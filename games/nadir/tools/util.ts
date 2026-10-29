import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True when the module at `url` is the script being run (works on Windows and POSIX). */
export function isMain(url: string): boolean {
  return !!process.argv[1] && resolve(fileURLToPath(url)) === resolve(process.argv[1]);
}

/** Directory of the game (games/nadir), as a filesystem path. */
export const GAME_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Formats bytes as `.byte` lines of at most `per` values. */
export function byteLines(bytes: ArrayLike<number>, per = 16, indent = '    '): string[] {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += per) out.push(`${indent}.byte ${Array.from({ length: Math.min(per, bytes.length - i) }, (_, k) => bytes[i + k]!).join(', ')}`);
  return out;
}

/** Formats words as `.word` lines of at most `per` values (each value may be a number or an expression). */
export function wordLines(words: ArrayLike<number | string>, per = 12, indent = '    '): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i += per) out.push(`${indent}.word ${Array.from({ length: Math.min(per, words.length - i) }, (_, k) => words[i + k]!).join(', ')}`);
  return out;
}

/** xorshift32 with an explicit seed, for procedural art (deterministic). */
export function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 2 ** 32;
  };
}
