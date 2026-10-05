// Parser for the .lvl level sources (syntax: ../levels/FORMAT.md). Used by the generator and the bot.
// The tests have their own independent reader (test/bo/oracle.ts).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from './util';

export type Material = 'normal' | 'sand' | 'ice' | 'alt';
export type Liquid = 'water' | 'choc';
export type TerrainCmd =
  | { op: 'flat' | 'up22' | 'down22' | 'up45' | 'down45' | 'gap' | 'liquid'; n: number; line: number }
  | { op: 'step'; d: number; line: number }
  | { op: 'mat'; m: Material; line: number }
  | { op: 'liq'; l: Liquid; line: number };

export interface LvlObject {
  col: number;
  kind: string;
  args: string[];
  line: number;
}

export interface Lvl {
  id: string;
  file: string;
  name: string;
  world: number;
  rows: 16 | 32;
  start: number;
  music: number;
  h0: number;
  terrain: TerrainCmd[];
  objects: LvlObject[];
  width: number;
}

/** Level order in the ROM table: test levels first, then the 25 game levels as they exist. */
export const LEVEL_ORDER = ['T1', 'T2', 'T3', ...[1, 2, 3, 4, 5].flatMap((w) => [1, 2, 3, 4, 5].map((l) => `${w}-${l}`))];

export const LEVELS_DIR = join(GAME_DIR, 'levels');

export function levelIds(): string[] {
  const have = new Set(readdirSync(LEVELS_DIR).filter((f) => f.endsWith('.lvl')).map((f) => f.slice(0, -4)));
  for (const id of have) if (!LEVEL_ORDER.includes(id)) throw new Error(`levels/${id}.lvl is not in LEVEL_ORDER`);
  return LEVEL_ORDER.filter((id) => have.has(id));
}

export function readLevel(id: string): Lvl {
  const file = join(LEVELS_DIR, `${id}.lvl`);
  return parseLevel(id, readFileSync(file, 'utf8'), `${id}.lvl`);
}

export function parseLevel(id: string, text: string, file = `${id}.lvl`): Lvl {
  const lvl: Lvl = { id, file, name: id, world: 1, rows: 16, start: 2, music: 0, h0: 4, terrain: [], objects: [], width: 0 };
  let section: 'head' | 'terrain' | 'objects' = 'head';
  const err = (n: number, msg: string) => new Error(`${file}:${n}: ${msg}`);
  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const w = line.split(/\s+/);
    if (line === 'terrain' || line === 'objects') {
      section = line;
      return;
    }
    if (section === 'head') {
      const v = w.slice(1).join(' ');
      switch (w[0]) {
        case 'name': lvl.name = v; break;
        case 'world': lvl.world = Number(v); break;
        case 'rows':
          if (v !== '16' && v !== '32') throw err(n, 'rows must be 16 or 32');
          lvl.rows = Number(v) as 16 | 32;
          break;
        case 'start': lvl.start = Number(v); break;
        case 'music': lvl.music = Number(v); break;
        default: throw err(n, `unknown header ${w[0]}`);
      }
      return;
    }
    if (section === 'terrain') {
      const op = w[0]!;
      if (op === 'h') {
        if (lvl.terrain.length) throw err(n, '"h" only before the first segment (use "step")');
        lvl.h0 = Number(w[1]);
      } else if (['flat', 'up22', 'down22', 'up45', 'down45', 'gap', 'liquid'].includes(op)) {
        const k = Number(w[1]);
        if (!Number.isInteger(k) || k < 1 || k > 384) throw err(n, `${op}: length 1..384`);
        lvl.terrain.push({ op: op as 'flat', n: k, line: n });
      } else if (op === 'step') {
        const d = Number(w[1]);
        if (!Number.isInteger(d) || d === 0 || d < -8 || d > 7) throw err(n, 'step: -8..7, not 0');
        lvl.terrain.push({ op: 'step', d, line: n });
      } else if (op === 'mat') {
        if (!['normal', 'sand', 'ice', 'alt'].includes(w[1]!)) throw err(n, 'mat normal|sand|ice|alt');
        lvl.terrain.push({ op: 'mat', m: w[1] as Material, line: n });
      } else if (op === 'liq') {
        if (!['water', 'choc'].includes(w[1]!)) throw err(n, 'liq water|choc');
        lvl.terrain.push({ op: 'liq', l: w[1] as Liquid, line: n });
      } else throw err(n, `unknown terrain command ${op}`);
      return;
    }
    const col = Number(w[0]);
    if (!Number.isInteger(col) || col < 0) throw err(n, 'objects: a line starts with a column');
    if (!w[1]) throw err(n, 'object kind missing');
    lvl.objects.push({ col, kind: w[1], args: w.slice(2), line: n });
  });
  lvl.width = terrainColumns(lvl.terrain);
  for (let i = 1; i < lvl.objects.length; i++) {
    if (lvl.objects[i]!.col < lvl.objects[i - 1]!.col) throw err(lvl.objects[i]!.line, 'objects must be sorted by column');
  }
  if (lvl.width > 384) throw new Error(`${file}: ${lvl.width} columns (max 384)`);
  return lvl;
}

export function terrainColumns(t: TerrainCmd[]): number {
  let c = 0;
  for (const s of t) if ('n' in s) c += s.op === 'up22' || s.op === 'down22' ? 2 * s.n : s.n;
  return c;
}

/** Ground height (tiles of non-empty cells counted from the bottom, i.e. 32 - top row) of every column. */
export function groundHeights(lvl: Lvl): number[] {
  const out: number[] = [];
  let h = lvl.h0;
  for (const s of lvl.terrain) {
    switch (s.op) {
      case 'flat':
        for (let i = 0; i < s.n; i++) out.push(h);
        break;
      case 'up45':
        for (let i = 0; i < s.n; i++) out.push(h + i + 1);
        h += s.n;
        break;
      case 'down45':
        for (let i = 0; i < s.n; i++) out.push(h - i);
        h -= s.n;
        break;
      case 'up22':
        for (let i = 0; i < s.n; i++) out.push(h + i + 1, h + i + 1);
        h += s.n;
        break;
      case 'down22':
        for (let i = 0; i < s.n; i++) out.push(h - i, h - i);
        h -= s.n;
        break;
      case 'gap':
      case 'liquid':
        for (let i = 0; i < s.n; i++) out.push(0);
        break;
      case 'step':
        h += s.d;
        break;
    }
  }
  return out;
}

/** Resolves a height spec: a number, or g / g+N / g-N relative to the ground at `col`. */
export function resolveY(spec: string, col: number, ground: number[], file: string, line: number): number {
  const m = /^g([+-]\d+)?$/.exec(spec);
  const y = m ? (ground[col] ?? 0) + Number(m[1] ?? 0) : Number(spec);
  if (!Number.isInteger(y) || y < 0 || y > 31) throw new Error(`${file}:${line}: bad height ${spec} (${y})`);
  return y;
}
