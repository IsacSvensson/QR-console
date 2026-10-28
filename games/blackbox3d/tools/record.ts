// Records every route in routes.ts (or the ones named on the command line) into ../replays/<name>.json.
// Then run `npm run refs:games` to regenerate the committed per-frame hashes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Bot3D } from './bot';
import { buildBb3d, startVM } from './game';
import { ROUTES } from './routes';
import { GAME_DIR } from './util';

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ROUTES);
const dir = join(GAME_DIR, 'replays');
mkdirSync(dir, { recursive: true });
const build = await buildBb3d();
for (const name of names) {
  const r = ROUTES[name];
  if (!r) throw new Error(`no route ${name}`);
  const bot = new Bot3D(startVM(build, r.seed), build.asm.symbols);
  try {
    bot.run(r.route);
  } catch (e) {
    console.error(`${name}: failed after ${bot.inputs.length} frames in ${bot.room}: ${(e as Error).message}`);
    process.exitCode = 1;
    continue;
  }
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(bot.replayFile(r.seed)) + '\n');
  console.log(`${name}: ${bot.inputs.length} frames, ends in ${bot.room} at ${bot.cell}`);
}
