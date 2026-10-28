// The test oracle for the FPS spike (PLAN.md Part 4, M26): its own reading of SPIKE.md, written independently
// of the engine and of the table generator. Geometry is cast in floating point from the camera the engine took;
// pixels are derived from the art with the sampling rules of SPIKE.md §3.4. What the engine holds in RAM is
// compared against this, never against itself. Shared design data it does use: the art and the map (art.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type VM, expandInputs, type ReplayFile } from '@qrc/vm';
import { CELL, DARK, ENEMY, FLASH, GUN, SPRITE_SIZES, TEXTURES, TEXTURE_OF, pixels, readLevel } from '../../games/fps/tools/art';
import { type FpsBuild, startVM } from '../../games/fps/tools/game';

export const GAME_DIR = join(import.meta.dirname, '../../games/fps');
export const s16 = (v: number) => (v << 16) >> 16;
const LEVEL = readLevel();

// ---- SPIKE.md §3.1: the camera ---------------------------------------------------------------------
export const FOCAL_PX = 97; // 64 / 0.66, rounded
export const VIEW_H = 96;
export const PERP_MIN = 0.25;

export interface Camera {
  x: number; // cells
  y: number;
  ang: number; // 0..1023
}

export interface Hit {
  cell: number;
  side: 0 | 1;
  perp: number; // cells
  u: number; // texture column 0..15
  steps: number; // DDA steps taken
}

/** SPIKE.md §3.1: sin and cos of angle a (0..1023) in 8.8, as the engine's tables hold them */
export const sin8 = (a: number) => Math.round(Math.sin(((a & 1023) / 1024) * 2 * Math.PI) * 256);
export const cos8 = (a: number) => sin8(a + 256);
/** SPIKE.md §3.1: a camera-plane component, 169/256 of v, computed as v - (87·v + 128) / 256 (floored) */
const plane8 = (v: number) => v - Math.floor((87 * v + 128) / 256);
/** SPIKE.md §3.1: the direction of ray c of n in 8.8 units (dir + plane · camX, camX in 1.7, rounded) */
export function rayDir(ang: number, c: number, n: number): [number, number] {
  const cam7 = Math.round(((2 * c + 1) / n - 1) * 128);
  const px = -plane8(sin8(ang));
  const py = plane8(cos8(ang));
  return [cos8(ang) + Math.floor((px * cam7 + 64) / 128), sin8(ang) + Math.floor((py * cam7 + 64) / 128)];
}

/**
 * SPIKE.md §3.7: the engine's error budget. With the camera quantised as in §3.1, what remains is its 8.8
 * DDA arithmetic: a ray parameter t (distance along the view, in cells) is off by at most (2 + steps) / 256
 * plus 0.4 % (reciprocals of up to 425 rounded to integers).
 */
export const tErr = (t: number, steps: number) => (2 + steps) / 256 + 0.004 * t;

/** SPIKE.md §3.3: a ray with direction (rdx, rdy) (cells per unit of t) from (x, y), cast in floating point. */
export function castFrom(x: number, y: number, rdx: number, rdy: number, doorOpen: (cell: number) => number): Hit {
  let mx = Math.floor(x);
  let my = Math.floor(y);
  const ddx = Math.abs(1 / rdx);
  const ddy = Math.abs(1 / rdy);
  const stepX = rdx < 0 ? -1 : 1;
  const stepY = rdy < 0 ? -1 : 1;
  let sx = rdx < 0 ? (x - mx) * ddx : (mx + 1 - x) * ddx;
  let sy = rdy < 0 ? (y - my) * ddy : (my + 1 - y) * ddy;
  for (let steps = 1; steps < 64; steps++) {
    let side: 0 | 1;
    if (sx < sy) {
      mx += stepX;
      sx += ddx;
      side = 0;
    } else {
      my += stepY;
      sy += ddy;
      side = 1;
    }
    const cell = my * 16 + mx;
    const code = LEVEL.cells[cell]!;
    if (code === CELL.EMPTY) continue;
    if ((side === 0 && code === CELL.DOOR_V) || (side === 1 && code === CELL.DOOR_H)) {
      // the door plane is in the middle of the cell; the door slides towards -y (-x), its open part first
      const pd = side === 0 ? sx - ddx / 2 : sy - ddy / 2;
      if (pd >= (side === 0 ? sy : sx)) continue;
      const w = side === 0 ? y + pd * rdy : x + pd * rdx;
      const frac = w - Math.floor(w);
      const open = doorOpen(cell) / 256;
      if (frac < open) continue;
      return { cell, side, perp: pd, u: Math.floor((frac - open) * 16), steps };
    }
    const perp = side === 0 ? sx - ddx : sy - ddy;
    const w = side === 0 ? y + perp * rdy : x + perp * rdx;
    return { cell, side, perp, u: Math.floor((w - Math.floor(w)) * 16), steps };
  }
  throw new Error('ray left the map');
}

/**
 * Ray c of n from the camera, and the same ray with the camera moved by what the error budget allows in t along
 * each axis (ε·|rdx|, ε·|rdy|): the engine's hit must equal one of these (SPIKE.md §3.7).
 */
export function castRef(cam: Camera, c: number, n: number, doorOpen: (cell: number) => number): { hits: Hit[]; tol: (h: Hit) => { perp: number; u: number } } {
  const [rdx, rdy] = rayDir(cam.ang, c, n).map((v) => v / 256) as [number, number];
  const base = castFrom(cam.x, cam.y, rdx, rdy, doorOpen);
  const eps = tErr(base.perp + 0.5, base.steps + 2);
  const hits: Hit[] = [];
  for (const ex of [0, -1, 1]) for (const ey of [0, -1, 1]) hits.push(castFrom(cam.x + ex * eps * Math.abs(rdx), cam.y + ey * eps * Math.abs(rdy), rdx, rdy, doorOpen));
  const tol = (h: Hit) => {
    const rt = Math.abs(h.side === 0 ? rdy : rdx);
    return { perp: tErr(h.perp, h.steps), u: 1 + Math.floor(16 * tErr(h.perp, h.steps) * rt) };
  };
  return { hits, tol };
}

/** SPIKE.md §3.4: the colour of row y of a wall column of height h, texture column u (or null: no wall). */
export function wallPixel(h: number, y: number, column: number[]): number | null {
  const s = 16 * y + 8 - (16 * (VIEW_H / 2) - 8 * h);
  if (s < 0 || s >= 16 * h) return null;
  return column[Math.floor(s / h)]!;
}

const TEX = Object.fromEntries(Object.entries(TEXTURES).map(([k, rows]) => [k, pixels(rows, 16, 16)]));
/** texture column u of the wall `code` seen from `side` (dark on y sides), top to bottom */
export function textureColumn(code: number, side: number, u: number): number[] {
  const px = TEX[TEXTURE_OF[code]!]!;
  return Array.from({ length: 16 }, (_, v) => (side ? DARK[px[v * 16 + u]!]! : px[v * 16 + u]!));
}

/** the enemy picture scaled to s x s by nearest neighbour (SPIKE.md §2.4) */
export function enemyPixel(pose: string, s: number, x: number, y: number): number {
  const src = ENEMY[pose]!;
  return parseInt(src[Math.floor((y * 16) / s)]![Math.floor((x * 16) / s)]!.replace('.', '0'), 16);
}
export const GUN_PX = pixels(GUN, 24, 16);
export const FLASH_PX = pixels(FLASH, 24, 8);
export { LEVEL, SPRITE_SIZES };

// ---- reading the engine ------------------------------------------------------------------------------
export interface Engine {
  b: FpsBuild;
  vm: VM;
  nrays: number;
  colw: number;
  r16: (name: string) => number;
  s: (name: string) => number;
}

export function engine(b: FpsBuild, vm: VM): Engine {
  const nrays = b.sym('NRAYS');
  return {
    b,
    vm,
    nrays,
    colw: 128 / nrays,
    r16: (name) => vm.read16(b.sym(name)),
    s: (name) => s16(vm.read16(b.sym(name))),
  };
}

/** pixel (x, y) of the view buffer in RAM (SPIKE.md §3.2) */
export function bufPixel(e: Engine, x: number, y: number): number {
  const bx = x >> 1;
  const byte = e.vm.read8(e.b.sym('buf') + (bx >> 2) * 384 + y * 4 + (bx & 3));
  return x & 1 ? byte & 15 : byte >> 4;
}

export function loadReplay(name: string): ReplayFile & { frames: number } {
  return JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8')) as ReplayFile & { frames: number };
}

export function replayNames(): string[] {
  return ['spin', 'door_fight', 'hall', 'hurt'];
}

/** Runs a replay, calling `each` after every frame with the engine and the rays cast in that frame. */
export function runReplay(b: FpsBuild, name: string, each: (e: Engine, frame: number, rays: number[], presented: boolean) => void, cyclesPerFrame?: number) {
  const rf = loadReplay(name);
  const vm = startVM(b, rf.seed ?? 1, cyclesPerFrame);
  const e = engine(b, vm);
  const inputs = expandInputs(rf.inputs, rf.frames);
  for (let f = 0; f < rf.frames; f++) {
    const before = e.r16('rray');
    const images = e.r16('images');
    vm.step(inputs[f]!);
    if (vm.fault) throw new Error(`${name} frame ${f + 1}: fault ${vm.fault}`);
    const after = e.r16('rray');
    const end = after === 0 ? e.nrays : after;
    const rays = Array.from({ length: end - before }, (_, i) => before + i);
    each(e, f + 1, rays, e.r16('images') !== images);
  }
  return { vm, e, rf };
}
