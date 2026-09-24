import { describe, expect, it } from 'vitest';
import { SYSCALLS as S, VM, expandInputs, replay } from '../src';
import { rng, testSeed } from '../../../test/helpers/rng';
import { ins, vmFor } from './helpers';

const SEED = testSeed(9001);
const R = 0x8000;

/**
 * A busy little program: every frame it reads the buttons, moves a "player" in RAM, draws 20 random
 * pixels and a line, keeps a running checksum, uses MUL/DIV/SAR, and plays a sound on button A.
 */
function busyVm(seed: number): VM {
  const body = [
    // player x += (held & RIGHT) - (held & LEFT) via shifts
    ins('SYS', 0, 0, S.BTN), ins('MOV', 7, 0), // r7 = held
    ins('MOV', 1, 7), ins('AND', 1, 0, 2), ins('SHR', 1, 0, 1), // r1 = right
    ins('MOV', 2, 7), ins('AND', 2, 0, 1), // r2 = left
    ins('LD', 3, 0, R), ins('ADD', 3, 1), ins('SUB', 3, 2), ins('ST', 3, 0, R),
    // 20 random pixels
    ins('MOV', 6, 0, 20),
    ins('MOV', 0, 0, 128), ins('SYS', 0, 0, S.RND), ins('MOV', 1, 0), // loop @ 4 + 12*4 = 52
    ins('MOV', 0, 0, 128), ins('SYS', 0, 0, S.RND), ins('MOV', 4, 0),
    ins('MOV', 0, 0, 16), ins('SYS', 0, 0, S.RND), ins('MOV', 2, 0),
    ins('MOV', 0, 1), ins('MOV', 1, 4), ins('SYS', 0, 0, S.PSET),
    ins('LD', 5, 0, R + 2), ins('MUL', 5, 0, 31), ins('ADD', 5, 0), ins('SAR', 5, 0, 1), ins('ST', 5, 0, R + 2),
    ins('SUB', 6, 0, 1), ins('JNZ', 0, 0, 52),
    // line from player
    ins('LD', 0, 0, R), ins('MOV', 1, 0, 0), ins('MOV', 2, 0, 64), ins('MOV', 3, 0, 127), ins('MOV', 4, 0, 9), ins('SYS', 0, 0, S.LINE),
    // sound on A press
    ins('SYS', 0, 0, S.BTNP), ins('AND', 0, 0, 16), ins('JZ', 0, 0, 4 + 45 * 4), // skip the 5 sound instructions
    ins('MOV', 0, 0, 0), ins('MOV', 1, 0, 440), ins('MOV', 2, 0, 5), ins('MOV', 3, 0, 8), ins('SYS', 0, 0, S.SOUND),
    ins('LD', 0, 0, R + 4), ins('DIV', 0, 0, 3), ins('ADD', 0, 0, 1000), ins('ST', 0, 0, R + 4),
    ins('RET'),
  ];
  return vmFor(body, { seed });
}

function randomInputs(seed: number, frames: number): number[] {
  const r = rng(seed);
  const out: number[] = [];
  let cur = 0;
  for (let f = 0; f < frames; f++) {
    if (r() < 0.1) cur = Math.floor(r() * 64);
    out.push(cur);
  }
  return out;
}

describe(`determinism (seed ${SEED})`, () => {
  it('same cartridge + seed + inputs run twice => identical per-frame hashes for 500 frames', () => {
    const inputs = randomInputs(SEED, 500);
    const audioA: string[] = [];
    const a = replay(busyVm(SEED), inputs, 500, (_, vm) => audioA.push(JSON.stringify(vm.audio)));
    const audioB: string[] = [];
    const b = replay(busyVm(SEED), inputs, 500, (_, vm) => audioB.push(JSON.stringify(vm.audio)));
    expect(a.length).toBe(500);
    expect(new Set(a).size).toBe(500); // state really changes every frame
    expect(b).toEqual(a);
    expect(audioB).toEqual(audioA);
    expect(audioA.some((x) => x !== '[]')).toBe(true);
    expect(audioA.some((x) => x === '[]')).toBe(true); // sound only on frames where A was newly pressed
  });

  it('a different seed or a single different input changes the hashes', () => {
    const inputs = randomInputs(SEED, 200);
    const base = replay(busyVm(SEED), inputs, 200);
    expect(replay(busyVm(SEED + 1), inputs, 200)).not.toEqual(base);
    const tweaked = inputs.slice();
    tweaked[100] = tweaked[100]! ^ 2;
    const t = replay(busyVm(SEED), tweaked, 200);
    expect(t.slice(0, 100)).toEqual(base.slice(0, 100));
    expect(t[100]).not.toBe(base[100]);
  });

  it('input scripts: per-frame and run-length forms', () => {
    expect(Array.from(expandInputs([1, 2, 3], 5))).toEqual([1, 2, 3, 0, 0]);
    expect(Array.from(expandInputs([[2, 4], [1, 8]], 4))).toEqual([4, 4, 8, 0]);
  });
});
