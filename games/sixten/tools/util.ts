import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True when the module at `url` is the script being run (works on Windows and POSIX). */
export function isMain(url: string): boolean {
  return !!process.argv[1] && resolve(fileURLToPath(url)) === resolve(process.argv[1]);
}

/** Directory of the game (games/sixten), as a filesystem path. */
export const GAME_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
