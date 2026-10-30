// PLAN.md M30: the stress replay m30-stress (tools/routes.ts): in the control room four enemies in view and two
// acid balls in flight, then a chain explosion of the barrel pair (24 particles) - every frame <= 25 000 cycles.
// (Per-frame hashes, the light rule with the dynamic lights and the model of DESIGN §6 run on it in the other files.)
import { describe, expect, it } from 'vitest';
import { K } from './ref';
import { buildNadir, imageWatch, runReplay } from './play';

describe('M30 stress', () => {
  it('m30-stress: 4 living enemies drawn with 2 acid balls, then an explosion with 24 particles and 4 enemies drawn; <= 25 000 cycles per frame', async () => {
    const n = await buildNadir();
    let four = 0; // images: >= 4 living enemies drawn and >= 2 acid balls
    let boom = 0; // images: the explosion's light, PART_MAX particles, >= 2 acid balls, >= 4 enemies drawn (living or dying)
    let maxBoom = 0;
    const drew = imageWatch(n);
    const run = runReplay(n, 'm30-stress', (_f, vm) => {
      if (!drew(vm)) return; // no image drawn in this frame
      let alive = 0;
      let drawn = 0;
      for (let i = vm.read16(n.S('spr_o0')) / 2; i < vm.read16(n.S('spr_cn')); i++) {
        const p = (vm.read16(vm.read16(n.S('spr_ord') + 2 * i)) - n.S('props')) / 8;
        if (p < n.S('NUM_PROPS')) continue;
        drawn++;
        if (vm.read8(n.S('enemies') + 24 * (p - n.S('NUM_PROPS')) + 4) !== 7) alive++;
      }
      const acids = [0, 1, 2, 3].filter((k) => vm.read8(n.S('acids') + 10 * k + 8)).length;
      if (alive >= 4 && acids >= 2) four++;
      if (vm.read16(n.S('rdl_i')) > 0 && vm.read16(n.S('np_live')) === K.PART_MAX && acids >= 2 && drawn >= 4) {
        boom++;
        maxBoom = Math.max(maxBoom, vm.cyclesLastFrame);
      }
    });
    console.log(`[stress] m30-stress: ${run.rf.frames} frames, max ${run.max}, mean ${run.mean.toFixed(0)} cycles per frame; ${four} images with 4 living enemies and 2 acid balls, ${boom} with the explosion, 24 particles, 2 acid balls and 4 enemies (max ${maxBoom} cycles)`);
    expect(run.vm.fault).toBeNull();
    expect(run.vm.overruns).toBe(0);
    expect(four).toBeGreaterThan(0);
    expect(boom).toBeGreaterThan(0);
    expect(run.vm.read16(n.S('booms'))).toBeGreaterThanOrEqual(2);
    expect(run.max).toBeLessThanOrEqual(25_000);
  });
});
