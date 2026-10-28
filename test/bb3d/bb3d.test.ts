import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { expandInputs, replay, type ReplayFile } from '@qrc/vm';
import { GENERATED } from '../../games/blackbox3d/tools/gen';
import { type Bb3dBuild, buildBb3d, startVM } from '../../games/blackbox3d/tools/game';
import { buildBlackbox } from '../blackbox/oracle';
import {
  type Engine,
  GAME_DIR,
  NRAYS,
  OPAQUE,
  type OpenSides,
  PERP_MIN,
  RADAR,
  SPRITE_SIZES,
  VIEW_H,
  castRef,
  cellChar,
  ceilColour,
  floorColour,
  heightAt,
  loadReplay,
  lowTopColour,
  lowTopRow,
  picPixel,
  renderCode,
  replayNames,
  rooms,
  runReplay,
  s16,
  setOf,
  texColumn,
  texelRow,
} from './oracle';

// M28 acceptance: the BLACKBOX 3D slice (PLAN.md Part 5, games/blackbox3d/DESIGN.md).
let b: Bb3dBuild;
beforeAll(async () => {
  b = await buildBb3d();
});

const BB = join(GAME_DIR, '../blackbox');
const SHARED = ['script.asm', 'scripts.asm', 'text.asm', 'oracle.asm', 'code.asm', 'sounds.asm', 'rooms.gen.asm', 'text.gen.asm'];
const ADAPTED = ['blackbox3d.asm', 'defs.asm', 'room.asm', 'player.asm', 'actors.asm', 'boss.asm', 'draw.asm', 'render.asm'];

describe('BLACKBOX 3D build', () => {
  it('generated files are up to date', () => {
    for (const [file, gen] of Object.entries(GENERATED)) expect(readFileSync(join(GAME_DIR, file), 'utf8'), file).toBe(gen());
  });

  it("the shared modules are BLACKBOX's, byte for byte; adapted ones say so on their first line", () => {
    for (const f of SHARED) expect(readFileSync(join(GAME_DIR, f)).equals(readFileSync(join(BB, f))), f).toBe(true);
    for (const f of ADAPTED) expect(readFileSync(join(GAME_DIR, f), 'utf8').split('\n')[0], f).toMatch(/^; BLACKBOX 3D/);
  });

  it('matches the committed cartridge; ROM within 32 KB', () => {
    expect(Buffer.from(b.bytes).equals(readFileSync(join(GAME_DIR, 'blackbox3d.qrc')))).toBe(true);
    const s = b.cart.sections;
    const rom = s.code.length + s.rodata.length + s.sound.length;
    console.log(`[size] blackbox3d: cartridge ${b.bytes.length} B, ROM ${rom} B of 32768 (code ${s.code.length}, data ${s.rodata.length}), xdata ${s.xdata?.length ?? 0} B`);
    expect(rom).toBeLessThanOrEqual(32768);
  });

  it('the quarter-wave sine gives round(256 sin) for every angle', () => {
    const vm = startVM(b);
    const q = (i: number) => s16(vm.read16(b.sym('sinq') + 2 * i));
    for (let a = 0; a < 1024; a++) {
      const i = a & 255;
      const quad = a >> 8;
      let v = q(quad & 1 ? 256 - i : i);
      if (quad & 2) v = -v;
      expect(v | 0, `angle ${a}`).toBe(Math.round(256 * Math.sin((a / 1024) * 2 * Math.PI)) | 0);
    }
  });
});

// ---- room state read from RAM ----------------------------------------------------------------------
function openSides(e: Engine, room: number): OpenSides {
  const out = new Set<string>();
  for (const [side, flag] of rooms[room]!.locks) {
    const f = e.b.sym(`F_${flag}`);
    if ((e.r8('flags', f >> 3) >> (f & 7)) & 1) out.add(side);
  }
  return out;
}

describe('every room in 3D agrees with LAYOUT.md (DESIGN.md §3.1, §3.5)', () => {
  it('render map and radar walls of all 37 rooms', () => {
    const problems: string[] = [];
    for (let room = 0; room < rooms.length; room++) {
      const vm = startVM(b);
      vm.step(0);
      vm.write16(b.sym('dbg_room'), room + 1);
      vm.step(0);
      const e: Engine = { b, vm, r16: (n, o = 0) => vm.read16(b.sym(n) + o), s: (n, o = 0) => s16(vm.read16(b.sym(n) + o)), r8: (n, o = 0) => vm.read8(b.sym(n) + o) };
      const open = openSides(e, room);
      for (let y = -1; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const got = y < 0 ? e.r8('rmap_pre', x) : e.r8('rmap', y * 16 + x);
          const want = y === 15 ? 1 : renderCode(room, x, y, open);
          if (got !== want) problems.push(`${rooms[room]!.id} cell ${x},${y}: render code ${got}, want ${want}`);
          if (y < 0 || y > 14) continue;
          const t = ((y >> 2) * 4 + (x >> 2)) * 32 + (y & 3) * 8 + (x & 3);
          const colour = RADAR[cellChar(room, x, y, open)]! * 17;
          if (e.r8('radar_buf', t) !== colour || e.r8('radar_buf', t + 4) !== colour) problems.push(`${rooms[room]!.id} radar ${x},${y}`);
        }
    }
    expect(problems.slice(0, 20)).toEqual([]);
  });
});

// ---- per-frame checks -----------------------------------------------------------------------------
interface Stats {
  frames: number;
  maxCycles: number;
  rays: number;
  ambiguous: number;
  images: number;
  radars: number;
  meters: number;
  problems: string[];
}

const bufPixel = (e: Engine, x: number, y: number) => {
  const byte = e.r8('buf', (x >> 3) * 352 + y * 4 + ((x >> 1) & 3));
  return x & 1 ? byte & 15 : byte >> 4;
};

function checkRays(e: Engine, name: string, f: number, rays: number[], st: Stats, fail: (m: string) => void) {
  const room = e.r16('room');
  const open = openSides(e, room);
  const code = (x: number, y: number) => (x < 0 || x > 15 ? 1 : renderCode(room, x, y, open));
  const set = setOf(room);
  const cam = { x: e.s('cx') / 256, y: e.s('cy') / 256, ang: e.r16('cang') };
  for (const c of rays) {
    st.rays++;
    const cell = e.r8('rcell', c);
    const tx = e.r8('rtx', c);
    const u = tx & 15;
    const side = tx >> 4;
    const perp = e.r16('zb', 2 * c);
    const h = e.r16('rh', 2 * c);
    const ref = castRef(cam, c, code);
    if (ref.hits.some((r) => r.cell !== ref.hits[0]!.cell || r.side !== ref.hits[0]!.side || r.blocks.length !== ref.hits[0]!.blocks.length)) st.ambiguous++;
    const wcode = code(cell & 15, cell >> 4);
    const along = side === 1 ? 1 : 16;
    const edge = (v: number) => v <= 1 || v >= 14;
    const cu = (a: number, b2: number) => Math.min((a - b2 + 16) % 16, (b2 - a + 16) % 16);
    const okWall = ref.hits.some((r) => {
      if (r.side !== side || code(r.cell & 15, r.cell >> 4) !== wcode) return false;
      if (r.cell !== cell && !(Math.abs(r.cell - cell) === along && (edge(u) || edge(r.u)))) return false;
      const t = ref.tol(r, r.perp);
      return Math.abs(perp / 256 - Math.max(PERP_MIN / 256, r.perp)) <= t.perp && cu(u, r.u) <= t.u;
    });
    if (!okWall) fail(`${name} f${f} ray ${c}: wall cell ${cell} side ${side} u ${u} at ${(perp / 256).toFixed(3)}; reference ${JSON.stringify({ ...ref.hits[0]!, blocks: undefined })}`);
    if (h !== heightAt(perp)) fail(`${name} f${f} ray ${c}: height ${h} for ${perp}`);
    // low blocks: count, code, side, front and back within the budget of one of the casts
    const n = e.r8('nlowr', c);
    const blocks = Array.from({ length: n }, (_, i) => ({ front: e.r16('blk_fb', c * 8 + i * 4), back: e.r16('blk_fb', c * 8 + i * 4 + 2), cs: e.r8('blk_cs', c * 2 + i) }));
    // a block the ray only grazes at a corner (no length within the budget) may or may not be there; a block
    // entered at a corner may be entered through either side (DESIGN.md §6)
    // a block the ray only grazes (shorter than twice the budget) may be there in one and not in the other;
    // a block entered at a corner may be entered through either side; when one list is full (two blocks) the
    // other may have more (DESIGN.md §6)
    const okLow = ref.hits.some((r) => {
      const t = (d: number) => ref.tol(r, d).perp;
      let i = 0;
      let j = 0;
      while (i < blocks.length && j < r.blocks.length) {
        const eb = blocks[i]!;
        const rb = r.blocks[j]!;
        const tt = t(rb.back);
        const same = (eb.cs & 127) === rb.code && (eb.cs >> 7 === rb.side || rb.corner <= tt) && Math.abs(eb.front / 256 - rb.front) <= tt && Math.abs(eb.back / 256 - rb.back) <= tt;
        if (same) {
          i++;
          j++;
        } else if ((eb.back - eb.front) / 256 <= 2 * t(eb.back / 256)) i++;
        else if (rb.back - rb.front <= 2 * tt) j++;
        else return false;
      }
      const restOk = (list: { len: number; back: number }[], otherFull: boolean) => otherFull || list.every((x) => x.len <= 2 * t(x.back));
      return (
        restOk(blocks.slice(i).map((x) => ({ len: (x.back - x.front) / 256, back: x.back / 256 })), r.blocks.length === 2) &&
        restOk(r.blocks.slice(j).map((x) => ({ len: x.back - x.front, back: x.back })), blocks.length === 2)
      );
    });
    if (!okLow) fail(`${name} f${f} ray ${c}: low blocks ${JSON.stringify(blocks)}; reference ${JSON.stringify(ref.hits[0]!.blocks)}`);
    const zlow = e.r16('zlow', 2 * c);
    if (n ? zlow !== blocks[0]!.front || e.r8('ylow', c) !== lowTopRow(heightAt(blocks[0]!.back)) : zlow !== 0xffff) fail(`${name} f${f} ray ${c}: zlow/ylow`);
    // the column (DESIGN.md §3.2-3.4)
    const want: number[] = Array.from({ length: VIEW_H }, (_, y) => (y < VIEW_H / 2 ? ceilColour(set) : floorColour(set)));
    const wall = texColumn(wcode, set, side, u);
    for (let y = 0; y < VIEW_H; y++) {
      const k = texelRow(h, y);
      if (k !== null) want[y] = wall[k]!;
    }
    for (let i = n - 1; i >= 0; i--) {
      const bl = blocks[i]!;
      const bside = bl.cs >> 7;
      const t = bl.cs & 127;
      const hf = heightAt(bl.front);
      const top0 = lowTopRow(heightAt(bl.back));
      const top1 = Math.min(lowTopRow(hf), VIEW_H);
      for (let y = top0; y < top1; y++) want[y] = lowTopColour(t, set);
      const rq = bside === 0 ? ref.rdy : ref.rdx;
      const cf = bside === 0 ? e.r16('cfy16') : e.r16('cfx16');
      const ub = (((cf + bl.front * rq) & 0xffff) >> 12) & 15;
      const col = texColumn(t, set, bside, ub);
      for (let y = 0; y < VIEW_H; y++) {
        const k = texelRow(hf, y);
        if (k !== null && k >= 10) want[y] = col[k]!;
      }
    }
    for (let y = 0; y < VIEW_H; y++) {
      const got = bufPixel(e, 2 * c, y);
      if (got !== want[y] || bufPixel(e, 2 * c + 1, y) !== want[y]) {
        fail(`${name} f${f} ray ${c}: pixel row ${y} is ${got}, want ${want[y]} (h ${h}, blocks ${n})`);
        break;
      }
    }
  }
}

const POSE = ['guard_front', 'guard_back', 'guard_side', 'unknown'];

/** DESIGN.md §4.2: the presented view = the buffer, then the actors far to near, then the overlays */
function checkScreen(e: Engine, name: string, f: number, before: Record<string, number>, fail: (m: string) => void) {
  const want: number[] = [];
  for (let y = 0; y < VIEW_H; y++) for (let x = 0; x < 128; x++) want.push(bufPixel(e, x, y));
  const put = (x: number, y: number, c: number) => {
    if (c !== 0 && x >= 0 && x < 128 && y >= 0 && y < VIEW_H) want[y * 128 + x] = c;
  };
  const cam = { x: e.s('cx') / 256, y: e.s('cy') / 256, th: (e.r16('cang') / 1024) * 2 * Math.PI };
  const n = e.r16('n_actors');
  const drawn: { i: number; depth: number; left: number; top: number; s: number; pic: string; flip: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const base = e.b.sym('actors') + i * 24;
    const w = (o: number) => s16(e.vm.read16(base + o));
    const type = w(0);
    if (type === 0 || type === e.b.sym('O_CAMERA')) continue;
    if (w(16) > 0 && e.r16('frame') & 4) continue; // stunned: blinks
    const ax = (w(2) + 4) / 8;
    const ay = (w(4) + 4) / 8;
    const rx = ax - cam.x;
    const ry = ay - cam.y;
    const depth = rx * Math.cos(cam.th) + ry * Math.sin(cam.th);
    const side = -rx * Math.sin(cam.th) + ry * Math.cos(cam.th);
    const q = Math.floor(97 / Math.max(depth, 0.25));
    const borderline = Math.abs(depth - 0.25) < 0.02 || Math.abs(Math.abs(side) - 2 * depth) < 0.05 || Math.abs(0.75 * 2 * q - 4) < 0.6;
    if (borderline) return 'skip';
    if (depth < 0.25 || Math.abs(side) > 2 * depth || 1.5 * q < 4) continue;
    const r = e.b.sym('bb') + i * e.b.sym('BB_SIZE');
    const rw = (o: number) => s16(e.vm.read16(r + o));
    const T = rw(8);
    const s = T * 8;
    const sx = 64 + (97 * side) / depth;
    const left = rw(2);
    const top = rw(4);
    if (sx >= 0 && sx < 128 && Math.abs(left + s / 2 - sx) > 2.5) fail(`${name} f${f} actor ${i}: centre ${left + s / 2}, reference ${sx.toFixed(1)}`);
    const nearest = SPRITE_SIZES.reduce((p, c) => (Math.abs(c - 1.5 * q) < Math.abs(p - 1.5 * q) ? c : p));
    if (Math.abs(s - 1.5 * q) > Math.abs(nearest - 1.5 * q) + 1.5) fail(`${name} f${f} actor ${i}: size ${s}, want about ${1.5 * q}`);
    if (sx >= 0 && sx < 128 && Math.abs(top + s - (VIEW_H / 2 + 97 / depth)) > 2.5 + 0.02 * q) fail(`${name} f${f} actor ${i}: stands at ${top + s}`);
    // pose (DESIGN.md §4.2): where the camera is, seen from the actor, against its facing
    let pic = 'unknown';
    let flip = false;
    if (type === e.b.sym('O_GUARD') || type === e.b.sym('O_HEAVY')) {
      const dx = cam.x - ax;
      const dy = cam.y - ay;
      const toward = Math.abs(dx * 256) >= Math.abs(dy * 256) ? (dx >= 0 ? 1 : 3) : dy >= 0 ? 2 : 0;
      const k = (w(6) - toward) & 3;
      pic = ['guard_front', 'guard_side', 'guard_back', 'guard_side'][k]!;
      flip = k === 1;
    }
    const picIndex = POSE.indexOf(pic);
    const sizeIndex = SPRITE_SIZES.indexOf(s);
    const wantPic = e.vm.read16(e.b.sym('pic_table') + (picIndex * SPRITE_SIZES.length + sizeIndex) * 4);
    if ((rw(6) & 0xffff) !== wantPic || (rw(10) !== 0) !== flip) fail(`${name} f${f} actor ${i}: picture ${rw(6)} flip ${rw(10)}, want ${pic} ${flip}`);
    drawn.push({ i, depth: rw(0), left, top, s, pic, flip });
  }
  // far to near; among equal depths the later actor first (as the engine picks)
  drawn.sort((p, q) => q.depth - p.depth || q.i - p.i);
  for (const d of drawn) {
    const T = d.s / 8;
    for (let j = 0; j < T; j++) {
      const mid = d.left + 8 * j + 4;
      if (mid < 0 || mid >= 128) continue;
      const ray = mid >> 1;
      if (d.depth >= e.r16('zb', 2 * ray)) continue;
      const cut = d.depth >= e.r16('zlow', 2 * ray) ? e.r8('ylow', ray) : VIEW_H;
      const src = d.flip ? T - 1 - j : j;
      for (let ty = 0; ty < T; ty++) {
        const y0 = d.top + 8 * ty;
        if (y0 >= cut) break;
        for (let y = 0; y < 8 && y0 + y < cut; y++)
          for (let x = 0; x < 8; x++) put(d.left + 8 * j + x, y0 + y, picPixel(d.pic, d.s, 8 * src + (d.flip ? 7 - x : x), 8 * ty + y));
      }
    }
  }
  const caught = e.r16('caught_t');
  const frame = (c: number, x0: number, y0: number, w: number, h: number) => {
    for (let x = x0; x < x0 + w; x++) {
      put(x, y0, c);
      put(x, y0 + h - 1, c);
    }
    for (let y = y0; y < y0 + h; y++) {
      put(x0, y, c);
      put(x0 + w - 1, y, c);
    }
  };
  if (caught & 8) {
    frame(6, 0, 0, 128, VIEW_H);
    frame(6, 1, 1, 126, VIEW_H - 2);
  }
  const emp = e.r16('emp_fx');
  if (emp) {
    const g = (emp ^ 15) * 4;
    frame(13, 64 - g, VIEW_H / 2 - g, 2 * g, 2 * g);
  }
  const barkRows = before.bark_t! > 0 || e.r16('bark_t') > 0 ? 21 : 0;
  for (let y = barkRows; y < VIEW_H; y++)
    for (let x = 0; x < 128; x++) {
      if (e.vm.fb[y * 128 + x] !== want[y * 128 + x]) {
        fail(`${name} f${f}: screen pixel ${x},${y} is ${e.vm.fb[y * 128 + x]}, want ${want[y * 128 + x]}`);
        return 'bad';
      }
    }
  return 'ok';
}

/** BLACKBOX's line of sight (actors.asm ray): cells from the actor's centre cell along its direction */
function sightCells(e: Engine, room: number, open: OpenSides, x0: number, y0: number, dir: number, range: number): [number, number][] {
  const out: [number, number][] = [];
  const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir]!;
  let x = x0;
  let y = y0;
  for (let k = 0; k < range; k++) {
    x += dx!;
    y += dy!;
    if (x < 0 || x > 15 || y < 0 || y > 14) break;
    if (OPAQUE.has(cellChar(room, x, y, open))) break;
    out.push([x, y]);
  }
  return out;
}
const RANGE: Record<string, number> = { O_GUARD: 7, O_DRONE: 5, O_HEAVY: 9, O_CAMERA: 8, O_BOSS: 15 };
const RAY_COLOUR: Record<string, number> = { O_GUARD: 14, O_DRONE: 13, O_HEAVY: 9, O_CAMERA: 6, O_BOSS: 6 };
const DOT_COLOUR = [0, 6, 9, 6, 9, 9, 6, 11, 6, 14, 6];

/** the watchers' lines this frame (for the radar and the meter) */
function watchers(e: Engine, room: number, open: OpenSides) {
  const out: { i: number; type: number; cells: [number, number][]; colour: number }[] = [];
  const n = e.r16('n_actors');
  const name = (t: number) => Object.keys(RANGE).find((k) => e.b.sym(k) === t);
  for (let i = 0; i < n; i++) {
    const base = e.b.sym('actors') + i * 24;
    const w = (o: number) => s16(e.vm.read16(base + o));
    const k = name(w(0));
    if (!k || w(16) > 0 || (k === 'O_BOSS' && w(8) !== 0)) continue;
    out.push({ i, type: w(0), cells: sightCells(e, room, open, (w(2) + 4) >> 3, (w(4) + 4) >> 3, w(6), RANGE[k]!), colour: RAY_COLOUR[k]! });
  }
  return out;
}

function checkRadar(e: Engine, name: string, f: number, fail: (m: string) => void) {
  const room = e.r16('room');
  const open = openSides(e, room);
  const W0 = 3;
  const H0 = 93;
  const want: number[] = Array(32 * 32).fill(1);
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && x < 32 && y >= 0 && y < 32) want[y * 32 + x] = c;
  };
  for (let y = 0; y < 15; y++) for (let x = 0; x < 16; x++) for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(2 * x + a!, 2 * y + c!, RADAR[cellChar(room, x, y, open)]!);
  const w = watchers(e, room, open);
  const n = e.r16('n_actors');
  for (let i = 0; i < n; i++) {
    for (const wt of w.filter((v) => v.i === i)) for (const [x, y] of wt.cells) put(2 * x, 2 * y, wt.colour);
    const base = e.b.sym('actors') + i * 24;
    const aw = (o: number) => s16(e.vm.read16(base + o));
    const type = aw(0);
    if (type === 0 || type === e.b.sym('O_CAMERA')) continue;
    const colour = aw(16) > 0 ? 13 : DOT_COLOUR[type]!;
    const cx = (aw(2) + 4) >> 3;
    const cy = (aw(4) + 4) >> 3;
    for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(2 * cx + a!, 2 * cy + c!, colour);
  }
  const px = e.r16('pfx') >> 7;
  const py = e.r16('pfy') >> 7;
  put(px, py, 15);
  const a = e.r16('ang');
  const sin = Math.round(256 * Math.sin((a / 1024) * 2 * Math.PI));
  const cos = Math.round(256 * Math.cos((a / 1024) * 2 * Math.PI));
  put(px + (cos >> 7), py + (sin >> 7), 14);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++)
      if (e.vm.fb[(H0 + y) * 128 + W0 + x] !== want[y * 32 + x]) {
        fail(`${name} f${f}: radar pixel ${x},${y} is ${e.vm.fb[(H0 + y) * 128 + W0 + x]}, want ${want[y * 32 + x]}`);
        return;
      }
}

function check(name: string): Stats {
  const st: Stats = { frames: 0, maxCycles: 0, rays: 0, ambiguous: 0, images: 0, radars: 0, meters: 0, problems: [] };
  const fail = (m: string) => {
    if (st.problems.length < 20) st.problems.push(m);
  };
  const PLAY = b.sym('M_PLAY');
  const DIALOG = b.sym('M_DIALOG');
  runReplay(b, name, (e, f, before) => {
    st.frames++;
    st.maxCycles = Math.max(st.maxCycles, e.vm.cyclesLastFrame);
    if (e.vm.cyclesLastFrame > 25_000) fail(`${name} f${f}: ${e.vm.cyclesLastFrame} cycles`);
    const presented = e.r16('images') !== before.images;
    const after = e.r16('rray');
    const rays = presented ? Array.from({ length: NRAYS - before.rray! }, (_, i) => before.rray! + i) : after > before.rray! ? Array.from({ length: after - before.rray! }, (_, i) => before.rray! + i) : [];
    if (rays.length) checkRays(e, name, f, rays, st, fail);
    const mode = e.r16('mode');
    if (presented && (mode === PLAY || mode === DIALOG)) {
      if (checkScreen(e, name, f, before, fail) !== 'skip') st.images++;
    }
    if (mode === PLAY && before.mode === PLAY && e.r16('room') === before.room) {
      st.radars++;
      checkRadar(e, name, f, fail);
    }
    // the detection meter (DESIGN.md §3.7), on frames where the actors ran
    if (e.r16('act_ran') === 1) {
      st.meters++;
      const room = e.r16('room');
      const pc = [(e.s('px') + 4) >> 3, (e.s('py') + 4) >> 3];
      const seen = watchers(e, room, openSides(e, room)).some((w) => w.cells.some(([x, y]) => x === pc[0] && y === pc[1]));
      const m = before.meter!;
      const want = seen && e.r16('grace_t') === 0 ? (m + 4 >= 64 ? 0 : m + 4) : Math.max(0, m - 1);
      if (e.r16('meter') !== want) fail(`${name} f${f}: meter ${e.r16('meter')}, want ${want} (seen ${seen}, was ${m})`);
    }
  });
  return st;
}

describe.each(replayNames())('replay %s', (name) => {
  it('matches the committed per-frame hashes; no fault, no overrun', () => {
    const rf = loadReplay(name);
    const vm = startVM(b, rf.seed ?? 1);
    const hashes = replay(vm, rf.inputs, rf.frames);
    expect(vm.fault).toBeNull();
    expect(vm.overruns).toBe(0);
    const expected = readFileSync(join(GAME_DIR, 'replays', `${name}.hashes.txt`), 'utf8').trim().split('\n');
    const first = hashes.findIndex((h, i) => h !== expected[i]);
    expect(first, `first differing frame: ${first + 1}`).toBe(-1);
    expect(hashes.length).toBe(expected.length);
  });

  it('every ray, wall column, low block, screen, radar and meter agrees with the oracle; every frame within 25 000 cycles', () => {
    const st = check(name);
    console.log(`[bb3d] ${name}: ${st.frames} frames, ${st.images} screens, ${st.rays} rays (${st.ambiguous} where the budget allows more than one hit), ${st.radars} radars, ${st.meters} meter steps, max ${st.maxCycles} cycles per frame`);
    expect(st.problems).toEqual([]);
    expect(st.images).toBeGreaterThan(100);
  });
});

describe('what the replays demonstrate', () => {
  const trace = (name: string) => {
    const out: { room: string; mode: number; det: number; px: number; py: number; ang: number; meter: number; caught: number; badge: boolean; code: number }[] = [];
    runReplay(b, name, (e) => {
      const f = e.b.sym('F_BADGE');
      out.push({
        room: rooms[e.r16('room')]!.id,
        mode: e.r16('mode'),
        det: e.r16('det_count'),
        px: e.s('px'),
        py: e.s('py'),
        ang: e.r16('ang'),
        meter: e.r16('meter'),
        caught: e.r16('caught_t'),
        badge: ((e.r8('flags', f >> 3) >> (f & 7)) & 1) === 1,
        code: e.r8('code_text'),
      });
    });
    return out;
  };

  it('slice: 0.1 -> 1.1 -> 1.2 (badge) -> 1.3 -> 1.4 -> 2.1, unseen, and the access code for section 2 is shown', () => {
    const t = trace('slice');
    const order = t.map((x) => x.room).filter((r, i, a) => r !== a[i - 1]);
    expect(order).toEqual(['0.1', '1.1', '1.2', '1.3', '1.4', '2.1']);
    expect(t.every((x) => x.det === 0)).toBe(true);
    expect(t.find((x) => x.room === '1.3')!.badge).toBe(true);
    expect(t[t.length - 1]!.code).toBeGreaterThan(0);
  });

  it('caught: the meter fills, the room restarts and the player is back where they came in, facing the same way', () => {
    const t = trace('caught');
    const enter = t.findIndex((x) => x.room === '1.1');
    const det = t.findIndex((x) => x.det === 1);
    expect(det).toBeGreaterThan(enter);
    expect(t[det - 1]!.meter).toBe(60);
    const restart = t.findIndex((x, i) => i > det && x.caught === 0);
    expect([t[restart]!.px, t[restart]!.py, t[restart]!.ang]).toEqual([t[enter]!.px, t[enter]!.py, t[enter]!.ang]);
    expect(t[t.length - 1]!.room).toBe('1.2');
  });

  it('tour: a full turn in every room of the slice', () => {
    const t = trace('tour');
    for (const room of ['0.1', '1.1', '1.2', '1.3', '1.4']) expect(new Set(t.filter((x) => x.room === room).map((x) => x.ang)).size, room).toBe(128);
  });
});

describe('access codes are shared with BLACKBOX', () => {
  const codeOf = (vm: { read8: (a: number) => number }, at: number) => String.fromCharCode(...Array.from({ length: 8 }, (_, i) => vm.read8(at + i)));
  const enter = (vm: { write8: (a: number, v: number) => void; write16: (a: number, v: number) => void; step: (b: number) => unknown }, sym: (n: string) => number, code: string) => {
    for (let i = 0; i < 8; i++) vm.write8(sym('code_text') + i, code.charCodeAt(i));
    vm.write16(sym('dbg_code'), 1);
    vm.step(0);
  };

  it('the slice shows the same code as BLACKBOX at the same point, and each game resumes from the other\'s code', async () => {
    // BLACKBOX 3D's code, from the end of the slice
    const { vm: vm3 } = runReplay(b, 'slice', () => {});
    const code3 = codeOf(vm3, b.sym('code_text'));
    expect(code3).toMatch(/^[A-Z2-9]{8}$/);
    // BLACKBOX's own code at the door of 2.1, from its recorded run m16-left
    const bb = await buildBlackbox();
    const sym = (n: string) => bb.sym.get(n)!;
    const rf = JSON.parse(readFileSync(join(BB, 'replays', 'm16-left.json'), 'utf8')) as ReplayFile & { frames: number };
    const run = startVM({ ...b, cart: bb.cart }, rf.seed ?? 1);
    const inputs = expandInputs(rf.inputs, rf.frames);
    let code2 = '';
    for (let f = 0; f < rf.frames && !code2; f++) {
      run.step(inputs[f]!);
      if (run.read16(sym('room')) === sym('R_2_1') && run.read8(sym('code_text')) !== 0) code2 = codeOf(run, sym('code_text'));
    }
    expect(code2).toBe(code3);
    const vm2 = startVM({ ...b, cart: bb.cart }, 1);
    vm2.step(0);
    enter(vm2, sym, code3);
    expect(vm2.read16(sym('code_ok'))).toBe(1);
    expect(vm2.read16(sym('room'))).toBe(sym('R_2_1'));
    const vm = startVM(b);
    vm.step(0);
    enter(vm, b.sym, code2);
    expect(vm.read16(b.sym('code_ok'))).toBe(1);
    expect(vm.read16(b.sym('room'))).toBe(b.sym('R_2_1'));
  });
});
