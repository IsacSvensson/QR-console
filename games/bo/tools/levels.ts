// Level generator: levels/*.lvl -> ../levels.gen.asm (ROM level table, DESIGN.md §14.1) and levels/<id>.png
// (a preview of every level, so levels can be reviewed without playing). Syntax: ../levels/FORMAT.md.
// Run: npx tsx games/bo/tools/levels.ts   (npm run bo:gen)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { PALETTE } from '@qrc/vm';
import { type Lvl, LEVELS_DIR, groundHeights, levelIds, readLevel, resolveY } from './lvl';
import { type ArcKind, flight } from './physics';
import { PREFABS } from './prefabs';
import { CLASS, T, WORLDS, WTILE, attrOf, tilePixels, worldHasTile } from './tiles';
import { isMain } from './util';

export const ROWS = 32;

// ROM object types (DESIGN.md §14.1; FORMAT.md)
export const OT = {
  TILE: 1, RECT: 2, APPLES: 3, BOX: 4, STAR: 5, PART: 6, FLAG: 7, GOAL: 8, ENEMY: 9, FG: 10,
  RAMP: 11, RAILD: 12, PLATFORM: 13, SIGN: 14, PICKUP: 15, PREFAB: 16,
} as const;
export const BOX_CONTENT: Record<string, number> = { apples: 0, apple: 1, pommes: 2, godis: 3 };
export const SIGN_KIND: Record<string, number> = { right: 0, a: 1, b: 2, down: 3 };
export const RAMP_KIND: Record<string, number> = { ramp45: 0, ramp45l: 1, ramp22: 2, ramp22l: 3 };
export const ENEMY_TYPE: Record<string, number> = {
  snail: 1, gull: 2, hedgehog: 3, wasp: 4, ball: 5, teddy: 6, squirrel: 7, pigeon: 8, snowman: 9, sled: 10, jelly: 11, blob: 12, cannon: 13,
  boss1: 17, log: 18, bus: 19,
};
export const PREFAB_IDS = Object.keys(PREFABS);

// terrain segment encoding: type << 5 | (n - 1); type 7 = special
const SEG: Record<string, number> = { flat: 0, up22: 1, down22: 2, up45: 3, down45: 4, gap: 5, liquid: 6 };
export const SP = { MAT_NORMAL: 16, MAT_SAND: 17, MAT_ICE: 18, MAT_ALT: 19, LIQ_WATER: 20, LIQ_CHOC: 21, END: 31 } as const;

export function tileCode(name: string): number {
  const v = (T as Record<string, number>)[name] ?? WTILE[name];
  if (v === undefined) throw new Error(`unknown tile ${name}`);
  return v;
}

export interface Built {
  lvl: Lvl;
  grid: Uint8Array; // column-major, 32 rows per column: grid[col * 32 + row] = tile code
  terrain: number[];
  objects: number[];
  /** apples of each source line (pattern), as [col, row] cells */
  patterns: Map<number, [number, number][]>;
  fg: { col: number; row: number; id: number }[];
}

export function buildLevel(lvl: Lvl): Built {
  const W = lvl.width;
  const grid = new Uint8Array(W * ROWS);
  const ground = groundHeights(lvl);
  const set = (c: number, r: number, code: number) => {
    if (c < 0 || c >= W || r < 0 || r >= ROWS) throw new Error(`${lvl.file}: cell ${c},${r} outside the level`);
    grid[c * ROWS + r] = code;
  };
  const get = (c: number, r: number) => (c < 0 || c >= W || r < 0 || r >= ROWS ? 0 : grid[c * ROWS + r]!);
  // ---- terrain
  const terrain: number[] = [];
  let h = lvl.h0;
  let col = 0;
  let top: number = T.TOP;
  let fill: number = T.FILL;
  let liq = [T.WATER_TOP as number, T.WATER as number];
  const column = (topRow: number, topCode: number) => {
    set(col, topRow, topCode);
    for (let r = topRow + 1; r < ROWS; r++) set(col, r, fill);
    col++;
  };
  for (const s of lvl.terrain) {
    switch (s.op) {
      case 'flat':
        for (let i = 0; i < s.n; i++) column(ROWS - h, top);
        break;
      case 'up45':
        for (let i = 0; i < s.n; i++) column(ROWS - h - 1 - i, T.S45U);
        h += s.n;
        break;
      case 'down45':
        for (let i = 0; i < s.n; i++) column(ROWS - h + i, T.S45D);
        h -= s.n;
        break;
      case 'up22':
        for (let i = 0; i < s.n; i++) {
          column(ROWS - h - 1 - i, T.S22U_LO);
          column(ROWS - h - 1 - i, T.S22U_HI);
        }
        h += s.n;
        break;
      case 'down22':
        for (let i = 0; i < s.n; i++) {
          column(ROWS - h + i, T.S22D_HI);
          column(ROWS - h + i, T.S22D_LO);
        }
        h -= s.n;
        break;
      case 'gap':
        col += s.n;
        break;
      case 'liquid':
        for (let i = 0; i < s.n; i++) {
          set(col, ROWS - h + 1, liq[0]!);
          for (let r = ROWS - h + 2; r < ROWS; r++) set(col, r, liq[1]!);
          col++;
        }
        break;
      case 'step':
        h += s.d;
        break;
      case 'mat':
        [top, fill] = { normal: [T.TOP, T.FILL], sand: [T.SAND, T.FILL], ice: [T.ICE, T.FILL], alt: [WTILE.GRASS!, WTILE.DIRT!] }[s.m];
        break;
      case 'liq':
        liq = s.l === 'water' ? [T.WATER_TOP, T.WATER] : [T.CHOC_TOP, T.CHOC];
        break;
    }
    if (h < 1 || h > 31) throw new Error(`${lvl.file}:${s.line}: ground height ${h} out of 1..31`);
    if (s.op === 'step') terrain.push((7 << 5) | (s.d + 8));
    else if (s.op === 'mat') terrain.push((7 << 5) | { normal: SP.MAT_NORMAL, sand: SP.MAT_SAND, ice: SP.MAT_ICE, alt: SP.MAT_ALT }[s.m]);
    else if (s.op === 'liq') terrain.push((7 << 5) | (s.l === 'water' ? SP.LIQ_WATER : SP.LIQ_CHOC));
    else for (let k = s.n; k > 0; k -= 32) terrain.push((SEG[s.op]! << 5) | (Math.min(k, 32) - 1));
  }
  terrain.push((7 << 5) | SP.END);

  // ---- objects
  type Rec = { col: number; bytes: number[] };
  const recs: Rec[] = [];
  const rec = (c: number, type: number, row: number, param: number, ...extra: number[]) => {
    if (row < 0 || row > 31 || param < 0 || param > 255) throw new Error(`${lvl.file}: bad object ${type} row ${row} param ${param}`);
    recs.push({ col: c, bytes: [c & 255, ((c >> 8) & 1) | (type << 1), row, param, ...extra] });
  };
  const patterns = new Map<number, [number, number][]>();
  const fg: Built['fg'] = [];
  const rowOf = (y: number) => ROWS - 1 - y;
  for (const o of lvl.objects) {
    const Y = (k: number) => resolveY(o.args[k] ?? 'g', o.col, ground, lvl.file, o.line);
    const N = (k: number, def?: number) => {
      const v = o.args[k] === undefined ? def : Number(o.args[k]);
      if (v === undefined || !Number.isInteger(v)) throw new Error(`${lvl.file}:${o.line}: ${o.kind}: argument ${k + 1} must be an integer`);
      return v;
    };
    const apples = (cells: [number, number][]) => {
      const list = patterns.get(o.line) ?? [];
      for (const [c, r] of cells) {
        if (get(c, r) !== 0 || list.some(([a, b]) => a === c && b === r)) continue;
        set(c, r, T.APPLE);
        list.push([c, r]);
      }
      patterns.set(o.line, list);
    };
    switch (o.kind) {
      case 'apples':
        apples(Array.from({ length: N(1) }, (_, i) => [o.col + i, rowOf(Y(0))]));
        break;
      case 'column':
        apples(Array.from({ length: N(1) }, (_, i) => [o.col, rowOf(Y(0)) - i]));
        break;
      case 'apple':
        apples([[o.col, rowOf(Y(0))]]);
        break;
      case 'arc': {
        const v = N(0);
        const kind = o.args[1] as ArcKind;
        if (!['hold', 'tap', 'r45', 'r45a', 'r22', 'r22a'].includes(kind)) throw new Error(`${lvl.file}:${o.line}: arc kind`);
        const ramp = kind.startsWith('r');
        let topRow = 0;
        while (topRow < ROWS && get(o.col, topRow) === 0) topRow++;
        const x0 = ramp ? o.col * 8 + 8 : o.col * 8 + 4;
        const y0 = topRow * 8;
        const cells: [number, number][] = [[x0 >> 3, (y0 - 9) >> 3]];
        let next = x0 + 16;
        flight(kind, v, (dx, dy) => {
          const x = x0 + (dx >> 4);
          const foot = y0 + (dy >> 4);
          if (x >= next) {
            cells.push([x >> 3, (foot - 9) >> 3]);
            next += 16;
          }
          const c = attrOf(lvl.world - 1, get(x >> 3, foot >> 3)) & 15;
          return dy > 0 && (foot > 255 || dy >> 4 > 16 || (c !== CLASS.EMPTY && c !== CLASS.APPLE));
        });
        const limit = o.args[2] ? N(2) : cells.length;
        apples(cells.slice(0, limit).filter(([c, r]) => c >= 0 && c < W && r >= 0 && r < ROWS));
        break;
      }
      case 'block':
      case 'weak':
      case 'bounce':
      case 'bar':
      case 'tile': {
        if (o.kind === 'tile' && !worldHasTile(lvl.world - 1, o.args[0]!)) throw new Error(`${lvl.file}:${o.line}: world ${lvl.world} has no tile ${o.args[0]}`);
        const code = o.kind === 'tile' ? tileCode(o.args[0]!) : { block: T.BLOCK, weak: T.WEAK, bounce: T.BOUNCE, bar: T.BAR }[o.kind]!;
        const a = o.kind === 'tile' ? 1 : 0;
        const y = Y(a);
        const w = N(a + 1, 1);
        const hh = N(a + 2, 1);
        if (w < 1 || w > 16 || hh < 1 || hh > 16) throw new Error(`${lvl.file}:${o.line}: size 1..16`);
        for (let i = 0; i < w; i++) for (let j = 0; j < hh; j++) set(o.col + i, rowOf(y) - j, code);
        if (w === 1 && hh === 1) rec(o.col, OT.TILE, rowOf(y), code);
        else rec(o.col, OT.RECT, rowOf(y), code, (w - 1) | ((hh - 1) << 4));
        break;
      }
      case 'platform': {
        const y = Y(0);
        const w = N(1);
        if (w < 2 || w > 32) throw new Error(`${lvl.file}:${o.line}: platform width 2..32`);
        for (let i = 0; i < w; i++) set(o.col + i, rowOf(y), i === 0 ? T.PLAT_L : i === w - 1 ? T.PLAT_R : T.PLAT_M);
        rec(o.col, OT.PLATFORM, rowOf(y), w);
        break;
      }
      case 'rail': {
        const y = Y(0);
        const w = N(1);
        for (let i = 0; i < w; i++) set(o.col + i, rowOf(y), T.RAIL);
        rec(o.col, OT.RECT, rowOf(y), T.RAIL, (w - 1) & 15);
        if (w > 16) throw new Error(`${lvl.file}:${o.line}: rail width 1..16`);
        break;
      }
      case 'raild': {
        const y = Y(0);
        const w = N(1);
        const up = o.args[2] === 'up';
        if (!up && o.args[2] !== 'down') throw new Error(`${lvl.file}:${o.line}: raild <y> <n> up|down`);
        for (let i = 0; i < w; i++) set(o.col + i, rowOf(y) - (up ? i : -i), up ? T.RAILU : T.RAILD);
        rec(o.col, OT.RAILD, rowOf(y), (w - 1) | (up ? 0 : 128));
        break;
      }
      case 'ramp45':
      case 'ramp45l':
      case 'ramp22':
      case 'ramp22l': {
        const n = N(0, 1);
        const y = ground[o.col]!;
        const r0 = rowOf(y);
        const kind = RAMP_KIND[o.kind]!;
        const cols = kind >= 2 ? 2 * n : n;
        for (let i = 0; i < cols; i++) {
          const k = kind >= 2 ? i >> 1 : i; // tiles above the ground in this column (the ramp tile is the top one)
          const step = kind === 1 || kind === 3 ? (kind === 1 ? n - 1 - i : n - 1 - (i >> 1)) : k;
          const code = [T.R45U, T.R45D, i % 2 === 0 ? T.R22U_LO : T.R22U_HI, i % 2 === 0 ? T.R22D_HI : T.R22D_LO][kind]!;
          set(o.col + i, r0 - step, code);
          for (let j = 0; j < step; j++) set(o.col + i, r0 - j, T.RAMPFILL);
        }
        rec(o.col, OT.RAMP, r0, (n - 1) | (kind << 4));
        break;
      }
      case 'box': {
        const y = Y(0);
        const content = BOX_CONTENT[o.args[1] ?? 'apples'];
        if (content === undefined) throw new Error(`${lvl.file}:${o.line}: box <y> apples|apple|pommes|godis`);
        set(o.col, rowOf(y), T.BOX);
        rec(o.col, OT.BOX, rowOf(y), content);
        break;
      }
      case 'star': {
        const y = Y(0);
        const k = N(1);
        if (k < 1 || k > 3) throw new Error(`${lvl.file}:${o.line}: star <y> 1|2|3`);
        set(o.col, rowOf(y), T.STAR1 + k - 1);
        rec(o.col, OT.STAR, rowOf(y), k - 1);
        break;
      }
      case 'part': {
        const y = Y(0);
        set(o.col, rowOf(y), T.PART);
        rec(o.col, OT.PART, rowOf(y), 0);
        break;
      }
      case 'flag':
      case 'goal': {
        const r = rowOf(ground[o.col]!);
        set(o.col, r, T.POLE);
        set(o.col, r - 1, o.kind === 'flag' ? T.FLAG_TOP : T.GOAL_TOP);
        rec(o.col, o.kind === 'flag' ? OT.FLAG : OT.GOAL, r, 0);
        break;
      }
      case 'sign': {
        const kind = SIGN_KIND[o.args[0] ?? ''];
        if (kind === undefined) throw new Error(`${lvl.file}:${o.line}: sign right|a|b|down`);
        const r = rowOf(ground[o.col]!);
        set(o.col, r, T.SIGNPOST);
        set(o.col, r - 1, T.SIGN_R + kind);
        rec(o.col, OT.SIGN, r, kind);
        break;
      }
      case 'pickup': {
        const code = { pommes: T.POMMES, godis: T.GODIS }[o.args[0] ?? ''];
        if (!code) throw new Error(`${lvl.file}:${o.line}: pickup pommes|godis <y>`);
        const y = Y(1);
        set(o.col, rowOf(y), code);
        rec(o.col, OT.PICKUP, rowOf(y), code);
        break;
      }
      case 'prefab':
      case 'fg': {
        const id = PREFAB_IDS.indexOf(o.args[0] ?? '');
        if (id < 0) throw new Error(`${lvl.file}:${o.line}: unknown prefab ${o.args[0]}`);
        const y = Y(1);
        const rows = PREFABS[o.args[0]!]!;
        for (const name of rows.flat()) {
          if (name !== '.' && !worldHasTile(lvl.world - 1, name)) throw new Error(`${lvl.file}:${o.line}: prefab ${o.args[0]} uses ${name}, which world ${lvl.world} does not have`);
        }
        if (o.kind === 'prefab') {
          rows.forEach((row, j) =>
            row.forEach((name, i) => {
              if (name !== '.') set(o.col + i, rowOf(y) - (rows.length - 1 - j), tileCode(name));
            }),
          );
          rec(o.col, OT.PREFAB, rowOf(y), id);
        } else {
          fg.push({ col: o.col, row: rowOf(y), id });
          rec(o.col, OT.FG, rowOf(y), id);
        }
        break;
      }
      case 'enemy': {
        const type = ENEMY_TYPE[o.args[0] ?? ''];
        if (!type) throw new Error(`${lvl.file}:${o.line}: unknown enemy ${o.args[0]}`);
        rec(o.col, OT.ENEMY, rowOf(Y(1)), type);
        break;
      }
      default:
        throw new Error(`${lvl.file}:${o.line}: unknown object ${o.kind}`);
    }
  }
  // apples: one APPLES record per pattern run (first cell + deltas: dx 0..15 high nibble, dy -8..7 low nibble)
  for (const cells of patterns.values()) {
    const sorted = [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let i = 0;
    while (i < sorted.length) {
      const run: [number, number][] = [sorted[i]!];
      let j = i + 1;
      while (j < sorted.length && run.length < 255) {
        const dx = sorted[j]![0] - run[run.length - 1]![0];
        const dy = sorted[j]![1] - run[run.length - 1]![1];
        if (dx > 15 || dy < -8 || dy > 7) break;
        run.push(sorted[j]!);
        j++;
      }
      const deltas = run.slice(1).map((c, k) => ((c[0] - run[k]![0]) << 4) | ((c[1] - run[k]![1]) & 15));
      rec(run[0]![0], OT.APPLES, run[0]![1], run.length, ...deltas);
      i = j;
    }
  }
  recs.sort((a, b) => a.col - b.col);
  const objects = [...recs.flatMap((r) => r.bytes), 255, 255];
  return { lvl, grid, terrain, objects, patterns, fg };
}

export function generateLevels(): { asm: string; built: Built[] } {
  const ids = levelIds();
  const built = ids.map((id) => buildLevel(readLevel(id)));
  const L = [
    '; GENERATED by games/bo/tools/levels.ts from levels/*.lvl — do not edit.',
    '; Level table (DESIGN.md §14.1): per level the far address of its packed data in xdata (ISA 2), the offset of',
    '; the objects in the unpacked data, width, start height, rows, world, start column, music. The unpacked data',
    '; is the terrain, one byte per segment (type << 5 | length - 1), then the objects: col lo, col hi | type << 1,',
    '; row, param [, extra]; 255 255 ends the list.',
    '',
    `NUM_LEVELS = ${ids.length}`,
    ...ids.map((id, i) => `LV_${id.replace('-', '_')} = ${i}`),
    ...Object.entries(OT).map(([k, v]) => `OT_${k} = ${v}`),
    ...Object.entries(SP).map(([k, v]) => `SP_${k} = ${v}`),
    ...Object.entries(ENEMY_TYPE).map(([k, v]) => `EN_${k.toUpperCase()} = ${v}`),
    `NUM_PREFABS = ${PREFAB_IDS.length}`,
    `LV_SRC_MAX = ${Math.max(...built.map((b) => b.terrain.length + b.objects.length))}   ; the largest unpacked level`,
    '',
    '.data',
    'level_table:',
  ];
  for (const b of built) {
    const l = b.lvl;
    const lab = l.id.replace('-', '_');
    L.push(`    .word lv_${lab} >> 16, lv_${lab} & $FFFF, ${b.terrain.length}, ${l.width}`, `    .byte ${l.h0}, ${l.rows}, ${l.world}, ${l.start}, ${l.music}, 0`);
  }
  L.push('', '.xdata');
  for (const b of built) {
    const lab = b.lvl.id.replace('-', '_');
    L.push(`lv_${lab}:   ; ${b.lvl.id} ${b.lvl.name}`, '.pack', `    .byte ${b.terrain.join(', ')}`);
    for (let i = 0; i < b.objects.length; i += 24) L.push(`    .byte ${b.objects.slice(i, i + 24).join(', ')}`);
    L.push('.endpack');
  }
  L.push('', '.data', 'prefab_table:', `    .word ${PREFAB_IDS.map((p) => `pf_${p}`).join(', ')}`);
  for (const p of PREFAB_IDS) {
    const rows = PREFABS[p]!;
    L.push(`pf_${p}:`, `    .byte ${rows[0]!.length}, ${rows.length}`);
    for (const row of rows) L.push(`    .byte ${row.map((n) => (n === '.' ? 0 : tileCode(n))).join(', ')}`);
  }
  return { asm: L.join('\n') + '\n', built };
}

/** Preview PNG of a level: the visible rows, every tile drawn with its world art; Bo's start marked. */
export function previewPng(b: Built): Buffer {
  const { lvl, grid } = b;
  const r0 = ROWS - lvl.rows;
  const w = lvl.width * 8;
  const h = lvl.rows * 8;
  const png = new PNG({ width: w, height: h });
  const world = lvl.world - 1;
  const sky = PALETTE[WORLDS[world]!.sky]!;
  const put = (x: number, y: number, rgb: number) => {
    const i = (y * w + x) * 4;
    png.data[i] = rgb >> 16;
    png.data[i + 1] = (rgb >> 8) & 255;
    png.data[i + 2] = rgb & 255;
    png.data[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, sky);
  for (let c = 0; c < lvl.width; c++) {
    for (let r = r0; r < ROWS; r++) {
      const code = grid[c * ROWS + r]!;
      if (!code) continue;
      const px = tilePixels(world, code);
      if (!px) continue;
      for (let i = 0; i < 64; i++) if (px[i]) put(c * 8 + (i & 7), (r - r0) * 8 + (i >> 3), PALETTE[px[i]!]!);
    }
  }
  for (const f of b.fg) {
    const rows = PREFABS[PREFAB_IDS[f.id]!]!;
    rows.forEach((row, j) =>
      row.forEach((name, i) => {
        if (name === '.') return;
        const px = tilePixels(world, tileCode(name))!;
        const cx = (f.col + i) * 8;
        const cy = (f.row - (rows.length - 1 - j) - r0) * 8;
        for (let k = 0; k < 64; k++) if (px[k] && cy + (k >> 3) >= 0) put(cx + (k & 7), cy + (k >> 3), PALETTE[px[k]!]!);
      }),
    );
  }
  // Bo's start: a white bar where his feet will be
  const g = groundHeights(lvl)[lvl.start]!;
  for (let x = 0; x < 8; x++) for (let y = 0; y < 16; y++) if (x === 0 || x === 7 || y === 0) put(lvl.start * 8 + x, (ROWS - g - r0) * 8 - 16 + y, 0xffffff);
  return PNG.sync.write(png);
}

if (isMain(import.meta.url)) {
  const { asm, built } = generateLevels();
  writeFileSync(new URL('../levels.gen.asm', import.meta.url), asm);
  for (const b of built) writeFileSync(join(LEVELS_DIR, `${b.lvl.id}.png`), previewPng(b));
  console.log(`wrote games/bo/levels.gen.asm (${built.length} levels) and levels/*.png`);
}
