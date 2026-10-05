// Prints the frames of a replay that use the most VM cycles (a development aid).
// Run: npx tsx games/bo/tools/cycles.ts <replay name> [top N]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandInputs } from '@qrc/vm';
import { loadGame } from './bot';
import { GAME_DIR } from './util';

const name = process.argv[2]!;
const top = Number(process.argv[3] ?? 10);
const rf = JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8'));
const { vm, sym } = await loadGame(rf.seed);
const inputs = expandInputs(rf.inputs, rf.frames);
const list: [number, number, number][] = [];
for (let f = 0; f < rf.frames; f++) {
  vm.step(inputs[f]!);
  list.push([vm.cyclesLastFrame, f + 1, vm.read16(sym.get('mode')!)]);
}
list.sort((a, b) => b[0] - a[0]);
for (const [c, f, m] of list.slice(0, top)) console.log(`frame ${f}: ${c} cycles (mode ${m})`);
