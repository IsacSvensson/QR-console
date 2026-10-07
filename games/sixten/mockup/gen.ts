// Writes art.gen.asm for the Sixten mockup (one source for everything the mockup draws):
//   - the bubble font (5x6 letters with room for Å Ä Ö above, 1 bit per pixel; same glyphs as Bo's mockup + '/')
//     and the mockup texts as glyph indices (255 ends a string);
//   - the top-down tiles and the cell patterns (one cell = 4 x 4 tiles), the map-symbol tables per cell type;
//   - level 1-1 as a cell map (one byte per cell), packed in xdata, plus the course (start, controls, goal);
//   - the side-view tiles and the side-view scene (column-major, one MAP call per column);
//   - the sprites (Sixten, flag, HUD icons).
// It also writes map-1-1.txt: the same cell map as text, with the controls, for DESIGN.md §13.
// Run: npx tsx games/sixten/mockup/gen.ts
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- font (copied from games/bo/mockup/gen.ts, plus '/') -------------------------------------------------
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
const ORDER = [' ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Å', 'Ä', 'Ö', ...'0123456789', '!', '?', '.', ',', "'", '-', ':', '/'];

/** Sixten's lines in the top-down scene, shown in turn */
const LINES = ['VINDEN ÖKAR!', 'EN TROMB!', 'NER I DIKET!'];
const LABELS: Record<string, string> = {
  t_ctrl: '2/5',
  t_wood: '3',
  t_go: 'GÅ',
  t_look: 'UNDERSÖK',
  t_map: 'KARTA',
  t_map_title: '1-1 SKOGSSTARTEN',
  t_lg_forest: 'SKOG',
  t_lg_open: 'ÖPPET',
  t_lg_water: 'VATTEN',
  t_lg_hill: 'HÖJD',
  t_lg_path: 'STIG',
  t_lg_marsh: 'MYR',
  t_lee: 'DET ÄR LÄ HÄR!',
  t_east: 'Ö',
  t_ovl_a: 'OVERLAY A: KOD I RAM',
  t_ovl_b: 'OVERLAY B: KARTAN',
  t_ovl_addr: 'ADRESS',
  t_ovl_size: 'BYTE FRÅN XDATA',
  t_ovl_scale: 'TROMBENS STYRKA 1-5',
};

const encode = (s: string) =>
  [...s].map((c) => {
    const k = ORDER.indexOf(c);
    if (k < 0) throw new Error(`no glyph for ${JSON.stringify(c)} in ${JSON.stringify(s)}`);
    return k;
  });

// ---- pixel art ---------------------------------------------------------------------------------------------
// rows of hex palette indices (DawnBringer 16), '.' = transparent (colour 0 in a sprite)
type Art = string[];
const mirror = (a: Art): Art => a.map((r) => [...r].reverse().join(''));
/** split a 16 x 16 (or 16 x 24) picture into 8 x 8 tiles, row by row */
const split = (a: Art): Art[] => {
  const out: Art[] = [];
  for (let ty = 0; ty < a.length / 8; ty++)
    for (let tx = 0; tx < a[0]!.length / 8; tx++) out.push(a.slice(ty * 8, ty * 8 + 8).map((r) => r.slice(tx * 8, tx * 8 + 8)));
  return out;
};
/** a procedural picture: f(x, y) -> palette char */
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
const DENSE: Art = ['5B550555', 'B5550B55', '55005555', '50555B55', '0555B5B5', '55B5B555', '5B555005', '55550555'];
const PATH_H: Art = ['........', '...B....', '77777777', '7C777C77', '777C7777', '77777777', '........', '........'];
const PATH_V = PATH_H[0]!.split('').map((_, x) => PATH_H.map((r) => r[x]).join('')); // transpose
const PATH_X = PATH_H.map((r, y) => [...r].map((c, x) => (c === '.' ? PATH_V[y]![x]! : c)).join(''));
const WATER: Art = ['88888888', '88DD8888', '88888888', '888888D8', '8888888D', '88888888', '8D888888', '88888888'];
const WATER2: Art = ['88888888', '8888DD88', '88888888', '8D888888', 'D8888888', '88888888', '888888D8', '88888888'];
const MARSH: Art = ['BB5BBBBB', 'B888BB5B', 'BB8BBBBB', 'BBBBB88B', '5BBB8888', 'BBBBBB8B', 'BB5BBBBB', 'B88BBB5B'];
const ROCK: Art = ['AAA3AAAA', 'A7AA3AAA', 'AAAA33A7', '3AA7AAAA', 'AA3AAA3A', 'A7AAA3AA', 'AAAA7AAA', '3AA3AAAA'];
const CAVE_TL: Art = ['AAAAA333', 'AAA33000', 'AA300000', 'A3000000', 'A3000000', '30000000', '30000000', '30000000'];
const CAVE_BL: Art = ['30000000', '30000000', '30000000', '30000000', '30000000', '30000000', '30000000', '37777777'];
const DITCH_T: Art = ['........', 'B5B5B5B5', '44444444', '43444434', '33333333', '34434443', '55545555', '5B555555'];
const DITCH_B: Art = ['555B5555', '55555B55', '5B555555', '55555555', '34443444', '44444444', 'B5B5B5B5', '........'];
// a hollow (sänka): a bowl with a brown rim, 16 x 16
const HOLLOW = draw(16, 16, (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  return d > 7.6 ? '.' : d > 6.2 ? '4' : d > 5.5 ? '5' : (x + y) % 7 === 0 ? 'B' : '5';
});
// a boulder, 16 x 16: light from the upper left
const BOULDER = draw(16, 16, (x, y) => {
  const d = Math.hypot(x - 7.5, (y - 8) * 1.15);
  if (d > 7.2) return d < 8.2 && x + y > 15 ? '3' : '.'; // shadow on the lower right
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

// top-down tiles: index = position + 1 (tile 0 is empty: the CLS colour, open ground)
const TOP_TILES: [string, Art][] = [
  ['tuft', TUFT],
  ['tuft_r', TUFT_R],
  ['tuft_l', mirror(TUFT_R)],
  ['floor', FLOOR],
  ...split(SPRUCE).map((a, i): [string, Art] => [`spruce${i}`, a]),
  ['dense', DENSE],
  ['path_h', PATH_H],
  ['path_v', PATH_V],
  ['path_x', PATH_X],
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
];
const TILE = new Map(TOP_TILES.map(([n], i) => [n, i + 1]));
const t = (n: string) => {
  if (n === '_') return 0;
  const k = TILE.get(n);
  if (k === undefined) throw new Error(`unknown tile ${n}`);
  return k;
};

// ---- cell types --------------------------------------------------------------------------------------------
// One byte per cell: bits 0-4 type, bit 5 variant (the pattern's upper and lower halves swap), bit 6 reserved
// (game: "covered by leaves"), bit 7 a control stands here.
// map fill colours (orienteering style): 15 white forest, 14 yellow open land, 11 green dense forest, 8 water
// map symbols: 0 none, 1 path E-W, 2 path N-S, 3 path crossing, 4 marsh, 5 contours, 6 ditch, 7 hollow,
// 8 building, 9 boulder, 10 fallen tree, 11 bridge, 12 cave, 13 lone tree
interface CellType { ch: string; name: string; pattern: string; fill: number; sym: number; varies?: boolean }
const F = 'floor';
const CELLS: CellType[] = [
  { ch: '.', name: 'OPEN', pattern: '_ _ tuft _ / _ _ _ _ / tuft _ _ _ / _ _ _ tuft', fill: 14, sym: 0, varies: true },
  { ch: 'T', name: 'FOREST', pattern: `spruce0 spruce1 ${F} ${F} / spruce2 spruce3 ${F} ${F} / ${F} ${F} spruce0 spruce1 / ${F} ${F} spruce2 spruce3`, fill: 15, sym: 0, varies: true },
  { ch: '#', name: 'DENSE', pattern: 'dense dense dense dense / dense dense dense dense / dense dense dense dense / dense dense dense dense', fill: 11, sym: 0 },
  { ch: '=', name: 'PATH_EW', pattern: `${F} ${F} ${F} ${F} / path_h path_h path_h path_h / ${F} ${F} ${F} ${F} / ${F} ${F} ${F} ${F}`, fill: 15, sym: 1 },
  { ch: '|', name: 'PATH_NS', pattern: `${F} path_v ${F} ${F} / ${F} path_v ${F} ${F} / ${F} path_v ${F} ${F} / ${F} path_v ${F} ${F}`, fill: 15, sym: 2 },
  { ch: '+', name: 'PATH_X', pattern: `${F} path_v ${F} ${F} / path_h path_x path_h path_h / ${F} path_v ${F} ${F} / ${F} path_v ${F} ${F}`, fill: 15, sym: 3 },
  { ch: '~', name: 'MARSH', pattern: 'marsh marsh marsh marsh / marsh marsh marsh marsh / marsh marsh marsh marsh / marsh marsh marsh marsh', fill: 15, sym: 4 },
  { ch: 'W', name: 'WATER', pattern: 'water water2 water water2 / water2 water water2 water / water water2 water water2 / water2 water water2 water', fill: 8, sym: 0 },
  { ch: '^', name: 'HILL', pattern: 'rock rock rock rock / rock rock rock rock / rock rock rock rock / rock rock rock rock', fill: 15, sym: 5 },
  { ch: 'v', name: 'DITCH', pattern: '_ tuft _ _ / ditch_t ditch_t ditch_t ditch_t / ditch_b ditch_b ditch_b ditch_b / _ _ tuft _', fill: 14, sym: 6 },
  { ch: 'u', name: 'HOLLOW', pattern: '_ _ _ tuft / _ hollow0 hollow1 _ / _ hollow2 hollow3 _ / tuft _ _ _', fill: 14, sym: 7 },
  { ch: 'H', name: 'HOUSE', pattern: '_ _ _ _ / _ house0 house1 _ / _ house2 house3 _ / _ _ tuft _', fill: 14, sym: 8 },
  { ch: 'o', name: 'BOULDER', pattern: 'tuft _ _ _ / _ boulder0 boulder1 _ / _ boulder2 boulder3 _ / _ _ _ tuft', fill: 14, sym: 9 },
  { ch: 'L', name: 'FALLEN', pattern: '_ _ _ _ / log_crown log log log_roots / _ _ _ _ / _ tuft _ _', fill: 14, sym: 10 },
  { ch: 'b', name: 'BRIDGE', pattern: 'water water2 water water2 / plank plank plank plank / water water2 water water2 / water2 water water2 water', fill: 8, sym: 11 },
  { ch: 'B', name: 'BUILD', pattern: '_ _ _ _ / _ _ _ _ / _ _ _ _ / _ _ _ _', fill: 14, sym: 0 },
  { ch: 'G', name: 'CAVE', pattern: 'rock rock rock rock / rock cave0 cave1 rock / rock cave2 cave3 rock / rock rock rock rock', fill: 15, sym: 12 },
  { ch: 'S', name: 'START', pattern: '_ _ _ _ / _ tuft _ _ / _ _ _ _ / _ _ tuft _', fill: 14, sym: 0 },
  { ch: 'M', name: 'GOAL', pattern: '_ _ tuft _ / _ _ _ _ / _ _ _ _ / tuft _ _ _', fill: 14, sym: 0 },
  { ch: 'i', name: 'LONE_TREE', pattern: '_ _ _ _ / _ spruce0 spruce1 _ / _ spruce2 spruce3 _ / _ _ _ _', fill: 14, sym: 13 },
];
const patternBytes = (p: string) => {
  const rows = p.split('/').map((r) => r.trim().split(/\s+/).map(t));
  if (rows.length !== 4 || rows.some((r) => r.length !== 4)) throw new Error(`bad pattern ${p}`);
  return rows.flat();
};

// ---- level 1-1 Skogsstarten (24 x 15 cells = 6 x 5 screens of 4 x 3 cells) -------------------------------
const MAP_1_1 = [
  '^^^^^^TTTT##TTTTTWWWWTTT',
  '^^G===+TT###TTTTWWWWWWTT',
  '^^^TTT|TTT##TTTT~~WWWWTT',
  'TTTTTT|TTTTTTTT~~~~.WTTT',
  'TT##TT|TTTTTTT~~~~~.WTTT',
  'TT##TT|TTTTTT.....~.WTTT',
  'TTTTTT|.....T.o.....W.MT',
  'TTTTTT|...u.........WTTT',
  'TTTTTT|vvvvvvvvvvvv.W.TT',
  'TTTTTT|TTTTTTTTTTTTTW.TT',
  'TT##TT|TTTTTTTTTTTTTW|TT',
  'TT##TT|TTTTTTTTTTTTTW|TT',
  'TTTTTT|TTTTTTTTTTTTTW|TT',
  'H.S===+=============b+TT',
  '...TTTTTTTTTTTTTTTTTWTTT',
];
const W = 24;
const H = 15;
/** the course: start, the controls in order, the goal (column, row) */
const COURSE: [number, number][] = [
  [2, 13], // start
  [6, 13], // 1: the path crossing
  [14, 6], // 2: the boulder
  [19, 3], // 3: the marsh edge by the lake (compass course over the marsh)
  [10, 7], // 4: the hollow in the field
  [21, 8], // 5: under the leaves by the brook (revealed when the whirlwind has passed)
  [22, 6], // goal
];
if (MAP_1_1.length !== H || MAP_1_1.some((r) => [...r].length !== W)) throw new Error('map 1-1 must be 24 x 15');
const cells: number[] = [];
MAP_1_1.forEach((row, r) =>
  [...row].forEach((ch, c) => {
    const k = CELLS.findIndex((ct) => ct.ch === ch);
    if (k < 0) throw new Error(`unknown cell '${ch}' at ${c},${r}`);
    const variant = CELLS[k]!.varies && ((c * 7 + r * 3) >> 1) & 1 ? 0x20 : 0;
    const ctrl = COURSE.slice(1, -1).some(([cc, rr]) => cc === c && rr === r) ? 0x80 : 0;
    cells.push(k | variant | ctrl);
  }),
);

// ---- side view ----------------------------------------------------------------------------------------------
const GRASS_TOP: Art = ['.5...5..', 'B5..B5.5', '5B.5B.B5', 'BBBBBBBB', '55B5555B', '44444444', '47444474', '44744444'];
const DIRT: Art = ['44444444', '44744444', '44444474', '47444444', '44444744', '44444444', '74444447', '44474444'];
const BACKWALL: Art = ['33433343', '34333333', '33333433', '33343333', '43333334', '33333333', '33433343', '33333333'];
const DITCH_FLOOR: Art = ['B353B335', '5B5B55B5', 'BBBBBBBB', '44444444', '47444474', '44444444', '44474444', '74444447'];
const TRUNK: Art = ['33333333', '47774777', '44444444', '74447444', '33333333'];
const LOG_GROUND: Art = [...TRUNK, '44444444', '47444474', '44744444'];
const LOG_DITCH: Art = [...TRUNK, '33433343', '34333333', '33333433'];
const TWIGS_SIDE: Art = ['..5..B..', '.5B.5B5.', '5B5B5B33', 'B5B55447', 'B5B5B333', '44444444', '47444474', '44744444'];
const TIP: Art = ['...55...', '...55...', '..5555..', '..5555..', '.555555.', '.555555.', '55555555', '55555555'];
const TREE: Art = ['...55...', '..5555..', '.555555.', '55555555', '..5555..', '.555555.', '55555555', '55555555'];
// the root plate of the fallen tree, standing up where the tree stood: 16 x 24
const ROOT_PLATE = draw(16, 24, (x, y) => {
  const d = Math.hypot((x - 7.5) / 7.6, (y - 11.5) / 11.6);
  if (d > 1) return y < 19 ? '.' : y === 19 ? 'B' : '4'; // the ground around the plate's foot
  if (d > 0.86) return '3';
  return (x * 7 + y * 3) % 9 === 0 ? '7' : (x * 5 + y * 11) % 13 === 0 ? '3' : '4';
});
const SIDE_TILES: [string, Art][] = [
  ['g', GRASS_TOP],
  ['d', DIRT],
  ['x', BACKWALL],
  ['f', DITCH_FLOOR],
  ['L', LOG_GROUND],
  ['l', LOG_DITCH],
  ['c', TWIGS_SIDE],
  ['A', TIP],
  ['Y', TREE],
  ...split(ROOT_PLATE).map((a, i): [string, Art] => [`R${i}`, a]),
];
const SIDE_INDEX = new Map(SIDE_TILES.map(([n], i) => [n, i + 1]));
// 16 columns x 14 rows from y 16 (under the side HUD); ' ' = sky; 'R' = the root plate, placed by position
const SIDE = [
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  'A  A  A   A  A A',
  'YA YA Y A RRYAYA',
  'YYYYYYYYYYRRYYYY',
  'gggcLLllllRRgggg',
  'ddddddxxxxdddddd',
  'ddddddffffdddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
];
const ROOT_COL = 10;
const ROOT_ROW = 6;
const sideIndex = (ch: string, c: number, r: number) => {
  if (ch === ' ') return 0;
  if (ch === 'R') return SIDE_INDEX.get(`R${(r - ROOT_ROW) * 2 + (c - ROOT_COL)}`)!;
  const k = SIDE_INDEX.get(ch);
  if (k === undefined) throw new Error(`unknown side tile ${ch}`);
  return k;
};

// ---- sprites ---------------------------------------------------------------------------------------------
const SPRITES: Record<string, Art> = {
  spr_sixten_head: ['..4444..', '.444444.', '.4CCCC4.', '.C0CC0C.', '.CCCCCC.', '..CCCC..', '.999999.', 'C929929C'],
  spr_sixten_body: ['C999999C', '.99FF99.', '.999999.', '.222222.', '.22..22.', '.22..22.', '.FF..FF.', '........'],
  spr_crouch_head: ['..4444..', '.444444.', '.44CCCC.', '.4CC0CC.', '..CCCCC.', '.229999.', '2229999C', '2229999C'],
  spr_crouch_body: ['22299999', '.2299999', '..22222.', '.222222.', '.22.22..', 'FF..FF..', '........', '........'],
  spr_flag: ['3.......', '3FFFFFF.', '3FFFFF9.', '3FFFF99.', '3FFF999.', '3FF9999.', '3F99999.', '3.......'],
  spr_heart: ['.66.66..', '6666666.', '6666666.', '.66666..', '..666...', '...6....', '........', '........'],
  spr_wood: ['........', '44444447', '47777774', '44444447', '47777774', '44444447', '........', '........'],
  spr_cucumber: ['......B.', '....5BB.', '...5BB5.', '..5BB5..', '.5BB5...', '5BB5....', '5B5.....', '.5......'],
  spr_btn_a: ['..6666..', '.66FF66.', '66F66F66', '66FFFF66', '66F66F66', '66F66F66', '.666666.', '..6666..'],
  spr_btn_b: ['..9999..', '.9FFF99.', '99F99F99', '99FFF999', '99F99F99', '99FFF999', '.999999.', '..9999..'],
  spr_dpad: ['...FF...', '...FF...', '...FF...', 'FFFFFFFF', 'FFFFFFFF', '...FF...', '...FF...', '...FF...'],
};

// ---- output -------------------------------------------------------------------------------------------------
const sprite = (a: Art) => {
  if (a.length !== 8 || a.some((r) => !/^[.0-9A-F]{8}$/.test(r))) throw new Error(`bad sprite ${a.join('|')}`);
  return ['.sprite', ...a];
};
const out = [
  '; GENERATED by games/sixten/mockup/gen.ts — do not edit.',
  '',
  `FONT_GLYPHS = ${ORDER.length}`,
  `LV_W = ${W}`,
  `LV_H = ${H}`,
  `COURSE_N = ${COURSE.length}`,
  `NUM_LINES = ${LINES.length}`,
  `SIDE_COLS = ${SIDE[0]!.length}`,
  `SIDE_ROWS = ${SIDE.length}`,
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
out.push('', 'lines:', ...LINES.map((_, i) => `    .word line_${i}`));
LINES.forEach((s, i) => out.push(`line_${i}: .byte ${[...encode(s), 255].join(', ')}   ; ${s}`));
for (const [label, s] of Object.entries(LABELS)) out.push(`${label}: .byte ${[...encode(s), 255].join(', ')}   ; ${s}`);

out.push('', '; top-down tiles (tile 0 = empty: the open-ground CLS colour shows through)', 'tiles_top:', '    .fill 32');
for (const [n, a] of TOP_TILES) out.push(`; ${n}`, ...sprite(a));
out.push('', '; cell patterns: 16 tile indices per cell type (4 rows of 4); the variant bit swaps rows 0-1 with 2-3', 'patterns:');
CELLS.forEach((c) => out.push(`    .byte ${patternBytes(c.pattern).join(', ')}   ; ${c.ch} ${c.name}`));
out.push('', '; the map screen: fill colour and symbol per cell type', `map_fill: .byte ${CELLS.map((c) => c.fill).join(', ')}`, `map_sym:  .byte ${CELLS.map((c) => c.sym).join(', ')}`);
out.push('', '; the course: start, controls 1..5, goal as (column, row) bytes', `course: .byte ${COURSE.flat().join(', ')}`);

out.push('', '; side-view tiles', 'tiles_side:', '    .fill 32');
for (const [n, a] of SIDE_TILES) out.push(`; ${n}`, ...sprite(a));
out.push('', '; the side-view scene, column-major (side[col * SIDE_ROWS + row]): one MAP call per column', 'side_map:');
for (let c = 0; c < SIDE[0]!.length; c++) out.push(`    .byte ${SIDE.map((row, r) => sideIndex(row[c]!, c, r)).join(', ')}   ; column ${c}`);

out.push('', '; sprites');
for (const [n, a] of Object.entries(SPRITES)) out.push(`${n}:`, ...sprite(a));

out.push('', '.xdata', '; level 1-1: one byte per cell, row-major (cells[row * LV_W + col]), packed', 'cells_1_1:', '.pack');
for (let r = 0; r < H; r++) out.push(`    .byte ${cells.slice(r * W, r * W + W).join(', ')}   ; ${MAP_1_1[r]}`);
out.push('.endpack', '');
writeFileSync(join(HERE, 'art.gen.asm'), out.join('\n'));

// the sketch for DESIGN.md: the cell map with the course on top (S start, 1-5 controls, M goal)
const sketch = MAP_1_1.map((r) => [...r]);
COURSE.forEach(([c, r], i) => (sketch[r]![c] = i === 0 ? 'S' : i === COURSE.length - 1 ? 'M' : String(i)));
const ruler = '    ' + Array.from({ length: W }, (_, c) => (c % 4 === 0 ? String(c / 4 + 1) : ' ')).join('');
const txt = [ruler, ...sketch.map((r, i) => `${String(i).padStart(2)}${i % 3 === 0 ? ' >' : '  '}${r.join('')}`)];
writeFileSync(join(HERE, 'map-1-1.txt'), txt.join('\n') + '\n');
console.log(`art.gen.asm: ${ORDER.length} glyphs, ${TOP_TILES.length} top tiles, ${CELLS.length} cell types, ${SIDE_TILES.length} side tiles, map ${W}x${H}`);
