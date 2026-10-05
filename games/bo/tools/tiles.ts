// Tile codes, tile classes and tile art for Bo's Skateäventyr (DESIGN.md §14.3–14.4).
// Writes ../tiles.gen.asm: the attribute table, the height maps, and every tileset at 2 bits per pixel with a
// 4-colour palette per tile. Pixel patterns are shared: a tile is (pattern index, palette), so a slope drawn once
// is recoloured for every world. Run: npx tsx games/bo/tools/tiles.ts (or npm run bo:gen).
import { writeFileSync } from 'node:fs';
import { isMain } from './util';

// ---- classes (low nibble of the attribute byte; the high nibble is the shape) -----------------------
export const CLASS = {
  EMPTY: 0, SOLID: 1, SLOPE: 2, RAMP: 3, ONEWAY: 4, RAIL: 5, HAZARD: 6, WEAK: 7,
  BOX: 8, BOUNCE: 9, BAR: 10, SAND: 11, ICE: 12, APPLE: 13, STAR: 14, PICKUP: 15,
} as const;
export type ClassName = keyof typeof CLASS;

/** Shapes = height-map index (SLOPE, RAMP, RAIL), star number (STAR) or pick-up kind (PICKUP). */
export const SHAPE = { FLAT: 0, U45: 1, D45: 2, U22LO: 3, U22HI: 4, D22HI: 5, D22LO: 6 } as const;
/** Height of the surface above the tile's bottom edge, per pixel column (1..8). */
export const HEIGHTMAPS: number[][] = [
  [8, 8, 8, 8, 8, 8, 8, 8],
  [1, 2, 3, 4, 5, 6, 7, 8],
  [8, 7, 6, 5, 4, 3, 2, 1],
  [1, 1, 2, 2, 3, 3, 4, 4],
  [5, 5, 6, 6, 7, 7, 8, 8],
  [8, 8, 7, 7, 6, 6, 5, 5],
  [4, 4, 3, 3, 2, 2, 1, 1],
];
export const PICKUP = { POMMES: 0, GODIS: 1, BIGAPPLE: 2, PART: 3 } as const;

// ---- tile codes ----------------------------------------------------------------------------------
// 1..26 structural (same meaning in every world, recoloured), 27..49 common items (same art everywhere),
// 64..95 world-specific (decor, alternative ground, parallax, foreground; class per world).
export const T = {
  TOP: 1, FILL: 2, S45U: 3, S45D: 4, S22U_LO: 5, S22U_HI: 6, S22D_HI: 7, S22D_LO: 8,
  SAND: 9, ICE: 10, PLAT_L: 11, PLAT_M: 12, PLAT_R: 13, BLOCK: 14, WEAK: 15, WATER_TOP: 16, WATER: 17,
  BOUNCE: 18, BAR: 19, R45U: 20, R45D: 21, R22U_LO: 22, R22U_HI: 23, R22D_HI: 24, R22D_LO: 25, RAMPFILL: 26,
  APPLE: 27, STAR1: 28, STAR2: 29, STAR3: 30, PART: 31, BOX: 32, RAIL: 33, RAILU: 34, RAILD: 35, POST: 36,
  SIGNPOST: 37, SIGN_R: 38, SIGN_A: 39, SIGN_B: 40, SIGN_D: 41, FLAG_TOP: 42, POLE: 43, GOAL_TOP: 44,
  POMMES: 45, GODIS: 46, BIGAPPLE: 47, FLAG_DONE: 48, CHOC_TOP: 49, CHOC: 50,
  W0: 64,
} as const;
export const NUM_CODES = 96;
export const STRUCT_CODES = Array.from({ length: 26 }, (_, i) => i + 1);
export const COMMON_CODES = Array.from({ length: T.CHOC - T.APPLE + 1 }, (_, i) => i + T.APPLE);
export const WORLD_CODES = Array.from({ length: 32 }, (_, i) => i + T.W0);

const A = (cls: ClassName, shape = 0) => CLASS[cls] | (shape << 4);

/** Attributes of codes 0..63 (the same in every world). */
export const ATTR_FIXED: Record<number, number> = {
  [T.TOP]: A('SOLID'), [T.FILL]: A('SOLID'),
  [T.S45U]: A('SLOPE', SHAPE.U45), [T.S45D]: A('SLOPE', SHAPE.D45),
  [T.S22U_LO]: A('SLOPE', SHAPE.U22LO), [T.S22U_HI]: A('SLOPE', SHAPE.U22HI),
  [T.S22D_HI]: A('SLOPE', SHAPE.D22HI), [T.S22D_LO]: A('SLOPE', SHAPE.D22LO),
  [T.SAND]: A('SAND'), [T.ICE]: A('ICE'),
  [T.PLAT_L]: A('ONEWAY'), [T.PLAT_M]: A('ONEWAY'), [T.PLAT_R]: A('ONEWAY'),
  [T.BLOCK]: A('SOLID'), [T.WEAK]: A('WEAK'), [T.WATER_TOP]: A('HAZARD'), [T.WATER]: A('HAZARD'),
  [T.BOUNCE]: A('BOUNCE'), [T.BAR]: A('BAR'),
  [T.R45U]: A('RAMP', SHAPE.U45), [T.R45D]: A('RAMP', SHAPE.D45),
  [T.R22U_LO]: A('RAMP', SHAPE.U22LO), [T.R22U_HI]: A('RAMP', SHAPE.U22HI),
  [T.R22D_HI]: A('RAMP', SHAPE.D22HI), [T.R22D_LO]: A('RAMP', SHAPE.D22LO), [T.RAMPFILL]: A('SOLID'),
  [T.APPLE]: A('APPLE'), [T.STAR1]: A('STAR', 0), [T.STAR2]: A('STAR', 1), [T.STAR3]: A('STAR', 2),
  [T.PART]: A('PICKUP', PICKUP.PART), [T.BOX]: A('BOX'),
  [T.RAIL]: A('RAIL', SHAPE.FLAT), [T.RAILU]: A('RAIL', SHAPE.U45), [T.RAILD]: A('RAIL', SHAPE.D45),
  [T.POMMES]: A('PICKUP', PICKUP.POMMES), [T.GODIS]: A('PICKUP', PICKUP.GODIS), [T.BIGAPPLE]: A('PICKUP', PICKUP.BIGAPPLE),
  [T.CHOC_TOP]: A('HAZARD'), [T.CHOC]: A('HAZARD'),
};

// ---- art -----------------------------------------------------------------------------------------
// 8 rows of 8 characters: '.' transparent, 0-f a palette colour, or a symbolic letter replaced per world
// (structural tiles). Each tile may use at most 4 distinct values (including '.').
type Art = string[];

/** Structural art with symbolic colours: g top edge, h ground main, k ground speck, w wood light,
 *  v wood mid, u wood dark, s stone light, t stone mid, r stone dark. */
const STRUCT_ART: Record<number, Art> = {
  [T.TOP]: ['gggggggg', 'kkkkkkkk', 'hhhhhhhh', 'hhhkhhhh', 'hhhhhhhh', 'hhhhhhkh', 'hkhhhhhh', 'hhhhhhhh'],
  [T.FILL]: ['hhhhhhhh', 'hhhkhhhh', 'hhhhhhhh', 'hhhhhhkh', 'hhhhhhhh', 'hkhhhhhh', 'hhhhhhhh', 'hhhhhhhh'],
  [T.S45U]: ['.......g', '......gh', '.....ghh', '....ghhh', '...ghhhh', '..ghhhhh', '.ghhhkhh', 'ghhhhhhh'],
  [T.S45D]: ['g.......', 'hg......', 'hhg.....', 'hhhg....', 'hhhhg...', 'hhhhhg..', 'hhkhhhg.', 'hhhhhhhg'],
  [T.S22U_LO]: ['........', '........', '........', '........', '......gg', '....gghh', '..gghhhh', 'gghhhhhh'],
  [T.S22U_HI]: ['......gg', '....gghh', '..gghhhh', 'gghhhhhh', 'hhhhhhhh', 'hhhkhhhh', 'hhhhhhhh', 'hhhhhhkh'],
  [T.S22D_HI]: ['gg......', 'hhgg....', 'hhhhgg..', 'hhhhhhgg', 'hhhhhhhh', 'hhhkhhhh', 'hhhhhhhh', 'hkhhhhhh'],
  [T.S22D_LO]: ['........', '........', '........', '........', 'gg......', 'hhgg....', 'hhhhgg..', 'hhhhhhgg'],
  [T.PLAT_L]: ['.wwwwwww', 'wvvvvvvv', 'wvuvvvuv', '.uuuuuuu', '..u.....', '..u.....', '........', '........'],
  [T.PLAT_M]: ['wwwwwwww', 'vvvvvvvv', 'vuvvvuvv', 'uuuuuuuu', '........', '........', '........', '........'],
  [T.PLAT_R]: ['wwwwwww.', 'vvvvvvvw', 'vuvvvuvw', 'uuuuuuu.', '.....u..', '.....u..', '........', '........'],
  [T.BLOCK]: ['ssssssst', 'sttttttr', 'sttttttr', 'sttrtttr', 'sttttttr', 'sttttrtr', 'sttttttr', 'trrrrrrr'],
  [T.WEAK]: ['wvvvwvvu', 'vvvvwvvv', 'vvvvwvvv', 'vuvvvvuv', 'vvvvvvvv', 'vvvvvvvv', 'vuvvvvuv', 'uuuuuuuu'],
  [T.R45U]: ['.......w', '......wv', '.....wvv', '....wvvu', '...wvvvv', '..wvvuvv', '.wvvvvvv', 'wvuvvvvv'],
  [T.R45D]: ['w.......', 'vw......', 'vvw.....', 'uvvw....', 'vvvvw...', 'vvuvvw..', 'vvvvvvw.', 'vvvvvuvw'],
  [T.R22U_LO]: ['........', '........', '........', '........', '......ww', '....wwvv', '..wwvvuv', 'wwvvvvvv'],
  [T.R22U_HI]: ['......ww', '....wwvv', '..wwvvuv', 'wwvvvvvv', 'vvvvvvvv', 'vvuvvvvv', 'vvvvvvuv', 'vvvvvvvv'],
  [T.R22D_HI]: ['ww......', 'vvww....', 'vuvvww..', 'vvvvvvww', 'vvvvvvvv', 'vvvvvuvv', 'vuvvvvvv', 'vvvvvvvv'],
  [T.R22D_LO]: ['........', '........', '........', '........', 'ww......', 'vvww....', 'vuvvww..', 'vvvvvvww'],
  [T.RAMPFILL]: ['vvvvvvvv', 'vvuvvvvv', 'vvvvvvuv', 'vvvvvvvv', 'vuvvvvvv', 'vvvvuvvv', 'vvvvvvvv', 'uvvvvvvu'],
  [T.BAR]: ['wwwwwwww', 'vvvvvvvv', 'vuvvuvvu', 'uuuuuuuu', '........', '........', '........', '........'],
};
/** Structural art that is not recoloured. */
const FIXED_ART: Record<number, Art> = {
  [T.SAND]: ['eeeeeeee', 'e9eeee9e', '99999999', '94999949', '99999999', '49999499', '99999999', '99949999'],
  [T.ICE]: ['ffffffff', 'dfdddfdd', 'dddddddd', 'd8dddd8d', 'dddddddd', '8ddd8ddd', 'dddddddd', 'dd8ddddd'],
  [T.WATER_TOP]: ['........', '........', '.ff...ff', 'dddfdddd', '88dd88dd', '88888888', '8888d888', '88888888'],
  [T.WATER]: ['88888888', '88d88888', '88888888', '88888d88', '88888888', '8d888888', '88888888', '88888888'],
  [T.BOUNCE]: ['11111111', '18888881', '.a....a.', '..a..a..', '.a....a.', 'a......a', '.a....a.', 'a......a'],
  [T.APPLE]: ['....bb..', '...bb...', '.66b66..', '6f66666.', '6f66666.', '6666666.', '.66666..', '..6.66..'],
  [T.STAR1]: ['...ee...', '...ee...', 'eeeeeeee', '.eeeeee.', '..eeee..', '.eeeeee.', '.ee..ee.', '.e....e.'],
  [T.STAR2]: ['...ee...', '...ee...', 'eeeeeeee', '.eeeeee.', '..eeee..', '.eeeeee.', '.ee..ee.', '.e....e.'],
  [T.STAR3]: ['...ee...', '...ee...', 'eeeeeeee', '.eeeeee.', '..eeee..', '.eeeeee.', '.ee..ee.', '.e....e.'],
  [T.PART]: ['..3333..', '.3aaaa3.', '3aa33aa3', '3a3ff3a3', '3a3ff3a3', '3aa33aa3', '.3aaaa3.', '..3333..'],
  [T.BOX]: ['44444444', '4999e994', '49e99e94', '4999e994', '499e9994', '4999e994', '49999994', '44444444'],
  [T.RAIL]: ['aaaaaaaa', '77777777', '........', '........', '........', '........', '........', '........'],
  [T.RAILU]: ['......aa', '.....aa7', '....aa7.', '...aa7..', '..aa7...', '.aa7....', 'aa7.....', 'a7......'],
  [T.RAILD]: ['aa......', '7aa.....', '.7aa....', '..7aa...', '...7aa..', '....7aa.', '.....7aa', '......7a'],
  [T.POST]: ['...77...', '...77...', '...77...', '...77...', '...77...', '...77...', '...77...', '..7777..'],
  [T.SIGNPOST]: ['...44...', '...44...', '...44...', '...44...', '...44...', '...44...', '...44...', '..4444..'],
  [T.SIGN_R]: ['44444444', '4ffffff4', '4ff6fff4', '466666f4', '4ff6fff4', '4ffffff4', '44444444', '...44...'],
  [T.SIGN_A]: ['44444444', '4fff6ff4', '4ff666f4', '4f6f6f64', '4fff6ff4', '4fff6ff4', '44444444', '...44...'],
  [T.SIGN_B]: ['44444444', '4ffffff4', '4f8888f4', '4888f884', '4f8888f4', '4ffffff4', '44444444', '...44...'],
  [T.SIGN_D]: ['44444444', '4fff6ff4', '4fff6ff4', '4f6f6f64', '4ff666f4', '4fff6ff4', '44444444', '...44...'],
  [T.FLAG_TOP]: ['a66666..', 'a666666.', 'a66666..', 'a6666...', 'a.......', 'a.......', 'a.......', 'a.......'],
  [T.POLE]: ['a.......', 'a.......', 'a.......', 'a.......', 'a.......', 'a.......', 'a.......', '777.....'],
  [T.GOAL_TOP]: ['af1f1f1.', 'a1f1f1f.', 'af1f1f1.', 'a1f1f1f.', 'a.......', 'a.......', 'a.......', 'a.......'],
  [T.POMMES]: ['.e.e.e..', '.eeeee..', '.eeeee..', '6666666.', '66f6666.', '.66666..', '.66666..', '........'],
  [T.GODIS]: ['.c...c..', 'cfc.cfc.', '.ccccc..', '.cfffc..', '.cfcfc..', '.cfffc..', '.ccccc..', '........'],
  [T.BIGAPPLE]: ['...bb...', '..6bb...', '.666666.', '6ff66666', '6f666666', '66666666', '.666666.', '..6666..'],
  [T.FLAG_DONE]: ['abbbbb..', 'abbbbbb.', 'abbbbb..', 'abbbb...', 'a.......', 'a.......', 'a.......', 'a.......'],
  [T.CHOC_TOP]: ['........', '........', '.44...44', '41444144', '44114411', '44444444', '44414444', '44444444'],
  [T.CHOC]: ['44444444', '44144444', '44444444', '44444144', '44444444', '41444444', '44444444', '44444444'],
};

export interface World {
  name: string;
  sky: number;
  /** symbolic colours for STRUCT_ART */
  sym: Record<string, string>;
  /** world-specific tiles: code -> [class, shape, art] */
  tiles: Record<number, [ClassName, number, Art]>;
  /** the parallax strip: 16 x 3 tile codes (0 = sky), drawn at half the camera speed */
  strip: number[][];
}

const W = (i: number) => T.W0 + i;

/** World 1 HEMMA — a sunny villa street: falu-red houses, green lawns, grey asphalt. */
const HEMMA: World = {
  name: 'HEMMA',
  sky: 13,
  sym: { g: 'a', h: '3', k: '7', w: 'e', v: '9', u: '4', s: 'a', t: '7', r: '3' },
  tiles: {
    [W(0)]: ['SOLID', 0, ['5bb5bbb5', 'bbbbbbbb', 'b5bbb5bb', '44b444b4', '44444444', '44414444', '44444441', '14444444']], // grass
    [W(1)]: ['SOLID', 0, ['44444444', '44414444', '44444441', '44444444', '41444444', '44444444', '44444144', '44444444']], // dirt
    [W(2)]: ['SOLID', 0, ['.555555.', '5bbbbbb5', '55555555', '.5b5bb5.', '.5b5bb5.', '.5b5bb5.', '.5b5bb5.', '.5b5bb5.']], // bin lid
    [W(3)]: ['SOLID', 0, ['.5b5bb5.', '.5b5bb5.', '.5b5bb5.', '.5b5bb5.', '.5b5bb5.', '.5b5bb5.', '.555555.', '..3..3..']], // bin
    [W(4)]: ['EMPTY', 0, ['66616661', '66616661', '66616661', '66616661', '66616661', '66616661', '66616661', '66616661']], // wall
    [W(5)]: ['EMPTY', 0, ['6ffffff6', '6fddfdf6', '6fd8f8f6', '6ffffff6', '6fd8fdf6', '6f88f8f6', '6ffffff6', '66666666']], // window
    [W(6)]: ['EMPTY', 0, ['6ffffff6', '6f2222f6', '6f2dd2f6', '6f2dd2f6', '6f2222f6', '6f2222f6', '6f2222f6', '6f2222f6']], // door top
    [W(7)]: ['EMPTY', 0, ['6f2222f6', '6f22e2f6', '6f2222f6', '6f2222f6', '6f2222f6', '6f2222f6', '6f2222f6', '6ffffff6']], // door bottom
    [W(8)]: ['EMPTY', 0, ['.......3', '......11', '.....333', '....3333', '...11111', '..333333', '.3333333', '11111111']], // roof left
    [W(9)]: ['EMPTY', 0, ['33333333', '11111111', '33333333', '33333333', '11111111', '33333333', '33333333', '11111111']], // roof
    [W(10)]: ['EMPTY', 0, ['3.......', '11......', '333.....', '3333....', '11111...', '333333..', '3333333.', '11111111']], // roof right
    [W(11)]: ['EMPTY', 0, ['fff16661', 'fff16661', 'fff16661', 'fff16661', 'fff16661', 'fff16661', 'fff16661', 'fff16661']], // corner L
    [W(12)]: ['EMPTY', 0, ['66616fff', '66616fff', '66616fff', '66616fff', '66616fff', '66616fff', '66616fff', '66616fff']], // corner R
    [W(13)]: ['EMPTY', 0, ['.f...f..', 'ff..ff..', 'ffa.ffa.', 'ffa.ffa.', 'ffa.ffa.', 'ffffffff', 'ffa.ffa.', 'ffa.ffa.']], // fence top
    [W(14)]: ['EMPTY', 0, ['ffa.ffa.', 'ffa.ffa.', 'ffa.ffa.', 'ffffffff', 'ffa.ffa.', 'ffa.ffa.', 'ffa.ffa.', 'ffa.ffa.']], // fence
    [W(15)]: ['EMPTY', 0, ['.5..5..5', '55.555.5', '5555555b', '55b55555', '555555b5', '5b555555', '55555b55', '55555555']], // tree tops (parallax)
    [W(16)]: ['EMPTY', 0, ['55555555', '5555b555', '55555555', '555555b5', '55555555', '5b555555', '55555555', '55555555']], // trees (parallax)
    [W(17)]: ['EMPTY', 0, ['5.b.5..b', '.5b.55b.', 'b55.b5.5', '.5..5b..', '5b.5..55', '.5b5.b5.', 'b..5b..5', '.55..b5.']], // sparse hedge (foreground)
    [W(18)]: ['EMPTY', 0, ['77777777', '7aaaaaa7', '7a7777a7', '7aaaaaa7', '7a7777a7', '7aaaaaa7', '7a7777a7', '7aaaaaa7']], // garage door
    [W(19)]: ['ONEWAY', 0, ['33333333', '77777777', '7a7a7a7a', '77777777', '........', '........', '........', '........']], // garage roof
    [W(20)]: ['EMPTY', 0, ['77777777', '7a777777', '77777777', '777777a7', '77777777', '77a77777', '77777777', '77777777']], // garage wall
    [W(21)]: ['EMPTY', 0, ['...44...', '...44...', '...44...', '..4444..', '...44...', '...44...', '...44...', '..4444..']], // trunk
    [W(22)]: ['ONEWAY', 0, ['.bbbbbb.', 'bb5bbb5b', 'b5bb5bbb', '5bbbb5b5', '.5b5bb5.', '..5555..', '........', '........']], // tree crown (one-way)
  },
  strip: [
    [W(15), W(15), W(15), W(15), W(15), W(15), W(15), W(15), W(15), W(15), W(15), W(15), W(15), W(15), W(15), W(15)],
    [W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16)],
    [W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16), W(16)],
  ],
};

export const WORLDS: World[] = [HEMMA];

/** World-specific tile code names (used by the level format). */
export const WTILE: Record<string, number> = {
  GRASS: W(0), DIRT: W(1), BIN_TOP: W(2), BIN: W(3), WALL: W(4), WINDOW: W(5), DOOR_T: W(6), DOOR_B: W(7),
  ROOF_L: W(8), ROOF_M: W(9), ROOF_R: W(10), CORNER_L: W(11), CORNER_R: W(12), FENCE_T: W(13), FENCE: W(14),
  STRIP_T: W(15), STRIP: W(16), HEDGE: W(17), GARAGE_DOOR: W(18), GARAGE_ROOF: W(19), GARAGE_WALL: W(20),
  TRUNK: W(21), CROWN: W(22),
};

// ---- encoding -----------------------------------------------------------------------------------
const HEX = '0123456789abcdef';

/** The art of `code` in world `w` as 64 palette values (0 = transparent). */
export function tilePixels(w: number, code: number): number[] | null {
  const world = WORLDS[w]!;
  let art: Art | undefined;
  if (STRUCT_ART[code]) art = STRUCT_ART[code]!.map((row) => row.replace(/[a-z]/g, (c) => (HEX.includes(c) ? c : world.sym[c] ?? c)));
  else if (FIXED_ART[code]) art = FIXED_ART[code];
  else if (world.tiles[code]) art = world.tiles[code]![2];
  if (!art) return null;
  if (art.length !== 8) throw new Error(`tile ${code}: ${art.length} rows`);
  return art.flatMap((row) => {
    if (!/^[.0-9a-f]{8}$/.test(row)) throw new Error(`tile ${code} (world ${world.name}): bad row ${row}`);
    return [...row].map((c) => (c === '.' ? 0 : parseInt(c, 16)));
  });
}

/** 2bpp encoding: palette of up to 4 colours in order of first appearance; pattern = 16 bytes. */
export function encodeTile(px: number[]): { palette: number[]; pattern: number[] } {
  const palette: number[] = [];
  for (const c of px) if (!palette.includes(c)) palette.push(c);
  if (palette.length > 4) throw new Error(`tile uses ${palette.length} colours: ${palette.join(',')}`);
  while (palette.length < 4) palette.push(0);
  const pattern: number[] = [];
  for (let i = 0; i < 64; i += 4) {
    let b = 0;
    for (let k = 0; k < 4; k++) b = (b << 2) | palette.indexOf(px[i + k]!);
    pattern.push(b);
  }
  return { palette, pattern };
}

export function attrOf(w: number, code: number): number {
  if (code < T.W0) return ATTR_FIXED[code] ?? 0;
  const t = WORLDS[w]!.tiles[code];
  return t ? CLASS[t[0]] | (t[1] << 4) : 0;
}

export function generateTiles(): string {
  const patterns: string[] = [];
  const patIndex = (p: number[]) => {
    const key = p.join(',');
    let i = patterns.indexOf(key);
    if (i < 0) {
      i = patterns.length;
      patterns.push(key);
    }
    return i;
  };
  const entries = (w: number, codes: number[]) =>
    codes.map((code) => {
      const px = tilePixels(w, code);
      if (!px) return `0, 0, 0 ; ${code} (none)`;
      let enc;
      try {
        enc = encodeTile(px);
      } catch (e) {
        throw new Error(`world ${w + 1} tile ${code}: ${(e as Error).message}`, { cause: e });
      }
      const { palette, pattern } = enc;
      return `${patIndex(pattern)}, $${palette[0]!.toString(16)}${palette[1]!.toString(16)}, $${palette[2]!.toString(16)}${palette[3]!.toString(16)}   ; ${code}`;
    });
  const L: string[] = [
    '; GENERATED by games/bo/tools/tiles.ts — do not edit.',
    '; Tile classes and codes (DESIGN.md §14.3), height maps, tilesets at 2 bits per pixel.',
    '',
    ...Object.entries(CLASS).map(([k, v]) => `C_${k} = ${v}`),
    ...Object.entries(T).map(([k, v]) => `T_${k} = ${v}`),
    ...Object.entries(WTILE).map(([k, v]) => `TW_${k} = ${v}`),
    `NUM_CODES = ${NUM_CODES}`,
    `NUM_STRUCT = ${STRUCT_CODES.length}`,
    `NUM_COMMON = ${COMMON_CODES.length}`,
    `NUM_WTILES = ${WORLD_CODES.length}`,
    `NUM_WORLDS = ${WORLDS.length}`,
    '',
    '.data',
    'heightmaps:',
    ...HEIGHTMAPS.map((h) => `    .byte ${h.join(', ')}`),
    '; attributes of codes 0..63 (class | shape << 4)',
    'attr_fixed:',
  ];
  for (let c = 0; c < 64; c += 16) L.push(`    .byte ${Array.from({ length: 16 }, (_, i) => ATTR_FIXED[c + i] ?? 0).join(', ')}`);
  L.push('; per world: attributes of codes 64..95');
  WORLDS.forEach((_, w) => L.push(`attr_w${w + 1}:`, `    .byte ${WORLD_CODES.map((c) => attrOf(w, c)).join(', ')}`));
  L.push('attr_worlds:', `    .word ${WORLDS.map((_, w) => `attr_w${w + 1}`).join(', ')}`);
  L.push('world_sky:', `    .byte ${WORLDS.map((w) => w.sky).join(', ')}`);
  L.push('; tile entries: pattern index, palette (4 nibbles); codes 27.. (common), 1..26 and 64..95 per world');
  L.push('ts_common:', ...entries(0, COMMON_CODES).map((e) => `    .byte ${e}`));
  WORLDS.forEach((_, w) => {
    L.push(`ts_w${w + 1}:`, ...entries(w, [...STRUCT_CODES, ...WORLD_CODES]).map((e) => `    .byte ${e}`));
  });
  L.push('ts_worlds:', `    .word ${WORLDS.map((_, w) => `ts_w${w + 1}`).join(', ')}`);
  L.push('strips:', `    .word ${WORLDS.map((_, w) => `strip_w${w + 1}`).join(', ')}`);
  WORLDS.forEach((world, w) => L.push(`strip_w${w + 1}:`, ...world.strip.map((row) => `    .byte ${row.join(', ')}`)));
  L.push(`NUM_PATTERNS = ${patterns.length}`, 'patterns:');
  patterns.forEach((p, i) => L.push(`    .byte ${p.split(',').map((b) => `$${Number(b).toString(16).padStart(2, '0')}`).join(', ')}   ; ${i}`));
  return L.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const out = new URL('../tiles.gen.asm', import.meta.url);
  writeFileSync(out, generateTiles());
  console.log('wrote games/bo/tiles.gen.asm');
}
