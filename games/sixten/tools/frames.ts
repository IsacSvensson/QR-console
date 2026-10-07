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
// a frame number, or "mode:N" for the 10th frame of the first stay in mode N
const marks = new Set(want.filter((w) => !w.startsWith('mode:')).map(Number));
const modes = new Map(want.filter((w) => w.startsWith('mode:')).map((w) => [Number(w.slice(5)), 0]));
mkdirSync(out, { recursive: true });
const u = (n: string) => vm.read16(sym.get(n)!);
for (let f = 0; f < rf.frames; f++) {
  vm.step(inputs[f]!);
  const m = u('mode');
  if (modes.has(m) && modes.get(m)! >= 0) {
    modes.set(m, modes.get(m)! + 1);
    if (modes.get(m) === 10) {
      marks.add(f + 1);
      modes.set(m, -1);
    }
  }
  if (marks.has(f + 1)) {
    writeFramePng(join(out, `${name}.f${f + 1}.png`), vm.fb, 4);
    console.log(`frame ${f + 1}: mode ${u('mode')} world ${u('world')} level ${u('level')} n_aj ${u('n_aj')} wood ${u('wood')} book ${[0, 1, 2, 3, 4].map((i) => vm.read8(sym.get('book')! + i).toString(2).padStart(8, '0')).join(' ')}`);
    console.log(`  whirl state ${u('wh_state')} s ${u('wh_s')} at ${u('wh_x') >> 4},${u('wh_y') >> 4} t ${u('wh_t')}; Sixten ${u('px') >> 4},${u('py') >> 4} hearts ${u('hearts')} sheltered ${u('sheltered')} danger ${u('danger')}`);
  }
}
