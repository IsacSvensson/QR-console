// Records every route in routes.ts (or the ones named on the command line) into ../replays/<name>.json.
// Then run `npm run refs:games` to regenerate the committed hashes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Bot, loadGame } from './bot';
import { ROUTES } from './routes';

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ROUTES);
const dir = new URL('../replays/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const name of names) {
  const r = ROUTES[name];
  if (!r) throw new Error(`no route ${name}`);
  const { vm, sym } = await loadGame(r.seed);
  const bot = new Bot(vm, sym);
  bot.run(r.route);
  writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(bot.replayFile(r.seed)) + '\n');
  console.log(`${name}: ${bot.inputs.length} frames, ends in room ${bot.room}`);
}
