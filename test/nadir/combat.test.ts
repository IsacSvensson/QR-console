// PLAN.md M29-M30: the weapon, the pellets, Kryp and the Spottare, barrels, acid balls, particles, the dynamic lights,
// the damage flash and the shake, and the player's health, against DESIGN §6 as an independent model:
// every frame of every replay, the model steps from the RAM state before the frame and must equal the RAM state
// after it (weapon state and ammunition, every shot's pellets and damage, every enemy's state, timers, line of sight,
// target, position under the collision rule, animation and sprite, the player's health, death and the restart).
import { describe, expect, it } from 'vitest';
import { VM, BUTTONS, expandInputs } from '@qrc/vm';
import { K, MASKED_CHARS, readRefMap, readRefSprites } from './ref';
import { REPLAYS, buildNadir, loadReplay, type Nadir } from './play';

const map = readRefMap('nadir');
const sprites = readRefSprites();
const s16 = (v: number) => (v << 16) >> 16;
const E_SIZE = 24;
const spr = (name: string) => sprites.findIndex((s) => s.name === name);

/** DESIGN §6.3, §6.10: per kind and state the animation (sprite, frames; 0 = held) */
const ANIM: [string, number][][][] = [
  [
    [['kryp_i0', 16], ['kryp_i1', 16]],
    [['kryp_a', 8]],
    [['kryp_w0', 6], ['kryp_w1', 6], ['kryp_w2', 6], ['kryp_w3', 6]],
    [['kryp_a', 8]],
    [['kryp_l', 8]],
    [['kryp_i0', 16]],
    [['kryp_p', 8]],
    [['kryp_d0', 6], ['kryp_d1', 6], ['kryp_d2', 0]],
    [['kryp_a', 8]],
  ],
  [
    [['spit_i0', 16], ['spit_i1', 16]],
    [['spit_a', 8]],
    [['spit_w0', 10], ['spit_w1', 10]],
    [['spit_a', 8]],
    [['spit_a', 8]],
    [['spit_i0', 16], ['spit_i1', 16]],
    [['spit_p', 8]],
    [['spit_d0', 6], ['spit_d1', 6], ['spit_d2', 0]],
    [['spit_a', 4], ['spit_i1', 4]],
  ],
];
/** DESIGN §6.3, §6.10: the allowed transitions per kind (besides staying, PAIN and DEAD from a hit or a blast) */
const ALLOWED = [new Set(['0-1', '1-2', '2-3', '2-0', '3-4', '4-5', '5-2', '6-2']), new Set(['0-1', '1-2', '2-0', '2-8', '8-2', '6-2'])];
/** DESIGN §6.9: 12 directions, round(PART_V cos), round(PART_V sin) of 30 k degrees */
const PART_DIR = Array.from({ length: 12 }, (_, k) => [Math.round(K.PART_V! * Math.cos((k * Math.PI) / 6)), Math.round(K.PART_V! * Math.sin((k * Math.PI) / 6))]);
const barrels = map.props.map((p) => sprites.find((q) => q.char === p.s)!.name === 'barrel');
const sb = (v: number) => ((v & 255) << 24) >> 24;

interface Enemy {
  x: number;
  y: number;
  st: number;
  t: number;
  hp: number;
  tx: number;
  ty: number;
  los: number;
  an: number;
  at: number;
  spk: number;
  vx: number;
  vy: number;
  losn: number;
  kind: number;
  cd: number;
}
interface Part {
  x: number;
  y: number;
  z: number;
  vz: number;
  vx: number;
  vy: number;
  life: number;
  col: number;
}
interface Acid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface State {
  tick: number;
  camX: number;
  camY: number;
  camA: number;
  hp: number;
  dead: number;
  restarts: number;
  hits: number;
  noise: number;
  wState: number;
  wT: number;
  mag: number;
  res: number;
  flash: number;
  shots: number;
  pickedMed: number;
  pickedAmmo: number;
  doorsOpen: number[];
  enemies: Enemy[];
  /** the enemies' prop entries: x, y, sprite type, alive */
  eprops: number[][];
  pelHit: number[];
  pelDmg: number[];
  /** M30 (DESIGN §6.6-6.10) */
  barHp: number[];
  barBoom: number[];
  barAlive: number[];
  boomAny: number;
  booms: number;
  parts: Part[];
  acids: Acid[];
  nFx: number;
  npLive: number;
  dlCell: number[];
  dlI: number[];
  explT: number;
  explCell: number;
  dmgT: number;
  dmgDir: number;
  dmgTaken: number;
  shake: number;
  shkOff: number;
}

function read(n: Nadir, vm: VM): State {
  const w = (s: string) => vm.read16(n.S(s));
  const ne = n.S('NUM_ENEMIES');
  const np = n.S('NUM_PROPS');
  return {
    tick: w('tick'),
    camX: w('cam_x'),
    camY: w('cam_y'),
    camA: w('cam_a'),
    hp: s16(w('hp')),
    dead: w('dead'),
    restarts: w('restarts'),
    hits: w('hits_taken'),
    noise: w('noise'),
    wState: w('w_state'),
    wT: w('w_t'),
    mag: w('w_mag'),
    res: w('w_res'),
    flash: w('w_flash'),
    shots: w('shots'),
    pickedMed: w('picked_med'),
    pickedAmmo: w('picked_ammo'),
    doorsOpen: map.doors.map((_, i) => vm.read16(n.S('doors') + 16 * i + 2)),
    enemies: Array.from({ length: ne }, (_, i) => {
      const b = n.S('enemies') + E_SIZE * i;
      return { x: vm.read16(b), y: vm.read16(b + 2), st: vm.read8(b + 4), t: vm.read8(b + 5), hp: s16(vm.read16(b + 6)), tx: vm.read16(b + 8), ty: vm.read16(b + 10), los: vm.read8(b + 12), an: vm.read8(b + 13), at: vm.read8(b + 14), spk: vm.read8(b + 15), vx: s16(vm.read16(b + 16)), vy: s16(vm.read16(b + 18)), losn: vm.read16(b + 20), kind: vm.read8(b + 22), cd: vm.read8(b + 23) };
    }),
    eprops: Array.from({ length: ne }, (_, i) => {
      const b = n.S('props') + 8 * (np + i);
      return [vm.read16(b), vm.read16(b + 2), vm.read8(b + 4), vm.read8(b + 5)];
    }),
    pelHit: Array.from({ length: K.PELLETS! }, (_, k) => vm.read8(n.S('pel_hit') + k)),
    pelDmg: Array.from({ length: K.PELLETS! }, (_, k) => vm.read8(n.S('pel_dmg') + k)),
    barHp: Array.from({ length: np }, (_, i) => vm.read8(n.S('bar_hp') + i)),
    barBoom: Array.from({ length: np }, (_, i) => vm.read8(n.S('bar_boom') + i)),
    barAlive: Array.from({ length: np }, (_, i) => (barrels[i] ? vm.read8(n.S('props') + 8 * i + 5) : 1)),
    boomAny: w('boom_any'),
    booms: w('booms'),
    parts: Array.from({ length: K.PART_MAX! }, (_, i) => {
      const b = n.S('parts') + 12 * i;
      return { x: vm.read16(b), y: vm.read16(b + 2), z: s16(vm.read16(b + 4)), vz: s16(vm.read16(b + 6)), vx: sb(vm.read8(b + 8)), vy: sb(vm.read8(b + 9)), life: vm.read8(b + 10), col: vm.read8(b + 11) };
    }),
    acids: Array.from({ length: K.ACID_MAX! }, (_, i) => {
      const b = n.S('acids') + 10 * i;
      return { x: vm.read16(b), y: vm.read16(b + 2), vx: s16(vm.read16(b + 4)), vy: s16(vm.read16(b + 6)), life: vm.read8(b + 8) };
    }),
    nFx: w('n_fx'),
    npLive: w('np_live'),
    dlCell: [vm.read16(n.S('dl_cell')), vm.read16(n.S('dl_cell') + 2)],
    dlI: [vm.read16(n.S('dl_i')), vm.read16(n.S('dl_i') + 2)],
    explT: w('expl_t'),
    explCell: w('expl_cell'),
    dmgT: w('dmg_t'),
    dmgDir: w('dmg_dir'),
    dmgTaken: w('dmg_taken'),
    shake: w('shake'),
    shkOff: s16(w('shk_off')),
  };
}

const octnorm = (dx: number, dy: number) => {
  const a = Math.abs(dx);
  const b = Math.abs(dy);
  return Math.max(a, b) + (Math.min(a, b) >> 1);
};

/** DESIGN §6.4, read from the map source and the doors' openings */
export function refLos(ax: number, ay: number, bx: number, by: number, doorsOpen: number[]): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const N = (Math.max(Math.abs(dx), Math.abs(dy)) >> 7) + 1;
  for (let k = 1; k < N; k++) {
    const x = ax + Math.sign(dx) * Math.floor((Math.abs(dx) * k) / N);
    const y = ay + Math.sign(dy) * Math.floor((Math.abs(dy) * k) / N);
    const cx = x >> 8;
    const cy = y >> 8;
    const c = map.grid[cy]?.[cx];
    if (c === undefined) return false;
    if (c === '.' || MASKED_CHARS.has(c)) continue;
    if (c === '+') {
      if (doorsOpen[map.doors.findIndex((d) => d.x === cx && d.y === cy)]! >= 128) continue;
      return false;
    }
    return false;
  }
  return true;
}

/** DESIGN §5 step 5: floor or a fully open door (masked cells and walls are not passable) */
const passableCell = (cx: number, cy: number, doorsOpen: number[]) => {
  const c = map.grid[cy]?.[cx];
  if (c === '.') return true;
  return c === '+' && doorsOpen[map.doors.findIndex((d) => d.x === cx && d.y === cy)] === 256;
};

/** DESIGN §5 step 5 and §6.3: an enemy's box at (x, y) is free (cells, doors fully open, standing blocking props, the player) */
function enemyFree(x: number, y: number, s: State, px: number, py: number): boolean {
  const r = K.E_RAD!;
  for (const cy of [(y - r) >> 8, (y + r) >> 8]) for (const cx of [(x - r) >> 8, (x + r) >> 8]) if (!passableCell(cx, cy, s.doorsOpen)) return false;
  for (const [i, p] of map.props.entries()) {
    const half = sprites.find((q) => q.char === p.s)!.block;
    if (half && s.barAlive[i] && Math.abs(x - Math.round(p.x * 256)) < r + half && Math.abs(y - Math.round(p.y * 256)) < r + half) return false;
  }
  return !(Math.abs(px - x) < r + K.P_RAD! && Math.abs(py - y) < r + K.P_RAD!);
}

const trunc8 = (a: number, b: number) => Math.sign(a) * Math.sign(b) * ((Math.abs(a) * Math.abs(b)) >> 8);
const sinS8 = (a: number) => {
  const v = Math.sign(Math.sin(((a + 0.5) * 2 * Math.PI) / 4096)) * Math.round(Math.abs(Math.sin(((a + 0.5) * 2 * Math.PI) / 4096)) * 16384);
  return Math.floor(v / 64);
};
const cosS8 = (a: number) => sinS8((a + 1024) & 4095);
const cellOf = (x: number, y: number) => (y >> 8) * 32 + (x >> 8);
const explDmg = (d: number) => (d <= K.EXPL_R! ? Math.floor((K.EXPL_DMG! * (K.EXPL_R! - d)) / K.EXPL_R!) : 0);

interface Notes {
  los: number;
  shots: number;
  transitions: Set<string>;
  booms: number;
  spits: number;
  acidHits: number;
}

/** One frame of DESIGN §6 from the state before it; the player's position after it (the player moves first). */
function model(b: State, held: number, pAfter: { x: number; y: number; a: number }, notes: Notes) {
  const s: State = structuredClone(b);
  s.tick = (b.tick + 1) & 0xffff;
  const px = pAfter.x;
  const py = pAfter.y;
  const enSet = (e: Enemy, st: number) => {
    e.st = st;
    e.t = 0;
    e.an = 0;
    e.at = 0;
  };
  // ---- the effects' timers (DESIGN §6.8)
  if (s.dmgT) s.dmgT--;
  s.shkOff = 0;
  if (s.shake) {
    s.shkOff = s.shake & 2 ? 2 : -2;
    s.shake--;
  }
  if (s.explT !== 255) s.explT++;
  const hurt = (dmg: number, sx: number, sy: number) => {
    s.hp -= dmg;
    s.dmgTaken += dmg;
    s.dmgT = K.DMG_FRAMES!;
    if (s.shake < K.SHAKE_HIT!) s.shake = K.SHAKE_HIT!;
    const c = cosS8(pAfter.a);
    const sn = sinS8(pAfter.a);
    const dx = s16(sx - px);
    const dy = s16(sy - py);
    const z = trunc8(dx, c) + trunc8(dy, sn);
    const lat = trunc8(dy, c) - trunc8(dx, sn);
    s.dmgDir = Math.abs(lat) > Math.abs(z) ? (lat > 0 ? 1 : 3) : z >= 0 ? 0 : 2;
  };
  const spawn = (x: number, y: number, vx: number, vy: number, vz: number, life: number, col: number) => {
    const p = s.parts.find((q) => q.life === 0);
    if (!p) return;
    Object.assign(p, { x, y, z: 0, vz, vx: sb(vx), vy: sb(vy), life, col });
    s.nFx++;
  };
  const explode = (x: number, y: number) => {
    notes.booms++;
    s.booms++;
    s.explT = 0;
    s.explCell = cellOf(x, y);
    if (s.shake < K.SHAKE_EXPL!) s.shake = K.SHAKE_EXPL!;
    const hit = (tx: number, ty: number) => {
      const d = explDmg(octnorm(s16(x - tx), s16(y - ty)));
      return d && refLos(x, y, tx, ty, b.doorsOpen) ? d : 0;
    };
    for (const e of s.enemies) {
      if (e.st === 7) continue;
      const d = hit(e.x, e.y);
      if (!d) continue;
      e.hp -= d;
      enSet(e, e.hp >= 1 ? 6 : 7);
    }
    const dp = hit(px, py);
    if (dp) hurt(dp, x, y);
    map.props.forEach((p, j) => {
      if (!s.barHp[j] || !s.barAlive[j]) return;
      const d = hit(Math.round(p.x * 256), Math.round(p.y * 256));
      if (!d) return;
      let h = s.barHp[j]! - d;
      if (h < 1) {
        h = 0;
        s.barBoom[j] = 2;
        s.boomAny = 1;
      }
      s.barHp[j] = h & 255;
    });
    for (let k = 0; k < 12; k++) spawn(x, y, PART_DIR[k]![0]!, PART_DIR[k]![1]!, K.PART_VZ!, 24, k % 3 ? 9 : 14);
  };
  // ---- barrels that explode this frame (DESIGN §6.6)
  if (s.boomAny) {
    s.boomAny = 0;
    map.props.forEach((p, j) => {
      if (s.barBoom[j] !== 1) return;
      s.barBoom[j] = 0;
      s.barAlive[j] = 0;
      explode(Math.round(p.x * 256), Math.round(p.y * 256));
    });
    s.barBoom = s.barBoom.map((v) => (v === 2 ? 1 : v));
  }
  // ---- enemies (DESIGN §6.3, §6.10)
  s.enemies.forEach((e, i) => {
    if (e.spk) e.spk--;
    e.t = Math.min(255, e.t + 1);
    if (e.cd) e.cd--;
    if (e.st !== 7) {
      const dist = octnorm(px - e.x, py - e.y);
      if (dist <= K.SIGHT!) {
        if (((s.tick + i) & 3) === 0) {
          e.losn = (e.losn + 1) & 0xffff;
          e.los = refLos(e.x, e.y, px, py, b.doorsOpen) ? 1 : 0;
          notes.los++;
        }
      } else e.los = 0;
      if (e.los) {
        e.tx = px;
        e.ty = py;
      }
      const vel = (tx: number, ty: number, v: number) => {
        const dx = s16(tx - e.x);
        const dy = s16(ty - e.y);
        const L = octnorm(dx, dy);
        if (L === 0) {
          e.vx = 0;
          e.vy = 0;
          return;
        }
        const f = Math.floor((v * 256) / L);
        e.vx = Math.floor((dx * f) / 256);
        e.vy = Math.floor((dy * f) / 256);
      };
      const move = () => {
        let blk = false;
        if (e.vx) {
          if (enemyFree(e.x + e.vx, e.y, s, px, py)) e.x += e.vx;
          else blk = true;
        }
        if (e.vy) {
          if (enemyFree(e.x, e.y + e.vy, s, px, py)) e.y += e.vy;
          else blk = true;
        }
        return blk;
      };
      const speed = e.kind ? K.SPIT_V! : K.KRYP_V!;
      const blind = () => {
        if (Math.abs(e.tx - e.x) < K.E_RAD! && Math.abs(e.ty - e.y) < K.E_RAD!) enSet(e, 0);
        else {
          vel(e.tx, e.ty, speed);
          move();
        }
      };
      const st0 = e.st;
      switch (e.st) {
        case 0:
          if (e.los) enSet(e, 1);
          else if (b.noise && dist <= K.HEAR!) {
            e.tx = px;
            e.ty = py;
            enSet(e, 1);
          }
          break;
        case 1:
          if (e.t >= K.ALERT_FRAMES!) enSet(e, 2);
          break;
        case 6:
          if (e.t >= K.PAIN_FRAMES!) enSet(e, 2);
          break;
        case 5:
          if (e.t >= K.RECOVER_FRAMES!) enSet(e, 2);
          break;
        case 3:
          if (e.t >= K.WINDUP_FRAMES!) {
            vel(px, py, K.LEAP_V!);
            enSet(e, 4);
          }
          break;
        case 4: {
          const blk = move();
          const reach = K.E_RAD! + K.P_RAD! + K.LEAP_REACH!;
          if (Math.abs(px - e.x) < reach && Math.abs(py - e.y) < reach) {
            s.hits++;
            hurt(K.KRYP_DMG!, e.x, e.y);
            enSet(e, 5);
          } else if (blk || e.t >= K.LEAP_FRAMES!) enSet(e, 5);
          break;
        }
        case 8:
          if (e.t >= K.AIM_FRAMES!) {
            const a = s.acids.find((q) => q.life === 0);
            if (a) {
              vel(px, py, K.ACID_V!);
              Object.assign(a, { x: e.x, y: e.y, vx: e.vx, vy: e.vy, life: K.ACID_LIFE! });
              s.nFx++;
              notes.spits++;
            }
            e.cd = K.SPIT_FRAMES!;
            enSet(e, 2);
          }
          break;
        case 2:
          if (e.kind === 1) {
            if (!e.los) blind();
            else if (e.cd === 0 && dist <= K.KEEP_FAR! + 512) enSet(e, 8);
            else if (dist > K.KEEP_FAR!) {
              vel(e.tx, e.ty, speed);
              move();
            } else if (dist < K.KEEP_NEAR!) {
              vel(s16(2 * e.x - px), s16(2 * e.y - py), K.SPIT_V!);
              move();
            }
          } else if (e.los && dist < K.LEAP_DIST!) enSet(e, 3);
          else if (!e.los) blind();
          else {
            vel(e.tx, e.ty, speed);
            move();
          }
          break;
      }
      if (e.st !== st0) {
        notes.transitions.add(`${e.kind}:${st0}-${e.st}`);
        expect(ALLOWED[e.kind]!.has(`${st0}-${e.st}`), `kind ${e.kind} transition ${st0} -> ${e.st}`).toBe(true);
      }
    }
    // animation: advances unless the state began this frame
    if (e.t !== 0) {
      const list = ANIM[e.kind]![e.st]!;
      const frames = list[e.an]![1];
      if (frames) {
        e.at++;
        if (e.at >= frames) {
          e.at = 0;
          e.an = e.an + 1 < list.length ? e.an + 1 : 0;
        }
      }
    }
    s.eprops[i] = [e.x, e.y, spr(ANIM[e.kind]![e.st]![e.an]![0]), 1];
  });
  s.noise = 0;
  // ---- acid balls and particles (DESIGN §6.9, §6.10), then the lights (§6.7)
  if (s.nFx === 0) s.npLive = 0;
  else {
    for (const a of s.acids) {
      if (!a.life) continue;
      a.life--;
      a.x = (a.x + a.vx) & 0xffff;
      a.y = (a.y + a.vy) & 0xffff;
      let gone = false;
      if (Math.abs(s16(px - a.x)) < K.ACID_R! + K.P_RAD! && Math.abs(s16(py - a.y)) < K.ACID_R! + K.P_RAD!) {
        hurt(K.ACID_DMG!, a.x, a.y);
        notes.acidHits++;
        gone = true;
      } else if (!passableCell(a.x >> 8, a.y >> 8, b.doorsOpen)) {
        if (octnorm(s16(px - a.x), s16(py - a.y)) <= K.SPLASH_R!) hurt(K.ACID_SPLASH!, a.x, a.y);
        gone = true;
      }
      if (gone) {
        a.life = 0;
        for (let k = 0; k < 6; k++) spawn(a.x, a.y, PART_DIR[2 * k]![0]! >> 1, PART_DIR[2 * k]![1]! >> 1, K.PART_VZ! >> 1, 16, 11);
      }
    }
    let live = 0;
    for (const p of s.parts) {
      if (!p.life) continue;
      p.life--;
      p.x = (p.x + p.vx) & 0xffff;
      p.y = (p.y + p.vy) & 0xffff;
      p.z = s16(p.z + p.vz);
      p.vz = s16(p.vz - K.PART_G!);
      if (p.z < 0) p.life = 0;
      if (p.life) live++;
    }
    s.npLive = live;
    s.nFx = live + s.acids.filter((a) => a.life).length;
  }
  s.dlI[0] = s.explT < K.EXPL_LIGHT! * 4 ? K.EXPL_LIGHT! - (s.explT >> 2) : 0;
  s.dlCell[0] = s.explCell;
  const fa = s.acids.find((a) => a.life);
  s.dlI[1] = fa ? K.ACID_LIGHT! : 0;
  if (fa) s.dlCell[1] = cellOf(fa.x, fa.y);
  // ---- death, weapon (DESIGN §6.1-6.2, §6.5)
  if (!b.dead && s.hp <= 0) s.dead = K.DEATH_FRAMES!;
  else if (!b.dead) {
    if (s.flash) s.flash--;
    s.wT++;
    const set = (st: number) => {
      s.wState = st;
      s.wT = 0;
    };
    if (s.wState === 1) {
      if (s.wT >= K.FIRE_FRAMES!) set(2);
    } else if (s.wState === 2) {
      if (s.wT >= K.PUMP_FRAMES!) set(0);
    } else if (s.wState === 3) {
      if (s.wT >= K.RELOAD_FRAMES!) {
        const nl = Math.min(K.MAG! - s.mag, s.res);
        s.mag += nl;
        s.res -= nl;
        set(0);
      }
    } else if (held & BUTTONS.A && s.mag > 0) {
      s.mag--;
      set(1);
      s.shots++;
      s.flash = K.FLASH_FRAMES!;
      s.noise = 1;
      notes.shots++;
      shoot(s, px, py, pAfter.a, b.doorsOpen, enSet);
    } else if (s.mag === 0 && s.res > 0) set(3);
  }
  return s;
}

function shoot(s: State, px: number, py: number, a: number, doorsOpen: number[], enSet: (e: Enemy, st: number) => void) {
  const reach = K.RANGE! + K.E_HIT!;
  const can = s.enemies.map((e) => e.st !== 7 && Math.abs(e.x - px) <= reach && Math.abs(e.y - py) <= reach && refLos(px, py, e.x, e.y, doorsOpen));
  const bpos = map.props.map((p) => [Math.round(p.x * 256), Math.round(p.y * 256)] as const);
  const canB = map.props.map((_, j) => s.barHp[j]! >= 1 && !!s.barAlive[j] && Math.abs(bpos[j]![0] - px) <= reach && Math.abs(bpos[j]![1] - py) <= reach && refLos(px, py, bpos[j]![0], bpos[j]![1], doorsOpen));
  for (let k = 0; k < K.PELLETS!; k++) {
    const ang = (a + (k - (K.PELLETS! >> 1)) * K.SPREAD!) & 4095;
    const c = cosS8(ang);
    const sn = sinS8(ang);
    let best = 255;
    let bt = K.RANGE! + 1;
    const test = (x: number, y: number, id: number) => {
      const dx = x - px;
      const dy = y - py;
      const t = trunc8(dx, c) + trunc8(dy, sn);
      if (t < 1 || t >= bt) return;
      const lat = trunc8(dy, c) - trunc8(dx, sn);
      if (Math.abs(lat) > K.E_HIT!) return;
      best = id;
      bt = t;
    };
    s.enemies.forEach((e, i) => {
      if (can[i] && e.st !== 7) test(e.x, e.y, i);
    });
    map.props.forEach((_, j) => {
      if (canB[j] && s.barHp[j]! >= 1) test(bpos[j]![0], bpos[j]![1], 128 + j);
    });
    s.pelHit[k] = best;
    s.pelDmg[k] = 0;
    if (best === 255) continue;
    const dmg = [8, 6, 4, 2, 2][bt >> 9]!;
    s.pelDmg[k] = dmg;
    if (best >= 128) {
      const j = best - 128;
      let h = s.barHp[j]! - dmg;
      if (h < 1) {
        h = 0;
        s.barBoom[j] = 1;
        s.boomAny = 1;
      }
      s.barHp[j] = h;
      continue;
    }
    const e = s.enemies[best]!;
    e.hp -= dmg;
    e.spk = K.SPARK_FRAMES!;
    enSet(e, e.hp >= 1 ? 6 : 7);
  }
}

describe('M29 combat', () => {
  for (const name of [...REPLAYS])
    it(`${name}: the weapon, every shot's pellets, every enemy and the player's health follow DESIGN §6 in every frame`, async () => {
      const n = await buildNadir();
      const rf = loadReplay(name);
      const inputs = expandInputs(rf.inputs, rf.frames);
      const vm = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
      vm.step(inputs[0]!);
      const notes: Notes = { los: 0, shots: 0, transitions: new Set<string>(), booms: 0, spits: 0, acidHits: 0 };
      let hits = 0;
      let kills = 0;
      let medkits = 0;
      let flashFrames = 0;
      let restarts = 0;
      let deathAt = -1;
      for (let f = 1; f < rf.frames; f++) {
        const b = read(n, vm);
        const paceBefore = vm.read16(n.S('pace'));
        vm.step(inputs[f]!);
        const a = read(n, vm);
        const where = `frame ${f + 1}`;
        if (a.restarts !== b.restarts) {
          restarts++;
          expect(f - deathAt, `${where}: DEATH_FRAMES from death to restart`).toBe(K.DEATH_FRAMES!);
          continue; // combat.test.ts 'restart' compares it with a fresh start
        }
        const m = model(b, inputs[f]!, { x: a.camX, y: a.camY, a: a.camA }, notes);
        // world (after the weapon): pickups change health and reserve (world.test.ts decides whether one is picked)
        if (a.pickedMed > b.pickedMed) {
          m.hp = Math.min(K.HP_MAX!, m.hp + K.MED_HP!);
          medkits++;
        }
        if (a.pickedAmmo > b.pickedAmmo) m.res = Math.min(K.AMMO_MAX!, m.res + K.AMMO_PICK!);
        m.pickedMed = a.pickedMed;
        m.pickedAmmo = a.pickedAmmo;
        m.camX = a.camX;
        m.camY = a.camY;
        m.camA = a.camA;
        m.doorsOpen = a.doorsOpen;
        if (m.dead && !b.dead) deathAt = f;
        if (b.dead) m.dead = b.dead - 1;
        expect(a, where).toEqual(m);
        hits += a.hits - b.hits;
        kills += a.enemies.filter((e, i) => e.st === 7 && b.enemies[i]!.st !== 7).length;
        // the muzzle flash lights exactly the images cast while w_flash > 0 (DESIGN §6.1)
        if (paceBefore === 0 && vm.read16(n.S('lg_heavy')) === 0) { // an image was cast (a shot or an explosion skips it, DESIGN §3.11)
          expect(vm.read16(n.S('rflash')), `${where}: rflash`).toBe(a.flash > 0 ? K.FLASH_LIGHT! : 0);
          if (a.flash > 0) flashFrames++;
        }
      }
      console.log(`[combat] ${name}: ${notes.shots} shots, ${kills} kills, ${notes.booms} explosions, ${notes.spits} acid balls (${notes.acidHits} hits), ${notes.los} line-of-sight checks, ${hits} hits taken, ${medkits} medkits, ${restarts} restarts, ${flashFrames} flash images; transitions ${[...notes.transitions].sort().join(' ')}`);
      if (name === 'm29-combat') {
        expect(hits).toBeGreaterThanOrEqual(1);
        expect(medkits).toBeGreaterThanOrEqual(1);
        expect(kills).toBe(n.S('NUM_ENEMIES'));
        for (const t of ALLOWED[0]!) if (t !== '2-0') expect(notes.transitions.has(`0:${t}`), `m29-combat shows Kryp transition ${t}`).toBe(true);
      }
      if (name === 'm29-death') expect(restarts).toBe(1);
    });

  it('restart (m29-death): the frame after the restart equals the first frame of a fresh start (RAM comparison)', async () => {
    const n = await buildNadir();
    const rf = loadReplay('m29-death');
    const inputs = expandInputs(rf.inputs, rf.frames);
    const a = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
    let f = 0;
    for (; f < rf.frames; f++) {
      const r = a.read16(n.S('restarts'));
      a.step(inputs[f]!);
      if (a.read16(n.S('restarts')) !== r) break;
    }
    expect(f).toBeLessThan(rf.frames);
    // a copy of the VM right after the restart, with the fresh start's tick, runs one frame without input
    const c = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
    c.mem.set(a.mem);
    c.frame = a.frame;
    c.write16(n.S('tick'), 0);
    c.step(0);
    const fresh = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
    fresh.step(0);
    // the game state DESIGN §6.5 resets: player, doors, props, enemies, weapon, health, counters
    const vars: [string, number][] = [
      ['cam_x', 2], ['cam_y', 2], ['cam_a', 2], ['walk_v', 2], ['turn_k', 2], ['turn_dir', 2], ['tap_dir', 2], ['dash_n', 2], ['dash_dir', 2], ['bob_ph', 2], ['bob', 2],
      ['keys', 2], ['doors', 16 * map.doors.length], ['props', 8 * (map.props.length + n.S('NUM_ENEMIES'))], ['picked_med', 2], ['picked_ammo', 2],
      ['enemies', E_SIZE * n.S('NUM_ENEMIES')], ['hp', 2], ['dead', 2], ['hits_taken', 2], ['noise', 2],
      ['w_state', 2], ['w_t', 2], ['w_mag', 2], ['w_res', 2], ['w_flash', 2], ['shots', 2], ['tick', 2],
      ['bar_hp', map.props.length], ['bar_boom', map.props.length], ['parts', 12 * K.PART_MAX! + 10 * K.ACID_MAX!], ['dmg_t', 2], ['dmg_taken', 2],
      ['shake', 2], ['booms', 2], ['boom_any', 2], ['n_fx', 2], ['expl_t', 2],
    ];
    let bytes = 0;
    for (const [v, len] of vars) {
      const at = n.S(v);
      expect(Array.from(c.mem.slice(at, at + len)), `${v} after the restart`).toEqual(Array.from(fresh.mem.slice(at, at + len)));
      bytes += len;
    }
    expect(c.read16(n.S('restarts'))).toBe(1);
    console.log(`[combat] restart at frame ${f + 1}: ${bytes} bytes of game state equal a fresh start`);
  });
});
