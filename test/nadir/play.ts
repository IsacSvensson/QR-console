// Shared test helpers for NADIR: build the cartridge once, run a replay frame by frame with a callback.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCartridge, type AsmResult } from '@qrc/asm';
import { parseCartridge, type Cartridge } from '@qrc/cartridge';
import { includeFrom } from '@qrc/tools';
import { VM, expandInputs, type ReplayFile } from '@qrc/vm';
import { GAME_DIR } from './ref';

export interface Nadir {
  bytes: Uint8Array;
  asm: AsmResult;
  cart: Cartridge;
  S: (name: string) => number;
}

let cached: Promise<Nadir> | null = null;
export function buildNadir(): Promise<Nadir> {
  cached ??= (async () => {
    const { bytes, asm } = await buildCartridge(readFileSync(join(GAME_DIR, 'nadir.asm'), 'utf8'), { file: 'nadir.asm', resolveInclude: includeFrom(GAME_DIR) });
    const S = (name: string) => {
      const v = asm.symbols.get(name);
      if (v === undefined) throw new Error(`no symbol ${name}`);
      return v;
    };
    return { bytes, asm, cart: await parseCartridge(bytes), S };
  })();
  return cached;
}

export function loadReplay(name: string): ReplayFile & { frames: number } {
  return JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8'));
}

export function expectedHashes(name: string): string[] {
  return readFileSync(join(GAME_DIR, 'replays', `${name}.hashes.txt`), 'utf8').trim().split('\n');
}

/** Runs replay `name`; calls `onFrame` after every frame. Returns the VM, cycle statistics and the first frame whose hash differs. */
export function runReplay(n: Nadir, name: string, onFrame?: (f: number, vm: VM) => void, setup?: (vm: VM) => void) {
  const rf = loadReplay(name);
  const inputs = expandInputs(rf.inputs, rf.frames);
  const expected = expectedHashes(name);
  const vm = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
  setup?.(vm);
  let max = 0;
  let sum = 0;
  let hashMismatch = -1;
  for (let f = 0; f < rf.frames; f++) {
    vm.step(inputs[f]!);
    if (f > 0) {
      max = Math.max(max, vm.cyclesLastFrame);
      sum += vm.cyclesLastFrame;
    }
    if (hashMismatch < 0 && vm.stateHash() !== expected[f]) hashMismatch = f + 1;
    onFrame?.(f, vm);
  }
  return { vm, rf, max, mean: sum / (rf.frames - 1), hashMismatch, expectedFrames: expected.length };
}

/** Every recorded replay of NADIR (games/nadir/replays, tools/routes.ts). */
export const REPLAYS = ['m26-fly', 'm27-walk', 'm27-doors', 'm27-masks', 'm27-tour', 'm28-props'];
