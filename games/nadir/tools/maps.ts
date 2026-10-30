// Reads levels/<name>.map and writes map.gen.asm (DESIGN.md §3.2, §3.5, §3.10, §7): the grid of map bytes, the
// light map (DESIGN §3.5's rule), the zone map (all three in xdata, copied into RAM by init), the doors, key
// triggers, lamps and camera poses (ROM). Checks the map rules (solid border, thin cells between two walls,
// MAX_SIGHT) and writes levels/<name>.png.
// Run: npx tsx games/nadir/tools/maps.ts [name]   (or npm run nadir:gen)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { PALETTE } from '@qrc/vm';
import { k } from './design';
import { COLANG, ANGLES } from './tables';
import { readMaterials } from './textures';
import { GAME_DIR, byteLines, isMain, wordLines } from './util';

export interface Lamp {
  x: number;
  y: number;
  intensity: number;
  group: number;
}
export interface Pose {
  name: string;
  x: number;
  y: number;
  deg: number;
}
export interface Door {
  x: number;
  y: number;
  /** 0 = no key, otherwise the key bit that unlocks it */
  key: number;
}
export interface KeyTrigger {
  x: number;
  y: number;
  bit: number;
}
export interface GameMap {
  name: string;
  W: number;
  H: number;
  /** material char or '.' per cell, [y][x] */
  grid: string[];
  zones: number[][];
  lamps: Lamp[];
  poses: Pose[];
  doors: Door[];
  keys: KeyTrigger[];
}

export function readMap(name = 'nadir'): GameMap {
  const lines = readFileSync(join(GAME_DIR, 'levels', `${name}.map`), 'utf8').split(/\r?\n/);
  const m: GameMap = { name: '', W: k('MAP_W'), H: k('MAP_H'), grid: [], zones: [], lamps: [], poses: [], doors: [], keys: [] };
  let part = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const where = `levels/${name}.map:${i + 1}`;
    if (!line || line.startsWith('#')) continue;
    const [kw, ...args] = line.split(/\s+/);
    if (kw === 'name') m.name = args.join(' ');
    else if (['grid', 'zones', 'lamps', 'poses', 'doors', 'keys'].includes(kw!)) part = kw!;
    else if (part === 'grid') {
      if (line.length !== m.W) throw new Error(`${where}: grid row has ${line.length} cells, expected ${m.W}`);
      m.grid.push(line);
    } else if (part === 'zones') {
      if (!/^\d+$/.test(line) || line.length !== m.W) throw new Error(`${where}: zone row must be ${m.W} digits`);
      m.zones.push([...line].map(Number));
    } else if (part === 'lamps') {
      const [x, y, intensity, group] = [kw, ...args].map(Number);
      m.lamps.push({ x: x!, y: y!, intensity: intensity!, group: group! });
    } else if (part === 'doors') {
      const [x, y, key] = [kw, ...args].map(Number);
      m.doors.push({ x: x!, y: y!, key: key! });
    } else if (part === 'keys') {
      const [x, y, bit] = [kw, ...args].map(Number);
      m.keys.push({ x: x!, y: y!, bit: bit! });
    } else if (part === 'poses') {
      m.poses.push({ name: kw!, x: Number(args[0]), y: Number(args[1]), deg: Number(args[2]) });
    } else throw new Error(`${where}: unexpected '${line}'`);
  }
  if (m.grid.length !== m.H || m.zones.length !== m.H) throw new Error(`levels/${name}.map: expected ${m.H} grid and zone rows`);
  return m;
}

export const solidAt = (m: GameMap, x: number, y: number) => x < 0 || y < 0 || x >= m.W || y >= m.H || m.grid[y]![x] !== '.';

const maskedChars = () => new Set(readMaterials().filter((x) => x.masked).map((x) => x.char));
/** a thin cell (DESIGN §3.10): a door or a masked wall, with a plane through the cell centre */
export const thinAt = (m: GameMap, x: number, y: number, masked = maskedChars()) => {
  const c = m.grid[y]?.[x];
  return c === '+' || (c !== undefined && masked.has(c));
};
/** a wall that stops every ray (not floor, not a thin cell) */
export const wallAt = (m: GameMap, x: number, y: number, masked = maskedChars()) => solidAt(m, x, y) && !thinAt(m, x, y, masked);

/**
 * DESIGN §3.10: orientation of a thin cell. 1 = the plane x = cx + 1/2 (walls or thin cells north and south, floor
 * west and east); 0 = the plane y = cy + 1/2. A door needs walls (its frame) on both sides.
 */
export function thinOrient(m: GameMap, x: number, y: number): 0 | 1 {
  const floor = (dx: number, dy: number) => !solidAt(m, x + dx, y + dy);
  const door = m.grid[y]![x] === '+';
  const side = (dx: number, dy: number) => (door ? wallAt(m, x + dx, y + dy) : solidAt(m, x + dx, y + dy));
  if (side(0, -1) && side(0, 1) && floor(-1, 0) && floor(1, 0)) return 1;
  if (side(-1, 0) && side(1, 0) && floor(0, -1) && floor(0, 1)) return 0;
  throw new Error(`${m.name}: thin cell at ${x},${y} needs ${door ? 'walls' : 'walls or thin cells'} on two opposite sides and floor on the other two`);
}

/** DESIGN §7: the longest free sight line (through thin cells) from any floor cell centre in 256 directions. */
export function longestSight(m: GameMap): { d: number; x: number; y: number; deg: number } {
  const masked = maskedChars();
  let best = { d: 0, x: 0, y: 0, deg: 0 };
  for (let cy = 0; cy < m.H; cy++)
    for (let cx = 0; cx < m.W; cx++) {
      if (m.grid[cy]![cx] !== '.') continue;
      for (let i = 0; i < 256; i++) {
        const a = ((i + 0.5) * 2 * Math.PI) / 256;
        const d = sightDist(m, cx + 0.5, cy + 0.5, Math.cos(a), Math.sin(a), masked);
        if (d > best.d) best = { d, x: cx, y: cy, deg: ((i + 0.5) * 360) / 256 };
      }
    }
  return best;
}

function sightDist(m: GameMap, px: number, py: number, dx: number, dy: number, masked: Set<string>): number {
  let mx = Math.floor(px);
  let my = Math.floor(py);
  const ddx = Math.abs(1 / dx);
  const ddy = Math.abs(1 / dy);
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  let sdx = (dx < 0 ? px - mx : mx + 1 - px) * ddx;
  let sdy = (dy < 0 ? py - my : my + 1 - py) * ddy;
  for (;;) {
    let t: number;
    if (sdx < sdy) {
      t = sdx;
      sdx += ddx;
      mx += sx;
    } else {
      t = sdy;
      sdy += ddy;
      my += sy;
    }
    if (wallAt(m, mx, my, masked)) return t;
  }
}

/** DESIGN §3.5: a lamp lights a cell if none of the 63 points between the two cell centres is in a solid cell. */
export function visible(m: GameMap, ax: number, ay: number, bx: number, by: number): boolean {
  for (let i = 1; i < 64; i++) {
    const px = ax + 0.5 + ((bx - ax) * i) / 64;
    const py = ay + 0.5 + ((by - ay) * i) / 64;
    if (solidAt(m, Math.floor(px), Math.floor(py))) return false;
  }
  return true;
}

/** DESIGN §3.5: light map byte per cell (bits 0-2 static, 3-5 flickering, 6-7 group). */
export function lightMap(m: GameMap): Uint8Array {
  const out = new Uint8Array(m.W * m.H);
  for (let y = 0; y < m.H; y++)
    for (let x = 0; x < m.W; x++) {
      if (solidAt(m, x, y)) continue;
      let stat = 0;
      let flick = 0;
      let group = 0;
      for (const l of m.lamps) {
        const v = Math.max(0, l.intensity - Math.floor(Math.hypot(x - l.x, y - l.y)));
        if (v === 0 || !visible(m, l.x, l.y, x, y)) continue;
        if (l.group === 0) stat = Math.max(stat, v);
        else if (v > flick || (v === flick && l.group < group)) {
          flick = v;
          group = l.group;
        }
      }
      out[y * m.W + x] = Math.min(7, stat) | (Math.min(7, flick) << 3) | (group << 6);
    }
  return out;
}

/**
 * The map rule that bounds the renderer's cost (DESIGN §7): the DDA steps of the 64 sample rays, summed, from
 * every floor cell (centre and four inner points) in 64 view directions. Returns the worst case.
 */
export function worstSteps(m: GameMap): { steps: number; x: number; y: number; deg: number } {
  const masked = maskedChars();
  let worst = { steps: 0, x: 0, y: 0, deg: 0 };
  for (let cy = 0; cy < m.H; cy++)
    for (let cx = 0; cx < m.W; cx++) {
      if (solidAt(m, cx, cy)) continue;
      for (const [ox, oy] of [
        [0.5, 0.5],
        [0.27, 0.27],
        [0.73, 0.27],
        [0.27, 0.73],
        [0.73, 0.73],
      ] as const) {
        const px = cx + ox;
        const py = cy + oy;
        for (let d = 0; d < 64; d++) {
          let steps = 0;
          for (const off of COLANG) {
            const a = ((d * 64 + off) * 2 * Math.PI) / ANGLES;
            steps += ddaSteps(m, px, py, Math.cos(a), Math.sin(a), masked);
          }
          if (steps > worst.steps) worst = { steps, x: px, y: py, deg: (d * 360) / 64 };
        }
      }
    }
  return worst;
}

function ddaSteps(m: GameMap, px: number, py: number, dx: number, dy: number, masked: Set<string>): number {
  let mx = Math.floor(px);
  let my = Math.floor(py);
  const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
  const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  let sdx = (dx < 0 ? px - mx : mx + 1 - px) * ddx;
  let sdy = (dy < 0 ? py - my : my + 1 - py) * ddy;
  for (let n = 1; n < 256; n++) {
    if (sdx < sdy) {
      sdx += ddx;
      mx += sx;
    } else {
      sdy += ddy;
      my += sy;
    }
        if (wallAt(m, mx, my, masked)) return n;
  }
  return 256;
}

export function checkMap(m: GameMap) {
  const chars = new Set(readMaterials().map((x) => x.char));
  for (let y = 0; y < m.H; y++)
    for (let x = 0; x < m.W; x++) {
      const c = m.grid[y]![x]!;
      if (c !== '.' && c !== '+' && !chars.has(c)) throw new Error(`${m.name}: unknown material '${c}' at ${x},${y}`);
      if ((x === 0 || y === 0 || x === m.W - 1 || y === m.H - 1) && !wallAt(m, x, y)) throw new Error(`${m.name}: the border must be solid (${x},${y})`);
      if (m.zones[y]![x]! > 3) throw new Error(`${m.name}: zone ${m.zones[y]![x]} at ${x},${y}`);
    }
  const doorCells = m.grid.flatMap((row, y) => [...row].flatMap((c, x) => (c === '+' ? [`${x},${y}`] : [])));
  if (doorCells.length > 16) throw new Error(`${m.name}: at most 16 doors`);
  const listed = m.doors.map((d) => `${d.x},${d.y}`);
  if (doorCells.sort().join() !== [...listed].sort().join()) throw new Error(`${m.name}: the doors section must list exactly the + cells`);
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) if (thinAt(m, x, y)) thinOrient(m, x, y);
  for (const t of m.keys) if (solidAt(m, t.x, t.y) || t.bit < 1 || t.bit > 128 || (t.bit & (t.bit - 1))) throw new Error(`${m.name}: bad key trigger at ${t.x},${t.y}`);
  const sight = longestSight(m);
  if (sight.d > k('MAX_SIGHT')) throw new Error(`${m.name}: a sight line of ${sight.d.toFixed(2)} cells from ${sight.x},${sight.y} at ${sight.deg.toFixed(1)} deg (MAX_SIGHT ${k('MAX_SIGHT')})`);
  for (const l of m.lamps) if (solidAt(m, l.x, l.y)) throw new Error(`${m.name}: lamp in a wall at ${l.x},${l.y}`);
  for (const p of m.poses) if (solidAt(m, Math.floor(p.x), Math.floor(p.y))) throw new Error(`${m.name}: pose ${p.name} in a wall`);
}

export function mapAsm(m: GameMap): string {
  checkMap(m);
  const mats = readMaterials();
  const id = new Map(mats.map((x) => [x.char, x.id]));
  const masked = new Set(mats.filter((x) => x.masked).map((x) => x.char));
  const doorIndex = new Map(m.doors.map((d, i) => [`${d.x},${d.y}`, i]));
  const grid = m.grid.flatMap((row, y) =>
    [...row].map((c, x) => {
      if (c === '.') return 0;
      if (c === '+') return 0x40 | doorIndex.get(`${x},${y}`)!;
      if (masked.has(c)) return 0x80 | (thinOrient(m, x, y) << 5) | id.get(c)!;
      return id.get(c)!;
    }),
  );
  const zones = m.zones.flat();
  const light = lightMap(m);
  const fix = (v: number) => Math.round(v * 256);
  const ang = (deg: number) => Math.round((deg * ANGLES) / 360) & (ANGLES - 1);
  return [
    `; GENERATED by games/nadir/tools/maps.ts from levels/${m.name.toLowerCase()}.map - do not edit.`,
    `NUM_LAMPS = ${m.lamps.length}`,
    `NUM_POSES = ${m.poses.length}`,
    `NUM_DOORS = ${m.doors.length}`,
    `NUM_KEYS = ${m.keys.length}`,
    ...m.poses.map((p, i) => `POSE_${p.name.toUpperCase()} = ${i + 1}`),
    '',
    '.data',
    '; lamps: x, y (cell), intensity, group',
    'lamps:',
    ...byteLines(m.lamps.flatMap((l) => [l.x, l.y, l.intensity, l.group])),
    '; doors (DESIGN §3.10), copied to the RAM door table by init: cell, open, state, timer, orientation, key, material',
    'door_init:',
    ...m.doors.flatMap((d) => [`    .word ${d.y * m.W + d.x}, 0`, `    .byte 0, 0, ${thinOrient(m, d.x, d.y)}, ${d.key}, ${d.key ? 'MAT_LOCKEDDOOR' : 'MAT_DOOR'}, 0, 0, 0, 0, 0, 0, 0`]),
    '; key triggers: cell, key bit',
    'key_tab:',
    ...m.keys.map((t) => `    .word ${t.y * m.W + t.x}, ${t.bit}`),
    '; camera poses: x, y (u8.8), angle (u12); pose n (1-based) is entry n - 1',
    'poses:',
    ...wordLines(m.poses.flatMap((p) => [fix(p.x), fix(p.y), ang(p.deg)])),
    '',
    '.xdata',
    '; copied to RAM by init: map (DESIGN §3.10 byte per cell), lmap (light byte), zmap (zone)',
    'map_x:',
    ...byteLines(grid, 32),
    'lmap_x:',
    ...byteLines(light, 32),
    'zmap_x:',
    ...byteLines(zones, 32),
    '',
  ].join('\n');
}

/** Top-down preview: walls in their material's typical colour, floor shaded by the light map, lamps and poses. */
export function mapPng(m: GameMap, scale = 8): Buffer {
  const W = m.W * scale;
  const H = m.H * scale;
  const png = new PNG({ width: W, height: H });
  const mats = readMaterials();
  const tone = new Map(mats.map((x) => {
    const count = new Map<number, number>();
    for (const r of x.frames[0]!.rows) for (const c of r) count.set(c & 15, (count.get(c & 15) ?? 0) + 1);
    return [x.char, [...count].sort((a, b) => b[1] - a[1])[0]![0]];
  }));
  const light = lightMap(m);
  const floorTone = [1, 2, 3, 7, 10, 12, 15, 15];
  const put = (x: number, y: number, c: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = PALETTE[c]!;
    const i = (y * W + x) * 4;
    png.data[i] = p >> 16;
    png.data[i + 1] = (p >> 8) & 255;
    png.data[i + 2] = p & 255;
    png.data[i + 3] = 255;
  };
  for (let cy = 0; cy < m.H; cy++)
    for (let cx = 0; cx < m.W; cx++) {
      const ch = m.grid[cy]![cx]!;
      const b = light[cy * m.W + cx]!;
      const c = ch === '+' ? 11 : ch === '.' ? floorTone[Math.max(b & 7, (b >> 3) & 7)]! : tone.get(ch)!;
      for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) put(cx * scale + x, cy * scale + y, c);
      if (ch === '.' && m.zones[cy]![cx] === 3) put(cx * scale + scale / 2, cy * scale + scale / 2, 8);
    }
  for (const l of m.lamps) for (let y = 2; y < scale - 2; y++) for (let x = 2; x < scale - 2; x++) put(l.x * scale + x, l.y * scale + y, l.group ? 6 : 14);
  for (const p of m.poses) {
    const a = (p.deg * Math.PI) / 180;
    for (let s = 0; s < scale * 1.5; s++) put(Math.round(p.x * scale + Math.cos(a) * s), Math.round(p.y * scale + Math.sin(a) * s), 13);
    put(Math.round(p.x * scale), Math.round(p.y * scale), 15);
  }
  return PNG.sync.write(png);
}

if (isMain(import.meta.url)) {
  const name = process.argv[2] ?? 'nadir';
  const m = readMap(name);
  writeFileSync(join(GAME_DIR, 'map.gen.asm'), mapAsm(m));
  writeFileSync(join(GAME_DIR, 'levels', `${name}.png`), mapPng(m));
  const w = worstSteps(m);
  console.log(`map.gen.asm written (${m.name}): ${m.lamps.length} lamps, ${m.poses.length} poses; worst DDA steps for 64 rays: ${w.steps} at (${w.x.toFixed(2)}, ${w.y.toFixed(2)}) facing ${w.deg} deg; longest sight ${longestSight(m).d.toFixed(2)} cells`);
}
