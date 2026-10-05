// The test oracle for Bo's Skateäventyr: its own reading of the design documents and the level sources,
// written independently of the game's generator (games/bo/tools/levels.ts) and engine. What the engine holds
// in ROM or RAM is compared against this, never against itself (PLAN.md Part 3).
// Shared design data it does use: tile classes (tools/tiles.ts) and prefab patterns (tools/prefabs.ts).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildCartridge } from '@qrc/asm';
import { parseCartridge } from '@qrc/cartridge';
import { includeFrom } from '@qrc/tools';
import { VM, expandInputs, type ReplayFile } from '@qrc/vm';
import { PREFABS } from '../../games/bo/tools/prefabs';
import { CLASS, T, WTILE, attrOf } from '../../games/bo/tools/tiles';

export const GAME_DIR = join(__dirname, '../../games/bo');
export const ROWS = 32;
export const s16 = (v: number) => (v << 16) >> 16;

// ---- DESIGN.md ---------------------------------------------------------------------------------------
const design = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');

/** §3.2: name -> value ("1 per N bildrutor" -> N, "1 per bildruta" -> 1). */
export const CONSTS: Record<string, number> = (() => {
  const sec = design.slice(design.indexOf('### 3.2'), design.indexOf('### 3.3'));
  const out: Record<string, number> = {};
  for (const m of sec.matchAll(/^\| `([A-Z_0-9]+)` \| ([^|]+) \|/gm)) {
    const v = m[2]!.trim();
    const per = /^1 per (\d+) bildrut/.exec(v);
    out[m[1]!] = per ? Number(per[1]) : /^1 per bildruta/.test(v) ? 1 : Number(v);
    if (Number.isNaN(out[m[1]!])) throw new Error(`DESIGN §3.2: cannot read ${m[1]} = ${v}`);
  }
  return out;
})();

/** §3.3: the derived values table, row label -> cell text. */
export const DERIVED: { label: string; value: string }[] = (() => {
  const sec = design.slice(design.indexOf('### 3.3'), design.indexOf('### 3.4'));
  return [...sec.matchAll(/^\| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => ({ label: m[1]!.trim(), value: m[2]!.trim() })).filter((r) => r.label !== 'Rörelse' && !r.label.startsWith('---'));
})();
/** All numbers of a §3.3 row (decimal commas), in order. */
export function derivedNumbers(labelStart: string): number[] {
  const row = DERIVED.find((r) => r.label.startsWith(labelStart));
  if (!row) throw new Error(`DESIGN §3.3: no row "${labelStart}"`);
  return [...row.value.replace(/\*\*/g, '').matchAll(/\d+(?:,\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
}

// ---- level sources -------------------------------------------------------------------------------
export interface RefTerrain {
  op: string;
  n: number;
}
export interface RefObject {
  col: number;
  kind: string;
  args: string[];
  line: number;
}
export interface RefLevel {
  id: string;
  name: string;
  world: number;
  rows: number;
  start: number;
  music: number;
  h0: number;
  width: number;
  terrain: RefTerrain[];
  objects: RefObject[];
}

export const LEVEL_IDS: string[] = (() => {
  const order = ['T1', 'T2', 'T3', ...[1, 2, 3, 4, 5].flatMap((w) => [1, 2, 3, 4, 5].map((l) => `${w}-${l}`))];
  const have = new Set(readdirSync(join(GAME_DIR, 'levels')).filter((f) => f.endsWith('.lvl')).map((f) => f.slice(0, -4)));
  return order.filter((id) => have.has(id));
})();

export function readRefLevel(id: string): RefLevel {
  const L: RefLevel = { id, name: '', world: 1, rows: 16, start: 0, music: 0, h0: 0, width: 0, terrain: [], objects: [] };
  let part = 0;
  for (const [i, raw] of readFileSync(join(GAME_DIR, 'levels', `${id}.lvl`), 'utf8').split(/\r?\n/).entries()) {
    const line = raw.split('#')[0]!.trim();
    if (!line) continue;
    if (line === 'terrain') part = 1;
    else if (line === 'objects') part = 2;
    else {
      const [k, ...rest] = line.split(/\s+/);
      if (part === 0) {
        if (k === 'name') L.name = rest.join(' ');
        else (L as unknown as Record<string, number>)[k!] = Number(rest[0]);
      } else if (part === 1) {
        if (k === 'h') L.h0 = Number(rest[0]);
        else if (k === 'step') L.terrain.push({ op: 'step', n: Number(rest[0]) });
        else if (k === 'mat' || k === 'liq') L.terrain.push({ op: `${k}:${rest[0]}`, n: 0 });
        else L.terrain.push({ op: k!, n: Number(rest[0]) });
      } else L.objects.push({ col: Number(k), kind: rest[0]!, args: rest.slice(1), line: i + 1 });
    }
  }
  for (const t of L.terrain) if (!t.op.includes(':') && t.op !== 'step') L.width += t.op.endsWith('22') ? 2 * t.n : t.n;
  return L;
}

const A = (cls: keyof typeof CLASS, shape = 0) => CLASS[cls] | (shape << 4);
// shapes: height-map index. The heights per pixel column, from DESIGN.md §3.4/§14.3: flat; 45° rises one
// tile per column; 22.5° rises one tile over two columns (lower half, upper half).
export const SH = { FLAT: 0, U45: 1, D45: 2, U22LO: 3, U22HI: 4, D22HI: 5, D22LO: 6 };
export const HMAP: number[][] = [
  [8, 8, 8, 8, 8, 8, 8, 8],
  Array.from({ length: 8 }, (_, x) => x + 1),
  Array.from({ length: 8 }, (_, x) => 8 - x),
  Array.from({ length: 8 }, (_, x) => 1 + (x >> 1)),
  Array.from({ length: 8 }, (_, x) => 5 + (x >> 1)),
  Array.from({ length: 8 }, (_, x) => 8 - (x >> 1)),
  Array.from({ length: 8 }, (_, x) => 4 - (x >> 1)),
];

export interface RefGrid {
  level: RefLevel;
  /** attribute (class | shape << 4) per cell, column-major */
  attr: Uint8Array;
  /** a tile is there at all (decor counts) */
  used: Uint8Array;
  /** apples of each source line (pattern) */
  patterns: Map<number, [number, number][]>;
  /** breakable rectangles (weak obstacles and boxes) */
  breakables: { col: number; row: number; w: number; h: number; kind: 'weak' | 'box' }[];
  /** ground height (non-empty cells from the bottom) per column after the terrain */
  ground: number[];
}

/** Builds the level grid from the .lvl source by the rules of FORMAT.md. */
export function refGrid(L: RefLevel): RefGrid {
  const W = L.width;
  const attr = new Uint8Array(W * ROWS);
  const used = new Uint8Array(W * ROWS);
  const put = (c: number, r: number, a: number) => {
    if (c < 0 || c >= W || r < 0 || r >= ROWS) throw new Error(`${L.id}: ${c},${r} outside`);
    attr[c * ROWS + r] = a;
    used[c * ROWS + r] = 1;
  };
  const topClass: Record<string, number> = { normal: A('SOLID'), sand: A('SAND'), ice: A('ICE'), alt: A('SOLID') };
  let top = topClass.normal!;
  let h = L.h0;
  let c = 0;
  const ground: number[] = [];
  const col = (topRow: number, a: number) => {
    put(c, topRow, a);
    for (let r = topRow + 1; r < ROWS; r++) put(c, r, A('SOLID'));
    ground.push(ROWS - topRow);
    c++;
  };
  for (const t of L.terrain) {
    if (t.op === 'step') h += t.n;
    else if (t.op.startsWith('mat:')) top = topClass[t.op.slice(4)]!;
    else if (t.op.startsWith('liq:')) continue;
    else
      for (let i = 0; i < t.n; i++) {
        if (t.op === 'flat') col(ROWS - h, top);
        else if (t.op === 'up45') col(ROWS - ++h, A('SLOPE', SH.U45));
        else if (t.op === 'down45') col(ROWS - h--, A('SLOPE', SH.D45));
        else if (t.op === 'up22') {
          col(ROWS - h - 1, A('SLOPE', SH.U22LO));
          col(ROWS - ++h, A('SLOPE', SH.U22HI));
        } else if (t.op === 'down22') {
          col(ROWS - h, A('SLOPE', SH.D22HI));
          col(ROWS - h--, A('SLOPE', SH.D22LO));
        } else if (t.op === 'gap') {
          ground.push(0);
          c++;
        } else if (t.op === 'liquid') {
          for (let r = ROWS - h + 1; r < ROWS; r++) put(c, r, A('HAZARD'));
          ground.push(0);
          c++;
        } else throw new Error(`${L.id}: terrain ${t.op}`);
      }
  }
  const patterns = new Map<number, [number, number][]>();
  const breakables: RefGrid['breakables'] = [];
  const isEmpty = (cc: number, r: number) => cc < 0 || cc >= W || r < 0 || r >= ROWS || !used[cc * ROWS + r];
  const classAt = (cc: number, r: number) => (cc < 0 || cc >= W || r < 0 || r >= ROWS ? 0 : attr[cc * ROWS + r]! & 15);
  for (const o of L.objects) {
    const y = (k: number) => {
      const s = o.args[k] ?? 'g';
      const m = /^g([+-]\d+)?$/.exec(s);
      return m ? ground[o.col]! + Number(m[1] ?? 0) : Number(s);
    };
    const n = (k: number, d = 1) => (o.args[k] === undefined ? d : Number(o.args[k]));
    const row = (k: number) => ROWS - 1 - y(k);
    const apples = (cells: [number, number][]) => {
      const list = patterns.get(o.line) ?? [];
      for (const [cc, r] of cells) {
        if (!isEmpty(cc, r) || cc < 0 || cc >= W || r < 0 || r >= ROWS) continue;
        put(cc, r, A('APPLE'));
        list.push([cc, r]);
      }
      patterns.set(o.line, list);
    };
    const rect = (a: number, k: number) => {
      for (let i = 0; i < n(k + 1); i++) for (let j = 0; j < n(k + 2); j++) put(o.col + i, row(k) - j, a);
    };
    switch (o.kind) {
      case 'apples':
        apples(Array.from({ length: n(1) }, (_, i) => [o.col + i, row(0)]));
        break;
      case 'column':
        apples(Array.from({ length: n(1) }, (_, i) => [o.col, row(0) - i]));
        break;
      case 'apple':
        apples([[o.col, row(0)]]);
        break;
      case 'arc': {
        const v = n(0);
        const kind = o.args[1]!;
        let topRow = 0;
        while (topRow < ROWS && isEmpty(o.col, topRow)) topRow++;
        const ramp = kind.startsWith('r');
        const x0 = ramp ? o.col * 8 + 8 : o.col * 8 + 4;
        const y0 = topRow * 8;
        const up = { hold: CONSTS.JUMP_V!, tap: CONSTS.JUMP_V!, r45: v, r45a: Math.min(v + CONSTS.JUMP_V!, CONSTS.LAUNCH_MAX!), r22: v >> 1, r22a: Math.min((v >> 1) + CONSTS.JUMP_V!, CONSTS.LAUNCH_MAX!) }[kind]!;
        const cells: [number, number][] = [[x0 >> 3, (y0 - 9) >> 3]];
        let vy = -up;
        let dx = 0;
        let dy = 0;
        let next = x0 + 16;
        for (let f = 1; f < 400; f++) {
          if (kind === 'tap' && f >= 2 && vy < -CONSTS.JUMP_CUT!) vy = -CONSTS.JUMP_CUT!;
          vy = Math.min(vy + CONSTS.G!, CONSTS.MAX_FALL!);
          dy += vy;
          dx += v;
          const x = x0 + (dx >> 4);
          const foot = y0 + (dy >> 4);
          if (x >= next) {
            cells.push([x >> 3, (foot - 9) >> 3]);
            next += 16;
          }
          const cl = classAt(x >> 3, foot >> 3);
          if (dy > 0 && (foot > 255 || (cl !== CLASS.EMPTY && cl !== CLASS.APPLE))) break;
        }
        apples(cells.slice(0, o.args[2] ? n(2) : cells.length));
        break;
      }
      case 'block':
        rect(A('SOLID'), 0);
        break;
      case 'weak':
        rect(A('WEAK'), 0);
        breakables.push({ col: o.col, row: row(0), w: n(1), h: n(2), kind: 'weak' });
        break;
      case 'bounce':
        rect(A('BOUNCE'), 0);
        break;
      case 'bar':
        rect(A('BAR'), 0);
        break;
      case 'tile': {
        const code = (T as Record<string, number>)[o.args[0]!] ?? WTILE[o.args[0]!]!;
        rect(attrOf(L.world - 1, code), 1);
        break;
      }
      case 'platform':
        for (let i = 0; i < n(1); i++) put(o.col + i, row(0), A('ONEWAY'));
        break;
      case 'rail':
        for (let i = 0; i < n(1); i++) put(o.col + i, row(0), A('RAIL', SH.FLAT));
        break;
      case 'raild': {
        const upw = o.args[2] === 'up';
        for (let i = 0; i < n(1); i++) put(o.col + i, row(0) - (upw ? i : -i), A('RAIL', upw ? SH.U45 : SH.D45));
        break;
      }
      case 'ramp45':
      case 'ramp45l':
      case 'ramp22':
      case 'ramp22l': {
        const k = n(0);
        const base = ROWS - 1 - ground[o.col]!;
        const wide = o.kind.startsWith('ramp22');
        const left = o.kind.endsWith('l');
        for (let i = 0; i < (wide ? 2 * k : k); i++) {
          const step = wide ? (left ? k - 1 - (i >> 1) : i >> 1) : left ? k - 1 - i : i;
          const shape = wide ? (left ? (i % 2 ? SH.D22LO : SH.D22HI) : i % 2 ? SH.U22HI : SH.U22LO) : left ? SH.D45 : SH.U45;
          put(o.col + i, base - step, A('RAMP', shape));
          for (let j = 0; j < step; j++) put(o.col + i, base - j, A('SOLID'));
        }
        break;
      }
      case 'box':
        put(o.col, row(0), A('BOX'));
        breakables.push({ col: o.col, row: row(0), w: 1, h: 1, kind: 'box' });
        break;
      case 'star':
        put(o.col, row(0), A('STAR', n(1) - 1));
        break;
      case 'part':
        put(o.col, row(0), A('PICKUP', 3));
        break;
      case 'flag':
      case 'goal':
      case 'sign': {
        const r = ROWS - 1 - ground[o.col]!;
        put(o.col, r, 0);
        put(o.col, r - 1, 0);
        break;
      }
      case 'pickup':
        put(o.col, row(1), A('PICKUP', o.args[0] === 'pommes' ? 0 : 1));
        break;
      case 'prefab': {
        const rows = PREFABS[o.args[0]!]!;
        rows.forEach((rr, j) =>
          rr.forEach((name, i) => {
            if (name === '.') return;
            const code = (T as Record<string, number>)[name] ?? WTILE[name]!;
            put(o.col + i, row(1) - (rows.length - 1 - j), attrOf(L.world - 1, code));
          }),
        );
        break;
      }
      case 'fg':
      case 'enemy':
        break;
      default:
        throw new Error(`${L.id}:${o.line}: object ${o.kind}`);
    }
  }
  return { level: L, attr, used, patterns, breakables, ground };
}

// ---- reference surfaces and boxes ------------------------------------------------------------------
const SURF = new Set<number>([CLASS.SOLID, CLASS.SLOPE, CLASS.RAMP, CLASS.ONEWAY, CLASS.RAIL, CLASS.WEAK, CLASS.BOX, CLASS.BOUNCE, CLASS.BAR, CLASS.SAND, CLASS.ICE]);
const HMAPPED = new Set<number>([CLASS.SLOPE, CLASS.RAMP, CLASS.RAIL]);
/** Classes Bo's body can never overlap (BAR: only its upper half). */
export const SOLID_CLASSES = new Set<number>([CLASS.SOLID, CLASS.WEAK, CLASS.BOX, CLASS.BOUNCE, CLASS.BAR, CLASS.SAND, CLASS.ICE]);

export function attrAt(g: { attr: Uint8Array; level: { width: number } }, c: number, r: number): number {
  if (c < 0 || c >= g.level.width || r < 0 || r >= ROWS) return 0;
  return g.attr[c * ROWS + r]!;
}

/** Is there a surface exactly at pixel row y in pixel column x of the reference grid? */
export function surfaceAt(g: RefGrid | { attr: Uint8Array; level: { width: number } }, x: number, y: number): boolean {
  const c = x >> 3;
  for (const r of [(y >> 3) - 1, y >> 3]) {
    const a = attrAt(g, c, r);
    const cl = a & 15;
    if (!SURF.has(cl)) continue;
    const sy = HMAPPED.has(cl) ? r * 8 + 8 - HMAP[a >> 4]![x & 7]! : r * 8;
    if (sy === y) return true;
  }
  return false;
}

/** Cells of the reference grid that a body box (pixels x0..x1, y0..y1) overlaps and may not. */
export function boxOverlaps(g: { attr: Uint8Array; level: { width: number } }, x0: number, x1: number, y0: number, y1: number): string[] {
  const out: string[] = [];
  for (let c = x0 >> 3; c <= x1 >> 3; c++) {
    for (let r = y0 >> 3; r <= y1 >> 3; r++) {
      const cl = attrAt(g, c, r) & 15;
      if (!SOLID_CLASSES.has(cl)) continue;
      if (cl === CLASS.BAR && y0 >= r * 8 + 4) continue;
      out.push(`${c},${r}`);
    }
  }
  return out;
}

// ---- the cartridge ---------------------------------------------------------------------------------
export async function buildBo() {
  const { bytes, asm } = await buildCartridge(readFileSync(join(GAME_DIR, 'bo.asm'), 'utf8'), { file: 'bo.asm', resolveInclude: includeFrom(GAME_DIR) });
  const cart = await parseCartridge(bytes);
  const rom = new Uint8Array(0x8000);
  rom.set(cart.sections.code, 0);
  rom.set(cart.sections.rodata, cart.sections.code.length);
  return { bytes, asm, cart, sym: asm.symbols, rom };
}
export type Bo = Awaited<ReturnType<typeof buildBo>>;

export function symbol(sym: Map<string, number>, name: string): number {
  const v = sym.get(name);
  if (v === undefined) throw new Error(`no symbol ${name}`);
  return v;
}

/** A VM in play mode in level `id` (via the dbg_level test hook). */
export function vmInLevel(bo: Bo, id: string, seed = 1): VM {
  const vm = VM.fromCartridge(bo.cart, { seed });
  vm.step(0);
  vm.write16(symbol(bo.sym, 'dbg_level'), LEVEL_IDS.indexOf(id) + 1);
  for (let i = 0; i < 30 && vm.read16(symbol(bo.sym, 'mode')) !== symbol(bo.sym, 'M_PLAY'); i++) vm.step(0);
  if (vm.fault) throw new Error(vm.fault);
  return vm;
}

/** The level grid as the engine holds it in RAM, as attributes (through the engine's attribute table). */
export function ramAttrs(bo: Bo, vm: VM, width: number): Uint8Array {
  const lvl = symbol(bo.sym, 'lvl');
  const tab = symbol(bo.sym, 'attr_tab');
  const out = new Uint8Array(width * ROWS);
  for (let i = 0; i < out.length; i++) out[i] = vm.read8(tab + vm.read8(lvl + i));
  return out;
}

// ---- replays ---------------------------------------------------------------------------------------
export function replayFiles(): string[] {
  const dir = join(GAME_DIR, 'replays');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.frames.json')).map((f) => f.slice(0, -5)) : [];
}
export function loadReplay(name: string): ReplayFile & { frames: number } {
  return JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8'));
}
export function expectedHashes(name: string): string[] {
  return readFileSync(join(GAME_DIR, 'replays', `${name}.hashes.txt`), 'utf8').trim().split('\n');
}

export interface FrameView {
  f: number;
  vm: VM;
  S: (name: string) => number;
  /** signed 16-bit RAM word */
  w: (name: string) => number;
  input: number;
  audio: ReturnType<VM['step']>;
}

export function runReplay(bo: Bo, name: string, onFrame: (v: FrameView) => void) {
  const rf = loadReplay(name);
  const inputs = expandInputs(rf.inputs, rf.frames);
  const expected = expectedHashes(name);
  const vm = VM.fromCartridge(bo.cart, { seed: rf.seed ?? 1 });
  const S = (n: string) => symbol(bo.sym, n);
  const w = (n: string) => s16(vm.read16(S(n)));
  let hashMismatch = -1;
  let maxCycles = 0;
  for (let f = 0; f < rf.frames; f++) {
    const audio = vm.step(inputs[f]!);
    maxCycles = Math.max(maxCycles, vm.cyclesLastFrame);
    if (hashMismatch < 0 && vm.stateHash() !== expected[f]) hashMismatch = f + 1;
    onFrame({ f, vm, S, w, input: inputs[f]!, audio });
  }
  return { vm, rf, hashMismatch, expectedFrames: expected.length, maxCycles };
}

/** Level index -> id, as the ROM table orders them. */
export const levelOf = (vm: VM, bo: Bo) => LEVEL_IDS[vm.read16(symbol(bo.sym, 'level'))]!;
