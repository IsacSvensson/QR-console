// The FPS spike's art and level (SPIKE.md §2): wall textures, the enemy, the gun and the map, as text.
// Shared design data: the generator (tables.ts) turns it into tables.gen.asm, and the test oracle
// (test/fps/oracle.ts) reads the same pictures to know what the screen must show.
// Colour letters are palette indices in hex; '.' is transparent (sprites only).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from './util';

/** Wall textures, 16x16, rows top to bottom. Colour 0 is not allowed: MAP would not draw it. */
export const TEXTURES: Record<string, string[]> = {
  brick: [
    '7777777777777777',
    '6666667666666667',
    '6666467666664667',
    '4444447444444447',
    '7777777777777777',
    '6667666666676666',
    '6467666664676666',
    '4447444444474444',
    '7777777777777777',
    '6666667666666667',
    '6646667666466667',
    '4444447444444447',
    '7777777777777777',
    '6667666666676666',
    '6667646666676466',
    '4447444444474444',
  ],
  stone: [
    'aaaaaaa3aaaaaaa3',
    'a7777773a7777773',
    'a7777773a7777773',
    'a7773773a7777773',
    'a7777773a7777373',
    'a7777773a7777773',
    'a7777773a7777773',
    '3333333333333333',
    'aaa3aaaaaaa3aaaa',
    'a773a7777773a777',
    'a773a7777773a777',
    'a773a7737773a777',
    'a773a7777773a777',
    'a773a7777773a737',
    'a773a7777773a777',
    '3333333333333333',
  ],
  tech: [
    '2222222222222222',
    '2888888228888882',
    '2833338228333382',
    '283dd382283ee382',
    '2833338228333382',
    '2888888228888882',
    '2222222222222222',
    '2a7a7a7a7a7a7a72',
    '27a7a7a7a7a7a7a2',
    '2222222222222222',
    '2888888888888882',
    '2833333333333382',
    '283d3d3d3d3d3d82',
    '2833333333333382',
    '2888888888888882',
    '2222222222222222',
  ],
  door: [
    '3333333333333333',
    '3aaaaaaaaaaaaaa3',
    '3a444444444444a3',
    '3a499999999994a3',
    '3a494444444494a3',
    '3a494444444494a3',
    '3a499999999994a3',
    '3a444444444444a3',
    '3a444444444444a3',
    '3a447777777744a3',
    '3a447eeeeee744a3',
    '3a447777777744a3',
    '3a444444444444a3',
    '3a444444444444a3',
    '3aaaaaaaaaaaaaa3',
    '3333333333333333',
  ],
};

/** Shade for walls hit on a y side (SPIKE.md §2.2): the same picture one step darker. */
export const DARK = [0, 1, 1, 1, 1, 1, 4, 3, 2, 4, 7, 5, 9, 8, 9, 10];

/** Map cell codes (SPIKE.md §2.1). */
export const CELL = { EMPTY: 0, BRICK: 1, STONE: 2, TECH: 3, DOOR_V: 8, DOOR_H: 9 } as const;
/** texture of each wall code */
export const TEXTURE_OF: Record<number, string> = { 1: 'brick', 2: 'stone', 3: 'tech', 8: 'door', 9: 'door' };
const CHAR_CELL: Record<string, number> = { '.': 0, P: 0, E: 0, '#': 1, '%': 2, '=': 3, '|': 8, '-': 9 };

export interface Level {
  cells: number[];
  player: { x: number; y: number };
  enemy: { x: number; y: number };
}

/** map.txt: 16 rows of 16 cells. P = player start (facing east), E = the enemy. */
export function readLevel(): Level {
  const rows = readFileSync(join(GAME_DIR, 'map.txt'), 'utf8').split(/\r?\n/).filter((l) => l.length && !l.startsWith(';'));
  if (rows.length !== 16) throw new Error(`map.txt: ${rows.length} rows, want 16`);
  const cells: number[] = [];
  let player: Level['player'] | undefined;
  let enemy: Level['enemy'] | undefined;
  rows.forEach((row, y) => {
    if (row.length !== 16) throw new Error(`map.txt row ${y}: ${row.length} cells, want 16`);
    [...row].forEach((ch, x) => {
      const c = CHAR_CELL[ch];
      if (c === undefined) throw new Error(`map.txt row ${y}: unknown cell '${ch}'`);
      if (ch === 'P') player = { x, y };
      if (ch === 'E') enemy = { x, y };
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      if (border && (c === 0 || c >= 8)) throw new Error(`map.txt: the border must be wall (row ${y}, column ${x})`);
      cells.push(c);
    });
  });
  if (!player || !enemy) throw new Error('map.txt needs a P and an E');
  return { cells, player, enemy };
}

/** The enemy, 16x16; scaled for the screen by nearest neighbour (SPIKE.md §2.4). */
export const ENEMY: Record<string, string[]> = {
  alive: [
    '................',
    '..f..........f..',
    '..ff.444444.ff..',
    '...f44444444f...',
    '...4e14444e14...',
    '...4444444444...',
    '....46666664....',
    '....44444444....',
    '..444444444444..',
    '.44.44444444.44.',
    '.4..44444444..4.',
    '.9..44444444..9.',
    '....444..444....',
    '....44....44....',
    '....44....44....',
    '...111....111...',
  ],
  dead: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......f........',
    '......f4f.......',
    '...6.444466.....',
    '..64444444469...',
    '.6644444444466..',
    '1111111111111111',
  ],
};

/** The gun, 24x16 (3x2 tiles), drawn at the bottom of the view; FLASH (24x8) above it when firing. */
export const GUN = [
  '..........3333..........',
  '.........3aaaa3.........',
  '.........3a77a3.........',
  '.........3a77a3.........',
  '........33a77a33........',
  '.......3aaa77aaa3.......',
  '.......3a777777a3.......',
  '......3a77777777a3......',
  '......3a7cc77cc7a3......',
  '.....3cccccccccccc3.....',
  '.....3ccccc33ccccc3.....',
  '....3ccccc3..3ccccc3....',
  '....3cccc3....3cccc3....',
  '...3ccccc3....3ccccc3...',
  '...3cccc3......3cccc3...',
  '...3cccc3......3cccc3...',
];
export const FLASH = [
  '........................',
  '..........e..e..........',
  '.......e..eeee..e.......',
  '........eeffffee........',
  '.........efffffe........',
  '........eeffffee........',
  '.......e..eeee..e.......',
  '..........e..e..........',
];

/** Enemy sprite sizes on screen, in pixels (square, multiples of 8). */
export const SPRITE_SIZES = [8, 16, 24, 32, 48, 64];

/** Picture -> palette indices (row-major), '.' -> 0. */
export function pixels(rows: string[], w: number, h: number): number[] {
  if (rows.length !== h || rows.some((r) => r.length !== w)) throw new Error(`picture must be ${w}x${h}`);
  return rows.flatMap((r) => [...r].map((ch) => (ch === '.' ? 0 : parseInt(ch, 16))));
}
