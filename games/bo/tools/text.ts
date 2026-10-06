// Writes ../text.gen.asm: the bubble font (5x6 letters with room for Å Ä Ö above, 1 bit per pixel, 8 bytes per
// glyph, DESIGN.md §14.4) and every text of the game as glyph indices (255 ends a text, 254 starts a second row):
// Bo's lines and the scenes' lines from DESIGN.md §11–12, the enemies' jokes (§9), the level names (levels/*.lvl)
// and the few words of the screens. The assembler's .string takes only ASCII, hence this generator.
// Run: npx tsx games/bo/tools/text.ts (npm run bo:gen).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { levelIds, readLevel } from './lvl';
import { GAME_DIR, isMain } from './util';

const E = '.....';
/** an ordinary glyph: rows 0-1 empty (room for diacritics), body in rows 2-7 */
const body = (rows: string[]) => [E, E, ...rows];

export const GLYPHS: Record<string, string[]> = {
  ' ': body([E, E, E, E, E, E]),
  A: body(['.###.', '#...#', '#...#', '#####', '#...#', '#...#']),
  B: body(['####.', '#...#', '####.', '#...#', '#...#', '####.']),
  C: body(['.###.', '#...#', '#....', '#....', '#...#', '.###.']),
  D: body(['####.', '#...#', '#...#', '#...#', '#...#', '####.']),
  E: body(['#####', '#....', '####.', '#....', '#....', '#####']),
  F: body(['#####', '#....', '####.', '#....', '#....', '#....']),
  G: body(['.###.', '#....', '#.###', '#...#', '#...#', '.###.']),
  H: body(['#...#', '#...#', '#####', '#...#', '#...#', '#...#']),
  I: body(['.###.', '..#..', '..#..', '..#..', '..#..', '.###.']),
  J: body(['..###', '...#.', '...#.', '...#.', '#..#.', '.##..']),
  K: body(['#...#', '#..#.', '###..', '#..#.', '#...#', '#...#']),
  L: body(['#....', '#....', '#....', '#....', '#....', '#####']),
  M: body(['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#']),
  N: body(['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#']),
  O: body(['.###.', '#...#', '#...#', '#...#', '#...#', '.###.']),
  P: body(['####.', '#...#', '#...#', '####.', '#....', '#....']),
  Q: body(['.###.', '#...#', '#...#', '#.#.#', '#..#.', '.##.#']),
  R: body(['####.', '#...#', '#...#', '####.', '#..#.', '#...#']),
  S: body(['.####', '#....', '.###.', '....#', '....#', '####.']),
  T: body(['#####', '..#..', '..#..', '..#..', '..#..', '..#..']),
  U: body(['#...#', '#...#', '#...#', '#...#', '#...#', '.###.']),
  V: body(['#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..']),
  W: body(['#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#']),
  X: body(['#...#', '.#.#.', '..#..', '..#..', '.#.#.', '#...#']),
  Y: body(['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..']),
  Z: body(['#####', '...#.', '..#..', '.#...', '#....', '#####']),
  // Swedish letters: the diacritic in rows 0-2, a 5-row body in rows 3-7
  'Å': ['..#..', '.#.#.', '..#..', '.###.', '#...#', '#####', '#...#', '#...#'],
  'Ä': [E, '.#.#.', E, '.###.', '#...#', '#####', '#...#', '#...#'],
  'Ö': [E, '.#.#.', E, '.###.', '#...#', '#...#', '#...#', '.###.'],
  '0': body(['.###.', '#..##', '#.#.#', '##..#', '#...#', '.###.']),
  '1': body(['..#..', '.##..', '..#..', '..#..', '..#..', '.###.']),
  '2': body(['.###.', '#...#', '...#.', '..#..', '.#...', '#####']),
  '3': body(['####.', '....#', '.###.', '....#', '....#', '####.']),
  '4': body(['...#.', '..##.', '.#.#.', '#####', '...#.', '...#.']),
  '5': body(['#####', '#....', '####.', '....#', '....#', '####.']),
  '6': body(['.###.', '#....', '####.', '#...#', '#...#', '.###.']),
  '7': body(['#####', '....#', '...#.', '..#..', '..#..', '..#..']),
  '8': body(['.###.', '#...#', '.###.', '#...#', '#...#', '.###.']),
  '9': body(['.###.', '#...#', '#...#', '.####', '....#', '.###.']),
  '!': body(['..#..', '..#..', '..#..', '..#..', E, '..#..']),
  '?': body(['.###.', '#...#', '...#.', '..#..', E, '..#..']),
  '.': body([E, E, E, E, E, '..#..']),
  ',': body([E, E, E, E, '..#..', '.#...']),
  "'": body(['..#..', '..#..', E, E, E, E]),
  '-': body([E, E, '.###.', E, E, E]),
  ':': body([E, '..#..', E, E, '..#..', E]),
  '→': body([E, '...#.', '#####', '...#.', E, E]),
};
export const ORDER = [' ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Å', 'Ä', 'Ö', ...'0123456789', '!', '?', '.', ',', "'", '-', ':', '→'];
export const ROW_CHARS = 19; // characters per bubble row (6 px each, inside 128 px)

/** The backticked lines of DESIGN.md §11 (incl. §11.1) and §12 that are text, in order of appearance. */
export function designLines(): string[] {
  const d = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');
  const sec = d.slice(d.indexOf('## 11.'), d.indexOf('## 13.'));
  const out: string[] = [];
  for (const m of sec.matchAll(/`([^`]+)`/g)) {
    const s = m[1]!;
    if ([...s].every((c) => ORDER.includes(c)) && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Extra texts: the enemies' jokes (§9), screens and banners. */
const EXTRA = ['POFF', 'ZZZ', 'SPLAT', 'POMMES POWER!', 'FEL KOD', 'BO\'S', 'SKATEÄVENTYR', 'SLUT', 'FÖRSÖK IGEN!', 'BANA', 'STJÄRNOR', 'ÄPPLEN', 'POÄNG', 'DEL', 'KOD'];

export function slug(s: string): string {
  const base = s
    .replace(/[ÅÄ]/g, 'A')
    .replace(/Ö/g, 'O')
    .replace(/→/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `TX_${base || 'X'}`;
}

export function encode(s: string): number[] {
  const out: number[] = [];
  const words = s.split(' ');
  let row = '';
  const rows: string[] = [];
  for (const w of words) {
    if (row && (row + ' ' + w).length > ROW_CHARS) {
      rows.push(row);
      row = w;
    } else row = row ? `${row} ${w}` : w;
  }
  rows.push(row);
  rows.forEach((r, i) => {
    if (i) out.push(254);
    for (const c of r) {
      const k = ORDER.indexOf(c);
      if (k < 0) throw new Error(`no glyph for ${JSON.stringify(c)} in ${JSON.stringify(s)}`);
      out.push(k);
    }
  });
  return [...out, 255];
}

export function allTexts(): { lines: string[]; levelNames: string[] } {
  const levelNames = levelIds().map((id) => readLevel(id).name);
  const lines: string[] = [];
  for (const s of [...designLines(), ...EXTRA, ...levelNames]) if (!lines.includes(s)) lines.push(s);
  return { lines, levelNames };
}

export function generateText(): string {
  const { lines, levelNames } = allTexts();
  const L = [
    '; GENERATED by games/bo/tools/text.ts — do not edit. Bubble font (1 bit per pixel, 8 bytes per glyph) and every',
    '; text as glyph indices (index = position in the font table); 255 ends a text, 254 starts its second row.',
    '',
    `FONT_GLYPHS = ${ORDER.length}`,
    `NUM_TEXTS = ${lines.length}`,
  ];
  const used = new Set<string>();
  lines.forEach((s, i) => {
    let name = slug(s);
    while (used.has(name)) name += '_';
    used.add(name);
    L.push(`${name} = ${i}   ; ${s}`);
  });
  L.push('', '.data', 'font1:');
  for (const ch of ORDER) {
    const rows = GLYPHS[ch];
    if (!rows || rows.length !== 8 || rows.some((r) => !/^[.#]{5}$/.test(r))) throw new Error(`bad glyph ${ch}`);
    L.push(`    .byte ${rows.map((r) => `$${parseInt(r.replace(/#/g, '1').replace(/\./g, '0') + '000', 2).toString(16).padStart(2, '0')}`).join(', ')}   ; '${ch}'`);
  }
  L.push('text_table:');
  for (let i = 0; i < lines.length; i += 8) L.push(`    .word ${lines.slice(i, i + 8).map((_, k) => `tx_${i + k}`).join(', ')}`);
  lines.forEach((s, i) => L.push(`tx_${i}: .byte ${encode(s).join(', ')}   ; ${s}`));
  L.push('level_names:   ; text id of every level, in the level table order', `    .byte ${levelNames.map((n) => lines.indexOf(n)).join(', ')}`);
  return L.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  writeFileSync(new URL('../text.gen.asm', import.meta.url), generateText());
  const { lines } = allTexts();
  console.log(`wrote games/bo/text.gen.asm (${ORDER.length} glyphs, ${lines.length} texts)`);
}
