// Picks the reference frames dumped by `npm run refs:games` (replays/<name>.frames.json): the first fully
// revealed dialogue box in m13-walk and the first terminal page in m14-labs. Run after re-recording.
import { readFileSync, writeFileSync } from 'node:fs';
import { expandInputs } from '@qrc/vm';
import { Bot, loadGame } from './bot';

for (const [name, want] of [['m13-walk', 'dialog'], ['m14-labs', 'term']] as const) {
  const file = new URL(`../replays/${name}.json`, import.meta.url);
  const rf = JSON.parse(readFileSync(file, 'utf8'));
  const { vm, sym } = await loadGame(rf.seed);
  const bot = new Bot(vm, sym);
  const inputs = expandInputs(rf.inputs, rf.frames);
  let pick = 0;
  for (let f = 0; f < rf.frames && !pick; f++) {
    vm.step(inputs[f]!);
    if (want === 'dialog' && bot.mode === sym.get('M_DIALOG') && bot.ram('reveal') >= bot.ram('box_len')) pick = f + 1;
    if (want === 'term' && bot.mode === sym.get('M_TERM')) pick = f + 1;
  }
  writeFileSync(new URL(`../replays/${name}.frames.json`, import.meta.url), JSON.stringify([pick]) + '\n');
  console.log(`${name}: reference frame ${pick}`);
}
