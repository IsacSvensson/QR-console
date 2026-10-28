// Builds the FPS spike, optionally with another build configuration (config.asm), and starts VMs on it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCartridge, type AsmResult } from '@qrc/asm';
import { parseCartridge, type Cartridge } from '@qrc/cartridge';
import { VM } from '@qrc/vm';
import { GAME_DIR } from './util';

export interface FpsBuild {
  bytes: Uint8Array;
  asm: AsmResult;
  cart: Cartridge;
  sym: (name: string) => number;
}

/** `config` replaces config.asm: e.g. configText(4, 32) for 4-pixel rays, 32 rays per frame. */
export const configText = (colw: 1 | 2 | 4, chunk: number) => `.include "col${colw}.asm"\nRAY_CHUNK = ${chunk}\n`;

export async function buildFps(config?: string): Promise<FpsBuild> {
  const source = readFileSync(join(GAME_DIR, 'fps.asm'), 'utf8');
  const resolveInclude = (name: string) => (name === 'config.asm' && config !== undefined ? config : readFileSync(join(GAME_DIR, name), 'utf8'));
  const { bytes, asm } = await buildCartridge(source, { file: 'fps.asm', resolveInclude });
  const cart = await parseCartridge(bytes);
  const sym = (name: string) => {
    const v = asm.symbols.get(name);
    if (v === undefined) throw new Error(`no symbol ${name}`);
    return v;
  };
  return { bytes, asm, cart, sym };
}

export const startVM = (b: FpsBuild, seed = 1, cyclesPerFrame?: number) => VM.fromCartridge(b.cart, { seed, cyclesPerFrame });
