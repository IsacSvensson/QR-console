// Level generator: levels/*.map -> ../levels.gen.asm (the ROM level table, each cell map packed in xdata) and
// levels/<id>.png (the level top-down, with the screens marked, and its map colours beside it).
// Format of a .map file (DESIGN.md §4.2):
//   # comment                       (not inside the cell map, where # is dense forest)
//   name: 1-1 SKOGSSTARTEN          the level card / map title (the game's font)
//   world: 1
//   cells:                          the cell map, one character per cell (DESIGN §4.1), up to 24 x 15,
//   ^^^^^^TTTT…                     width a multiple of 4 and height a multiple of 3 (whole screens);
//                                   exactly one S (start) and one M (goal)
//   controls:                       number, kind (O obligatory, F optional, H hidden), column, row
//   1 O 6 13
//   leaves: 21 8                    cells covered by leaves (bit 6)
// Run: npx tsx games/sixten/tools/levels.ts (or npm run sixten:gen)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { PALETTE } from '@qrc/vm';
import { CELLS, CELL_BY_CH, encode, patternBytes, tilePixels } from './art';
import { GAME_DIR, isMain } from './util';

export const MAX_W = 24;
export const MAX_H = 15;
export const CONTROL_KINDS = { O: 0, F: 1, H: 2 } as const;

export interface Control { n: number; kind: keyof typeof CONTROL_KINDS; c: number; r: number }
export interface Level {
  id: string;
  name: string;
  world: number;
  w: number;
  h: number;
  rows: string[];
  controls: Control[];
  leaves: [number, number][];
  start: [number, number];
  goal: [number, number];
}

const LEVEL_DIR = join(GAME_DIR, 'levels');

/** level ids in table order: the real levels by id, then the test levels */
export function levelIds(): string[] {
  const ids = readdirSync(LEVEL_DIR).filter((f) => f.endsWith('.map')).map((f) => f.slice(0, -4));
  const real = ids.filter((i) => !i.startsWith('T')).sort();
  const test = ids.filter((i) => i.startsWith('T')).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return [...real, ...test];
}

export function parseLevel(id: string, text = readFileSync(join(LEVEL_DIR, `${id}.map`), 'utf8')): Level {
  const L: Level = { id, name: '', world: 0, w: 0, h: 0, rows: [], controls: [], leaves: [], start: [-1, -1], goal: [-1, -1] };
  let section = '';
  const fail = (m: string): never => {
    throw new Error(`${id}.map: ${m}`);
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line || (line.startsWith('#') && section !== 'cells')) continue; // '#' is dense forest inside the cell map
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) {
      const [, k, v] = kv;
      if (k === 'name') L.name = v!;
      else if (k === 'world') L.world = Number(v);
      else if (k === 'leaves') {
        const n = v!.trim().split(/\s+/).map(Number);
        for (let i = 0; i + 1 < n.length; i += 2) L.leaves.push([n[i]!, n[i + 1]!]);
      } else if (k === 'cells' || k === 'controls') section = k;
      else fail(`unknown key ${k}`);
      continue;
    }
    if (section === 'cells') L.rows.push(line);
    else if (section === 'controls') {
      const m = /^(\d+)\s+([OFH])\s+(\d+)\s+(\d+)$/.exec(line.trim());
      if (!m) fail(`bad control line '${line}'`);
      L.controls.push({ n: Number(m![1]), kind: m![2] as Control['kind'], c: Number(m![3]), r: Number(m![4]) });
    } else fail(`unexpected line '${line}'`);
  }
  L.h = L.rows.length;
  L.w = L.rows[0]?.length ?? 0;
  if (!L.name) fail('no name');
  encode(L.name);
  if (L.w % 4 || L.h % 3 || L.w > MAX_W || L.h > MAX_H || !L.w) fail(`size ${L.w} x ${L.h}: must be whole screens (4 x 3 cells), at most ${MAX_W} x ${MAX_H}`);
  L.rows.forEach((r, y) => {
    if ([...r].length !== L.w) fail(`row ${y} has ${[...r].length} cells, expected ${L.w}`);
    [...r].forEach((ch, x) => {
      if (!CELL_BY_CH.has(ch)) fail(`unknown cell '${ch}' at ${x},${y}`);
      if (ch === 'S') {
        if (L.start[0] >= 0) fail('more than one S');
        L.start = [x, y];
      }
      if (ch === 'M') {
        if (L.goal[0] >= 0) fail('more than one M');
        L.goal = [x, y];
      }
    });
  });
  if (L.start[0] < 0 || L.goal[0] < 0) fail('needs one S and one M');
  if (!L.controls.length || L.controls.length > 8) fail('1-8 controls');
  L.controls.forEach((c, i) => {
    if (c.n !== i + 1) fail(`controls must be numbered 1, 2, … in order (found ${c.n})`);
    if (c.c >= L.w || c.r >= L.h) fail(`control ${c.n} outside the level`);
    if (CELLS[CELL_BY_CH.get(L.rows[c.r]![c.c]!)!]!.speed === 0) fail(`control ${c.n} on a blocking cell`);
  });
  for (const [c, r] of L.leaves) if (c >= L.w || r >= L.h) fail(`leaves outside the level at ${c},${r}`);
  return L;
}

/** the cell bytes of a level, row-major (DESIGN §4.1) */
export function cellBytes(L: Level): number[] {
  const out: number[] = [];
  L.rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const k = CELL_BY_CH.get(ch)!;
      const variant = CELLS[k]!.varies && ((c * 7 + r * 3) >> 1) & 1 ? 0x20 : 0;
      const leaves = L.leaves.some(([lc, lr]) => lc === c && lr === r) ? 0x40 : 0;
      const ctrl = L.controls.some((x) => x.c === c && x.r === r) ? 0x80 : 0;
      out.push(k | variant | leaves | ctrl);
    }),
  );
  return out;
}

export function generateLevels(): { asm: string; levels: Level[] } {
  const levels = levelIds().map((id) => parseLevel(id));
  const lab = (id: string) => id.replace(/-/g, '_');
  const out = [
    '; GENERATED by games/sixten/tools/levels.ts from levels/*.map — do not edit.',
    `LEVEL_COUNT = ${levels.length}`,
    'LV_REC = 16',
    ...levels.map((L, i) => `LEVEL_${lab(L.id).toUpperCase()} = ${i}`),
    '',
    '.data',
    '; per level: far address of the packed cell map (hi, lo), width, height, start column/row, goal column/row,',
    '; control count, world, name, controls (column, row, kind: 0 obligatory, 1 optional, 2 hidden)',
    'level_table:',
  ];
  for (const L of levels) {
    const n = lab(L.id);
    out.push(
      `    .word cells_${n} >> 16, cells_${n} & 0xFFFF`,
      `    .byte ${L.w}, ${L.h}, ${L.start[0]}, ${L.start[1]}, ${L.goal[0]}, ${L.goal[1]}, ${L.controls.length}, ${L.world}`,
      `    .word name_${n}, ctrls_${n}`,
    );
  }
  for (const L of levels) {
    const n = lab(L.id);
    out.push(`name_${n}: .byte ${[...encode(L.name), 255].join(', ')}   ; ${L.name}`);
    out.push(`ctrls_${n}: .byte ${L.controls.map((c) => `${c.c}, ${c.r}, ${CONTROL_KINDS[c.kind]}`).join(', ')}`);
  }
  out.push('', '.xdata');
  for (const L of levels) {
    const bytes = cellBytes(L);
    out.push(`cells_${lab(L.id)}:`, '.pack');
    for (let r = 0; r < L.h; r++) out.push(`    .byte ${bytes.slice(r * L.w, r * L.w + L.w).join(', ')}   ; ${L.rows[r]}`);
    out.push('.endpack');
  }
  return { asm: out.join('\n') + '\n', levels };
}

/** Preview: the level top-down (1 px = 1 px, screen borders dotted), and beside it the map colours (8 px a cell). */
export function previewPng(L: Level): Buffer {
  const W = L.w * 32;
  const H = L.h * 32;
  const width = W + 8 + L.w * 8;
  const png = new PNG({ width, height: H });
  const put = (x: number, y: number, c: number) => {
    const rgb = PALETTE[c]!;
    const i = (y * width + x) * 4;
    png.data[i] = rgb >> 16;
    png.data[i + 1] = (rgb >> 8) & 255;
    png.data[i + 2] = rgb & 255;
    png.data[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < width; x++) put(x, y, 0);
  const bytes = cellBytes(L);
  bytes.forEach((b, i) => {
    const c = i % L.w;
    const r = Math.floor(i / L.w);
    const pat = patternBytes(CELLS[b & 31]!.pattern);
    for (let ty = 0; ty < 4; ty++)
      for (let tx = 0; tx < 4; tx++) {
        let t = pat[(b & 0x20 ? ty ^ 2 : ty) * 4 + tx]!;
        if (b & 0x40 && tx === 1 && ty === 1) t = 0;
        const px = tilePixels(t);
        for (let p = 0; p < 64; p++) put(c * 32 + tx * 8 + (p % 8), r * 32 + ty * 8 + (p >> 3), px[p] || 11);
      }
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) put(W + 8 + c * 8 + x, r * 8 + y, CELLS[b & 31]!.fill);
    if (b & 0x80) for (let k = 0; k < 6; k++) put(c * 32 + 13 + (k % 3), r * 32 + 13 + Math.floor(k / 3), 6);
  });
  for (let x = 0; x < W; x += 2) for (let r = 0; r < L.h; r += 3) put(x, r * 32, 15);
  for (let y = 0; y < H; y += 2) for (let c = 0; c < L.w; c += 4) put(c * 32, y, 15);
  return PNG.sync.write(png);
}

if (isMain(import.meta.url)) {
  const { asm, levels } = generateLevels();
  writeFileSync(join(GAME_DIR, 'levels.gen.asm'), asm);
  for (const L of levels) writeFileSync(join(LEVEL_DIR, `${L.id}.png`), previewPng(L));
  console.log(`levels.gen.asm: ${levels.map((L) => `${L.id} ${L.w}x${L.h}`).join(', ')}`);
}
