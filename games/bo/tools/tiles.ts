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
  /** the ground colour of the world map */
  ground: number;
  /** symbolic colours for STRUCT_ART */
  sym: Record<string, string>;
  /** structural art drawn differently in this world (same shape for collision, e.g. stairs for 45° slopes) */
  structArt?: Record<number, Art>;
  /** world-specific tiles: code -> [class, shape, art] */
  tiles: Record<number, [ClassName, number, Art]>;
  /** names of the world-specific tiles (a name used by several worlds must have the same code in all) */
  names: Record<string, number>;
  /** the parallax strip: 16 x 3 tile codes (0 = sky), drawn at half the camera speed */
  strip: number[][];
}

const W = (i: number) => T.W0 + i;
const row16 = (code: number) => Array.from({ length: 16 }, () => code);
// shared art (same pattern and colours in several worlds)
const ART_DIRT: Art = ['44444444', '44414444', '44444441', '44444444', '41444444', '44444444', '44444144', '44444444'];
const ART_HEDGE: Art = ['5.b.5..b', '.5b.55b.', 'b55.b5.5', '.5..5b..', '5b.5..55', '.5b5.b5.', 'b..5b..5', '.55..b5.'];
const ART_TRUNK: Art = ['...44...', '...44...', '...44...', '..4444..', '...44...', '...44...', '...44...', '..4444..'];

/** World 1 HEMMA — a sunny villa street: falu-red houses, green lawns, grey asphalt. */
const HEMMA: World = {
  name: 'HEMMA',
  sky: 13,
  ground: 11,
  sym: { g: 'a', h: '3', k: '7', w: 'e', v: '9', u: '4', s: 'a', t: '7', r: '3' },
  tiles: {
    [W(0)]: ['SOLID', 0, ['5bb5bbb5', 'bbbbbbbb', 'b5bbb5bb', '44b444b4', '44444444', '44414444', '44444441', '14444444']], // grass
    [W(1)]: ['SOLID', 0, ART_DIRT], // dirt
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
    [W(17)]: ['EMPTY', 0, ART_HEDGE], // sparse hedge (foreground)
    [W(18)]: ['EMPTY', 0, ['77777777', '7aaaaaa7', '7a7777a7', '7aaaaaa7', '7a7777a7', '7aaaaaa7', '7a7777a7', '7aaaaaa7']], // garage door
    [W(19)]: ['ONEWAY', 0, ['33333333', '77777777', '7a7a7a7a', '77777777', '........', '........', '........', '........']], // garage roof
    [W(20)]: ['EMPTY', 0, ['77777777', '7a777777', '77777777', '777777a7', '77777777', '77a77777', '77777777', '77777777']], // garage wall
    [W(21)]: ['EMPTY', 0, ART_TRUNK], // trunk
    [W(22)]: ['ONEWAY', 0, ['.bbbbbb.', 'bb5bbb5b', 'b5bb5bbb', '5bbbb5b5', '.5b5bb5.', '..5555..', '........', '........']], // tree crown (one-way)
  },
  names: {
    GRASS: W(0), DIRT: W(1), BIN_TOP: W(2), BIN: W(3), WALL: W(4), WINDOW: W(5), DOOR_T: W(6), DOOR_B: W(7),
    ROOF_L: W(8), ROOF_M: W(9), ROOF_R: W(10), CORNER_L: W(11), CORNER_R: W(12), FENCE_T: W(13), FENCE: W(14),
    STRIP_T: W(15), STRIP: W(16), HEDGE: W(17), GARAGE_DOOR: W(18), GARAGE_ROOF: W(19), GARAGE_WALL: W(20),
    TRUNK: W(21), CROWN: W(22),
  },
  strip: [row16(W(15)), row16(W(16)), row16(W(16))],
};

/** World 2 SKOGEN — the forest in warm evening light: moss, brown earth, dark spruces, fresh-cut wood. */
const SKOGEN: World = {
  name: 'SKOGEN',
  sky: 12,
  ground: 5,
  sym: { g: 'b', h: '4', k: '1', w: 'c', v: '9', u: '4', s: 'a', t: '7', r: '5' },
  tiles: {
    [W(0)]: ['SOLID', 0, ['bbbbbbbb', 'b5bb5bb5', '55555555', '45544554', '44444444', '44414444', '44444441', '14444444']], // moss (alt ground)
    [W(1)]: ['SOLID', 0, ART_DIRT], // earth
    [W(2)]: ['SOLID', 0, ['.cccccc.', 'c999999c', 'c9cccc9c', 'c9c99c9c', 'c9cccc9c', 'c999999c', '4cccccc4', '44444444']], // stump top
    [W(3)]: ['SOLID', 0, ['41444414', '44414444', '14444441', '44144144', '44444414', '41444144', '44414444', '14441444']], // stump bark
    [W(4)]: ['EMPTY', 0, ['........', '........', '........', '........', '.....4..', '...44.4.', '.44...44', '4.......']], // root
    [W(5)]: ['ONEWAY', 0, ['cccccccc', '99999999', '94999949', '44444444', '.4....4.', '.4....4.', '........', '........']], // bridge
    [W(6)]: ['EMPTY', 0, ['..4444..', '..4994..', '..4444..', '..4994..', '..4444..', '..4994..', '..4444..', '..4994..']], // bridge post
    [W(7)]: ['SOLID', 0, ['..aaaa..', '.aaa77a.', 'aa77777a', 'a7777773', '77777733', '77737773', '37777733', '.333333.']], // stone
    [W(8)]: ['EMPTY', 0, ['........', '..6666..', '.66f666.', '6f6666f6', '..ffff..', '...ff...', '...ff...', '..ffff..']], // mushroom
    [W(9)]: ['EMPTY', 0, ['........', '.b...b..', '..b.b..b', 'b..bb.b.', '.b.bb..b', '..bbbbb.', '...b5b..', '...555..']], // fern
    [W(10)]: ['EMPTY', 0, ['..4444..', '.4....4.', '99999999', '9c9c9c9c', '99999999', '9c9c9c9c', '99999999', '.999999.']], // picnic basket
    [W(11)]: ['EMPTY', 0, ['.b..b.b.', '.bb.bbb.', '..b..b..', '.99.99..', '.99.99..', '.99..99.', '..9..9..', '44444444']], // carrots
    [W(12)]: ['EMPTY', 0, ['...55...', '..5555..', '..55b5..', '.555555.', '.5b5555.', '55555b55', '..5555..', '.555555.']], // spruce top
    [W(13)]: ['EMPTY', 0, ['55b55555', '55555b55', '..5445..', '.555555.', '55b55555', '55555b55', '...44...', '...44...']], // spruce
    [W(15)]: ['EMPTY', 0, ['...5....', '..555..5', '..555.55', '.5555555', '.5555555', '55555555', '55555555', '55555555']], // spruces (parallax)
    [W(16)]: ['EMPTY', 0, ['55555555', '55515555', '55555555', '51555555', '55555515', '55555555', '55155555', '55555555']], // forest (parallax)
    [W(17)]: ['EMPTY', 0, ART_HEDGE], // sparse bush (foreground)
    [W(21)]: ['EMPTY', 0, ART_TRUNK], // trunk
    [W(22)]: ['ONEWAY', 0, ['.555555.', '55b555b5', '5b55b555', 'b5555b5b', '.5b5bb5.', '..5555..', '........', '........']], // crown (one-way)

    [W(14)]: ['EMPTY', 0, ['.4444444', '4c999999', 'c9c99999', 'c9c99999', '4c999999', '.4444444', '........', '........']], // log, left end (moving platform)
    [W(18)]: ['EMPTY', 0, ['44444444', '99999999', '99949999', '99999999', '99999499', '44444444', '........', '........']], // log
    [W(19)]: ['EMPTY', 0, ['4444444.', '99999994', '99999949', '99999949', '99999994', '4444444.', '........', '........']], // log, right end
  },
  names: {
    GRASS: W(0), DIRT: W(1), STUMP_T: W(2), STUMP: W(3), ROOT: W(4), BRIDGE: W(5), BRIDGE_POST: W(6), STONE: W(7),
    MUSHROOM: W(8), FERN: W(9), BASKET: W(10), CARROTS: W(11), SPRUCE_T: W(12), SPRUCE: W(13), LOG_L: W(14),
    STRIP_T: W(15), STRIP: W(16), HEDGE: W(17), LOG_M: W(18), LOG_R: W(19), TRUNK: W(21), CROWN: W(22),
  },
  strip: [row16(W(15)), row16(W(16)), row16(W(16))],
};

/** World 3 STADEN — the city at dusk: navy sky, a lit skyline, light pavement, brick, blue metal ramps. */
const STADEN: World = {
  name: 'STADEN',
  sky: 2,
  ground: 7,
  sym: { g: 'a', h: '7', k: '3', w: 'd', v: '8', u: '2', s: '9', t: '6', r: '1' },
  structArt: {
    [T.S45U]: ['......gg', '......hh', '....gghh', '....hhhh', '..gghhhh', '..hhhhhh', 'gghhhhhh', 'hhhhhhhh'], // stairs
    [T.S45D]: ['gg......', 'hh......', 'hhgg....', 'hhhh....', 'hhhhgg..', 'hhhhhh..', 'hhhhhhgg', 'hhhhhhhh'],
  },
  tiles: {
    [W(0)]: ['SOLID', 0, ['aaaaaaaa', '33333333', '33333333', 'ee333ee3', '33333333', '33303333', '33333333', '30333333']], // road (alt ground)
    [W(1)]: ['SOLID', 0, ['33333333', '33303333', '33333333', '33333303', '33333333', '30333333', '33333333', '33330333']], // road fill
    [W(2)]: ['EMPTY', 0, ['66696669', '11111111', '69666966', '11111111', '66696669', '11111111', '69666966', '11111111']], // brick
    [W(3)]: ['EMPTY', 0, ['11111111', '1dfdddd1', '1fddddd1', '1dddddd1', '1ddddfd1', '1dddfdd1', '1dddddd1', '11111111']], // shop window
    [W(4)]: ['EMPTY', 0, ['11111111', '14444441', '14dddd41', '14dddd41', '14444441', '14449441', '14444441', '14444441']], // shop door
    [W(5)]: ['ONEWAY', 0, ['ff66ff66', 'ff66ff66', 'ff66ff66', '6.f.6.f.', '........', '........', '........', '........']], // awning
    [W(6)]: ['RAIL', 0, ['99999999', '44444444', '.4....4.', '.4....4.', '.4....4.', '.4....4.', '.4....4.', '44....44']], // bench (grind)
    [W(7)]: ['ONEWAY', 0, ['....6666', '...6dddd', '..6ddddd', '.6dddddd', '66666666', '66666666', '66666666', '66666666']], // car roof L
    [W(8)]: ['ONEWAY', 0, ['66666666', 'dd6ddddd', 'dd6ddddd', 'dd6ddddd', '66666666', '66666666', '66666666', '66666666']], // car roof
    [W(9)]: ['ONEWAY', 0, ['6666....', 'ddd66...', 'dddd66..', 'ddddd66.', '66666666', '66666666', '66666666', '66666666']], // car roof R
    [W(10)]: ['SOLID', 0, ['66666666', '66666666', '66666666', '66666666', '66333666', '.333a33.', '.33aa33.', '..3333..']], // car body L
    [W(11)]: ['SOLID', 0, ['66666666', '66666666', '66666666', '66666666', '66666666', '66666666', '........', '........']], // car body
    [W(12)]: ['SOLID', 0, ['66666666', '66666666', '66666666', '66666666', '66633366', '.33a333.', '.33aa33.', '..3333..']], // car body R
    [W(13)]: ['EMPTY', 0, ['..eeee..', '.eeffee.', '..eeee..', '...77...', '...77...', '...77...', '...77...', '...77...']], // lamp top
    [W(14)]: ['EMPTY', 0, ['...77...', '...77...', '...77...', '...77...', '...77...', '...77...', '...77...', '..7777..']], // lamp post
    [W(15)]: ['EMPTY', 0, ['........', '.11.....', '.11.....', '.1e..111', '111..111', '111.11e1', '1e1.1111', '11111111']], // skyline top (parallax)
    [W(16)]: ['EMPTY', 0, ['11111111', '111111e1', '11111111', '1e111111', '11111111', '11111111', '1111e111', '11111111']], // skyline (parallax)
    [W(17)]: ['EMPTY', 0, ART_HEDGE], // planter hedge (foreground)
    [W(18)]: ['ONEWAY', 0, ['99999999', '44444444', '.a....a.', '.a....a.', '..a..a..', '...aa...', '..a..a..', '.a....a.']], // scaffold plank
    [W(19)]: ['EMPTY', 0, ['.a....a.', '.a....a.', '..a..a..', '...aa...', '..a..a..', '.a....a.', '.a....a.', '.a....a.']], // scaffold
    [W(20)]: ['EMPTY', 0, ['........', '...99...', '...ff...', '..9999..', '..ffff..', '.999999.', '.999999.', '33333333']], // cone
    [W(21)]: ['EMPTY', 0, ART_TRUNK], // trunk
    [W(22)]: ['ONEWAY', 0, ['.bbbbbb.', 'bb5bbb5b', 'b5bb5bbb', '5bbbb5b5', '.5b5bb5.', '..5555..', '........', '........']], // street tree crown
    [W(23)]: ['RAIL', 0, ['aaaaaaaa', '77777777', '33333333', '........', '........', '........', '........', '........']], // pipe (grind)
    [W(24)]: ['RAIL', 0, ['eeeeeeee', 'e.e.e.e.', '.e.e.e.e', 'eeeeeeee', '........', '........', '........', '........']], // crane arm (grind)
    [W(25)]: ['EMPTY', 0, ['.888888.', '8ffffff8', '8f8ff8f8', '8ffffff8', '.888888.', '...77...', '...77...', '...77...']], // bus stop
    [W(26)]: ['EMPTY', 0, ['66696669', '11111111', '1eeeeee1', '1eeeeee1', '1e1ee1e1', '1eeeeee1', '11111111', '69666966']], // lit window
    [W(27)]: ['EMPTY', 0, ['.eeeeeee', 'e3333333', 'e3dd3dd3', 'e3dd3dd3', 'e3333333', 'eeeeeeee', 'eeeeeeee', 'eeeeeeee']], // bus rear (moving platform)
    [W(28)]: ['EMPTY', 0, ['eeeeeeee', '33333333', '3dd3dd3d', '3dd3dd3d', '33333333', 'eeeeeeee', 'eeeeeeee', 'eeeeeeee']], // bus windows
    [W(29)]: ['EMPTY', 0, ['eeeeeeee', '3333333e', '3dd3ddde', '3dd3ddde', '3333333e', 'eeeeeeee', 'eeeeeee6', 'eeeeeeee']], // bus front
    [W(30)]: ['EMPTY', 0, ['eeeeeeee', 'eeeeeeee', 'ee3333ee', 'e300003e', '.300003.', '.300003.', '..3333..', '........']], // bus wheel
    [W(31)]: ['EMPTY', 0, ['eeeeeeee', 'eeeeeeee', '33333333', 'eeeeeeee', 'eeeeeeee', '........', '........', '........']], // bus side
  },
  names: {
    GRASS: W(0), DIRT: W(1), BRICK: W(2), SHOP_WIN: W(3), SHOP_DOOR: W(4), AWNING: W(5), BENCH: W(6),
    CARR_L: W(7), CARR_M: W(8), CARR_R: W(9), CARB_L: W(10), CARB_M: W(11), CARB_R: W(12), LAMP_T: W(13), LAMP: W(14),
    STRIP_T: W(15), STRIP: W(16), HEDGE: W(17), SCAFF: W(18), SCAFF_POST: W(19), CONE: W(20), TRUNK: W(21), CROWN: W(22),
    PIPE: W(23), CRANE: W(24), BUSSTOP: W(25), LITWIN: W(26), BUS_R: W(27), BUS_W: W(28), BUS_F: W(29),
    BUS_WH: W(30), BUS_B: W(31),
  },
  strip: [row16(W(15)), row16(W(16)), row16(W(16))],
};

/** World 4 SNÖ — winter: a clear blue sky, white snow with grey specks, snowy mountains, icy blue ramps. */
const SNO: World = {
  name: 'SNÖ',
  sky: 8,
  ground: 15,
  sym: { g: 'f', h: 'f', k: 'a', w: 'f', v: 'd', u: '8', s: 'f', t: 'a', r: '7' },
  tiles: {
    [W(0)]: ['SOLID', 0, ['ffffffff', 'fdfffdff', 'dddddddd', 'd8dddd8d', 'dddddddd', '8ddd8ddd', 'dddddddd', 'dd8ddddd']], // packed snow (alt ground)
    [W(1)]: ['SOLID', 0, ['ffffffff', 'fffaffff', 'ffffffaf', 'ffffffff', 'faffffff', 'ffffffff', 'ffffafff', 'ffffffff']], // snow fill
    [W(2)]: ['EMPTY', 0, ['........', '...ff...', '..ffff..', '.ffaaff.', 'ffaaaaff', 'ffffffff', '........', '........']], // snow heap (decor)
    [W(3)]: ['EMPTY', 0, ['...ff...', '..f55f..', '..5f55..', '.f555f5.', '.55f555.', 'f5555f55', '...44...', '...44...']], // snowy spruce top
    [W(4)]: ['EMPTY', 0, ['.f55f55.', 'f555555f', '55f555f5', '...44...', '...44...', '...44...', '...44...', '..4444..']], // snowy spruce
    [W(5)]: ['EMPTY', 0, ['...77...', '...77...', '...77...', '...77...', '...77...', '...77...', '...77...', '..7777..']], // lift pole
    [W(6)]: ['EMPTY', 0, ['3.......', '.33.....', '...33...', '.....33.', '.......3', '........', '........', '........']], // lift cable
    [W(7)]: ['EMPTY', 0, ['......00', '......0.', '......0.', '......0.', '......0.', '......0.', '......0.', '666666..']], // chair hanger L (moving platform)
    [W(8)]: ['EMPTY', 0, ['00......', '.0......', '.0......', '.0......', '.0......', '.0......', '.0......', '..666666']], // chair hanger R
    [W(9)]: ['EMPTY', 0, ['66666666', '6eeeeee6', '66666666', '.0....0.', '........', '........', '........', '........']], // chair seat
    [W(10)]: ['EMPTY', 0, ['....66..', '...6666.', '..666666', '.6666666', '66666666', '6ffff6f6', '6f22f6f6', '6f22f666']], // cabin roof/wall
    [W(11)]: ['EMPTY', 0, ['6f22f666', '6f22f6f6', '6f22f6f6', '6ffff666', '66666666', '66666666', '66666666', '66666666']], // cabin wall
    [W(12)]: ['EMPTY', 0, ['f.f..f.f', '.f....f.', '........', '........', '........', '........', '........', '........']], // icicles
    [W(13)]: ['ONEWAY', 0, ['ffffffff', 'cccccccc', '9c9c9c9c', '99999999', '........', '........', '........', '........']], // snowy plank
    [W(14)]: ['EMPTY', 0, ['........', '..666...', '..666...', '666666..', '..ff....', '.ffff...', 'ffffff..', 'ffffff..']], // flag on a snow pile
    [W(15)]: ['EMPTY', 0, ['....f...', '...faf..', '..faaaf.', '.faaaaaf', 'faaaaaaa', 'aaaaaaaa', 'aaaaaaaa', 'aaaaaaaa']], // mountains (parallax)
    [W(16)]: ['EMPTY', 0, ['aaaaaaaa', 'aaa7aaaa', 'aaaaaaaa', 'a7aaaaa7', 'aaaaaaaa', 'aaaaa7aa', 'aaaaaaaa', 'aaaaaaaa']], // mountain (parallax)
    [W(17)]: ['EMPTY', 0, ['f.d.f..d', '.fd.ffd.', 'dff.df.f', '.f..fd..', 'fd.f..ff', '.fdf.df.', 'd..fd..f', '.ff..df.']], // snowy bush (foreground)
    [W(21)]: ['EMPTY', 0, ART_TRUNK], // trunk
    [W(22)]: ['ONEWAY', 0, ['.ffffff.', 'ff5fff5f', 'f5ff5fff', '5ffff5f5', '.5f5ff5.', '..5555..', '........', '........']], // snowy crown (one-way)
  },
  names: {
    GRASS: W(0), DIRT: W(1), SNOWHEAP: W(2), SPRUCE_ST: W(3), SPRUCE_S: W(4), LIFTPOLE: W(5), CABLE: W(6),
    CHAIR_TL: W(7), CHAIR_TR: W(8), CHAIR: W(9), CABIN_T: W(10), CABIN: W(11), ICICLES: W(12), SNOWPLANK: W(13),
    SNOWFLAG: W(14), STRIP_T: W(15), STRIP: W(16), HEDGE: W(17), TRUNK: W(21), CROWN: W(22),
  },
  strip: [row16(W(15)), row16(W(16)), row16(W(16))],
};

/** World 5 GODISLANDET — candy land at a purple dusk: white frosting on peach cake, red sprinkles, biscuit ramps,
 *  lollipops, licorice, a candy castle on the horizon. */
const GODIS: World = {
  name: 'GODISLANDET',
  sky: 1,
  ground: 12,
  sym: { g: 'f', h: 'c', k: '6', w: 'e', v: '9', u: '4', s: 'f', t: 'c', r: '6' },
  tiles: {
    [W(0)]: ['SOLID', 0, ['ffffffff', 'f6ff66ff', 'cccccccc', 'c4cccc4c', 'cccccccc', '4ccc4ccc', 'cccccccc', 'cc4ccccc']], // frosted cake (alt ground)
    [W(1)]: ['SOLID', 0, ['cccccccc', 'cc6ccccc', 'cccccccc', 'cccccc6c', 'cccccccc', 'c6cccccc', 'cccccccc', 'ccccc6cc']], // cake fill
    [W(2)]: ['ONEWAY', 0, ['..6666..', '.66ff66.', '66f66f66', '6f6ff6f6', '66f66f66', '.66ff66.', '..6666..', '........']], // lollipop (one-way top)
    [W(3)]: ['EMPTY', 0, ['...ff...', '...ff...', '...ff...', '...ff...', '...ff...', '...ff...', '...ff...', '...ff...']], // lollipop stick
    [W(4)]: ['EMPTY', 0, ['........', '........', '...ee...', '..eeee..', '.eefeee.', '.eeeeee.', 'eeeeeeee', 'eeeeeeee']], // gumdrop
    [W(5)]: ['RAIL', 0, ['11111111', '10101010', '11111111', '........', '........', '........', '........', '........']], // licorice rail (grind)
    [W(6)]: ['EMPTY', 0, ['f6ff6ff6', '6ff6ff6f', 'ff6ff6ff', 'f6ff6ff6', '6ff6ff6f', 'ff6ff6ff', 'f6ff6ff6', '6ff6ff6f']], // candy cane wall
    [W(7)]: ['EMPTY', 0, ['.ffffff.', 'ffcffcff', 'fffffcff', 'fcffffff', 'ffffcfff', 'fffffffc', 'cffffcff', '.ffffff.']], // marshmallow raft L (moving platform)
    [W(8)]: ['EMPTY', 0, ['ffffffff', 'ffcffcff', 'fffffcff', 'fcffffff', 'ffffcfff', 'fffffffc', 'cffffcff', 'ffffffff']], // marshmallow raft
    [W(9)]: ['EMPTY', 0, ['.ffffff.', 'ffcffcff', 'fffffcff', 'fcffffff', 'ffffcfff', 'fffffffc', 'cffffcff', '.ffffff.']], // marshmallow raft R
    [W(10)]: ['EMPTY', 0, ['4.4..4.4', '44444444', '14141441', '44444444', '14141414', '.444444.', '..4444..', '........']], // the seagull's nest
    [W(11)]: ['ONEWAY', 0, ['eeeeeeee', '99999999', '9e9e9e9e', '44444444', '........', '........', '........', '........']], // biscuit plank
    [W(12)]: ['EMPTY', 0, ['..cc....', '.cccc...', 'ccffcc..', '.cccc...', '..cc....', '...4....', '...4....', '..444...']], // cotton candy (decor)
    [W(15)]: ['EMPTY', 0, ['..6..6..', '.666666.', '.6f66f6.', '.666666.', '66666666', '6f6666f6', '66666666', '66666666']], // candy castle (parallax)
    [W(16)]: ['EMPTY', 0, ['66666666', '66f66666', '66666666', '666666f6', '66666666', '6f666666', '66666666', '66666666']], // castle wall (parallax)
    [W(17)]: ['EMPTY', 0, ['c.f.c..f', '.cf.ccf.', 'fcc.fc.c', '.c..cf..', 'cf.c..cc', '.cfc.fc.', 'f..cf..c', '.cc..fc.']], // cotton candy bush (foreground)
    [W(21)]: ['EMPTY', 0, ['...ff...', '...ff...', '...ff...', '..ffff..', '...ff...', '...ff...', '...ff...', '..ffff..']], // candy stick (trunk)
    [W(22)]: ['ONEWAY', 0, ['.cccccc.', 'cc6ccc6c', 'c6cc6ccc', '6cccc6c6', '.c6c6cc.', '..cccc..', '........', '........']], // cotton candy crown (one-way)
  },
  names: {
    GRASS: W(0), DIRT: W(1), LOLLI: W(2), LOLLI_S: W(3), GUMDROP: W(4), LIQRAIL: W(5), CANEWALL: W(6),
    RAFT_L: W(7), RAFT_M: W(8), RAFT_R: W(9), NEST: W(10), BISCUIT: W(11), CANDYFLOSS: W(12),
    STRIP_T: W(15), STRIP: W(16), HEDGE: W(17), TRUNK: W(21), CROWN: W(22),
  },
  strip: [row16(W(15)), row16(W(16)), row16(W(16))],
};

export const WORLDS: World[] = [HEMMA, SKOGEN, STADEN, SNO, GODIS];

/** World-specific tile names of every world, merged (a name means the same code in every world that has it). */
export const WTILE: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const w of WORLDS) {
    for (const [name, code] of Object.entries(w.names)) {
      if (out[name] !== undefined && out[name] !== code) throw new Error(`tile name ${name}: code ${out[name]} in one world, ${code} in ${w.name}`);
      if (!w.tiles[code]) throw new Error(`${w.name}: ${name} names code ${code}, which has no art`);
      out[name] = code;
    }
  }
  return out;
})();

/** True if world `w` (0-based) has a tile called `name` (structural/common names exist everywhere). */
export function worldHasTile(w: number, name: string): boolean {
  return (T as Record<string, number>)[name] !== undefined || WORLDS[w]!.names[name] !== undefined;
}

// ---- encoding -----------------------------------------------------------------------------------
const HEX = '0123456789abcdef';

/** The art of `code` in world `w` as 64 palette values (0 = transparent). */
export function tilePixels(w: number, code: number): number[] | null {
  const world = WORLDS[w]!;
  let art: Art | undefined;
  const struct = world.structArt?.[code] ?? STRUCT_ART[code];
  if (struct) art = struct.map((row) => row.replace(/[a-z]/g, (c) => (HEX.includes(c) ? c : world.sym[c] ?? c)));
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

/** Layout of a world block (unpacked into RAM when the world changes; DESIGN.md §14.4). */
export const WB = { ENT: 0, ATTR: (STRUCT_CODES.length + WORLD_CODES.length) * 3, STRIP: 0, SKY: 0, PAT: 0 };
WB.STRIP = WB.ATTR + WORLD_CODES.length;
WB.SKY = WB.STRIP + 48;
WB.PAT = WB.SKY + 2;
/** Pattern bytes >= LOCAL_PAT refer to the world block's own patterns. */
export const LOCAL_PAT = 128;

export function generateTiles(): string {
  type Enc = { code: number; palette: number[]; pattern: string } | null;
  const encode = (w: number, code: number): Enc => {
    const px = tilePixels(w, code);
    if (!px) return null;
    try {
      const { palette, pattern } = encodeTile(px);
      return { code, palette, pattern: pattern.join(',') };
    } catch (e) {
      throw new Error(`world ${w + 1} tile ${code}: ${(e as Error).message}`, { cause: e });
    }
  };
  const common = COMMON_CODES.map((c) => encode(0, c));
  const perWorld = WORLDS.map((_, w) => [...STRUCT_CODES, ...WORLD_CODES].map((c) => encode(w, c)));
  // a pattern is shared (ROM) if the common tiles or two worlds use it; otherwise it lives in its world's block
  const users = new Map<string, Set<number>>();
  const use = (p: string, who: number) => users.set(p, (users.get(p) ?? new Set()).add(who));
  common.forEach((e) => e && use(e.pattern, -1));
  perWorld.forEach((list, w) => list.forEach((e) => e && use(e.pattern, w)));
  const shared: string[] = [];
  for (const [p, who] of users) if (who.has(-1) || who.size > 1) shared.push(p);
  if (shared.length > LOCAL_PAT) throw new Error(`${shared.length} shared patterns, max ${LOCAL_PAT}`);
  const local: string[][] = WORLDS.map(() => []);
  const ref = (e: Enc, w: number): number => {
    if (!e) return 0;
    const s = shared.indexOf(e.pattern);
    if (s >= 0) return s;
    let i = local[w]!.indexOf(e.pattern);
    if (i < 0) i = local[w]!.push(e.pattern) - 1;
    if (i >= 256 - LOCAL_PAT) throw new Error(`world ${w + 1}: too many own patterns`);
    return LOCAL_PAT + i;
  };
  const entry = (e: Enc, w: number) => (e ? [ref(e, w), (e.palette[0]! << 4) | e.palette[1]!, (e.palette[2]! << 4) | e.palette[3]!] : [0, 0, 0]);
  const hex = (n: number) => `$${n.toString(16).padStart(2, '0')}`;
  const blocks = WORLDS.map((world, w) => {
    const bytes: number[] = [];
    perWorld[w]!.forEach((e) => bytes.push(...entry(e, w)));
    bytes.push(...WORLD_CODES.map((c) => attrOf(w, c)));
    world.strip.forEach((row) => bytes.push(...row));
    bytes.push(world.sky, 0);
    for (const p of local[w]!) bytes.push(...p.split(',').map(Number));
    if (bytes.length !== WB.PAT + local[w]!.length * 16) throw new Error('world block layout');
    return bytes;
  });
  const L: string[] = [
    '; GENERATED by games/bo/tools/tiles.ts — do not edit.',
    '; Tile classes and codes (DESIGN.md §14.3), height maps, tilesets at 2 bits per pixel. The common tiles and',
    '; the patterns several worlds share are in ROM; each world block (its tile entries, attributes, parallax strip,',
    '; sky and own patterns) is packed in xdata (ISA 2) and unpacked into RAM (wblk) when the world changes.',
    '',
    ...Object.entries(CLASS).map(([k, v]) => `C_${k} = ${v}`),
    ...Object.entries(T).map(([k, v]) => `T_${k} = ${v}`),
    ...Object.entries(WTILE).map(([k, v]) => `TW_${k} = ${v}`),
    `NUM_CODES = ${NUM_CODES}`,
    `NUM_STRUCT = ${STRUCT_CODES.length}`,
    `NUM_COMMON = ${COMMON_CODES.length}`,
    `NUM_WTILES = ${WORLD_CODES.length}`,
    `NUM_WORLDS = ${WORLDS.length}`,
    `WB_ATTR = ${WB.ATTR}`,
    `WB_STRIP = ${WB.STRIP}`,
    `WB_SKY = ${WB.SKY}`,
    `WB_PAT = ${WB.PAT}`,
    `WBLK_MAX = ${Math.max(...blocks.map((b) => b.length))}   ; the largest world block`,
    `LOCAL_PAT = ${LOCAL_PAT}`,
    '',
    '.data',
    'heightmaps:',
    ...HEIGHTMAPS.map((h) => `    .byte ${h.join(', ')}`),
    '; attributes of codes 0..63 (class | shape << 4)',
    'attr_fixed:',
  ];
  for (let c = 0; c < 64; c += 16) L.push(`    .byte ${Array.from({ length: 16 }, (_, i) => ATTR_FIXED[c + i] ?? 0).join(', ')}`);
  L.push('; tile entries: pattern index, palette (4 nibbles); the common codes 27.. (same in every world)');
  L.push('ts_common:', ...common.map((e, i) => `    .byte ${entry(e, 0).join(', ')}   ; ${COMMON_CODES[i]}`));
  L.push('; sky colour per world (also in the world block; this copy is for screens that show any world)');
  L.push('world_sky:', `    .byte ${WORLDS.map((w) => w.sky).join(', ')}`);
  L.push('world_ground:', `    .byte ${WORLDS.map((w) => w.ground).join(', ')}`);
  L.push('; the world blocks: far addresses (hi, lo)', 'world_blocks:');
  WORLDS.forEach((world, w) => L.push(`    .word wb_${w + 1} >> 16, wb_${w + 1} & $FFFF   ; ${world.name}`));
  L.push(`NUM_PATTERNS = ${shared.length}`, 'patterns:');
  shared.forEach((p, i) => L.push(`    .byte ${p.split(',').map((b) => hex(Number(b))).join(', ')}   ; ${i}`));
  L.push('', '.xdata');
  blocks.forEach((bytes, w) => {
    L.push(`wb_${w + 1}:   ; ${WORLDS[w]!.name}: ${bytes.length} bytes, ${local[w]!.length} own patterns`, '.pack');
    for (let i = 0; i < bytes.length; i += 24) L.push(`    .byte ${bytes.slice(i, i + 24).join(', ')}`);
    L.push('.endpack');
  });
  L.push('', '.data');
  return L.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const out = new URL('../tiles.gen.asm', import.meta.url);
  writeFileSync(out, generateTiles());
  console.log('wrote games/bo/tiles.gen.asm');
}
