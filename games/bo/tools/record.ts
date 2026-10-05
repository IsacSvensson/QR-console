// Records every route in routes.ts (or the ones named on the command line) into ../replays/<name>.json.
// Then run `npm run refs:games` to regenerate the committed per-frame hashes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Bot, loadGame } from './bot';
import { ROUTES } from './routes';
import { GAME_DIR } from './util';

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ROUTES);
const dir = join(GAME_DIR, 'replays');
mkdirSync(dir, { recursive: true });
for (const name of names) {
  const r = ROUTES[name];
  if (!r) throw new Error(`no route ${name}`);
  const { vm, sym } = await loadGame(r.seed);
  const bot = new Bot(vm, sym);
  try {
    r.run(bot);
  } catch (e) {
    console.error(`${name}: failed after ${bot.inputs.length} frames: ${(e as Error).message}`);
    process.exitCode = 1;
    continue;
  }
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(bot.replayFile(r.seed)) + '\n');
  console.log(`${name}: ${bot.inputs.length} frames, ends in ${bot.level} at x ${bot.x}`);
}
