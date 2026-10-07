// Development aid: play a recorded replay and dump chosen frames as PNG (4x), with the whirlwind's state.
// Run: npx tsx games/sixten/tools/frames.ts <replay name> <out dir> <frame> [frame …]
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeFramePng } from '@qrc/tools';
import { expandInputs } from '@qrc/vm';
import { loadGame } from './bot';
import { GAME_DIR } from './util';

const [name, out = 'frames', ...want] = process.argv.slice(2);
const rf = JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8'));
const { vm, sym } = await loadGame(rf.seed);
const inputs = expandInputs(rf.inputs, rf.frames);
const marks = new Set(want.map(Number));
mkdirSync(out, { recursive: true });
const u = (n: string) => vm.read16(sym.get(n)!);
for (let f = 0; f < rf.frames; f++) {
  vm.step(inputs[f]!);
  if (marks.has(f + 1)) {
    writeFramePng(join(out, `${name}.f${f + 1}.png`), vm.fb, 4);
    console.log(`frame ${f + 1}: whirl state ${u('wh_state')} s ${u('wh_s')} at ${u('wh_x') >> 4},${u('wh_y') >> 4} t ${u('wh_t')}; Sixten ${u('px') >> 4},${u('py') >> 4} hearts ${u('hearts')} sheltered ${u('sheltered')} danger ${u('danger')}`);
  }
}
