import { expect } from 'vitest';
import type { GameChecks } from '../../test/games/types';

// Breakout rules demonstrated by replay.json, asserted from VM RAM.
const checks: GameChecks = {
  sample: (ram, vm) => ({
    score: ram('score'),
    lives: ram('lives'),
    bricks: ram('bricks_left'),
    state: ram('state'),
    sounds: vm.audio.length,
  }),
  verify(s) {
    // breaks at least one brick: bricks_left drops below 40 while the score rises
    const firstBrick = s.findIndex((x) => x.bricks < 40);
    expect(firstBrick).toBeGreaterThan(0);
    expect(s[firstBrick]!.score).toBeGreaterThan(0);
    // loses at least one life
    const firstLoss = s.findIndex((x) => x.lives < 3);
    expect(firstLoss).toBeGreaterThan(0);
    // the run also reaches GAME OVER (state 2) and a restart
    const over = s.findIndex((x) => x.state === 2);
    expect(over).toBeGreaterThan(firstLoss);
    expect(s.slice(over).some((x) => x.lives === 3 && x.state !== 2)).toBe(true);
    // sound on hits
    expect(s.filter((x) => x.sounds > 0).length).toBeGreaterThan(5);
  },
};
export default checks;
