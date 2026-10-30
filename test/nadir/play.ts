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

/** M31: true in the frames that drew an image (the engine's image counter `img_n` moved): not a frame that only
 * cast rays, skipped rendering after a shot (DESIGN §3.11) or showed the title's press, the lift or the statistics. */
export function imageWatch(n: Nadir) {
  let last = 0;
  return (vm: VM) => {
    const k = vm.read16(n.S('img_n'));
    const drew = k !== last;
    last = k;
    return drew;
  };
}

/** Every recorded replay of NADIR (games/nadir/replays, tools/routes.ts). */
export const REPLAYS = ['m26-fly', 'm27-walk', 'm27-doors', 'm27-masks', 'm27-tour', 'm28-props', 'm29-combat', 'm29-death', 'm30-stress', 'm31-game', 'm31-checkpoint', 'm31-attract'];

/**
 * The stress replay m28-props (PLAN M28): per frame the cycles of drawing the props (draw_sprites with its callees),
 * of that without the 3D boxes (draw_box), of choosing them (spr_frame) and of the frame; frames that drew eight.
 */
export function propCosts(n: Nadir) {
  const drew = imageWatch(n);
  let maxDraw = 0;
  let maxBill = 0;
  let maxSel = 0;
  let maxFrame = 0;
  let eight = 0;
  const entries = [n.S('draw_sprites'), n.S('spr_frame'), n.S('draw_box')];
  runReplay(n, 'm28-props', undefined, (vm) => {
    const ret = [-1, -1, -1];
    const cyc = [0, 0, 0];
    vm.tracer = (pc) => {
      for (let k = 0; k < 3; k++) {
        if (pc === entries[k]) ret[k] = vm.read16(vm.sp);
        else if (pc === ret[k]) ret[k] = -1;
        if (ret[k] >= 0) cyc[k]! += vm.mem[pc] !== 0x20 ? 1 : 8 + (vm.mem[pc + 2] === 17 ? Math.ceil(vm.regs[3]! / 8) : vm.mem[pc + 2] === 18 ? Math.ceil(vm.regs[2]! / 8) : 0);
      }
    };
    const step = vm.step.bind(vm);
    vm.step = (b: number) => {
      cyc.fill(0);
      const out = step(b);
      if (vm.frame > 1) {
        maxDraw = Math.max(maxDraw, cyc[0]!);
        maxBill = Math.max(maxBill, cyc[0]! - cyc[2]!);
        maxSel = Math.max(maxSel, cyc[1]!);
        maxFrame = Math.max(maxFrame, vm.cyclesLastFrame);
        if (drew(vm) && vm.read16(n.S('spr_cn')) - vm.read16(n.S('spr_o0')) / 2 >= 8) eight++;
      }
      return out;
    };
  });
  return { maxDraw, maxBill, maxSel, maxFrame, eight };
}
