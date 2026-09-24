import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { buildCartridge, type AsmResult } from '@qrc/asm';

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
export const GAMES_DIR = join(REPO_ROOT, 'games');

/**
 * The main source of a game directory: `<dir>/<dirname>.asm` if it exists, otherwise the directory's only
 * .asm file. Other .asm files in the directory are reachable through `.include`.
 */
export function gameSource(dir: string): { file: string; source: string } {
  const named = join(dir, `${basename(dir)}.asm`);
  let file = named;
  if (!existsSync(named)) {
    const asm = readdirSync(dir).filter((f) => f.endsWith('.asm'));
    if (asm.length !== 1) throw new Error(`${dir}: expected ${basename(dir)}.asm or exactly one .asm file, found ${asm.length}`);
    file = join(dir, asm[0]!);
  }
  return { file, source: readFileSync(file, 'utf8') };
}

/** `.include` resolver restricted to one directory (the assembler already rejects paths). */
export function includeFrom(dir: string) {
  return (name: string) => readFileSync(join(dir, name), 'utf8');
}

export async function buildGame(dir: string): Promise<{ bytes: Uint8Array; asm: AsmResult; name: string }> {
  const { file, source } = gameSource(dir);
  const { bytes, asm } = await buildCartridge(source, { file: basename(file), resolveInclude: includeFrom(dir) });
  return { bytes, asm, name: basename(dir) };
}

/** Reads a `.sym` file written by `qrc build` into name -> value. */
export function readSymbols(path: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([0-9a-f]{4})\s+\w+\s+(\S+)$/.exec(line.trim());
    if (m) out.set(m[2]!, parseInt(m[1]!, 16));
  }
  return out;
}
