import { expect } from 'vitest';
import type { GameChecks } from '../../test/games/types';

// What the NADIR fly-through (replay.json = replays/m26-fly.json) demonstrates, from VM RAM. The renderer itself
// is checked against the floating-point oracle by `npm run test:nadir`.
const checks: GameChecks = {
  sample: (ram, vm) => ({ x: ram('cam_x'), y: ram('cam_y'), a: ram('cam_a'), zone: ram('cam_zone'), cycles: vm.cyclesLastFrame }),
  verify(s) {
    // the camera walks through the mine, the room, the dark corridor and the lab
    expect(new Set(s.map((f) => f.zone))).toEqual(new Set([0, 1, 3]));
    const dist = s.slice(1).reduce((d, f, i) => d + Math.hypot(f.x - s[i]!.x, f.y - s[i]!.y), 0) / 256;
    expect(dist).toBeGreaterThan(40);
    // it turns through every direction
    expect(new Set(s.map((f) => f.a >> 9)).size).toBe(8);
    expect(Math.max(...s.slice(1).map((f) => f.cycles))).toBeLessThanOrEqual(25_000);
  },
};
export default checks;
