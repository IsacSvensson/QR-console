// Bo's jump physics in TypeScript, the same rules as the engine (DESIGN.md §3, engine order per frame:
// vy += G; y += vy; x += vx). Used by the level generator to lay apple arcs and by the bot to plan.
// Units: 1/16 pixel, per frame.

export const PHYS = {
  G: 3, JUMP_V: 52, JUMP_CUT: 16, MAX_FALL: 64, LAUNCH_MAX: 80,
} as const;

export type ArcKind = 'hold' | 'tap' | 'r45' | 'r45a' | 'r22' | 'r22a';

/** Initial upward speed (positive = up) of a jump of `kind` at horizontal speed `v`. */
export function launchSpeed(kind: ArcKind, v: number): number {
  const s = Math.abs(v);
  switch (kind) {
    case 'hold':
    case 'tap':
      return PHYS.JUMP_V;
    case 'r45':
      return s;
    case 'r45a':
      return Math.min(s + PHYS.JUMP_V, PHYS.LAUNCH_MAX);
    case 'r22':
      return s >> 1;
    case 'r22a':
      return Math.min((s >> 1) + PHYS.JUMP_V, PHYS.LAUNCH_MAX);
  }
}

/** Positions (1/16 px, relative to takeoff; y down) after every frame of a free flight, until `stop` says so. */
export function flight(kind: ArcKind, v: number, stop: (dx: number, dy: number, frame: number) => boolean, maxFrames = 400) {
  let vy = -launchSpeed(kind, v);
  let x = 0;
  let y = 0;
  const out: { x: number; y: number; vy: number }[] = [];
  for (let f = 1; f <= maxFrames; f++) {
    if (kind === 'tap' && f >= 2 && vy < -PHYS.JUMP_CUT) vy = -PHYS.JUMP_CUT;
    vy = Math.min(vy + PHYS.G, PHYS.MAX_FALL);
    y += vy;
    x += v;
    out.push({ x, y, vy });
    if (stop(x, y, f)) break;
  }
  return out;
}
