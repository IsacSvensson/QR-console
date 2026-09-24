import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { buildCartridge, type AsmResult } from '@qrc/asm';

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
export const GAMES_DIR = join(REPO_ROOT, 'games');

/** The single .asm file of a game directory. */
export function gameSource(dir: string): { file: string; source: string } {
  const asm = readdirSync(dir).filter((f) => f.endsWith('.asm'));
  if (asm.length !== 1) throw new Error(`${dir}: expected exactly one .asm file, found ${asm.length}`);
  const file = join(dir, asm[0]!);
  return { file, source: readFileSync(file, 'utf8') };
}

export async function buildGame(dir: string): Promise<{ bytes: Uint8Array; asm: AsmResult; name: string }> {
  const { file, source } = gameSource(dir);
  const { bytes, asm } = await buildCartridge(source, { file: basename(file) });
  return { bytes, asm, name: basename(dir) };
}
