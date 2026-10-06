// Picks reference frames for the bubble tests: in the given replays, the first frame of every distinct line that
// is fully shown (half a second after it appears). Writes replays/<name>.frames.json; `npm run refs:games` then
// dumps those frames from the VM as PNG. Run: npx tsx games/bo/tools/pick-frames.ts [replay…]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandInputs } from '@qrc/vm';
import { loadGame } from './bot';
import { GAME_DIR, isMain } from './util';

export async function pickFrames(name: string) {
  const rf = JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8'));
  const { vm, sym } = await loadGame(rf.seed);
  const inputs = expandInputs(rf.inputs, rf.frames);
  const seen = new Set<number>();
  const frames: number[] = [];
  const want = sym.get('BUB_T')! - 30;
  for (let f = 0; f < rf.frames; f++) {
    vm.step(inputs[f]!);
    if (vm.read16(sym.get('bub_t')!) !== want) continue;
    const id = vm.read16(sym.get('bub_id')!);
    if (seen.has(id)) continue;
    seen.add(id);
    frames.push(f + 1);
  }
  writeFileSync(join(GAME_DIR, 'replays', `${name}.frames.json`), JSON.stringify(frames) + '\n');
  console.log(`${name}: reference frames ${frames.join(', ')}`);
}

if (isMain(import.meta.url)) for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['m21-zoo1', 'm21-zoo2']) await pickFrames(name);
