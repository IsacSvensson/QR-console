// PLAN.md M26's cycle gate for the 3D view: max <= 14 000 and mean <= 11 000 cycles per frame over the
// fly-through. Kept as specified even while it fails (CLAUDE.md: a human decides; DECISIONS.md D-040).
import { expect, it } from 'vitest';
import { buildNadir, runReplay } from './play';

it('M26 gate: the 3D view stays within max 14 000 and mean 11 000 cycles per frame', async () => {
  const run = runReplay(await buildNadir(), 'm26-fly');
  console.log(`[gate] m26-fly: max ${run.max}, mean ${run.mean.toFixed(0)} cycles per frame (gate: max 14 000, mean 11 000)`);
  expect(run.max).toBeLessThanOrEqual(14_000);
  expect(run.mean).toBeLessThanOrEqual(11_000);
});
