// PLAN.md M27: the level in RAM against its source, the collision oracle, the player's curves and the doors,
// every frame of every replay, against DESIGN §3.10 and §5 as read by test/nadir/ref.ts.
import { describe, expect, it } from 'vitest';
import { VM, expandInputs, type ReplayFile } from '@qrc/vm';
import { K, MASKED_CHARS, MATERIAL_CHARS, mapByte, readRefMap, readRefSprites, refLight, solid, stepDoor, stepPlayer, type PlayerState } from './ref';
import { REPLAYS, buildNadir, loadReplay, type Nadir } from './play';

const map = readRefMap('nadir');
const sprites = readRefSprites();
const propSprite = map.props.map((p) => sprites.find((s) => s.char === p.s)!);
const alive = (n: Nadir, vm: VM, i: number) => vm.read8(n.S('props') + 8 * i + 5);
const W = map.grid[0]!.length;
const H = map.grid.length;


const s16 = (v: number) => (v << 16) >> 16;

function readPlayer(n: Nadir, vm: VM): PlayerState {
  const r = (name: string) => vm.read16(n.S(name));
  return { x: r('cam_x'), y: r('cam_y'), a: r('cam_a'), v: s16(r('walk_v')), turnK: r('turn_k'), turnDir: s16(r('turn_dir')), tapDir: s16(r('tap_dir')), tapTick: r('tap_tick'), dashN: r('dash_n'), dashDir: s16(r('dash_dir')), bobPh: r('bob_ph'), bob: s16(r('bob')) };
}
const doorAt = (n: Nadir, vm: VM, i: number) => {
  const b = n.S('doors') + 16 * i;
  return { cell: vm.read16(b), open: vm.read16(b + 2), state: vm.read8(b + 4), timer: vm.read8(b + 5), orient: vm.read8(b + 6), key: vm.read8(b + 7), mat: vm.read8(b + 8) };
};

/** Runs a replay frame by frame; `each` gets the state before and after each frame. */
interface Before {
  p: PlayerState;
  doors: ReturnType<typeof doorAt>[];
  keys: number;
  alive: number[];
  med: number;
  ammo: number;
  /** M29: health, death, restarts, hits taken, the enemies (x, y, state) */
  hp: number;
  dead: number;
  restarts: number;
  hits: number;
  /** M30: damage taken in total (leaps, acid, explosions) */
  dmg: number;
  /** a pending start pose (the frame after init or a restart puts the player there) */
  pose: number;
  enemies: { x: number; y: number; st: number }[];
}
const readBefore = (n: Nadir, vm: VM): Before => ({
  p: readPlayer(n, vm),
  doors: map.doors.map((_, i) => doorAt(n, vm, i)),
  keys: vm.read16(n.S('keys')),
  alive: map.props.map((_, i) => alive(n, vm, i)),
  med: vm.read16(n.S('picked_med')),
  ammo: vm.read16(n.S('picked_ammo')),
  hp: s16(vm.read16(n.S('hp'))),
  dead: vm.read16(n.S('dead')),
  restarts: vm.read16(n.S('restarts')),
  hits: vm.read16(n.S('hits_taken')),
  dmg: vm.read16(n.S('dmg_taken')),
  pose: vm.read16(n.S('dbg_pose')),
  enemies: Array.from({ length: n.S('NUM_ENEMIES') }, (_, i) => {
    const b = n.S('enemies') + 24 * i;
    return { x: vm.read16(b), y: vm.read16(b + 2), st: vm.read8(b + 4) };
  }),
});
function walk(n: Nadir, name: string, each: (f: number, vm: VM, held: number, pressed: number, before: Before) => void) {
  const rf: ReplayFile & { frames: number } = loadReplay(name);
  const inputs = expandInputs(rf.inputs, rf.frames);
  const vm = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
  vm.step(inputs[0]!); // init and the first frame (the start pose)
  for (let f = 1; f < rf.frames; f++) {
    const before = readBefore(n, vm);
    const played = vm.read16(n.S('gstate')) === 1; // M31: the player and the world run only in play
    const held = inputs[f]!;
    const pressed = held & ~inputs[f - 1]!;
    vm.step(held);
    if (played) each(f, vm, held, pressed, before);
  }
  return vm;
}

describe('M27 world', () => {
  it('every cell, door, key trigger, zone and lamp in RAM equals levels/nadir.map (independent reader)', async () => {
    const n = await buildNadir();
    const vm = VM.fromCartridge(n.cart, { seed: 1 });
    vm.step(0);
    const light = refLight(map);
    let cells = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        expect(vm.read8(n.S('map') + i), `map byte at ${x},${y}`).toBe(mapByte(map, x, y));
        cells++;
        // M31: lmap and zmap end after the last row with an open cell (every cell after it is solid)
        if (i >= n.S('LIGHT_CELLS')) {
          expect(/[A-Z]/.test(map.grid[y]![x]!) && !MASKED_CHARS.has(map.grid[y]![x]!), `${x},${y} beyond lmap is solid`).toBe(true);
          continue;
        }
        expect(vm.read8(n.S('zmap') + i), `zone at ${x},${y}`).toBe(map.zones[y]![x]!);
        const L = light[y]![x]!;
        expect(vm.read8(n.S('lmap') + i), `light at ${x},${y}`).toBe(Math.min(7, L.s) | (Math.min(7, L.f) << 3) | (L.g << 6));
      }
    expect(n.S('NUM_DOORS')).toBe(map.doors.length);
    map.doors.forEach((d, i) => {
      const r = doorAt(n, vm, i);
      expect(r.cell).toBe(d.y * W + d.x);
      expect(r.orient).toBe(solid(map, d.x, d.y - 1) && solid(map, d.x, d.y + 1) ? 1 : 0);
      expect(r.key).toBe(d.key);
      // M31: a hidden door has its wall's material and opens only at HIDE_REACH (DESIGN §3.10)
      expect(vm.read8(n.S('doors') + 16 * i + 9), `door ${i} material`).toBe(d.hidden ? MATERIAL_CHARS.indexOf(d.hidden) + 1 : n.S('MAT_DOOR'));
      expect(vm.read16(n.S('doors') + 16 * i + 10), `door ${i} reach`).toBe(d.hidden ? K.HIDE_REACH! : K.DOOR_REACH!);
    });
    expect(n.S('NUM_KEYS')).toBe(map.keys.length);
    map.keys.forEach((k, i) => {
      expect(vm.read16(n.S('key_tab') + 4 * i)).toBe(k.y * W + k.x);
      expect(vm.read16(n.S('key_tab') + 4 * i + 2)).toBe(k.bit);
    });
    expect(n.S('NUM_LAMPS')).toBe(map.lamps.length);
    map.lamps.forEach((l, i) => expect([0, 1, 2, 3].map((k) => vm.read8(n.S('lamps') + 4 * i + k))).toEqual([l.x, l.y, l.i, l.g]));
    expect(n.S('NUM_PROPS')).toBe(map.props.length);
    map.props.forEach((p, i) => {
      const b = n.S('props') + 8 * i;
      expect([vm.read16(b), vm.read16(b + 2), vm.read8(b + 4), vm.read8(b + 5)], `prop ${i}`).toEqual([Math.round(p.x * 256), Math.round(p.y * 256), sprites.indexOf(propSprite[i]!), 1]);
    });
    console.log(`[world] ${cells} cells, ${map.doors.length} doors, ${map.keys.length} key, ${map.lamps.length} lamps match the source`);
  });

  for (const name of REPLAYS)
    it(`${name}: collision oracle, the player's curves (DESIGN §5) and the doors (DESIGN §3.10) in every frame`, async () => {
      const n = await buildNadir();
      const R = K.P_RAD! / 256;
      let maxMove = 0;
      let frames = 0;
      let blockedX = 0;
      let dashes = 0;
      let opened = 0;
      let picks = 0;
      let strafes = 0;
      const lockedRefused = new Set<number>();
      walk(n, name, (f, vm, held, pressed, before) => {
        frames++;
        const tick = vm.read16(n.S('tick'));
        // the player follows DESIGN §5 exactly (passable from the door state before the frame)
        const passable = (cx: number, cy: number) => {
          const c = map.grid[cy]?.[cx];
          if (c === '.') return true;
          if (c !== '+') return false;
          return before.doors[map.doors.findIndex((d) => d.x === cx && d.y === cy)]!.open === 256;
        };
        // blocking props (DESIGN §3.12; a burst barrel no longer blocks, §6.6): the box overlaps one if both axis distances are < P_RAD + its half-size
        const propHit = (x: number, y: number) => map.props.some((p, i) => propSprite[i]!.block > 0 && before.alive[i] && Math.abs(x - Math.round(p.x * 256)) < K.P_RAD! + propSprite[i]!.block && Math.abs(y - Math.round(p.y * 256)) < K.P_RAD! + propSprite[i]!.block);
        // M29 (DESIGN §6.3): living enemies block the player too (their positions before the frame: the player moves first)
        const enemyHit = (x: number, y: number) => before.enemies.some((e) => e.st !== 7 && Math.abs(x - e.x) < K.P_RAD! + K.E_RAD! && Math.abs(y - e.y) < K.P_RAD! + K.E_RAD!);
        // a restart (DESIGN §6.5) sets everything as at the start: combat.test.ts compares it with a fresh start
        if (vm.read16(n.S('restarts')) !== before.restarts) return;
        const got = readPlayer(n, vm);
        let want = before.p;
        if (before.pose) {
          // the start pose after a restart (combat.test.ts: the frame equals a fresh start's first frame)
        } else if (before.dead) {
          // dead: no control, the player stands; the horizon sinks (DESIGN §6.5)
          const dead = vm.read16(n.S('dead'));
          expect({ ...got, bob: 0 }, `frame ${f + 1}: dead`).toEqual({ ...before.p, bob: 0 });
          expect(got.bob, `frame ${f + 1}: sinking`).toBe(Math.min(16, (K.DEATH_FRAMES! - dead) >> 2));
        } else {
          want = stepPlayer(before.p, held, pressed, tick, passable, vm.read16(n.S('ctl_s1')) === 1, false, (x, y) => propHit(x, y) || enemyHit(x, y));
          expect(got, `frame ${f + 1}`).toEqual(want);
        }
        if (got.dashN === K.DASH_FRAMES! - 1) dashes++;
        // collision: the circle never overlaps a solid cell or a door that is not fully open, never leaves the map
        const x = got.x / 256;
        const y = got.y / 256;
        expect(x - R >= 1 && y - R >= 1 && x + R <= W - 1 && y + R <= H - 1, `frame ${f + 1}: outside the map`).toBe(true);
        for (let cy = Math.floor(y - R); cy <= Math.floor(y + R); cy++)
          for (let cx = Math.floor(x - R); cx <= Math.floor(x + R); cx++) {
            if (!solid(map, cx, cy)) continue;
            const qx = Math.max(cx, Math.min(cx + 1, x));
            const qy = Math.max(cy, Math.min(cy + 1, y));
            if (Math.hypot(x - qx, y - qy) >= R) continue;
            const di = map.doors.findIndex((d) => d.x === cx && d.y === cy);
            expect(di >= 0 && doorAt(n, vm, di).open === 256 && before.doors[di]!.open === 256, `frame ${f + 1}: the player circle overlaps ${cx},${cy}`).toBe(true);
          }
        const move = before.pose ? 0 : Math.hypot(got.x - before.p.x, got.y - before.p.y);
        maxMove = Math.max(maxMove, move);
        expect(move, `frame ${f + 1}: moved ${move}`).toBeLessThanOrEqual(K.P_RAD!);
        if (got.x === before.p.x && want.x === before.p.x && held & 12) blockedX++;
        // S1 (DESIGN §5, the default): B + LEFT/RIGHT walks sideways without turning
        if (held & 32 && held & 3 && got.a === before.p.a && (got.x !== before.p.x || got.y !== before.p.y)) strafes++;
        // keys, then the doors' state machine after the player moved
        // pickups (DESIGN §3.12), after the move
        let med = before.med;
        let ammo = before.ammo;
        map.props.forEach((p, i) => {
          const sp = propSprite[i]!;
          let alive0 = before.alive[i]!;
          // M29 (DESIGN §6.1): a medkit only below HP_MAX (health after this frame's leap hits); ammunition only below
          // AMMO_MAX (the reserve after the weapon's step: combat.test.ts follows it exactly, here the engine's choice)
          const hpAtWorld = before.hp - (vm.read16(n.S('dmg_taken')) - before.dmg);
          const needed = sp.pick === 1 ? hpAtWorld < K.HP_MAX! : !alive(n, vm, i) || s16(vm.read16(n.S('w_res'))) < K.AMMO_MAX!;
          if (alive0 && sp.pick && needed && Math.abs(got.x - Math.round(p.x * 256)) < K.P_RAD! + K.PICK_HALF! && Math.abs(got.y - Math.round(p.y * 256)) < K.P_RAD! + K.PICK_HALF!) {
            alive0 = 0;
            if (sp.pick === 1) med++;
            else ammo++;
            picks++;
          }
          // M30 (DESIGN §6.6): a barrel bursts (combat.test.ts follows its health and the explosions exactly), never returns
          if (sp.char === 'B' && alive0 && !alive(n, vm, i)) alive0 = 0;
          expect(alive(n, vm, i), `frame ${f + 1}: prop ${i} alive`).toBe(alive0);
        });
        expect([vm.read16(n.S('picked_med')), vm.read16(n.S('picked_ammo'))], `frame ${f + 1}: pickups`).toEqual([med, ammo]);
        // the player never overlaps a blocking prop
        expect(propHit(got.x, got.y), `frame ${f + 1}: inside a prop`).toBe(false);
        let keys = before.keys;
        for (const k of map.keys) if (Math.floor(x) === k.x && Math.floor(y) === k.y) keys |= k.bit;
        expect(vm.read16(n.S('keys')), `frame ${f + 1}: keys`).toBe(keys);
        map.doors.forEach((d, i) => {
          const r = doorAt(n, vm, i);
          const bd = before.doors[i]!;
          const w = stepDoor({ open: bd.open, state: bd.state, timer: bd.timer }, d.x, d.y, d.key, keys, got.x, got.y, d.hidden ? K.HIDE_REACH! : K.DOOR_REACH!);
          expect({ open: r.open, state: r.state, timer: r.timer }, `frame ${f + 1}: door ${i}`).toEqual(w);
          const base = d.hidden ? MATERIAL_CHARS.indexOf(d.hidden) + 1 : n.S('MAT_DOOR'); // M31: a hidden door looks like its wall
          expect(r.mat).toBe(d.key === 0 || keys & d.key ? base : n.S('MAT_LOCKEDDOOR'));
          if (before.doors[i]!.state === 1 && r.state === 2) opened++;
          // a locked door never leaves CLOSED without its key
          if (d.key && !(keys & d.key)) {
            expect(r.state).toBe(0);
            if (Math.abs(got.x - (d.x * 256 + 128)) < K.DOOR_REACH! && Math.abs(got.y - (d.y * 256 + 128)) < K.DOOR_REACH!) lockedRefused.add(i);
          }
        });
      });
      console.log(`[world] ${name}: ${frames} frames, largest step ${maxMove.toFixed(1)} units, ${blockedX} blocked frames, ${dashes} side steps, ${opened} doors fully opened, locked door refused: ${lockedRefused.size > 0}`);
      if (name === 'm27-doors') {
        expect(opened).toBeGreaterThanOrEqual(3);
        expect(lockedRefused.size).toBe(1);
      }
      if (name === 'm27-walk') {
        expect(dashes).toBeGreaterThanOrEqual(4);
        expect(strafes, 'frames walking sideways with B').toBeGreaterThanOrEqual(30);
      }
      if (name === 'm29-combat') expect(picks).toBeGreaterThanOrEqual(2); // a medkit (after a hit) and ammunition
      console.log(`[world] ${name}: ${picks} pickups`);
    });

  it('door timing: a door takes 256 / DOOR_SPEED frames to open and closes DOOR_WAIT frames after the player left (m27-doors)', async () => {
    const n = await buildNadir();
    const opening: number[] = [];
    const waits: number[] = [];
    const startOpen = new Map<number, number>();
    const startWait = new Map<number, number>();
    walk(n, 'm27-doors', (f, vm, _h, _p, before) => {
      map.doors.forEach((_, i) => {
        const r = doorAt(n, vm, i);
        const b = before.doors[i]!;
        if (b.state === 0 && r.state === 1) startOpen.set(i, f);
        if (b.state === 1 && r.state === 2 && startOpen.has(i)) opening.push(f - startOpen.get(i)!);
        if (r.state === 2 && r.timer === K.DOOR_WAIT! - 1) startWait.set(i, f);
        if (b.state === 2 && r.state === 3 && startWait.has(i)) waits.push(f - startWait.get(i)! + 1);
      });
    });
    console.log(`[doors] opening ${opening.join(', ')} frames; waits ${waits.join(', ')} frames`);
    expect(opening.length).toBeGreaterThan(0);
    expect(opening.every((d) => d === 256 / K.DOOR_SPEED!)).toBe(true);
    expect(waits.length).toBeGreaterThan(0);
    expect(waits.every((d) => d === K.DOOR_WAIT!)).toBe(true);
  });
});
