// The test oracle for BLACKBOX 3D (PLAN.md Part 5): its own reading of LAYOUT.md (through BLACKBOX's independent
// reader, test/blackbox/oracle.ts), of games/blackbox3d/DESIGN.md §3-4, and of the art. Rays are cast in floating
// point from the camera the engine took (the camera quantisation of SPIKE.md §3.1, reused from test/fps/oracle.ts);
// pixels follow the rules of DESIGN.md. What the engine holds in RAM and on screen is compared against this.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type VM, expandInputs, type ReplayFile } from '@qrc/vm';
import { ACTOR_ART, DARK, SETS, SPRITE_SIZES, TEX_NAMES, ZONE_SET, lowTop, texturePixels } from '../../games/blackbox3d/tools/art';
import { type Bb3dBuild, startVM } from '../../games/blackbox3d/tools/game';
import { rooms, tileClass } from '../blackbox/oracle';
import { rayDir, tErr } from '../fps/oracle';

export const GAME_DIR = join(import.meta.dirname, '../../games/blackbox3d');
export const s16 = (v: number) => (v << 16) >> 16;
export const VIEW_H = 88;
export const NRAYS = 64;
export const PERP_MIN = 64; // 8.8
export const LOW_ROW = 10;
export { rooms };

// ---- DESIGN.md §3.1: render codes from LAYOUT.md --------------------------------------------------
const FULL: Record<string, number> = { '#': 1, S: 2, C: 3, D: 4, V: 5, L: 6 };
const LOW: Record<string, number> = { '=': 0x88, T: 0x89, E: 0x8a, K: 0x8b };
export const PORTAL = 7;

/** sides of the room whose border cells a lock flag has opened: side -> open */
export type OpenSides = Set<string>;

export function borderSide(x: number, y: number): string | null {
  if (y === 0) return 'N';
  if (y === 14) return 'S';
  if (x === 15) return 'E';
  if (x === 0) return 'W';
  return null;
}

/** the LAYOUT character of a cell as it stands: a locked door on a side whose lock is open is a doorway */
export function cellChar(room: number, x: number, y: number, open: OpenSides): string {
  const ch = tileClass(rooms[room]!.grid[y]![x]!);
  const side = borderSide(x, y);
  return ch === 'D' && side && open.has(side) ? '+' : ch;
}

export function renderCode(room: number, x: number, y: number, open: OpenSides): number {
  if (y < 0 || y > 14) return 1; // rows -1 and 15 are solid
  const ch = cellChar(room, x, y, open);
  const border = borderSide(x, y) !== null;
  if ((ch === '+' || ch === 'V') && border) return PORTAL;
  return FULL[ch] ?? LOW[ch] ?? 0;
}

/** BLACKBOX's attributes (LAYOUT.md legend): what blocks sight */
export const OPAQUE = new Set(['#', 'S', 'C', 'D', 'V', 'L']);
/** DESIGN.md §3.5: radar colour of each LAYOUT class */
export const RADAR: Record<string, number> = { '.': 1, '+': 1, '#': 7, S: 4, C: 6, D: 6, '=': 5, V: 13, T: 11, E: 9, L: 10, K: 14 };

export function setOf(room: number): number {
  return ZONE_SET[Number(rooms[room]!.id.split('.')[0])]!;
}

// ---- DESIGN.md §3.3-3.4: rays with low blocks -----------------------------------------------------
export interface Block {
  front: number; // cells
  back: number;
  side: 0 | 1;
  code: number;
  /** how far (in t) the other axis' nearest boundary crossing (before or after) is from the entry: near 0 = a corner */
  corner: number;
}
export interface Hit {
  cell: number;
  side: 0 | 1;
  perp: number;
  u: number;
  steps: number;
  blocks: Block[];
}

/** A ray from (x, y) with direction (rdx, rdy), cast in floating point over the render codes. */
export function castFrom(x: number, y: number, rdx: number, rdy: number, code: (cx: number, cy: number) => number): Hit {
  let mx = Math.floor(x);
  let my = Math.floor(y);
  const ddx = Math.abs(1 / rdx);
  const ddy = Math.abs(1 / rdy);
  const stepX = rdx < 0 ? -1 : 1;
  const stepY = rdy < 0 ? -1 : 1;
  let sx = rdx < 0 ? (x - mx) * ddx : (mx + 1 - x) * ddx;
  let sy = rdy < 0 ? (y - my) * ddy : (my + 1 - y) * ddy;
  const blocks: Block[] = [];
  for (let steps = 1; steps < 80; steps++) {
    let side: 0 | 1;
    let entry: number;
    if (sx < sy) {
      entry = sx;
      mx += stepX;
      sx += ddx;
      side = 0;
    } else {
      entry = sy;
      my += stepY;
      sy += ddy;
      side = 1;
    }
    const c = code(mx, my);
    if (c === 0) continue;
    if (c >= 0x80) {
      const exit = Math.min(sx, sy);
      const last = blocks[blocks.length - 1];
      if (last && Math.abs(last.back - entry) < 1e-9) last.back = exit;
      else if (blocks.length < 2) blocks.push({ front: entry, back: exit, side, code: c & 127, corner: side === 0 ? Math.min(Math.abs(sy - entry), Math.abs(sy - ddy - entry)) : Math.min(Math.abs(sx - entry), Math.abs(sx - ddx - entry)) });
      continue;
    }
    const perp = entry;
    const w = side === 0 ? y + perp * rdy : x + perp * rdx;
    return { cell: my * 16 + mx, side, perp, u: Math.floor((w - Math.floor(w)) * 16), steps, blocks };
  }
  throw new Error('ray left the room');
}

/** ray c from the camera, and from the camera moved within the error budget (SPIKE.md §3.7): 9 casts */
export function castRef(cam: { x: number; y: number; ang: number }, c: number, code: (cx: number, cy: number) => number) {
  const [rdx, rdy] = rayDir(cam.ang, c, NRAYS).map((v) => v / 256) as [number, number];
  const base = castFrom(cam.x, cam.y, rdx, rdy, code);
  const eps = tErr(base.perp + 0.5, base.steps + 2);
  const hits: Hit[] = [];
  for (const ex of [0, -1, 1]) for (const ey of [0, -1, 1]) hits.push(castFrom(cam.x + ex * eps * Math.abs(rdx), cam.y + ey * eps * Math.abs(rdy), rdx, rdy, code));
  // along the wall: the DDA budget, plus the camera's own move in the variant (its wall coordinate moves with it)
  const tol = (h: Hit, perp: number) => {
    const along = Math.abs(h.side === 0 ? rdy : rdx);
    return { perp: tErr(perp, h.steps), u: 1 + Math.floor(16 * (tErr(perp, h.steps) + eps) * along) };
  };
  return { hits, tol, rdx: rayDir(cam.ang, c, NRAYS)[0], rdy: rayDir(cam.ang, c, NRAYS)[1] };
}

// ---- DESIGN.md §3.2-3.4: pixels ------------------------------------------------------------------
/** texel row of row y on a wall h high (or null: not on the wall) */
export function texelRow(h: number, y: number): number | null {
  const s = 16 * y + 8 - (16 * (VIEW_H / 2) - 8 * h);
  if (s < 0 || s >= 16 * h) return null;
  return Math.floor(s / h);
}
/** h for a distance (8.8): 2 * floor(97 * 256 / max(d, 64)) */
export const heightAt = (d: number) => 2 * Math.floor((97 * 256) / Math.max(d, PERP_MIN));
/** first row of a low block's top edge at height h: (8 * 88 - 8 + 2h + 15) >> 4 */
export const lowTopRow = (h: number) => (8 * VIEW_H - 8 + 2 * h + 15) >> 4;

const TEXCACHE = new Map<string, number[]>();
/** texture column u of render texture t (1..11) in tileset `set`, side-shaded, top to bottom */
export function texColumn(t: number, set: number, side: number, u: number): number[] {
  const key = `${t},${set}`;
  let px = TEXCACHE.get(key);
  if (!px) TEXCACHE.set(key, (px = texturePixels(TEX_NAMES[t - 1]!, set)));
  return Array.from({ length: 16 }, (_, v) => (side ? DARK[px![v * 16 + u]!]! : px![v * 16 + u]!));
}
export const lowTopColour = (t: number, set: number) => lowTop(TEX_NAMES[t - 1]!, set);
export const ceilColour = (set: number) => SETS[set]!.ceil;
export const floorColour = (set: number) => SETS[set]!.floor;

/** pixel (sx, sy) of actor picture `name` at size s (nearest neighbour from 16x16) */
export function picPixel(name: string, s: number, x: number, y: number): number {
  const ch = ACTOR_ART[name]![Math.floor((y * 16) / s)]![Math.floor((x * 16) / s)]!;
  return ch === '.' ? 0 : parseInt(ch, 16);
}
export { SPRITE_SIZES };

// ---- running a replay ----------------------------------------------------------------------------
export interface Engine {
  b: Bb3dBuild;
  vm: VM;
  r16: (name: string, off?: number) => number;
  s: (name: string, off?: number) => number;
  r8: (name: string, off?: number) => number;
}

export function loadReplay(name: string): ReplayFile & { frames: number } {
  return JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8')) as ReplayFile & { frames: number };
}
export const replayNames = () => ['slice', 'tour', 'caught'];

export function runReplay(b: Bb3dBuild, name: string, each: (e: Engine, frame: number, before: Record<string, number>) => void) {
  const rf = loadReplay(name);
  const vm = startVM(b, rf.seed ?? 1);
  const e: Engine = {
    b,
    vm,
    r16: (n, o = 0) => vm.read16(b.sym(n) + o),
    s: (n, o = 0) => s16(vm.read16(b.sym(n) + o)),
    r8: (n, o = 0) => vm.read8(b.sym(n) + o),
  };
  const inputs = expandInputs(rf.inputs, rf.frames);
  const watch = ['rray', 'images', 'bark_t', 'meter', 'det_count', 'room', 'caught_t', 'mode'];
  for (let f = 0; f < rf.frames; f++) {
    const before = Object.fromEntries(watch.map((w) => [w, e.s(w)]));
    vm.step(inputs[f]!);
    if (vm.fault) throw new Error(`${name} frame ${f + 1}: fault ${vm.fault}`);
    each(e, f + 1, before);
  }
  return { vm, e, rf };
}
