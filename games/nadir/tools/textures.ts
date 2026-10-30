// Reads art/textures.txt and writes textures.gen.asm (DESIGN.md §3.6): for every material and animation frame,
// three LODs of column data (a base colour plus detail runs in 1/32 of the wall height), the vector features
// (bands and seams) and the material table. Column data, tables and features go to xdata and are copied into
// RAM at `texram` by `init`; the entry table in ROM points at their RAM addresses. Also writes art/textures.png.
// Run: npx tsx games/nadir/tools/textures.ts   (or npm run nadir:gen)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { PALETTE } from '@qrc/vm';
import { GAME_DIR, byteLines, isMain, rng } from './util';

export const TEX = 32;
export const EMISSIVE = 16;
/** colour index of a transparent texel (masked materials, DESIGN §3.10): never drawn */
export const TRANSPARENT = 32;

export interface Band {
  v: number;
  u0: number;
  u1: number;
}
export interface Frame {
  /** colour index 0..31 per texel, [v][u] */
  rows: number[][];
  bands: Band[];
}
export interface Material {
  id: number;
  char: string;
  name: string;
  legend: Map<string, number>;
  seams: number[];
  animShift: number;
  /** a thin see-through wall (DESIGN §3.10) */
  masked: boolean;
  /** LOD 0 columns as data behind 8-byte stubs instead of compiled code (saves RAM, DESIGN §3.6) */
  nocompile: boolean;
  frames: Frame[];
}

function parseColour(s: string, where: string): number {
  if (s === 't') return TRANSPARENT;
  const m = /^(\d+)(!?)$/.exec(s);
  if (!m || Number(m[1]) > 15) throw new Error(`${where}: bad colour '${s}'`);
  return Number(m[1]) + (m[2] ? EMISSIVE : 0);
}

/** Parses art/textures.txt (format at the top of that file). */
export function readMaterials(text = readFileSync(join(GAME_DIR, 'art', 'textures.txt'), 'utf8')): Material[] {
  const mats: Material[] = [];
  let cur: Material | null = null;
  let bands: Band[] = [];
  let bandsDeclared = false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const where = `art/textures.txt:${i + 1}`;
    const line = lines[i]!.trim();
    if (!line || line.startsWith('#')) continue;
    const [kw, ...args] = line.split(/\s+/);
    if (kw === 'material') {
      cur = { id: mats.length + 1, char: args[0]!, name: args[1]!, legend: new Map(), seams: [], animShift: 0, masked: false, nocompile: false, frames: [] };
      if (!/^[A-Z]$/.test(cur.char)) throw new Error(`${where}: map char must be one capital letter`);
      mats.push(cur);
      bands = [];
      bandsDeclared = false;
      continue;
    }
    if (!cur) throw new Error(`${where}: '${kw}' outside a material`);
    if (kw === 'legend') {
      for (let k = 0; k + 1 < args.length; k += 2) cur.legend.set(args[k]!, parseColour(args[k + 1]!, where));
    } else if (kw === 'band') {
      if (!bandsDeclared) bands = [];
      bandsDeclared = true;
      const v = Number(args[0]);
      bands.push({ v, u0: args[1] === undefined ? 0 : Number(args[1]), u1: args[2] === undefined ? TEX : Number(args[2]) });
    } else if (kw === 'seam') {
      cur.seams.push(Number(args[0]));
    } else if (kw === 'masked') {
      cur.masked = true;
    } else if (kw === 'nocompile') {
      cur.nocompile = true;
    } else if (kw === 'anim') {
      cur.animShift = Number(args[0]);
    } else if (kw === 'frame') {
      bandsDeclared = false;
    } else if (kw === 'procedural') {
      if (args[0] !== 'rock') throw new Error(`${where}: unknown procedural texture ${args[0]}`);
      cur.frames.push({ rows: proceduralRock(cur, Number(args[1])), bands: [...bands] });
    } else if (kw === 'rows') {
      const rows: number[][] = [];
      for (i++; i < lines.length && lines[i]!.trim() !== 'end' && lines[i]!.trim() !== 'frame'; i++) {
        const r = lines[i]!.trim();
        if (r.length !== TEX) throw new Error(`art/textures.txt:${i + 1}: row has ${r.length} characters, expected ${TEX}`);
        rows.push([...r].map((ch) => {
          const c = cur!.legend.get(ch);
          if (c === undefined) throw new Error(`art/textures.txt:${i + 1}: '${ch}' is not in the legend of ${cur!.name}`);
          return c;
        }));
      }
      if (rows.length !== TEX) throw new Error(`${where}: ${cur.name} has ${rows.length} rows, expected ${TEX}`);
      cur.frames.push({ rows, bands: [...bands] });
      if (lines[i]?.trim() === 'frame') bandsDeclared = false;
    } else if (kw === 'end') {
      // end of a procedural material (rows blocks consume their own end)
    } else throw new Error(`${where}: unknown keyword '${kw}'`);
  }
  for (const m of mats) {
    const hasT = m.frames.some((f) => f.rows.some((r) => r.includes(TRANSPARENT)));
    if (hasT !== m.masked) throw new Error(`${m.name}: transparent texels exactly in masked materials`);
    if (m.masked && (m.seams.length || m.frames.some((f) => f.bands.length))) throw new Error(`${m.name}: a masked material has no bands or seams`);
    if (m.frames.length === 0) throw new Error(`${m.name}: no rows`);
    if ((m.frames.length & (m.frames.length - 1)) !== 0) throw new Error(`${m.name}: frame count must be a power of two`);
  }
  return mats;
}

/**
 * Tileable rock: two courses of large boulders on a dark base (light top edges, no cracks), an ore vein and a few
 * glints (seeded, deterministic). Boulders are large on purpose: every boulder edge is a colour run in every
 * column it crosses (DESIGN §3.6 budget).
 */
function proceduralRock(m: Material, seed: number): number[][] {
  const C = (ch: string) => m.legend.get(ch)!;
  const r = rng(seed);
  const id = Array.from({ length: TEX }, () => new Array<number>(TEX).fill(-1));
  const boulders: { u: number; v: number; ru: number; rv: number; c: number }[] = [];
  for (const [vc, n] of [
    [9, 2],
    [24, 2],
  ] as const) {
    const off = r() * TEX;
    for (let i = 0; i < n; i++) boulders.push({ u: off + (i * TEX) / n + (r() - 0.5) * 2, v: vc + (r() - 0.5) * 2, ru: 8 + r() * 1.5, rv: 7.5 + r() * 1.5, c: i % 2 ? C('b') : C('g') });
  }
  for (let v = 0; v < TEX; v++)
    for (let u = 0; u < TEX; u++) {
      let best = -1;
      let bd = 1;
      boulders.forEach((b, k) => {
        let du = Math.abs(u + 0.5 - (b.u % TEX));
        du = Math.min(du, TEX - du); // tileable in u
        const d = (du / b.ru) ** 2 + ((v + 0.5 - b.v) / b.rv) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      id[v]![u] = best;
    }
  const out = id.map((row) => row.map((k) => (k < 0 ? C('.') : boulders[k]!.c)));
  for (let v = 1; v < TEX; v++)
    for (let u = 0; u < TEX; u++) {
      const k = id[v]![u]!;
      if (k >= 0 && id[v - 1]![u] !== k) out[v]![u] = C('l'); // light top edge
    }
  // ore vein: a wavy streak through the upper course
  const v0 = 9 + Math.floor(r() * 4);
  for (let u = 4; u < 20; u++) {
    const v = Math.round(v0 + Math.sin((u / TEX) * Math.PI * 2) * 2);
    if (id[v]![u]! >= 0) out[v]![u] = C('o');
  }
  for (let g = 0; g < 3; g++) {
    const v = 4 + Math.floor(r() * 24);
    const u = Math.floor(r() * TEX);
    if (id[v]![u]! >= 0) out[v]![u] = C('*');
  }
  return out;
}

// ---- column encoding ------------------------------------------------------------------------------------
export interface Run {
  v0: number;
  v1: number;
  c: number;
}
export interface Column {
  base: number;
  runs: Run[];
}

/** The texture with band rows and seam columns replaced, so that the runs do not draw them twice. */
export function cleaned(f: Frame, seams: number[]): number[][] {
  const t = f.rows.map((r) => [...r]);
  const bandRow = (v: number, u: number) => f.bands.some((b) => b.v === v && u >= b.u0 && u < b.u1);
  for (let u = 0; u < TEX; u++)
    for (let v = 0; v < TEX; v++) {
      if (!bandRow(v, u)) continue;
      let s = v + 1;
      while (s < TEX && bandRow(s, u)) s++;
      if (s >= TEX) for (s = v - 1; s >= 0 && bandRow(s, u); s--);
      t[v]![u] = f.rows[s]![u]!;
    }
  for (const u of seams) {
    let s = u + 1;
    while (s < TEX && seams.includes(s)) s++;
    if (s >= TEX) for (s = u - 1; s >= 0 && seams.includes(s); s--);
    for (let v = 0; v < TEX; v++) t[v]![u] = t[v]![s]!;
  }
  return t;
}

/** Downsamples by 2^k: the most common colour of each block; emissive wins when it covers a quarter of it. */
export function lod(t: number[][], k: number): number[][] {
  const n = TEX >> k;
  const b = 1 << k;
  return Array.from({ length: n }, (_, bv) =>
    Array.from({ length: n }, (_, bu) => {
      const count = new Map<number, number>();
      for (let v = 0; v < b; v++) for (let u = 0; u < b; u++) count.set(t[bv * b + v]![bu * b + u]!, (count.get(t[bv * b + v]![bu * b + u]!) ?? 0) + 1);
      const sorted = [...count].sort((x, y) => y[1] - x[1] || x[0] - y[0]);
      const em = sorted.filter(([c]) => c >= EMISSIVE && c !== TRANSPARENT);
      if (em.length && em.reduce((s, [, n]) => s + n, 0) * 4 >= b * b) return em[0]![0];
      return sorted[0]![0];
    }),
  );
}

/** One column of an LOD texture (n rows) as base colour + detail runs in 1/32 units. */
export function encodeColumn(col: number[], masked = false): Column {
  const n = col.length;
  const unit = TEX / n;
  const runs: Run[] = [];
  for (let v = 0; v < n; ) {
    let e = v;
    while (e < n && col[e] === col[v]) e++;
    runs.push({ v0: v * unit, v1: e * unit, c: col[v]! });
    v = e;
  }
  // a masked column has no base: every opaque run is drawn, transparent ones are skipped
  if (masked) return { base: TRANSPARENT, runs: runs.filter((r) => r.c !== TRANSPARENT) };
  let best: Column | null = null;
  for (const c of new Set(col)) {
    const rest = runs.filter((r) => r.c !== c);
    const texels = col.filter((x) => x === c).length;
    if (!best || rest.length < best.runs.length || (rest.length === best.runs.length && texels > col.filter((x) => x === best!.base).length)) best = { base: c, runs: rest };
  }
  return best!;
}

/**
 * LOD 0 columns are compiled to straight-line code (copied into RAM at `coderam` and called there): base colour
 * and every run with its v bounds and colour as immediates. Called with r0 = x, r2 = COL_W, r5 = h, r6 = shade
 * table, r7 = top; clobbers r1, r3, r4. A run costs 11 instructions + one RECTFILL (no loads, no loop).
 */
export function compileColumn(c: Column): string[] {
  // a masked column (DESIGN §3.10) has no base: only its opaque runs
  const L = c.base === TRANSPARENT ? [] : ['    MOV r1, r7', '    MOV r3, r5', `    LDB r4, [r6 + ${c.base}]`, '    SYS RECTFILL'];
  for (const r of c.runs) {
    if (r.v0 === 0) L.push('    MOV r1, r7');
    else L.push('    MOV r1, r5', `    MUL r1, ${r.v0}`, '    SHR r1, 5', '    ADD r1, r7');
    if (r.v1 === TEX) L.push('    MOV r3, r7', '    ADD r3, r5');
    else L.push('    MOV r3, r5', `    MUL r3, ${r.v1}`, '    SHR r3, 5', '    ADD r3, r7');
    L.push('    SUB r3, r1', `    LDB r4, [r6 + ${r.c}]`, '    SYS RECTFILL');
  }
  L.push('    RET');
  return L;
}

export interface Feature {
  type: 0 | 1;
  a: number;
  b: number;
  c: number;
  colour: number;
}

/** Bands (type 0: v, u0, u1) and seam segments (type 1: u, v0, v1) of one frame. */
export function features(f: Frame, seams: number[], clean: number[][]): Feature[] {
  const out: Feature[] = [];
  for (const b of f.bands) {
    // a band is one colour: the most common colour of its row within its u range
    const count = new Map<number, number>();
    for (let u = b.u0; u < b.u1; u++) count.set(f.rows[b.v]![u]!, (count.get(f.rows[b.v]![u]!) ?? 0) + 1);
    const colour = [...count].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]![0];
    out.push({ type: 0, a: b.v, b: b.u0, c: b.u1, colour });
  }
  for (const u of seams) {
    for (let v = 0; v < TEX; ) {
      const c = f.rows[v]![u]!;
      if (c === clean[v]![u] || f.bands.some((b) => b.v === v && u >= b.u0 && u < b.u1)) {
        v++;
        continue;
      }
      let e = v;
      while (e < TEX && f.rows[e]![u] === c && !f.bands.some((b) => b.v === e && u >= b.u0 && u < b.u1)) e++;
      out.push({ type: 1, a: u, b: v, c: e, colour: c });
      v = e;
    }
  }
  return out;
}

export interface Encoded {
  /** per material id (1-based index into this array is id - 1): its first entry and anim parameters */
  mats: { first: number; mask: number; shift: number }[];
  /** per entry (material frame): offsets in the blob of its 3 LOD tables and its feature list */
  entries: { lod: number[]; feat: number }[];
  /** the RAM blob, with `{off}` placeholders for RAM pointers written as words */
  blob: (number | { ptr: number; code?: boolean })[];
  stats: { name: string; runs: number[] }[];
  /** compiled LOD 0 columns (assembly lines) and their size */
  codeLines: string[];
  codeBytes: number;
}

/** Lays out the blob: per entry 3 column tables (words), then the shared column data, then feature lists. */
export function encode(mats: Material[]): Encoded {
  const blob: (number | { ptr: number; code?: boolean })[] = [];
  const colData = new Map<string, number>(); // dedup: encoded column -> blob offset
  const pending: { at: number; key: string; code?: boolean }[] = [];
  const code = new Map<string, number>(); // compiled LOD 0 column -> offset in coderam
  const codeLines: string[] = [];
  let codeBytes = 0;
  const entries: Encoded['entries'] = [];
  const stats: Encoded['stats'] = [];
  const colBytes = (c: Column) => [c.base, ...c.runs.flatMap((r) => [r.v0, r.v1, r.c]), 255];
  const out: Encoded['mats'] = [];
  const cols: Column[] = [];
  for (const m of mats) {
    out.push({ first: entries.length, mask: m.frames.length - 1, shift: m.animShift });
    for (const f of m.frames) {
      const clean = cleaned(f, m.seams);
      const lodOffs: number[] = [];
      const runCounts: number[] = [];
      for (let k = 0; k < 3; k++) {
        const t = lod(clean, k);
        lodOffs.push(blob.length);
        let sum = 0;
        for (let u = 0; u < TEX >> k; u++) {
          const full = encodeColumn(t.map((row) => row[u]!), m.masked);
          // LOD 2 (walls under LOD2_H px) is the base colour only: detail there is under a pixel or two and fogged
          // (masked materials keep their runs: there is no base to fall back on)
          const c = k === 2 && !m.masked ? { base: full.base, runs: [] } : full;
          sum += c.runs.length;
          cols.push(c);
          const key = colBytes(c).join(',');
          if (k === 0) {
            // a compiled column, or for a nocompile material a stub: LDI r1, <its column data>; JMP col_data
            const ckey = m.nocompile ? `stub ${key}` : key;
            if (!code.has(ckey)) {
              const lines = m.nocompile ? [`    LDI r1, texram + {${key}}`, '    JMP col_data'] : compileColumn(c);
              if (m.nocompile && !colData.has(key)) colData.set(key, -1);
              code.set(ckey, codeBytes);
              codeLines.push(`    ; column ${key}`, ...lines);
              codeBytes += lines.length * 4;
            }
            pending.push({ at: blob.length, key: ckey, code: true });
          } else {
            pending.push({ at: blob.length, key });
            if (!colData.has(key)) colData.set(key, -1);
          }
          blob.push(0, 0); // word placeholder
        }
        runCounts.push(sum / (TEX >> k));
      }
      entries.push({ lod: lodOffs, feat: -1 });
      (entries[entries.length - 1] as { feats?: Feature[] }).feats = features(f, m.seams, clean);
      stats.push({ name: `${m.name}${m.frames.length > 1 ? `#${m.frames.indexOf(f)}` : ''}`, runs: runCounts });
    }
  }
  for (const key of colData.keys()) {
    colData.set(key, blob.length);
    blob.push(...key.split(',').map(Number));
  }
  for (const p of pending) {
    blob[p.at] = p.code ? { ptr: code.get(p.key)!, code: true } : { ptr: colData.get(p.key)! };
    blob[p.at + 1] = -1; // second byte of the word
  }
  for (let i = 0; i < codeLines.length; i++) codeLines[i] = codeLines[i]!.replace(/\{([\d,]+)\}/, (_, key: string) => String(colData.get(key)!));
  for (const e of entries) {
    e.feat = blob.length;
    for (const f of (e as { feats?: Feature[] }).feats!) blob.push(f.type, f.a, f.b, f.c, f.colour);
    blob.push(255);
  }
  return { mats: out, entries, blob, stats, codeLines, codeBytes };
}

export function texturesAsm(mats = readMaterials()): string {
  const enc = encode(mats);
  const L: string[] = [
    '; GENERATED by games/nadir/tools/textures.ts from art/textures.txt - do not edit.',
    `NUM_MATS = ${mats.length}`,
    `TEX_BYTES = ${enc.blob.length}`,
    `CODE_BYTES = ${enc.codeBytes}`,
    ...mats.map((m) => `MAT_${m.name.toUpperCase()} = ${m.id}`),
    `TRANSPARENT = ${TRANSPARENT}`,
    '',
    '.data',
    '; per material id (index 0 unused): first entry, animation mask, animation shift',
    'mat_first:',
    ...byteLines([0, ...enc.mats.map((m) => m.first)]),
    'mat_mask:',
    ...byteLines([0, ...enc.mats.map((m) => m.mask)]),
    'mat_shift:',
    ...byteLines([0, ...enc.mats.map((m) => m.shift)]),
    '; per entry (material frame): RAM addresses of the LOD 0/1/2 column tables and of the feature list',
    'mat_ent:',
    ...enc.entries.map((e) => `    .word texram + ${e.lod[0]}, texram + ${e.lod[1]}, texram + ${e.lod[2]}, texram + ${e.feat}`),
    '',
    '.xdata',
    '; copied to texram: column tables (RAM addresses), column data (base, then (v0, v1, colour) runs, 255), features',
    'tex_x:',
  ];
  // emit the blob: pointer words as expressions, bytes in rows
  let row: string[] = [];
  const flush = () => {
    if (row.length) L.push(`    .byte ${row.join(', ')}`);
    row = [];
  };
  for (let i = 0; i < enc.blob.length; i++) {
    const b = enc.blob[i]!;
    if (typeof b === 'object') {
      flush();
      L.push(`    .word ${b.code ? 'coderam' : 'texram'} + ${b.ptr}`);
      i++; // the word's second byte
      continue;
    }
    row.push(String(b));
    if (row.length === 16) flush();
  }
  flush();
  L.push('; compiled LOD 0 columns, copied to coderam and called there (code that runs from RAM)', 'code_x:', ...enc.codeLines, '');
  return L.join('\n');
}

/** Preview: every material frame at LOD 0, 1, 2 (scaled to the same size) with its bands and seams. */
export function previewPng(mats = readMaterials(), scale = 4): Buffer {
  const enc = encode(mats);
  const frames = mats.flatMap((m) => m.frames.map((f) => ({ m, f })));
  const cell = TEX * scale;
  const W = cell * 4 + 5 * 4;
  const H = (cell + 4) * frames.length + 4;
  const png = new PNG({ width: W, height: H });
  png.data.fill(40);
  const put = (x: number, y: number, c: number) => {
    const p = PALETTE[c & 15]!;
    const i = (y * W + x) * 4;
    png.data[i] = p >> 16;
    png.data[i + 1] = (p >> 8) & 255;
    png.data[i + 2] = p & 255;
    png.data[i + 3] = 255;
  };
  frames.forEach(({ m, f }, fi) => {
    const y0 = 4 + fi * (cell + 4);
    const clean = cleaned(f, m.seams);
    const views = [f.rows, lod(clean, 0), lod(clean, 1), lod(clean, 2)];
    views.forEach((t, vi) => {
      const n = t.length;
      const x0 = 4 + vi * (cell + 4);
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) put(x0 + x, y0 + y, t[Math.floor((y * n) / cell)]![Math.floor((x * n) / cell)]!);
      if (vi === 1)
        for (const ft of features(f, m.seams, clean)) {
          if (ft.type === 0) for (let x = ft.b * scale; x < ft.c * scale; x++) for (let s = 0; s < scale; s++) put(x0 + x, y0 + ft.a * scale + s, ft.colour);
          else for (let y = ft.b * scale; y < ft.c * scale; y++) for (let s = 0; s < scale; s++) put(x0 + ft.a * scale + s, y0 + y, ft.colour);
        }
    });
  });
  void enc;
  return PNG.sync.write(png);
}

if (isMain(import.meta.url)) {
  const mats = readMaterials();
  writeFileSync(join(GAME_DIR, 'textures.gen.asm'), texturesAsm(mats));
  writeFileSync(join(GAME_DIR, 'art', 'textures.png'), previewPng(mats));
  const enc = encode(mats);
  for (const s of enc.stats) console.log(`${s.name.padEnd(12)} runs per column: LOD0 ${s.runs[0]!.toFixed(2)}  LOD1 ${s.runs[1]!.toFixed(2)}  LOD2 ${s.runs[2]!.toFixed(2)}`);
  console.log(`textures.gen.asm written: ${mats.length} materials, ${enc.entries.length} frames, ${enc.blob.length} bytes of texture RAM`);
}
