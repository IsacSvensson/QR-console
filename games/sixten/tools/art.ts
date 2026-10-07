// Art and tables for Sixten -> ../art.gen.asm. The one source of: the cell types (DESIGN.md §4.1: character, cell
// pattern, map colour and symbol, speed, blocking), the top-down tiles, the sprites, the bubble font with Å Ä Ö and
// the fixed texts (as glyph indices). Run: npx tsx games/sixten/tools/art.ts (or npm run sixten:gen)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR, isMain } from './util';

// ---- font: 5 x 6 letters with room for Å Ä Ö above, 1 bit per pixel (as Bo's) ----------------------------
const E = '.....';
const body = (rows: string[]) => [E, E, ...rows];
const GLYPHS: Record<string, string[]> = {
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
  '/': body(['....#', '...#.', '..#..', '..#..', '.#...', '#....']),
};
export const ORDER = [' ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Å', 'Ä', 'Ö', ...'0123456789', '!', '?', '.', ',', "'", '-', ':', '/'];

/** a text as glyph indices (the game's font), throws on a character the font lacks */
export const encode = (s: string) =>
  [...s].map((c) => {
    const k = ORDER.indexOf(c);
    if (k < 0) throw new Error(`no glyph for ${JSON.stringify(c)} in ${JSON.stringify(s)}`);
    return k;
  });

/** fixed texts: asm label -> text */
export const TEXTS: Record<string, string> = {
  t_go: 'GÅ',
  t_look: 'UNDERSÖK',
  t_map: 'KARTA',
  t_here: 'DU ÄR HÄR! A: KURS',
  t_lg_forest: 'SKOG',
  t_lg_open: 'ÖPPET',
  t_lg_water: 'VATTEN',
  t_lg_hill: 'HÖJD',
  t_lg_path: 'STIG',
  t_lg_marsh: 'MYR',
};

// ---- pixel art ---------------------------------------------------------------------------------------------
// rows of hex palette indices (DawnBringer 16), '.' = transparent
export type Art = string[];
export const mirror = (a: Art): Art => a.map((r) => [...r].reverse().join(''));
const split = (a: Art): Art[] => {
  const out: Art[] = [];
  for (let ty = 0; ty < a.length / 8; ty++)
    for (let tx = 0; tx < a[0]!.length / 8; tx++) out.push(a.slice(ty * 8, ty * 8 + 8).map((r) => r.slice(tx * 8, tx * 8 + 8)));
  return out;
};
const draw = (w: number, h: number, f: (x: number, y: number) => string): Art =>
  Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => f(x, y)).join(''));

const TUFT: Art = ['........', '........', '...5....', '..5.5.5.', '...555..', '....5...', '........', '........'];
const TUFT_R: Art = ['........', '........', '.....5..', '...55.5.', '..555...', '...5....', '........', '........'];
const FLOOR: Art = ['44544444', '4B444474', '44445444', '74444454', '44544B44', '44444447', '45474444', '44444544'];
const SPRUCE: Art = [
  '4444445555444444',
  '4444555555554444',
  '44455555B5555444',
  '4455B555555B5544',
  '4555555BB5555554',
  '45555B5BB55B5554',
  '55555BBBBBB55555',
  '5B55BBB44BBB55B5',
  '55555BB44BB55550',
  '45555B5BB5B55550',
  '455555BBB5555504',
  '4455B55BB55B5004',
  '4445555555550044',
  '4444555555000444',
  '4444400000004444',
  '4444440000444444',
];
const LONE_SPRUCE = SPRUCE.map((r) => r.replace(/4/g, '.'));
const DENSE: Art = ['5B550555', 'B5550B55', '55005555', '50555B55', '0555B5B5', '55B5B555', '5B555005', '55550555'];
const PATH_H: Art = ['........', '...B....', '77777777', '7C777C77', '777C7777', '77777777', '........', '........'];
const PATH_V = PATH_H[0]!.split('').map((_, x) => PATH_H.map((r) => r[x]).join(''));
const PATH_X = PATH_H.map((r, y) => [...r].map((c, x) => (c === '.' ? PATH_V[y]![x]! : c)).join(''));
const PATH_HF = PATH_H.map((r) => r.replace(/\./g, '4')); // paths through forest: forest floor around them
const PATH_VF = PATH_V.map((r) => r.replace(/\./g, '4'));
const PATH_XF = PATH_X.map((r) => r.replace(/\./g, '4'));
const WATER: Art = ['88888888', '88DD8888', '88888888', '888888D8', '8888888D', '88888888', '8D888888', '88888888'];
const WATER2: Art = ['88888888', '8888DD88', '88888888', '8D888888', 'D8888888', '88888888', '888888D8', '88888888'];
const MARSH: Art = ['BB5BBBBB', 'B888BB5B', 'BB8BBBBB', 'BBBBB88B', '5BBB8888', 'BBBBBB8B', 'BB5BBBBB', 'B88BBB5B'];
const ROCK: Art = ['AAA3AAAA', 'A7AA3AAA', 'AAAA33A7', '3AA7AAAA', 'AA3AAA3A', 'A7AAA3AA', 'AAAA7AAA', '3AA3AAAA'];
const CAVE_TL: Art = ['AAAAA333', 'AAA33000', 'AA300000', 'A3000000', 'A3000000', '30000000', '30000000', '30000000'];
const CAVE_BL: Art = ['30000000', '30000000', '30000000', '30000000', '30000000', '30000000', '30000000', '37777777'];
const DITCH_T: Art = ['........', 'B5B5B5B5', '44444444', '43444434', '33333333', '34434443', '55545555', '5B555555'];
const DITCH_B: Art = ['555B5555', '55555B55', '5B555555', '55555555', '34443444', '44444444', 'B5B5B5B5', '........'];
const HOLLOW = draw(16, 16, (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  return d > 7.6 ? '.' : d > 6.2 ? '4' : d > 5.5 ? '5' : (x + y) % 7 === 0 ? 'B' : '5';
});
const BOULDER = draw(16, 16, (x, y) => {
  const d = Math.hypot(x - 7.5, (y - 8) * 1.15);
  if (d > 7.2) return d < 8.2 && x + y > 15 ? '3' : '.';
  if (d > 6.4) return '3';
  const s = x + y;
  return s < 9 ? 'F' : s < 18 ? 'A' : '3';
});
const HOUSE: Art = [
  '...6666666666...',
  '..666666666666..',
  '.66666666666666.',
  '1111111111111111',
  '6666666666666666',
  '6666666666666666',
  '6666666666666666',
  '3333333333333333',
  'F66666666666666F',
  'F6FFFF666444666F',
  'F6F88F666444666F',
  'F6F88F666444666F',
  'F6FFFF666444666F',
  'F66666666444666F',
  'F66666666444666F',
  '3333333333333333',
];
const LOG: Art = ['........', '33333333', '47474747', '44444444', '74447444', '44444444', '33333333', '........'];
const LOG_CROWN: Art = ['.5.5B...', '55B5B553', '5B55B474', 'B555B444', '5B5BB744', '55B55444', '.5B5B533', '..5.5...'];
const LOG_ROOTS: Art = ['...4344.', '..434443', '33444444', '47444343', '44444344', '44434444', '33444443', '..4344..'];
const PLANK: Art = ['33333333', '47774777', '47774777', '44444444', '47774777', '47774777', '33333333', '88888888'];
const STAKE: Art = ['........', '...4....', '...4E...', '...4.E..', '...4..E.', '...4...E', '...4....', '..333...'];
const LEAVES: Art = ['..9.E...', '.99E94..', '9E949E9.', 'E9499E94', '.94E99E.', '..9E49..', '...9....', '........'];

/** top-down tiles in order; index = position + 1 (tile 0 = empty: the open-ground CLS colour) */
export const TOP_TILES: [string, Art][] = [
  ['tuft', TUFT],
  ['tuft_r', TUFT_R],
  ['tuft_l', mirror(TUFT_R)],
  ['floor', FLOOR],
  ...split(SPRUCE).map((a, i): [string, Art] => [`spruce${i}`, a]),
  ...split(LONE_SPRUCE).map((a, i): [string, Art] => [`lone${i}`, a]),
  ['dense', DENSE],
  ['path_h', PATH_HF],
  ['path_v', PATH_VF],
  ['path_x', PATH_XF],
  ['water', WATER],
  ['water2', WATER2],
  ['marsh', MARSH],
  ['rock', ROCK],
  ['cave0', CAVE_TL],
  ['cave1', mirror(CAVE_TL)],
  ['cave2', CAVE_BL],
  ['cave3', mirror(CAVE_BL)],
  ['ditch_t', DITCH_T],
  ['ditch_b', DITCH_B],
  ...split(HOLLOW).map((a, i): [string, Art] => [`hollow${i}`, a]),
  ...split(BOULDER).map((a, i): [string, Art] => [`boulder${i}`, a]),
  ...split(HOUSE).map((a, i): [string, Art] => [`house${i}`, a]),
  ['log', LOG],
  ['log_crown', LOG_CROWN],
  ['log_roots', LOG_ROOTS],
  ['plank', PLANK],
  ['stake', STAKE],
  ['leaves', LEAVES],
];
export const TILE = new Map(TOP_TILES.map(([n], i) => [n, i + 1]));
export const tileIndex = (n: string) => {
  if (n === '_') return 0;
  const k = TILE.get(n);
  if (k === undefined) throw new Error(`unknown tile ${n}`);
  return k;
};
/** palette index of every pixel of tile t (0 = transparent), for previews */
export const tilePixels = (t: number): number[] =>
  t === 0 ? new Array(64).fill(0) : TOP_TILES[t - 1]![1].join('').split('').map((c) => (c === '.' ? 0 : parseInt(c, 16)));

// ---- cell types (DESIGN.md §4.1) ----------------------------------------------------------------------------
// One byte per cell: bits 0-4 type, bit 5 variant (the pattern's upper and lower halves swap), bit 6 covered by leaves, bit 7 a
// control stands here. speed in 1/16 px per frame (0 = blocking). fill = map colour, sym = map symbol:
// 0 none, 1 path E-W, 2 path N-S, 3 crossing, 4 marsh, 5 contours, 6 ditch, 7 hollow, 8 building, 9 boulder,
// 10 fallen tree / windfall, 11 bridge, 12 cave, 13 lone tree, 14 building site
export interface CellType { ch: string; name: string; pattern: string; fill: number; sym: number; speed: number; varies?: boolean }
const F = 'floor';
export const CELLS: CellType[] = [
  { ch: '.', name: 'OPEN', pattern: '_ _ tuft _ / _ _ _ _ / tuft _ _ _ / _ _ _ tuft', fill: 14, sym: 0, speed: 16, varies: true },
  { ch: 'T', name: 'FOREST', pattern: `spruce0 spruce1 ${F} ${F} / spruce2 spruce3 ${F} ${F} / ${F} ${F} spruce0 spruce1 / ${F} ${F} spruce2 spruce3`, fill: 15, sym: 0, speed: 14, varies: true },
  { ch: '#', name: 'DENSE', pattern: 'dense dense dense dense / dense dense dense dense / dense dense dense dense / dense dense dense dense', fill: 11, sym: 0, speed: 8 },
  { ch: '=', name: 'PATH_EW', pattern: `${F} ${F} ${F} ${F} / path_h path_h path_h path_h / ${F} ${F} ${F} ${F} / ${F} ${F} ${F} ${F}`, fill: 15, sym: 1, speed: 20 },
  { ch: '|', name: 'PATH_NS', pattern: `${F} path_v ${F} ${F} / ${F} path_v ${F} ${F} / ${F} path_v ${F} ${F} / ${F} path_v ${F} ${F}`, fill: 15, sym: 2, speed: 20 },
  { ch: '+', name: 'PATH_X', pattern: `${F} path_v ${F} ${F} / path_h path_x path_h path_h / ${F} path_v ${F} ${F} / ${F} path_v ${F} ${F}`, fill: 15, sym: 3, speed: 20 },
  { ch: '~', name: 'MARSH', pattern: 'marsh marsh marsh marsh / marsh marsh marsh marsh / marsh marsh marsh marsh / marsh marsh marsh marsh', fill: 15, sym: 4, speed: 10 },
  { ch: 'W', name: 'WATER', pattern: 'water water2 water water2 / water2 water water2 water / water water2 water water2 / water2 water water2 water', fill: 8, sym: 0, speed: 0 },
  { ch: '^', name: 'HILL', pattern: 'rock rock rock rock / rock rock rock rock / rock rock rock rock / rock rock rock rock', fill: 15, sym: 5, speed: 0 },
  { ch: 'v', name: 'DITCH', pattern: '_ tuft _ _ / ditch_t ditch_t ditch_t ditch_t / ditch_b ditch_b ditch_b ditch_b / _ _ tuft _', fill: 14, sym: 6, speed: 12 },
  { ch: 'u', name: 'HOLLOW', pattern: '_ _ _ tuft / _ hollow0 hollow1 _ / _ hollow2 hollow3 _ / tuft _ _ _', fill: 14, sym: 7, speed: 14 },
  { ch: 'H', name: 'HOUSE', pattern: '_ _ _ _ / _ house0 house1 _ / _ house2 house3 _ / _ _ tuft _', fill: 14, sym: 8, speed: 16 },
  { ch: 'o', name: 'BOULDER', pattern: 'tuft _ _ _ / _ boulder0 boulder1 _ / _ boulder2 boulder3 _ / _ _ _ tuft', fill: 14, sym: 9, speed: 16 },
  { ch: 'L', name: 'FALLEN', pattern: '_ _ _ _ / log_crown log log log_roots / _ _ _ _ / _ tuft _ _', fill: 14, sym: 10, speed: 12 },
  { ch: 'b', name: 'BRIDGE', pattern: 'water water2 water water2 / plank plank plank plank / water water2 water water2 / water2 water water2 water', fill: 8, sym: 11, speed: 16 },
  { ch: 'B', name: 'BUILD', pattern: '_ _ _ _ / _ stake _ stake / _ _ _ _ / _ stake _ stake', fill: 14, sym: 14, speed: 16 },
  { ch: 'G', name: 'CAVE', pattern: 'rock rock rock rock / rock cave0 cave1 rock / rock cave2 cave3 rock / rock rock rock rock', fill: 15, sym: 12, speed: 0 },
  { ch: 'S', name: 'START', pattern: '_ _ _ _ / _ tuft _ _ / _ _ _ _ / _ _ tuft _', fill: 14, sym: 0, speed: 16 },
  { ch: 'M', name: 'GOAL', pattern: '_ _ tuft _ / _ _ _ _ / _ _ _ _ / tuft _ _ _', fill: 14, sym: 0, speed: 16 },
  { ch: 'i', name: 'LONE_TREE', pattern: '_ _ _ _ / _ lone0 lone1 _ / _ lone2 lone3 _ / _ _ _ _', fill: 14, sym: 13, speed: 16 },
  { ch: 'X', name: 'WINDFALL', pattern: '_ _ _ _ / log_crown log log log_roots / log_roots log log log_crown / _ tuft _ _', fill: 15, sym: 10, speed: 0 },
];
export const CELL_BY_CH = new Map(CELLS.map((c, i) => [c.ch, i]));
export const patternBytes = (p: string) => {
  const rows = p.split('/').map((r) => r.trim().split(/\s+/).map(tileIndex));
  if (rows.length !== 4 || rows.some((r) => r.length !== 4)) throw new Error(`bad pattern ${p}`);
  return rows.flat();
};

// ---- sprites ---------------------------------------------------------------------------------------------
// Sixten top-down: 8 x 16 = head + body; facing down, up and right (left = right flipped); two walking bodies.
export const SPRITES: Record<string, Art> = {
  spr_head_dn: ['..4444..', '.444444.', '.4CCCC4.', '.C0CC0C.', '.CCCCCC.', '..CCCC..', '.999999.', 'C929929C'],
  spr_body_dn0: ['C999999C', '.99FF99.', '.999999.', '.222222.', '.22..22.', '.22..22.', '.FF..FF.', '........'],
  spr_body_dn1: ['C999999C', '.99FF99.', '.999999.', '.222222.', '.22..22.', '.FF..22.', '.....FF.', '........'],
  spr_head_up: ['..4444..', '.444444.', '.444444.', '.444444.', '.444444.', '..4444..', '.222222.', 'C222222C'],
  spr_body_up0: ['C222222C', '.222222.', '.999999.', '.222222.', '.22..22.', '.22..22.', '.FF..FF.', '........'],
  spr_body_up1: ['C222222C', '.222222.', '.999999.', '.222222.', '.22..22.', '.22..FF.', '.FF.....', '........'],
  spr_head_rt: ['..4444..', '.444444.', '.444CCC.', '.44CC0C.', '..4CCCC.', '...CCC..', '.22999..', '.229999C'],
  spr_body_rt0: ['.229999C', '.22999..', '..9999..', '..2222..', '..2..2..', '.2....2.', 'FF....FF', '........'],
  spr_body_rt1: ['.229999C', '.22999..', '..9999..', '..2222..', '...22...', '...22...', '...FF...', '........'],
  // crouching (in shelter): 8 x 12, drawn 4 px lower
  spr_crouch_head: ['..4444..', '.444444.', '.4CCCC4.', '.C0CC0C.', '.CCCCCC.', '.299992.', 'C299992C', '22999922'],
  spr_crouch_body: ['.222222.', '.22..22.', '.FF..FF.', '........', '........', '........', '........', '........'],
  spr_shadow: ['........', '........', '........', '..3333..', '.333333.', '..3333..', '........', '........'],
  spr_flag: ['3.......', '3FFFFFF.', '3FFFFF9.', '3FFFF99.', '3FFF999.', '3FF9999.', '3F99999.', '3.......'],
  spr_heart: ['.66.66..', '6666666.', '6666666.', '.66666..', '..666...', '...6....', '........', '........'],
  spr_wood: ['........', '44444447', '47777774', '44444447', '47777774', '44444447', '........', '........'],
  spr_cucumber: ['......B.', '....5BB.', '...5BB5.', '..5BB5..', '.5BB5...', '5BB5....', '5B5.....', '.5......'],
  spr_btn_a: ['..6666..', '.66FF66.', '66F66F66', '66FFFF66', '66F66F66', '66F66F66', '.666666.', '..6666..'],
  spr_btn_b: ['..9999..', '.9FFF99.', '99F99F99', '99FFF999', '99F99F99', '99FFF999', '.999999.', '..9999..'],
  spr_dpad: ['...FF...', '...FF...', '...FF...', 'FFFFFFFF', 'FFFFFFFF', '...FF...', '...FF...', '...FF...'],
};

// ---- output ------------------------------------------------------------------------------------------------
const sprite = (a: Art) => {
  if (a.length !== 8 || a.some((r) => !/^[.0-9A-F]{8}$/.test(r))) throw new Error(`bad sprite ${a.join('|')}`);
  return ['.sprite', ...a];
};

export function generateArt(): string {
  const out = [
    '; GENERATED by games/sixten/tools/art.ts — do not edit.',
    '',
    `FONT_GLYPHS = ${ORDER.length}`,
    `G_0 = ${ORDER.indexOf('0')}`,
    `G_SLASH = ${ORDER.indexOf('/')}`,
    `CELL_TYPES = ${CELLS.length}`,
    ...CELLS.map((c, i) => `CT_${c.name} = ${i}`),
    ...TOP_TILES.map(([n], i) => `T_${n.toUpperCase()} = ${i + 1}`),
    '',
    '.data',
    '; bubble font, 1 bit per pixel (bit 7 = leftmost), 8 bytes per glyph',
    'font1:',
  ];
  for (const ch of ORDER) {
    const rows = GLYPHS[ch];
    if (!rows || rows.length !== 8 || rows.some((r) => !/^[.#]{5}$/.test(r))) throw new Error(`bad glyph ${ch}`);
    out.push(`    .byte ${rows.map((r) => `0b${r.replace(/#/g, '1').replace(/\./g, '0')}000`).join(', ')}   ; '${ch}'`);
  }
  out.push('');
  for (const [label, s] of Object.entries(TEXTS)) out.push(`${label}: .byte ${[...encode(s), 255].join(', ')}   ; ${s}`);
  out.push('', '; top-down tiles (tile 0 = empty)', 'tiles_top:', '    .fill 32');
  for (const [n, a] of TOP_TILES) out.push(`; ${n}`, ...sprite(a));
  out.push('', '; cell patterns: 16 tile indices per cell type (4 rows of 4); the variant bit swaps rows 0-1 with 2-3', 'patterns:');
  CELLS.forEach((c) => out.push(`    .byte ${patternBytes(c.pattern).join(', ')}   ; ${c.ch} ${c.name}`));
  out.push(
    '',
    '; per cell type: walking speed (1/16 px per frame, 0 = blocking), map fill colour, map symbol',
    `cell_speed: .byte ${CELLS.map((c) => c.speed).join(', ')}`,
    `map_fill:   .byte ${CELLS.map((c) => c.fill).join(', ')}`,
    `map_sym:    .byte ${CELLS.map((c) => c.sym).join(', ')}`,
    '',
    '; sprites',
  );
  for (const [n, a] of Object.entries(SPRITES)) out.push(`${n}:`, ...sprite(a));
  return out.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  writeFileSync(join(GAME_DIR, 'art.gen.asm'), generateArt());
  console.log(`art.gen.asm: ${ORDER.length} glyphs, ${TOP_TILES.length} tiles, ${CELLS.length} cell types, ${Object.keys(SPRITES).length} sprites`);
}
