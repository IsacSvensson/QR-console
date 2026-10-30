// Reads art/sprites.txt and writes sprites.gen.asm (DESIGN.md §3.12): every sprite as three lists of rectangles
// (LOD 0, 1, 2) drawn in order, later ones over earlier ones, plus the type table. Also writes art/sprites.png
// (source, then each LOD as the rectangles draw it, 4x).
// Run: npx tsx games/nadir/tools/sprites.ts   (or npm run nadir:gen)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { PALETTE } from '@qrc/vm';
import { EMISSIVE, TRANSPARENT } from './textures';
import { GAME_DIR, byteLines, isMain, rng } from './util';

export const LOD_LIMITS = [48, 20, 8];

export interface Sprite {
  id: number;
  char: string;
  name: string;
  w: number;
  h: number;
  height: number;
  block: number;
  pick: number;
  /** colour 0..31 or TRANSPARENT per pixel, [y][x] */
  px: number[][];
}
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  c: number;
}

function colour(s: string, where: string): number {
  if (s === 't') return TRANSPARENT;
  const m = /^(\d+)(!?)$/.exec(s);
  if (!m || Number(m[1]) > 15) throw new Error(`${where}: bad colour '${s}'`);
  return Number(m[1]) + (m[2] ? EMISSIVE : 0);
}

/** Parses art/sprites.txt (format at the top of that file). */
export function readSprites(text = readFileSync(join(GAME_DIR, 'art', 'sprites.txt'), 'utf8')): Sprite[] {
  const out: Sprite[] = [];
  const lines = text.split(/\r?\n/);
  let cur: Sprite | null = null;
  let legend = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const where = `art/sprites.txt:${i + 1}`;
    const line = lines[i]!.trim();
    if (!line || line.startsWith('#')) continue;
    const [kw, ...a] = line.split(/\s+/);
    if (kw === 'sprite') {
      cur = { id: out.length, char: a[0]!, name: a[1]!, w: Number(a[2]), h: Number(a[3]), height: 0, block: 0, pick: 0, px: [] };
      if (!/^[A-Z]$/.test(cur.char) || cur.w > 16 || cur.h > 24) throw new Error(`${where}: sprite needs a capital letter and at most 16 x 24 pixels`);
      out.push(cur);
      legend = new Map();
      continue;
    }
    if (!cur) throw new Error(`${where}: '${kw}' outside a sprite`);
    if (kw === 'height') cur.height = Number(a[0]);
    else if (kw === 'block') cur.block = Number(a[0]);
    else if (kw === 'pick') cur.pick = Number(a[0]);
    else if (kw === 'legend') for (let k = 0; k + 1 < a.length; k += 2) legend.set(a[k]!, colour(a[k + 1]!, where));
    else if (kw === 'rows') {
      for (i++; lines[i]!.trim() !== 'end'; i++) {
        const r = lines[i]!.trim();
        if (r.length !== cur.w) throw new Error(`art/sprites.txt:${i + 1}: row has ${r.length} pixels, expected ${cur.w}`);
        cur.px.push([...r].map((ch) => {
          const c = legend.get(ch);
          if (c === undefined) throw new Error(`art/sprites.txt:${i + 1}: '${ch}' is not in the legend of ${cur!.name}`);
          return c;
        }));
      }
      if (cur.px.length !== cur.h) throw new Error(`${where}: ${cur.name} has ${cur.px.length} rows, expected ${cur.h}`);
    } else throw new Error(`${where}: unknown keyword '${kw}'`);
  }
  return out;
}

/** DESIGN §3.12: downsampled by 2^k; the most common value of each block (transparent counts), emissive wins at a quarter. */
export function lodPixels(px: number[][], k: number): number[][] {
  const b = 1 << k;
  const H = Math.ceil(px.length / b);
  const W = Math.ceil(px[0]!.length / b);
  return Array.from({ length: H }, (_, by) =>
    Array.from({ length: W }, (_, bx) => {
      const count = new Map<number, number>();
      let n = 0;
      for (let y = by * b; y < Math.min(px.length, by * b + b); y++)
        for (let x = bx * b; x < Math.min(px[0]!.length, bx * b + b); x++) {
          count.set(px[y]![x]!, (count.get(px[y]![x]!) ?? 0) + 1);
          n++;
        }
      const sorted = [...count].sort((p, q) => q[1] - p[1] || p[0] - q[0]);
      const em = sorted.filter(([c]) => c >= EMISSIVE && c !== TRANSPARENT);
      if (em.length && em.reduce((s, [, m]) => s + m, 0) * 4 >= n) return em[0]![0];
      return sorted[0]![0];
    }),
  );
}

/** Draws a rectangle list at scale `n` (DESIGN §3.12's edge formula with s = 64 n): the test renders it the same way. */
export function render(rects: Rect[], w: number, h: number, n = 1): number[][] {
  const out = Array.from({ length: h * n }, () => new Array<number>(w * n).fill(TRANSPARENT));
  const s = 64 * n;
  for (const r of rects)
    for (let y = (r.y0 * s + 32) >> 6; y < (r.y1 * s + 32) >> 6; y++) for (let x = (r.x0 * s + 32) >> 6; x < (r.x1 * s + 32) >> 6; x++) out[y]![x] = r.c;
  return out;
}

/** One layered greedy cover for a given colour order. */
function cover(px: number[][], order: number[]): Rect[] {
  const H = px.length;
  const W = px[0]!.length;
  const rank = new Map(order.map((c, i) => [c, i]));
  const rects: Rect[] = [];
  for (const [li, c] of order.entries()) {
    // allowed: this colour or a colour drawn later (overwritten); never transparent or an earlier colour
    const allowed = px.map((row) => row.map((v) => v !== TRANSPARENT && rank.get(v)! >= li));
    const todo = px.map((row) => row.map((v) => v === c));
    for (;;) {
      let best: Rect | null = null;
      let bestN = 0;
      let bestA = 0;
      for (let y0 = 0; y0 < H; y0++)
        for (let x0 = 0; x0 < W; x0++) {
          if (!allowed[y0]![x0]) continue;
          let xmax = W;
          for (let y1 = y0 + 1; y1 <= H; y1++) {
            const y = y1 - 1;
            let x = x0;
            while (x < xmax && allowed[y]![x]) x++;
            xmax = x;
            if (xmax === x0) break;
            for (let x1 = x0 + 1; x1 <= xmax; x1++) {
              let n = 0;
              for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) if (todo[yy]![xx]) n++;
              const a = (x1 - x0) * (y1 - y0);
              if (n > bestN || (n === bestN && n > 0 && a < bestA)) {
                best = { x0, y0, x1, y1, c };
                bestN = n;
                bestA = a;
              }
            }
          }
        }
      if (!best) break;
      rects.push(best);
      for (let y = best.y0; y < best.y1; y++) for (let x = best.x0; x < best.x1; x++) todo[y]![x] = false;
    }
  }
  return rects;
}

/** DESIGN §3.12: the shortest rectangle list found over several colour orders (verified against the pixels). */
export function compile(px: number[][], seed = 1): Rect[] {
  const colours = [...new Set(px.flat())].filter((c) => c !== TRANSPARENT);
  const count = (c: number) => px.flat().filter((v) => v === c).length;
  const bbox = (c: number) => {
    let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
    px.forEach((row, y) => row.forEach((v, x) => {
      if (v !== c) return;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }));
    return (x1 - x0 + 1) * (y1 - y0 + 1);
  };
  const orders = [[...colours].sort((a, b) => count(b) - count(a) || a - b), [...colours].sort((a, b) => bbox(b) - bbox(a) || a - b)];
  const r = rng(seed);
  for (let i = 0; i < 10; i++) {
    const o = [...orders[i % 2]!];
    for (let k = o.length - 1; k > 0; k--) {
      const j = Math.floor(r() * (k + 1));
      [o[k], o[j]] = [o[j]!, o[k]!];
    }
    orders.push(o);
  }
  let best: Rect[] | null = null;
  for (const o of orders) {
    const rects = cover(px, o);
    if (!best || rects.length < best.length) best = rects;
  }
  const back = render(best!, px[0]!.length, px.length);
  if (JSON.stringify(back) !== JSON.stringify(px)) throw new Error('sprite compiler: the rectangles do not reproduce the pixels');
  return best!;
}

export interface CompiledSprite extends Sprite {
  k: number;
  lods: Rect[][];
}

export function compileAll(sprites = readSprites()): CompiledSprite[] {
  return sprites.map((sp) => {
    const lods = [0, 1, 2].map((k) => compile(lodPixels(sp.px, k), sp.id + 1));
    lods.forEach((l, k) => {
      if (l.length > LOD_LIMITS[k]!) throw new Error(`${sp.name}: LOD ${k} has ${l.length} rectangles (limit ${LOD_LIMITS[k]})`);
    });
    return { ...sp, k: Math.round(((sp.height / 100) * 2048) / sp.h), lods };
  });
}

/** DESIGN §3.12: a rectangle of LOD k in source pixels, clipped to the source size (so a LOD never grows the sprite). */
export function sourceRect(r: Rect, k: number, w: number, h: number): number[] {
  return [r.x0 << k, r.y0 << k, Math.min(w, r.x1 << k), Math.min(h, r.y1 << k), r.c];
}

export function spritesAsm(all = compileAll()): string {
  const L = [
    '; GENERATED by games/nadir/tools/sprites.ts from art/sprites.txt - do not edit.',
    `NUM_SPR_TYPES = ${all.length}`,
    ...all.map((s) => `SPR_${s.name.toUpperCase()} = ${s.id}`),
    '',
    '.data',
    '; per type (16 bytes): width, height, K, pick, block (word), LOD 0/1/2 rectangle lists (words), their counts',
    'spr_type:',
    ...all.flatMap((s) => [`    .byte ${s.w}, ${s.h}, ${s.k}, ${s.pick}`, `    .word ${s.block}, spr_${s.name}_0, spr_${s.name}_1, spr_${s.name}_2`, `    .byte ${s.lods.map((l) => l.length).join(', ')}, 0`]),
    '; rectangle lists: x0, y0, x1, y1 (exclusive, source pixels, clipped to the source), colour; 255 ends a list',
    ...all.flatMap((s) => s.lods.flatMap((l, k) => [`spr_${s.name}_${k}:`, ...byteLines([...l.flatMap((r) => sourceRect(r, k, s.w, s.h)), 255], 15)])),
    '',
  ];
  return L.join('\n');
}

/** Preview: per sprite the source and each LOD as its rectangles draw it, 4x (transparent = grey). */
export function spritesPng(all = compileAll(), scale = 4): Buffer {
  const cellW = 16 * scale + 4;
  const cellH = 24 * scale + 4;
  const W = cellW * 4 + 4;
  const H = cellH * all.length + 4;
  const png = new PNG({ width: W, height: H });
  png.data.fill(90);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  all.forEach((s, si) => {
    const views = [s.px, ...s.lods.map((l, k) => render(l, Math.ceil(s.w / (1 << k)), Math.ceil(s.h / (1 << k)), 1 << k))];
    views.forEach((v, vi) => {
      for (let y = 0; y < v.length * scale; y++)
        for (let x = 0; x < v[0]!.length * scale; x++) {
          const c = v[(y / scale) | 0]![(x / scale) | 0]!;
          if (c === TRANSPARENT) continue;
          const p = PALETTE[c & 15]!;
          const d = ((4 + si * cellH + y) * W + 4 + vi * cellW + x) * 4;
          png.data[d] = p >> 16;
          png.data[d + 1] = (p >> 8) & 255;
          png.data[d + 2] = p & 255;
        }
    });
  });
  return PNG.sync.write(png);
}

if (isMain(import.meta.url)) {
  const all = compileAll();
  writeFileSync(join(GAME_DIR, 'sprites.gen.asm'), spritesAsm(all));
  writeFileSync(join(GAME_DIR, 'art', 'sprites.png'), spritesPng(all));
  for (const s of all) console.log(`${s.name.padEnd(10)} ${s.w}x${s.h} K ${s.k}: rectangles LOD0 ${s.lods[0]!.length}, LOD1 ${s.lods[1]!.length}, LOD2 ${s.lods[2]!.length}`);
}
