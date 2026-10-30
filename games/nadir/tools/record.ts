// npm run nadir:record [name ...] — records every route in routes.ts (or the named ones) into
// replays/<name>.json; the fly-through is also written as the top-level replay.json (npm run test:games).
// Then run `npm run refs:games` to regenerate the committed per-frame hashes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { B, Bot } from './bot';
import { loadGame } from './game';
import { ROUTES } from './routes';
import { GAME_DIR } from './util';

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ROUTES);
mkdirSync(join(GAME_DIR, 'replays'), { recursive: true });
for (const name of names) {
  const r = ROUTES[name];
  if (!r) throw new Error(`no route ${name}`);
  const g = await loadGame(r.seed);
  const bot = new Bot(g.vm, g.S);
  try {
    if (!r.title) bot.step(B.A); // M31: the game starts on the title
    r.run(bot);
  } catch (e) {
    console.error(`${name}: failed after ${bot.inputs.length} frames: ${(e as Error).message}`);
    process.exitCode = 1;
    continue;
  }
  const file = JSON.stringify(bot.replayFile(r.seed)) + '\n';
  writeFileSync(join(GAME_DIR, 'replays', `${name}.json`), file);
  if (name === 'm26-fly') writeFileSync(join(GAME_DIR, 'replay.json'), file);
  console.log(`${name}: ${bot.inputs.length} frames, ends at ${bot.x.toFixed(2)}, ${bot.y.toFixed(2)}`);
}
