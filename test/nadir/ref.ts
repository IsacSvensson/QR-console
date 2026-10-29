// The test oracle for NADIR: its own reading of games/nadir/DESIGN.md (§3.2-3.5), the map sources and the
// material list, and a floating-point raycaster. What the engine holds in RAM is compared against this, never
// against itself (PLAN.md Part 4). It shares no code with the game's generators.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GAME_DIR = fileURLToPath(new URL('../../games/nadir', import.meta.url));
const design = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');
const between = (a: string, b: string) => design.slice(design.indexOf(a), design.indexOf(b, design.indexOf(a) + a.length));

/** DESIGN §3.3 */
export const K: Record<string, number> = Object.fromEntries([...between('### 3.3', '### 3.4').matchAll(/^\| `([A-Z_0-9]+)` \| (-?\d+) \|/gm)].map((m) => [m[1]!, Number(m[2])]));
const light35 = between('### 3.5', '### 3.6');
/** DESIGN §3.5: flicker patterns by group */
export const FLICKER: string[] = [...light35.matchAll(/^\| (\d) \| `([01]{32})` \|/gm)].map((m) => m[2]!);
/** DESIGN §3.5: cone value per sample column */
export const CONE: number[] = (() => {
  const out = new Array<number>(64).fill(0);
  for (const m of light35.matchAll(/^\| (\d) \| ([\d–, ]+) \|$/gm))
    for (const part of m[2]!.split(',')) {
      const [a, b] = part.trim().split('–').map(Number);
      for (let c = a!; c <= (b ?? a!); c++) out[c] = Number(m[1]);
    }
  return out;
})();
/** DESIGN §3.5: amb per zone */
export const AMB: number[] = [...light35.matchAll(/^\| (\d) \| \S+ \| (\d) \|/gm)].map((m) => Number(m[2]));

/** art/textures.txt: map character of material id i + 1 */
export const MATERIAL_CHARS: string[] = [...readFileSync(join(GAME_DIR, 'art', 'textures.txt'), 'utf8').matchAll(/^material ([A-Z]) /gm)].map((m) => m[1]!);

export interface RefMap {
  grid: string[];
  zones: number[][];
  lamps: { x: number; y: number; i: number; g: number }[];
  poses: { name: string; x: number; y: number; deg: number }[];
}

export function readRefMap(name = 'proto'): RefMap {
  const m: RefMap = { grid: [], zones: [], lamps: [], poses: [] };
  let part = '';
  for (const raw of readFileSync(join(GAME_DIR, 'levels', `${name}.map`), 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (['grid', 'zones', 'lamps', 'poses'].includes(line)) part = line;
    else if (line.startsWith('name ')) continue;
    else if (part === 'grid') m.grid.push(line);
    else if (part === 'zones') m.zones.push([...line].map(Number));
    else if (part === 'lamps') {
      const [x, y, i, g] = line.split(/\s+/).map(Number);
      m.lamps.push({ x: x!, y: y!, i: i!, g: g! });
    } else if (part === 'poses') {
      const [name, x, y, deg] = line.split(/\s+/);
      m.poses.push({ name: name!, x: Number(x), y: Number(y), deg: Number(deg) });
    }
  }
  return m;
}

export const solid = (m: RefMap, x: number, y: number) => x < 0 || y < 0 || y >= m.grid.length || x >= m.grid[0]!.length || m.grid[y]![x] !== '.';

/** DESIGN §3.5: { static, flicker, group } per cell from the lamps. */
export function refLight(m: RefMap): { s: number; f: number; g: number }[][] {
  const H = m.grid.length;
  const W = m.grid[0]!.length;
  const out = Array.from({ length: H }, () => Array.from({ length: W }, () => ({ s: 0, f: 0, g: 0 })));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (solid(m, x, y)) continue;
      for (const l of m.lamps) {
        const v = Math.max(0, l.i - Math.floor(Math.hypot(x - l.x, y - l.y)));
        if (!v) continue;
        let free = true;
        for (let k = 1; k < 64 && free; k++) free = !solid(m, Math.floor(l.x + 0.5 + ((x - l.x) * k) / 64), Math.floor(l.y + 0.5 + ((y - l.y) * k) / 64));
        if (!free) continue;
        const c = out[y]![x]!;
        if (l.g === 0) c.s = Math.max(c.s, v);
        else if (v > c.f || (v === c.f && l.g < c.g)) {
          c.f = v;
          c.g = l.g;
        }
      }
    }
  return out;
}

/** DESIGN §3.2: tabulated angle offset of sample column c (angle units) */
export function colOff(c: number): number {
  const camX = (2 * c + 1 - 64) / 64;
  return Math.round((Math.atan(camX * Math.tan(((K.FOV_DEG! / 2) * Math.PI) / 180)) * K.ANGLES!) / (2 * Math.PI));
}

export interface RefHit {
  cell: number;
  side: number;
  face: number;
  front: number;
  t: number;
  perp: number;
  h: number;
  /** texel 0..31 and the hit's fraction along the face (0..1, before mirroring) */
  u: number;
  frac: number;
}

/** DESIGN §3.2: the ray of sample column c from (x, y) in cells at camera angle a (units), in floating point. */
export function castRef(m: RefMap, x: number, y: number, a: number, c: number): RefHit {
  const W = m.grid[0]!.length;
  const off = colOff(c) + 0.5;
  const th = ((a + off) * 2 * Math.PI) / K.ANGLES!;
  const dx = Math.cos(th);
  const dy = Math.sin(th);
  let mx = Math.floor(x);
  let my = Math.floor(y);
  const ddx = Math.abs(1 / dx);
  const ddy = Math.abs(1 / dy);
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  let sdx = (dx < 0 ? x - mx : mx + 1 - x) * ddx;
  let sdy = (dy < 0 ? y - my : my + 1 - y) * ddy;
  for (;;) {
    let side: number;
    let t: number;
    const pmx = mx;
    const pmy = my;
    if (sdx < sdy) {
      t = sdx;
      sdx += ddx;
      mx += sx;
      side = sx > 0 ? 0 : 1;
    } else {
      t = sdy;
      sdy += ddy;
      my += sy;
      side = sy > 0 ? 2 : 3;
    }
    if (solid(m, mx, my)) {
      const hx = x + t * dx;
      const hy = y + t * dy;
      const frac = side < 2 ? hy - Math.floor(hy) : hx - Math.floor(hx);
      let u = Math.min(31, Math.floor(frac * 32));
      if (side === 1 || side === 2) u = 31 - u;
      const perp = t * Math.cos((off * 2 * Math.PI) / K.ANGLES!);
      return { cell: my * W + mx, side, face: (my * W + mx) * 4 + side, front: pmy * W + pmx, t, perp, h: K.F256! / 256 / perp, u, frac };
    }
  }
}

/** DESIGN §3.5: the light level of a column drawn h px tall, in front of `front`, at column c, frame tick. */
export function refLevel(m: RefMap, light: ReturnType<typeof refLight>, front: number, h: number, c: number, tick: number): number {
  const W = m.grid[0]!.length;
  const fx = front % W;
  const fy = Math.floor(front / W);
  const q = h === 0 ? 255 : Math.min(255, Math.floor(K.F256! / (64 * Math.min(h, 255))));
  const fog = q < K.FOG_NEAR_Q! ? 0 : Math.min(7, 1 + Math.floor((q - K.FOG_NEAR_Q!) / K.FOG_STEP_Q!));
  const L = light[fy]![fx]!;
  const lit = FLICKER[L.g]![(tick >> K.FLICK_SHIFT!) & 31] === '1';
  const lightv = Math.max(L.s, lit ? L.f : 0);
  const cone = q < K.FL_RANGE_Q! ? CONE[c]! : 0;
  return Math.max(0, Math.min(7, fog + AMB[m.zones[fy]![fx]!]! - lightv - cone));
}
