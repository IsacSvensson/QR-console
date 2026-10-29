// Builds the NADIR cartridge from source and gives a VM plus its symbol table (for tools and the bot).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCartridge, type AsmResult } from '@qrc/asm';
import { parseCartridge } from '@qrc/cartridge';
import { includeFrom } from '@qrc/tools';
import { VM } from '@qrc/vm';
import { GAME_DIR } from './util';

export async function buildNadir(): Promise<{ bytes: Uint8Array; asm: AsmResult }> {
  return buildCartridge(readFileSync(join(GAME_DIR, 'nadir.asm'), 'utf8'), { file: 'nadir.asm', resolveInclude: includeFrom(GAME_DIR) });
}

export async function loadGame(seed = 1) {
  const { bytes, asm } = await buildNadir();
  const vm = VM.fromCartridge(await parseCartridge(bytes), { seed });
  const S = (name: string) => {
    const a = asm.symbols.get(name);
    if (a === undefined) throw new Error(`no symbol ${name}`);
    return a;
  };
  return { vm, sym: asm.symbols, asm, bytes, S };
}

export type Game = Awaited<ReturnType<typeof loadGame>>;

/** Puts the camera at pose `n` (1-based, map.gen.asm) on the next frame and runs one frame with no input. */
export function atPose(g: Game, n: number, flags = 0) {
  g.vm.write16(g.S('dbg_pose'), n);
  g.vm.write16(g.S('dbg_flags'), flags);
  g.vm.step(0);
  return g.vm.cyclesLastFrame;
}
