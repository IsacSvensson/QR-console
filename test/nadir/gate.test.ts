// The cycle gates, kept as specified even while they fail (CLAUDE.md: a human decides; DECISIONS.md D-040, D-042,
// D-044): PLAN.md M26 (the 3D view: max <= 14 000, mean <= 11 000 cycles over the fly-through), M27 (3D view plus game
// logic <= 16 000) and M28 (drawing the props of the stress replay <= 5 000 per frame, since D-044 incl. 3D boxes). They are measured per IMAGE: an image drawn one frame after its rays were cast (adaptive pacing,
// DESIGN §3.11) costs both frames, so pacing cannot make a gate pass.
import { expect, it } from 'vitest';
import { REPLAYS, buildNadir, propCosts, runReplay, type Nadir } from './play';

function imageCosts(n: Nadir, name: string): number[] {
  const out: number[] = [];
  let pending = 0;
  runReplay(n, name, (f, vm) => {
    if (f === 0) return;
    pending += vm.cyclesLastFrame;
    if (vm.read16(n.S('pace')) !== 0 || vm.read16(n.S('lg_heavy')) !== 0) return; // no image drawn in this frame
    out.push(pending);
    pending = 0;
  });
  return out;
}

const stats = (a: number[]) => ({ max: Math.max(...a), mean: a.reduce((s, x) => s + x, 0) / a.length });

it('M26 gate: the 3D view stays within max 14 000 and mean 11 000 cycles per image', async () => {
  const s = stats(imageCosts(await buildNadir(), 'm26-fly'));
  console.log(`[gate] m26-fly: max ${s.max}, mean ${s.mean.toFixed(0)} cycles per image (gate: max 14 000, mean 11 000)`);
  expect(s.max).toBeLessThanOrEqual(14_000);
  expect(s.mean).toBeLessThanOrEqual(11_000);
});

it('M27 gate: the 3D view plus game logic stays within 16 000 cycles per image in every replay', async () => {
  const n = await buildNadir();
  let worst = 0;
  for (const name of REPLAYS) {
    const s = stats(imageCosts(n, name));
    worst = Math.max(worst, s.max);
    console.log(`[gate] ${name}: max ${s.max}, mean ${s.mean.toFixed(0)} cycles per image (gate: 16 000)`);
  }
  expect(worst).toBeLessThanOrEqual(16_000);
});

it('M28 gate: drawing the props of the stress replay (billboards and 3D boxes) costs <= 5 000 cycles per frame', async () => {
  const m = propCosts(await buildNadir());
  console.log(`[gate] m28-props: drawing props max ${m.maxDraw} cycles per frame (billboards alone ${m.maxBill}; gate: 5 000)`);
  expect(m.maxDraw).toBeLessThanOrEqual(5_000);
});
