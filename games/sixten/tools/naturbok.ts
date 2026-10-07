// The nature book (DESIGN.md §8.2, ../NATURBOK.md) -> ../naturbok.gen.asm: the 40 entries' names (ROM), their texts
// word-wrapped into pages (xdata, packed), and the pictures of the entries that have one so far (8 x 8 sprites).
// Run: npx tsx games/sixten/tools/naturbok.ts (or npm run sixten:gen)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Art, encode } from './art';
import { GAME_DIR, isMain } from './util';

export const LINE = 20;
export const LINES_PER_PAGE = 2;
export const MAX_PAGES = 3;

export interface Entry { n: number; name: string; category: string; world: number; text: string; source: string; check: string }

export function readBook(text = readFileSync(join(GAME_DIR, 'NATURBOK.md'), 'utf8')): Entry[] {
  const out: Entry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\| (\d+) \| ([^|]+) \| ([^|]+) \| (\d) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/.exec(line);
    if (!m) continue;
    out.push({ n: Number(m[1]), name: m[2]!.trim(), category: m[3]!.trim(), world: Number(m[4]), text: m[5]!.trim(), source: m[6]!.trim(), check: m[7]!.trim() });
  }
  out.forEach((e, i) => {
    if (e.n !== i + 1) throw new Error(`NATURBOK.md: entries must be numbered 1, 2, … (row ${i + 1})`);
  });
  return out;
}

/** greedy word wrap into lines of at most LINE characters, LINES_PER_PAGE lines a page */
export function pages(text: string): string[][] {
  const lines: string[] = [];
  for (const w of text.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + w.length <= LINE) lines[lines.length - 1] = `${last} ${w}`;
    else {
      if (w.length > LINE) throw new Error(`word too long: ${w}`);
      lines.push(w);
    }
  }
  const out: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) out.push(lines.slice(i, i + LINES_PER_PAGE));
  if (out.length > MAX_PAGES) throw new Error(`text too long (${out.length} pages): ${text}`);
  return out;
}

/** pictures (8 x 8, DawnBringer 16 hex, '.' transparent) of the entries that have one; the rest show a '?' */
export const PICTURES: Record<string, Art> = {
  TROMB: ['.333333.', '..AAAA..', '..AAA...', '...AA9..', '...AA...', '..E.A...', '...A..9.', '..7777..'],
  VIND: ['........', 'FFFFF...', '.....F..', 'FFFFFF..', '......F.', '.FFFFF..', '....E...', '..9.....'],
  'RÄV': ['9.....9.', '99...99.', '.99999..', '.90990..', '.99F99..', '..9999..', '.9999999', '99....FF'],
  IGELKOTT: ['........', '..4343..', '.434343.', '43434343', '4343434C', '43434C0C', '.444CCC.', '..C..C..'],
  GRAN: ['...5....', '..555...', '.5B555..', '..555...', '.55B55..', '5555555.', '...4....', '...4....'],
  'BLÅBÄR': ['.5..5...', '5B55B5..', '.5555...', '..2.2...', '.282.28.', '.222.22.', '..2..2..', '........'],
  FLYTTBLOCK: ['........', '..3333..', '.3AAAA3.', '3AFAAAA3', '3AAAAA33', '3AAA3333', '.333333.', 'BBBBBBBB'],
  'ROTVÄLTA': ['..4344..', '.434443.', '3444443.', '4744434.', '4444434.', '.444443.', '..4344..', '33333333'],
  STORM: ['.333333.', '33AAAA33', '.333333.', 'F.F.F.F.', '.F.F.F.F', 'F.F.F.F.', '.F.F.F.F', '........'],
  KORP: ['........', '...00...', '..0000.7', '.000000.', '00000000', '.000000.', '..0..0..', '..7..7..'],
  HACKSPETT: ['..66....', '.0006...', '.0F0F...', '.00004..', '.0F00...', '.0000...', '.0..0...', '........'],
  EKORRE: ['..9.....', '.999..9.', '.9F99999', '.99999.9', '..999..9', '..9999.9', '..9..999', '.99.....'],
  TALL: ['..555...', '.55555..', '5555555.', '.55555..', '...4....', '...4....', '...4....', '..444...'],
  LINGON: ['.5..5...', '5B55B5..', '.5555...', '..6.6...', '.666.66.', '.666.66.', '..6..6..', '........'],
  GRANIT: ['........', '.A3AF3A.', '3AF3A3A3', 'A3A6A3AF', '3A3AF3A3', '.A3A3A3.', '..3333..', 'BBBBBBBB'],
  'RULLSTENSÅS': ['........', '........', '...777..', '..77A77.', '.7A77777', '7777A777', '77A77777', 'BBBBBBBB'],
  REGN: ['.333333.', '3AAAAAA3', '.333333.', '.8..8..8', '8..8..8.', '.8..8..8', '8..8..8.', '........'],
  GRODA: ['........', '.5....5.', '5F5..5F5', '5555555.', '.55BB55.', '5555555.', '5.5..5.5', '........'],
  'BÄVER': ['........', '..4444..', '.4F44F4.', '.444444.', '.44FF44.', '.444444.', '..4444..', '.3333333'],
  VITMOSSA: ['.B.B.B..', 'BEBEBEB.', '.BEBEB..', 'BEBEBEB.', '.BEBEB..', '..B.B...', '.8888...', '88888888'],
  MYR: ['BBBBBBBB', 'B88BBB8B', 'BB88BBBB', 'BBBB88BB', 'B8BBBB88', 'BBB88BBB', '88BBBBBB', 'BBBB88BB'],
  'BÄCK': ['BBBBBBBB', 'BB8888BB', 'B88D888B', '.88888D.', '..8D888.', '.88888..', 'B888D88B', 'BBBBBBBB'],
  'KÄLLA': ['BBBBBBBB', 'BB3333BB', 'B388883B', '3888D883', '38D88883', 'B388883B', 'BB3333BB', 'BBBBBBBB'],
  LERA: ['........', '........', '.77777..', '7777777.', '77AA777.', '7777777.', '.77777..', '44444444'],
};
export const UNKNOWN: Art = ['..FFFF..', '.F....F.', '......F.', '....FF..', '...F....', '...F....', '........', '...F....'];

export function generateBook(): string {
  const book = readBook();
  const out = [
    '; GENERATED by games/sixten/tools/naturbok.ts from NATURBOK.md — do not edit.',
    `NB_COUNT = ${book.length}`,
    '',
    '.data',
    '; per entry: its name (glyphs), its picture, the far address of its packed pages',
    'nb_names:',
    ...book.map((_, i) => `    .word nb_name_${i}`),
    'nb_pics:',
    ...book.map((e, i) => `    .word ${PICTURES[e.name] ? `nb_pic_${i}` : 'nb_pic_unknown'}`),
    'nb_texts:',
    ...book.map((_, i) => `    .word nb_text_${i} >> 16, nb_text_${i} & 0xFFFF`),
    `nb_world: .byte ${book.map((e) => e.world).join(', ')}`,
  ];
  book.forEach((e, i) => out.push(`nb_name_${i}: .byte ${[...encode(e.name), 255].join(', ')}   ; ${e.name}`));
  const sprite = (a: Art) => ['.sprite', ...a];
  out.push('nb_pic_unknown:', ...sprite(UNKNOWN));
  book.forEach((e, i) => {
    if (PICTURES[e.name]) out.push(`nb_pic_${i}:   ; ${e.name}`, ...sprite(PICTURES[e.name]!));
  });
  out.push('', '.xdata', '; the pages: the page count, then LINES_PER_PAGE lines a page, each 255-terminated (an empty line is 255)');
  book.forEach((e, i) => {
    const p = pages(e.text);
    const bytes = [p.length];
    for (const page of p) for (let k = 0; k < LINES_PER_PAGE; k++) bytes.push(...(page[k] ? encode(page[k]!) : []), 255);
    out.push(`nb_text_${i}:   ; ${e.name}`, '.pack', `    .byte ${bytes.join(', ')}`, '.endpack');
  });
  return out.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  writeFileSync(join(GAME_DIR, 'naturbok.gen.asm'), generateBook());
  const book = readBook();
  console.log(`naturbok.gen.asm: ${book.length} entries, ${Object.keys(PICTURES).length} pictures, longest ${Math.max(...book.map((e) => pages(e.text).length))} pages`);
}
