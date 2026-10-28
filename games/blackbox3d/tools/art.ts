// BLACKBOX 3D art (DESIGN.md §4): wall textures drawn once with symbolic colours and recoloured per tileset, like
// BLACKBOX's tiles (games/blackbox/tools/tiles.ts), and the actors as 16x16 pictures. Original art.
// Shared design data: the generator (gen.ts) and the test oracle (test/bb3d) both read it.

/**
 * Per tileset (the zone groups of BLACKBOX): ceiling and floor colours and the symbolic colours p (main), q (dark),
 * r (light), s (accent), t (accent 2), as hex digits of the DawnBringer-16 palette. p..t are BLACKBOX's own.
 */
export const SETS = [
  { name: 'OFFICE', ceil: 2, floor: 1, p: '7', q: '3', r: 'a', s: '8', t: 'c' }, // zones 0-2
  { name: 'SECURITY', ceil: 1, floor: 3, p: 'a', q: '7', r: 'f', s: 'd', t: 'b' }, // zones 3-4
  { name: 'BUNKER', ceil: 1, floor: 3, p: '7', q: '4', r: 'c', s: '9', t: 'e' }, // zone 5
  { name: 'SERVER', ceil: 1, floor: 2, p: '8', q: '2', r: 'd', s: 'b', t: '6' }, // zones 6-7
] as const;
/** tileset of each zone 0..7 (as BLACKBOX's room records) */
export const ZONE_SET = [0, 0, 0, 1, 1, 2, 3, 3];

/**
 * Render textures, in render-code order (DESIGN.md §3.1). Full walls 1-7; low cells 8-11, whose front face is
 * texture rows 10-15 (the lower 6/16 of a wall) and whose top is the colour in LOW_TOP.
 */
export const TEX_NAMES = ['WALL', 'SHELF', 'CAMERA', 'LOCKED', 'VENT', 'LIFT', 'PORTAL', 'DESK', 'TERMINAL', 'CHARGER', 'CABLE'] as const;
export const FIRST_LOW = 8;
export const LOW_ROW = 10;

const LOW = (face: string[]) => [...Array(LOW_ROW).fill(face[0]!), ...face];

export const TEXTURES: Record<(typeof TEX_NAMES)[number], string[]> = {
  WALL: [
    'qqqqqqqqqqqqqqqq',
    'rrrrrrrqrrrrrrrq',
    'pppppppqpppppppq',
    'pppppppqpppppppq',
    'ppppqppqpppppppq',
    'pppppppqpppppppq',
    'pppppppqppppqppq',
    'pppppppqpppppppq',
    'pppppppqpppppppq',
    'pppppppqpppppppq',
    'ppqppppqpppppppq',
    'pppppppqpppppppq',
    'pppppppqpppqpppq',
    'pppppppqpppppppq',
    'qqqqqqqqqqqqqqqq',
    'ssssssssssssssss',
  ],
  SHELF: [
    'qqqqqqqqqqqqqqqq',
    'qsstsstqsttsstsq',
    'qsstsstqsttsstsq',
    'qqqqqqqqqqqqqqqq',
    'qtsstssqstsstssq',
    'qtsstssqstsstssq',
    'qqqqqqqqqqqqqqqq',
    'qstsstsqsstsstsq',
    'qstsstsqsstsstsq',
    'qqqqqqqqqqqqqqqq',
    'qsstsstqtsstsstq',
    'qsstsstqtsstsstq',
    'qqqqqqqqqqqqqqqq',
    'qrrrrrrqrrrrrrrq',
    'qqqqqqqqqqqqqqqq',
    'qqqqqqqqqqqqqqqq',
  ],
  CAMERA: [
    'qqqqqqqqqqqqqqqq',
    'rrrrrrrrrrrrrrrq',
    'ppppqqqqqqqqpppq',
    'pppqrrrrrrrrqppq',
    'pppqr333333rqppq',
    'pppqr366663rqppq',
    'pppqr366663rqppq',
    'pppqr333333rqppq',
    'pppqrrrrrrrrqppq',
    'ppppqqqqqqqqpppq',
    'pppppppqqppppppq',
    'pppppppqqppppppq',
    'pppppqqqqqqppppq',
    'pppppppppppppppq',
    'qqqqqqqqqqqqqqqq',
    'ssssssssssssssss',
  ],
  LOCKED: [
    'qqqqqqqqqqqqqqqq',
    'q66666666666666q',
    'q6qqqqqqqqqqqq6q',
    'q6q6666666666q6q',
    'q6q6666666666q6q',
    'q6qqqqqqqqqqqq6q',
    'q66666666666666q',
    'q666666ee666666q',
    'q666666ee666666q',
    'q66666666666666q',
    'q6qqqqqqqqqqqq6q',
    'q6q6666666666q6q',
    'q6q6666666666q6q',
    'q6qqqqqqqqqqqq6q',
    'q66666666666666q',
    'qqqqqqqqqqqqqqqq',
  ],
  VENT: [
    'qqqqqqqqqqqqqqqq',
    'pppppppppppppppq',
    'pppppppppppppppq',
    'pppppppppppppppq',
    'pppppppppppppppq',
    'pppppppppppppppq',
    'pppppppppppppppq',
    'pppppppppppppppq',
    'pppqqqqqqqqqpppq',
    'pppq3r3r3r3qpppq',
    'pppq3r3r3r3qpppq',
    'pppq3r3r3r3qpppq',
    'pppq3r3r3r3qpppq',
    'pppqqqqqqqqqpppq',
    'qqqqqqqqqqqqqqqq',
    'ssssssssssssssss',
  ],
  LIFT: [
    '7777777777777777',
    '7aaaaaa77aaaaaa7',
    '7a7777a77a7777a7',
    '7a7777a77a7777a7',
    '7a7777a77a7777a7',
    '7a7777a77a7777a7',
    '7a7777a77a7777a7',
    '7a7777a77a7777a7',
    '7a7777a77a7777a7',
    '7a7777a77a7777a7',
    '7a7777a77a7777a7',
    '7a7777a77a7777a7',
    '7a7777a77a7777a7',
    '7a7777a77a7777a7',
    '7aaaaaa77aaaaaa7',
    '7777777777777777',
  ],
  PORTAL: [
    'qqqqqqqqqqqqqqqq',
    'qrrrrrrrrrrrrrrq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
    'qr111111111111rq',
  ],
  DESK: LOW(['4444444444444444', '4999999999999994', '4999999999999994', '4444444444444444', '4433333333333344', '4433333333333344']),
  TERMINAL: LOW(['3333333333333333', '3222bb2b22bb2223', '32bb22b2bb2b2b23', '3222222222222223', '3333333333333333', '3737373737373733']),
  CHARGER: LOW(['8888888888888888', '8dddddddddddddd8', '8d888888888888d8', '8d88888ee88888d8', '8dddddddddddddd8', '8888888888888888']),
  CABLE: LOW(['3333333333333333', '3eeeeeeeeeeeeee3', '3e333333333333e3', '3e3eeeeeeeeee3e3', '3eee33333333eee3', '3333333333333333']),
};
/** the colour of each low cell's top surface (hex digit or symbolic letter) */
export const LOW_TOP: Record<string, string> = { DESK: '9', TERMINAL: '3', CHARGER: '8', CABLE: '3' };

/** Shade for walls hit on a y side (a face running east-west): one step darker (as the FPS spike). */
export const DARK = [0, 1, 1, 1, 1, 1, 4, 3, 2, 4, 7, 5, 9, 8, 9, 10];

/** Texture `name` in tileset `set` as palette indices, row-major. */
export function texturePixels(name: (typeof TEX_NAMES)[number], set: number): number[] {
  const S = SETS[set]! as unknown as Record<string, string>;
  return TEXTURES[name].flatMap((row) => {
    if (row.length !== 16) throw new Error(`texture ${name}: row "${row}" is not 16 wide`);
    return [...row].map((ch) => {
      const c = parseInt(/[pqrst]/.test(ch) ? S[ch]! : ch, 16);
      if (!(c >= 1 && c <= 15)) throw new Error(`texture ${name}: colour ${ch} -> ${c} (0 is not drawn by MAP)`);
      return c;
    });
  });
}
export function lowTop(name: string, set: number): number {
  const ch = LOW_TOP[name]!;
  const S = SETS[set]! as unknown as Record<string, string>;
  return parseInt(/[pqrst]/.test(ch) ? S[ch]! : ch, 16);
}

/**
 * Actor pictures, 16x16, '.' transparent. A guard has three poses: facing the viewer, facing away, and side
 * (facing the viewer's right; the engine mirrors it for the left).
 */
export const ACTOR_ART: Record<string, string[]> = {
  guard_front: [
    '.....222222.....',
    '....22222222....',
    '.....eccccc.....',
    '.....c1cc1c.....',
    '.....cccccc.....',
    '......cccc......',
    '...2222222222...',
    '..222e222222c2..',
    '..2.22222222.2..',
    '..c.22222222.c..',
    '....22222222....',
    '....3333333.....',
    '....222..222....',
    '....222..222....',
    '....222..222....',
    '...1111..1111...',
  ],
  guard_back: [
    '.....222222.....',
    '....22222222....',
    '.....444444.....',
    '.....444444.....',
    '.....444444.....',
    '......cccc......',
    '...2222222222...',
    '..222222222222..',
    '..2.22222222.2..',
    '..c.22222222.c..',
    '....22222222....',
    '....3333333.....',
    '....222..222....',
    '....222..222....',
    '....222..222....',
    '...1111..1111...',
  ],
  guard_side: [
    '......222222....',
    '.....22222222...',
    '......4ccccce...',
    '......44cc1c....',
    '......4cccccc...',
    '.......cccc.....',
    '.....2222222....',
    '.....22222222...',
    '.....2222222c...',
    '.....222222.....',
    '.....222222.....',
    '.....333333.....',
    '.....222.222....',
    '.....222..222...',
    '.....222..222...',
    '....1111.1111...',
  ],
  /** every actor without art yet (later sections) */
  unknown: [
    '................',
    '.....777777.....',
    '....7aaaaaa7....',
    '....7a7777a7....',
    '....7777a7a7....',
    '.......7aa7.....',
    '......7aa7......',
    '......7aa7......',
    '......7777......',
    '......7aa7......',
    '......7777......',
    '....77777777....',
    '....7aaaaaa7....',
    '....7a7777a7....',
    '....7777777.....',
    '................',
  ],
};
/** pictures held in RAM, in this order; a guard's poses must be consecutive (front, back, side) */
export const ACTOR_PICS = ['guard_front', 'guard_back', 'guard_side', 'unknown'];
/** screen sizes of the pre-scaled pictures, pixels (DESIGN.md §4.2) */
export const SPRITE_SIZES = [8, 16, 24, 32, 48];
