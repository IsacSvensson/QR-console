// Per-frame checks shared by every Bo replay test: Bo's body never overlaps a solid cell of the reference grid,
// and whenever he is grounded his feet are exactly on a reference surface (PLAN.md M19) or on the top of a moving
// platform (M23; the platforms' own motion is checked against PLATFORMS in world23.test.ts).
import { type Bo, type FrameView, type RefGrid, LEVEL_IDS, boxOverlaps, readRefLevel, refGrid, s16, surfaceAt, symbol } from './oracle';

/** The moving platforms (DESIGN §9 PLATTFORM), as this oracle specifies them: enemy type -> width px, how it moves
 *  (`drift`: right over `range` px from its home and back, at `speed` 1/16 px per frame; `bus`: waits, then drives
 *  right over `range` px once Bo stands on it). Its top is the bottom edge of the cell it is placed in. */
export const PLATFORMS: Record<number, { name: string; w: number; move: 'drift' | 'bus'; range: number; speed: number }> = {
  18: { name: 'log', w: 24, move: 'drift', range: 80, speed: 6 },
  19: { name: 'bus', w: 48, move: 'bus', range: 1280, speed: 16 },
};

const grids = new Map<string, RefGrid>();
export function gridOf(id: string): RefGrid {
  let g = grids.get(id);
  if (!g) {
    g = refGrid(readRefLevel(id));
    grids.set(id, g);
  }
  return g;
}

export interface BoView {
  level: string;
  playing: boolean;
  x16: number;
  y16: number;
  cx: number;
  foot: number;
  vx: number;
  vy: number;
  state: number;
  grounded: boolean;
  crouch: boolean;
  sattr: number;
  /** live moving platforms: centre x px, top y px, width px */
  platforms: { x: number; top: number; w: number }[];
}

export function boView(bo: Bo, v: FrameView): BoView {
  const S = (n: string) => symbol(bo.sym, n);
  const x16 = v.vm.read16(S('bo_x'));
  const y16 = s16(v.vm.read16(S('bo_y')));
  const state = v.w('bo_state');
  return {
    level: LEVEL_IDS[v.vm.read16(S('level'))]!,
    playing: v.vm.read16(S('mode')) === S('M_PLAY'),
    x16,
    y16,
    cx: x16 >> 4,
    foot: y16 >> 4,
    vx: v.w('bo_vx'),
    vy: v.w('bo_vy'),
    state,
    grounded: state === S('ST_GROUND'),
    crouch: v.w('bo_crouch') !== 0,
    sattr: v.w('bo_sattr'),
    platforms: platformsOf(bo, v),
  };
}

function platformsOf(bo: Bo, v: FrameView) {
  const base = symbol(bo.sym, 'actors');
  const out: BoView['platforms'] = [];
  for (let i = 0; i < 12; i++) {
    const a = base + i * 22;
    const spec = PLATFORMS[v.vm.read16(a)];
    if (spec) out.push({ x: v.vm.read16(a + 2) >> 4, top: s16(v.vm.read16(a + 4)) >> 4, w: spec.w });
  }
  return out;
}

/** Problems of this frame (empty if fine). `grid` defaults to the level's reference grid. */
export function frameProblems(b: BoView, f: number, grid = gridOf(b.level)): string[] {
  if (!b.playing) return [];
  const out: string[] = [];
  const top = b.foot - (b.crouch ? 11 : 16);
  const hits = boxOverlaps(grid, b.cx - 3, b.cx + 2, top, b.foot - 3);
  if (hits.length) out.push(`frame ${f + 1}: ${b.level} body box (${b.cx - 3}..${b.cx + 2}, ${top}..${b.foot - 3}) overlaps solid cells ${hits.join(' ')}`);
  // the same three sensors as for the level: the middle of the feet and the two edges of the body box
  const onPlatform = b.platforms.some((p) => p.top === b.foot && [b.cx - 3, b.cx, b.cx + 2].some((x) => x >= p.x - (p.w >> 1) && x < p.x - (p.w >> 1) + p.w));
  if (b.grounded && !onPlatform && !surfaceAt(grid, b.cx, b.foot) && !surfaceAt(grid, b.cx - 3, b.foot) && !surfaceAt(grid, b.cx + 2, b.foot)) {
    out.push(`frame ${f + 1}: ${b.level} grounded at (${b.cx}, ${b.foot}) but no reference surface there`);
  }
  return out;
}
