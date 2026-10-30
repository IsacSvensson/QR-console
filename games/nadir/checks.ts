import { expect } from 'vitest';
import type { GameChecks } from '../../test/games/types';

// What the NADIR fly-through (replay.json = replays/m26-fly.json) demonstrates, from VM RAM. The renderer and the
// world are checked against the floating-point oracle and DESIGN.md by `npm run test:nadir`.
const checks: GameChecks = {
  sample: (ram, vm) => ({ x: ram('cam_x'), y: ram('cam_y'), a: ram('cam_a'), zone: ram('cam_zone'), keys: ram('keys'), cycles: vm.cyclesLastFrame }),
  verify(s) {
    // the player walks the whole loop: the shaft and workshop, the dark corridor, the control room, the core
    expect(new Set(s.map((f) => f.zone))).toEqual(new Set([0, 1, 2, 3]));
    const dist = s.slice(1).reduce((d, f, i) => d + Math.hypot(f.x - s[i]!.x, f.y - s[i]!.y), 0) / 256;
    expect(dist).toBeGreaterThan(80);
    // it turns through every direction, picks up the red key and never exceeds the frame budget
    expect(new Set(s.map((f) => f.a >> 9)).size).toBe(8);
    expect(s[s.length - 1]!.keys).toBe(1);
    expect(Math.max(...s.slice(1).map((f) => f.cycles))).toBeLessThanOrEqual(25_000);
  },
};
export default checks;
