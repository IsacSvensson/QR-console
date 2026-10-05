// Per-frame checks shared by every Bo replay test: Bo's body never overlaps a solid cell of the reference grid,
// and whenever he is grounded his feet are exactly on a reference surface (PLAN.md M19).
import { type Bo, type FrameView, type RefGrid, LEVEL_IDS, boxOverlaps, readRefLevel, refGrid, s16, surfaceAt, symbol } from './oracle';

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
  };
}

/** Problems of this frame (empty if fine). `grid` defaults to the level's reference grid. */
export function frameProblems(b: BoView, f: number, grid = gridOf(b.level)): string[] {
  if (!b.playing) return [];
  const out: string[] = [];
  const top = b.foot - (b.crouch ? 11 : 16);
  const hits = boxOverlaps(grid, b.cx - 3, b.cx + 2, top, b.foot - 3);
  if (hits.length) out.push(`frame ${f + 1}: ${b.level} body box (${b.cx - 3}..${b.cx + 2}, ${top}..${b.foot - 3}) overlaps solid cells ${hits.join(' ')}`);
  if (b.grounded && !surfaceAt(grid, b.cx, b.foot) && !surfaceAt(grid, b.cx - 3, b.foot) && !surfaceAt(grid, b.cx + 2, b.foot)) {
    out.push(`frame ${f + 1}: ${b.level} grounded at (${b.cx}, ${b.foot}) but no reference surface there`);
  }
  return out;
}
