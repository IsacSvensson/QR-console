import { VM } from './vm';

/**
 * Input script for deterministic replays: either one button mask per frame, or run-length pairs
 * `[frames, mask]`. Frames past the end of the script have no buttons pressed.
 */
export type InputScript = number[] | [number, number][];

export interface ReplayFile {
  seed?: number;
  inputs: InputScript;
}

export function expandInputs(script: InputScript, frames: number): Uint8Array {
  const out = new Uint8Array(frames);
  let f = 0;
  for (const item of script) {
    if (typeof item === 'number') {
      if (f < frames) out[f] = item;
      f++;
    } else {
      const [count, mask] = item;
      for (let i = 0; i < count && f < frames; i++) out[f++] = mask;
    }
  }
  return out;
}

/** Runs `frames` frames and returns the VM state hash after each one. */
export function replay(vm: VM, script: InputScript, frames: number, onFrame?: (frame: number, vm: VM) => void): string[] {
  const inputs = expandInputs(script, frames);
  const hashes: string[] = [];
  for (let f = 0; f < frames; f++) {
    vm.step(inputs[f]!);
    onFrame?.(f, vm);
    hashes.push(vm.stateHash());
  }
  return hashes;
}
