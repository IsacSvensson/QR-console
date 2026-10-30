// Development aid: the largest frame (cycles) of every replay in replays/, and how many images took three frames
// (DESIGN §3.11). Builds from source, so it measures uncommitted changes. Run: npx tsx games/nadir/tools/budget.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandInputs } from '@qrc/vm';
import { loadGame } from './game';
import { GAME_DIR } from './util';

const out: string[] = [];
let three = 0;
let images = 0;
for (const file of readdirSync(join(GAME_DIR, 'replays')).filter((f) => f.endsWith('.json')).sort()) {
  const rf = JSON.parse(readFileSync(join(GAME_DIR, 'replays', file), 'utf8'));
  const g = await loadGame(rf.seed);
  const inputs = expandInputs(rf.inputs, rf.frames);
  let max = 0;
  for (let f = 0; f < rf.frames; f++) {
    g.vm.step(inputs[f]!);
    const pace = g.vm.read16(g.S('pace'));
    if (pace === 2) three++;
    if (pace === 0) images++;
    if (f) max = Math.max(max, g.vm.cyclesLastFrame);
  }
  out.push(`${file.replace('.json', '')} ${max}`);
}
console.log(`${out.join(', ')}; ${three} of ${images} images took three frames`);
