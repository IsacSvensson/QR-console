// Records every route in routes.ts (or the ones named on the command line) into ../replays/<name>.json.
// Then run `npm run refs:games` to regenerate the committed hashes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { expandInputs } from '@qrc/vm';
import { Bot, loadGame, type Step } from './bot';
import { ROUTES } from './routes';

/** The access code R1 (m17-obedient) was shown on entering section 6, read from RAM. */
async function codeFromR1(): Promise<string> {
  const rf = JSON.parse(readFileSync(new URL('../replays/m17-obedient.json', import.meta.url), 'utf8'));
  const { vm, sym } = await loadGame(rf.seed);
  const bot = new Bot(vm, sym);
  const inputs = expandInputs(rf.inputs, rf.frames);
  for (let f = 0; f < rf.frames; f++) {
    vm.step(inputs[f]!);
    if (bot.room === '6.1' && bot.mode === sym.get('M_DIALOG')) {
      let s = '';
      for (let a = sym.get('code_text')!; a < sym.get('code_text')! + 8; a++) s += String.fromCharCode(vm.read8(a));
      return s;
    }
  }
  throw new Error('R1 never showed the section 6 code');
}

/** M18: title -> B -> type R1's section-6 code -> resume in 6.1 -> on to 6.2. */
const resumeRoute = (code: string): Step[] => [
  { wait: 10 },
  { press: 'B' },
  { enterCode: code },
  { room: '6.1' },
  { to: [12, 4] },
  { exit: 'W' },
  { room: '6.2' },
  { wait: 30 },
];

const names = process.argv.slice(2).length ? process.argv.slice(2) : [...Object.keys(ROUTES), 'm18-resume'];
const dir = new URL('../replays/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const name of names) {
  const r = name === 'm18-resume' ? { seed: 10, route: resumeRoute(await codeFromR1()) } : ROUTES[name];
  if (!r) throw new Error(`no route ${name}`);
  const { vm, sym } = await loadGame(r.seed);
  const bot = new Bot(vm, sym);
  bot.run(r.route);
  writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(bot.replayFile(r.seed)) + '\n');
  console.log(`${name}: ${bot.inputs.length} frames, ends in room ${bot.room}`);
}
