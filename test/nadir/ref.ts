// The test oracle for NADIR: its own reading of games/nadir/DESIGN.md (§3.2-3.5), the map sources and the
// material list, and a floating-point raycaster. What the engine holds in RAM is compared against this, never
// against itself (PLAN.md Part 4). It shares no code with the game's generators.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GAME_DIR = fileURLToPath(new URL('../../games/nadir', import.meta.url));
const design = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');
const between = (a: string, b: string) => design.slice(design.indexOf(a), design.indexOf(b, design.indexOf(a) + a.length));

/** DESIGN's constant tables (§3.3, §3.10, §5) */
export const K: Record<string, number> = Object.fromEntries([...design.matchAll(/^\| `([A-Z_0-9]+)` \| (-?\d+) \|/gm)].map((m) => [m[1]!, Number(m[2])]));
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

const texturesTxt = readFileSync(join(GAME_DIR, 'art', 'textures.txt'), 'utf8');
/** art/textures.txt: map character of material id i + 1 */
export const MATERIAL_CHARS: string[] = [...texturesTxt.matchAll(/^material ([A-Z]) /gm)].map((m) => m[1]!);
/** art/textures.txt: the masked materials (a `masked` line in the material's block, DESIGN §3.10) */
export const MASKED_CHARS: Set<string> = new Set(texturesTxt.split(/^material /m).slice(1).filter((b) => /^masked$/m.test(b)).map((b) => b[0]!));
/** art/textures.txt: per material char, its frames' texels as 'transparent' flags [v][u] (only masked materials) */
export function transparency(ch: string): boolean[][] {
  const block = texturesTxt.split(/^material /m).find((b) => b[0] === ch)!;
  const legend = new Map<string, string>();
  for (const l of block.matchAll(/^legend (.*)$/gm)) {
    const t = l[1]!.trim().split(/\s+/);
    for (let i = 0; i + 1 < t.length; i += 2) legend.set(t[i]!, t[i + 1]!);
  }
  const rows = block.split(/^rows$/m)[1]!.split('\n').slice(1, 33);
  return rows.map((row) => [...row.trim()].map((c) => legend.get(c) === 't'));
}

export interface RefMap {
  grid: string[];
  zones: number[][];
  lamps: { x: number; y: number; i: number; g: number }[];
  poses: { name: string; x: number; y: number; deg: number }[];
  doors: { x: number; y: number; key: number }[];
  keys: { x: number; y: number; bit: number }[];
  props: { x: number; y: number; s: string }[];
  /** DESIGN §6.3: the enemies at the start (K = Kryp) */
  enemies: { x: number; y: number; t: string }[];
}

export function readRefMap(name = 'nadir'): RefMap {
  const m: RefMap = { grid: [], zones: [], lamps: [], poses: [], doors: [], keys: [], props: [], enemies: [] };
  let part = '';
  for (const raw of readFileSync(join(GAME_DIR, 'levels', `${name}.map`), 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (['grid', 'zones', 'lamps', 'poses', 'doors', 'keys', 'props', 'enemies'].includes(line)) part = line;
    else if (line.startsWith('name ')) continue;
    else if (part === 'grid') m.grid.push(line);
    else if (part === 'zones') m.zones.push([...line].map(Number));
    else if (part === 'lamps') {
      const [x, y, i, g] = line.split(/\s+/).map(Number);
      m.lamps.push({ x: x!, y: y!, i: i!, g: g! });
    } else if (part === 'doors') {
      const [x, y, key] = line.split(/\s+/).map(Number);
      m.doors.push({ x: x!, y: y!, key: key! });
    } else if (part === 'props') {
      const [x, y, ch] = line.split(/\s+/);
      m.props.push({ x: Number(x), y: Number(y), s: ch! });
    } else if (part === 'enemies') {
      const [x, y, t] = line.split(/\s+/);
      m.enemies.push({ x: Number(x), y: Number(y), t: t! });
    } else if (part === 'keys') {
      const [x, y, bit] = line.split(/\s+/).map(Number);
      m.keys.push({ x: x!, y: y!, bit: bit! });
    } else if (part === 'poses') {
      const [name, x, y, deg] = line.split(/\s+/);
      m.poses.push({ name: name!, x: Number(x), y: Number(y), deg: Number(deg) });
    }
  }
  return m;
}

export const solid = (m: RefMap, x: number, y: number) => x < 0 || y < 0 || y >= m.grid.length || x >= m.grid[0]!.length || m.grid[y]![x] !== '.';
/** DESIGN §3.10: a thin cell (door or masked wall) */
export const thin = (m: RefMap, x: number, y: number) => {
  const c = m.grid[y]?.[x];
  return c === '+' || (c !== undefined && MASKED_CHARS.has(c));
};
/** DESIGN §3.10: plane orientation of a thin cell: 1 = x = cx + 1/2 (non-floor north and south), 0 = y = cy + 1/2 */
export const orient = (m: RefMap, x: number, y: number) => (solid(m, x, y - 1) && solid(m, x, y + 1) ? 1 : 0);
/** DESIGN §3.10: the map byte of a cell */
export function mapByte(m: RefMap, x: number, y: number): number {
  const c = m.grid[y]![x]!;
  if (c === '.') return 0;
  if (c === '+') return 0x40 | m.doors.findIndex((d) => d.x === x && d.y === y);
  const id = MATERIAL_CHARS.indexOf(c) + 1;
  return MASKED_CHARS.has(c) ? 0x80 | (orient(m, x, y) << 5) | id : id;
}

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
  /** the first masked plane in front of the wall, if any */
  mask?: RefHit;
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

/**
 * DESIGN §3.2 and §3.10: the ray of sample column c from (x, y) in cells at camera angle a (units), in floating
 * point. `open(cell)` gives a door's opening (0..256) at this frame. Doors and masked walls are planes through
 * their cell's centre; the first masked plane is returned as `mask`.
 */
export function castRef(m: RefMap, x: number, y: number, a: number, c: number, open: (cell: number) => number = () => 0): RefHit {
  const W = m.grid[0]!.length;
  const off = colOff(c) + 0.5;
  const th = ((a + off) * 2 * Math.PI) / K.ANGLES!;
  const dx = Math.cos(th);
  const dy = Math.sin(th);
  const cosOff = Math.cos((off * 2 * Math.PI) / K.ANGLES!);
  let mx = Math.floor(x);
  let my = Math.floor(y);
  const ddx = Math.abs(1 / dx);
  const ddy = Math.abs(1 / dy);
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  let sdx = (dx < 0 ? x - mx : mx + 1 - x) * ddx;
  let sdy = (dy < 0 ? y - my : my + 1 - y) * ddy;
  let mask: RefHit | undefined;
  const make = (cell: number, side: number, front: number, t: number, frac: number, shift = 0): RefHit => {
    let u = Math.min(31, Math.floor((((frac - shift) % 1) + 1) % 1 * 32));
    if (side === 1 || side === 2) u = 31 - u;
    const perp = t * cosOff;
    return { cell, side, face: cell * 4 + side, front, t, perp, h: K.F256! / 256 / perp, u, frac };
  };
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
    if (!solid(m, mx, my)) continue;
    const cell = my * W + mx;
    if (thin(m, mx, my)) {
      const o = orient(m, mx, my);
      // where the ray crosses the cell's centre plane, and whether that is inside the cell
      const tp = o === 1 ? (mx + 0.5 - x) / dx : (my + 0.5 - y) / dy;
      const along = o === 1 ? y + tp * dy : x + tp * dx;
      if (!(tp > 0) || Math.floor(along) !== (o === 1 ? my : mx)) continue;
      const frac = along - Math.floor(along);
      const pside = o === 1 ? (sx > 0 ? 0 : 1) : sy > 0 ? 2 : 3;
      const front = o === 1 ? cell - sx : cell - sy * W;
      if (m.grid[my]![mx] === '+') {
        const op = open(cell) / 256;
        if (op >= 1 || frac < op) continue;
        return { ...make(cell, pside, front, tp, frac, op), mask };
      }
      mask ??= make(cell, pside, front, tp, frac);
      continue;
    }
    const hx = x + t * dx;
    const hy = y + t * dy;
    const frac = side < 2 ? hy - Math.floor(hy) : hx - Math.floor(hx);
    return { ...make(cell, side, pmy * W + pmx, t, frac), mask };
  }
}

/** DESIGN §3.5: the light level of a column drawn h px tall, in front of `front`, at column c, frame tick (`extra`
 * is added before the clamp: a box's W and E sides, DESIGN §3.12). */
export function refLevel(m: RefMap, light: ReturnType<typeof refLight>, front: number, h: number, c: number, tick: number, extra = 0): number {
  const W = m.grid[0]!.length;
  const fx = front % W;
  const fy = Math.floor(front / W);
  const q = h === 0 ? 255 : Math.min(255, Math.floor(K.F256! / (64 * Math.min(h, 255))));
  const fog = q < K.FOG_NEAR_Q! ? 0 : Math.min(7, 1 + Math.floor((q - K.FOG_NEAR_Q!) / K.FOG_STEP_Q!));
  const L = light[fy]![fx]!;
  const lit = FLICKER[L.g]![(tick >> K.FLICK_SHIFT!) & 31] === '1';
  const lightv = Math.max(L.s, lit ? L.f : 0);
  const cone = q < K.FL_RANGE_Q! ? CONE[c]! : 0;
  return Math.max(0, Math.min(7, fog + AMB[m.zones[fy]![fx]!]! - lightv - cone + extra));
}

// ---- the player (DESIGN §5) ------------------------------------------------------------------------------------

/** DESIGN §5: sin and cos of angle a in s.8: floor(S / 64), S = sign * round(|sin((a + 1/2) * 2 pi / 4096)| * 16384) */
export function sin8(a: number): number {
  const v = Math.sin(((a + 0.5) * 2 * Math.PI) / K.ANGLES!);
  return Math.floor((Math.sign(v) * Math.round(Math.abs(v) * 16384)) / 64);
}
export const cos8 = (a: number) => sin8(a + K.ANGLES! / 4);

export interface PlayerState {
  x: number;
  y: number;
  a: number;
  v: number;
  turnK: number;
  turnDir: number;
  tapDir: number;
  tapTick: number;
  dashN: number;
  dashDir: number;
  bobPh: number;
  bob: number;
}

const BTN = { L: 1, R: 2, U: 4, D: 8, A: 16, B: 32 };

/**
 * DESIGN §5, one frame: the player's next state from the previous one, the buttons held and pressed this frame,
 * the frame counter, and `passable(cell)` (floor or a fully open door, from the door state before the frame).
 */
export function stepPlayer(p: PlayerState, held: number, pressed: number, tick: number, passable: (cx: number, cy: number) => boolean, s1 = false, noBob = false, propHit: (x: number, y: number) => boolean = () => false): PlayerState {
  const q = { ...p };
  const s1b = s1 && (held & BTN.B) !== 0;
  // 1 double tap
  if (q.dashN === 0 && !s1b) {
    const dir = pressed & BTN.L ? -1 : pressed & BTN.R ? 1 : 0;
    if (dir) {
      if (q.tapDir === dir && ((tick - q.tapTick) & 0xffff) <= K.DTAP_FRAMES!) {
        q.dashN = K.DASH_FRAMES!;
        q.dashDir = dir;
        q.tapDir = 0;
      } else {
        q.tapDir = dir;
        q.tapTick = tick;
      }
    }
  }
  // 2 turning
  const tdir = held & BTN.L ? -1 : held & BTN.R ? 1 : 0;
  if (q.dashN === 0 && !s1b && tdir) {
    q.turnK = q.turnDir === tdir ? Math.min(14, q.turnK + 1) : 1;
    q.turnDir = tdir;
    q.a = (q.a + tdir * Math.min(K.TURN_MAX!, K.TURN_MIN! + K.TURN_ACC! * (q.turnK - 1)) + 4096) & 4095;
  } else {
    q.turnK = 0;
    q.turnDir = 0;
  }
  // 3 walking
  const target = held & BTN.U || (!s1 && held & BTN.B) ? K.WALK_MAX! : held & BTN.D ? -K.BACK_MAX! : 0;
  q.v = q.v < target ? Math.min(target, q.v + K.WALK_ACC!) : Math.max(target, q.v - K.WALK_ACC!);
  // 4 movement
  let l = 0;
  if (q.dashN > 0) {
    l = q.dashDir * K.DASH_V!;
    q.dashN--;
  } else if (s1b) l = held & BTN.L ? -K.WALK_MAX! : held & BTN.R ? K.WALK_MAX! : 0;
  const c = cos8(q.a);
  const s = sin8(q.a);
  const dx = Math.floor((q.v * c - l * s) / 256);
  const dy = Math.floor((q.v * s + l * c) / 256);
  // 5 collision with wall sliding: the box +-P_RAD (inclusive corners) in passable cells only
  const R = K.P_RAD!;
  const free = (x: number, y: number) => {
    for (const cx of [(x - R) >> 8, (x + R) >> 8]) for (const cy of [(y - R) >> 8, (y + R) >> 8]) if (!passable(cx, cy)) return false;
    return !propHit(x, y);
  };
  if (free(q.x + dx, q.y)) q.x += dx;
  if (free(q.x, q.y + dy)) q.y += dy;
  // 6 head bob
  const av = Math.abs(q.v);
  const S = K.BOB_SHIFT!;
  if (av) q.bobPh = (q.bobPh + av) & 0xffff;
  else if ((q.bobPh >> S) & 7) q.bobPh = (q.bobPh + (1 << S)) & 0xffff;
  q.bob = noBob ? 0 : Math.round(K.BOB_AMP! * Math.sin((2 * Math.PI * ((q.bobPh >> S) & 15)) / 16));
  return q;
}

// ---- doors (DESIGN §3.10) --------------------------------------------------------------------------------------

export interface DoorState {
  open: number;
  state: number;
  timer: number;
}

/** DESIGN §3.10, one frame of one door at (dx, dy) with its key bit, after the player moved to (px, py) (u8.8). */
export function stepDoor(d: DoorState, cx: number, cy: number, key: number, keys: number, px: number, py: number): DoorState {
  const q = { ...d };
  const near = Math.abs(px - (cx * 256 + 128)) < K.DOOR_REACH! && Math.abs(py - (cy * 256 + 128)) < K.DOOR_REACH!;
  const na = near && (key === 0 || (keys & key) !== 0);
  if (q.state === 0) {
    if (na) q.state = 1;
  } else if (q.state === 1) {
    q.open += K.DOOR_SPEED!;
    if (q.open >= 256) {
      q.open = 256;
      q.state = 2;
      q.timer = K.DOOR_WAIT!;
    }
  } else if (q.state === 2) {
    q.timer = na ? K.DOOR_WAIT! : q.timer - 1;
    if (q.timer === 0) q.state = 3;
  } else if (na) q.state = 1;
  else {
    q.open -= K.DOOR_SPEED!;
    if (q.open <= 0) {
      q.open = 0;
      q.state = 0;
    }
  }
  return q;
}

// ---- sprites (DESIGN §3.12) ------------------------------------------------------------------------------------

export const T = 32;
export interface RefSprite {
  char: string;
  name: string;
  w: number;
  h: number;
  height: number;
  block: number;
  pick: number;
  px: number[][];
  /** a 3D box (DESIGN §3.12): colours and style; no pixels */
  box?: { face: number; lid: number; line: number; style: number };
}

/** art/sprites.txt, read on its own */
export function readRefSprites(): RefSprite[] {
  const out: RefSprite[] = [];
  let legend = new Map<string, number>();
  const lines = readFileSync(join(GAME_DIR, 'art', 'sprites.txt'), 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim().split(/\s+/);
    if (t[0] === 'sprite' && t[3] === 'box') out.push({ char: t[1]!, name: t[2]!, w: 0, h: 0, height: 0, block: 0, pick: 0, px: [], box: { face: 0, lid: 0, line: 0, style: 0 } });
    else if (t[0] === 'sprite') {
      out.push({ char: t[1]!, name: t[2]!, w: Number(t[3]), h: Number(t[4]), height: 0, block: 0, pick: 0, px: [] });
      legend = new Map();
    } else if (t[0] === 'box') out[out.length - 1]!.box = { face: parseInt(t[1]!, 10), lid: parseInt(t[2]!, 10), line: parseInt(t[3]!, 10), style: Number(t[4]) }; else if (t[0] === 'height') out[out.length - 1]!.height = Number(t[1]);
    else if (t[0] === 'block') out[out.length - 1]!.block = Number(t[1]);
    else if (t[0] === 'pick') out[out.length - 1]!.pick = Number(t[1]);
    else if (t[0] === 'legend') for (let k = 1; k + 1 < t.length; k += 2) legend.set(t[k]!, t[k + 1] === 't' ? T : parseInt(t[k + 1]!, 10) + (t[k + 1]!.endsWith('!') ? 16 : 0));
    else if (t[0] === 'rows') for (i++; lines[i]!.trim() !== 'end'; i++) out[out.length - 1]!.px.push([...lines[i]!.trim()].map((ch) => legend.get(ch)!));
  }
  return out;
}

/** DESIGN §3.12: the source downsampled by 2^k (the block's most common value, transparent counting; emissive wins at a quarter) */
export function refLod(px: number[][], k: number): number[][] {
  const b = 1 << k;
  const out: number[][] = [];
  for (let by = 0; by * b < px.length; by++) {
    const row: number[] = [];
    for (let bx = 0; bx * b < px[0]!.length; bx++) {
      const n = new Map<number, number>();
      let all = 0;
      let emis = 0;
      for (let y = by * b; y < Math.min(px.length, by * b + b); y++)
        for (let x = bx * b; x < Math.min(px[0]!.length, bx * b + b); x++) {
          const v = px[y]![x]!;
          n.set(v, (n.get(v) ?? 0) + 1);
          all++;
          if (v >= 16 && v !== T) emis++;
        }
      const ranked = [...n].sort((p, q) => q[1] - p[1] || p[0] - q[0]);
      row.push(emis * 4 >= all && emis ? ranked.find(([v]) => v >= 16 && v !== T)![0] : ranked[0]![0]);
    }
    out.push(row);
  }
  return out;
}

/** DESIGN §3.12: a box's height in 1/256 of the wall height */
export const refBoxK = (s: RefSprite) => Math.round((s.height * 256) / 100);

/**
 * DESIGN §3.12: a ray from (ox, oy) along (dx, dy) against the box of half size a around (bx, by) (slab test). Returns the
 * entry parameter t, the side entered (0 W, 1 E, 2 N, 3 S) and how far the entry point lies from the nearest vertical
 * edge (cells), or null if the ray misses (then `edge` of the closest approach is not computed: null).
 */
export function boxRay(ox: number, oy: number, dx: number, dy: number, bx: number, by: number, a: number): { t: number; side: number; edge: number } | null {
  let t0 = -Infinity;
  let t1 = Infinity;
  let side = -1;
  for (const [o, d, lo, hi, s0] of [[ox, dx, bx - a, bx + a, 0], [oy, dy, by - a, by + a, 2]] as const) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const ta = (lo - o) / d;
    const tb = (hi - o) / d;
    const near = Math.min(ta, tb);
    if (near > t0) {
      t0 = near;
      side = s0 + (d > 0 ? 0 : 1);
    }
    t1 = Math.min(t1, Math.max(ta, tb));
  }
  if (t0 > t1 || t0 <= 0) return null;
  const px = ox + t0 * dx;
  const py = oy + t0 * dy;
  const along = side < 2 ? py - (by - a) : px - (bx - a);
  return { t: t0, side, edge: Math.min(along, 2 * a - along) };
}

/** DESIGN §3.12: K of a sprite */
export const refK = (s: RefSprite) => Math.round(((s.height / 100) * 2048) / s.h);
