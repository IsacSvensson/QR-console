import { expect } from 'vitest';
import type { GameChecks } from '../../test/games/types';

// Pong rules demonstrated by replay.json, asserted from VM RAM.
const checks: GameChecks = {
  sample: (ram, vm) => ({
    state: ram('state'),
    you: ram('p_score'),
    cpu: ram('c_score'),
    rally: ram('rally'),
    sounds: vm.audio.length,
  }),
  verify(s) {
    // both sides score points
    expect(s.some((x) => x.you > 0)).toBe(true);
    expect(s.some((x) => x.cpu > 0)).toBe(true);
    // the ball is returned by paddles several times
    expect(Math.max(...s.map((x) => x.rally))).toBeGreaterThanOrEqual(5);
    // a match is won (someone reaches 5, state GAME OVER = 3) and a new match starts afterwards
    const over = s.findIndex((x) => x.state === 3);
    expect(over).toBeGreaterThan(0);
    expect(Math.max(s[over]!.you, s[over]!.cpu)).toBe(5);
    expect(s.slice(over).some((x) => x.state !== 3 && x.you === 0 && x.cpu === 0)).toBe(true);
    expect(s.filter((x) => x.sounds > 0).length).toBeGreaterThan(5);
  },
};
export default checks;
