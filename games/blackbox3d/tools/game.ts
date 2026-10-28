// Builds BLACKBOX 3D and starts VMs on it (tools, tests, benchmark).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCartridge, type AsmResult } from '@qrc/asm';
import { parseCartridge, type Cartridge } from '@qrc/cartridge';
import { VM } from '@qrc/vm';
import { GAME_DIR } from './util';

export interface Bb3dBuild {
  bytes: Uint8Array;
  asm: AsmResult;
  cart: Cartridge;
  sym: (name: string) => number;
}

/** `replace` swaps the text of included files (by name), e.g. for a benchmark variant. */
export async function buildBb3d(replace: Record<string, string> = {}): Promise<Bb3dBuild> {
  const read = (name: string) => replace[name] ?? readFileSync(join(GAME_DIR, name), 'utf8');
  const { bytes, asm } = await buildCartridge(read('blackbox3d.asm'), { file: 'blackbox3d.asm', resolveInclude: read });
  const cart = await parseCartridge(bytes);
  const sym = (name: string) => {
    const v = asm.symbols.get(name);
    if (v === undefined) throw new Error(`no symbol ${name}`);
    return v;
  };
  return { bytes, asm, cart, sym };
}

export const startVM = (b: Bb3dBuild, seed = 1, cyclesPerFrame?: number) => VM.fromCartridge(b.cart, { seed, cyclesPerFrame });
