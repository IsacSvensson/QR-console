// Records games/breakout/replay.json: a bot tracks the ball for a while, then lets it drop.
// Run: npx tsx games/breakout/record-replay.ts  (then `npm run refs:games`)
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCartridge } from '@qrc/asm';
import { parseCartridge } from '@qrc/cartridge';
import { BUTTONS, VM } from '@qrc/vm';

const FRAMES = 1200;
const SEED = 7;
const dir = new URL('.', import.meta.url);
const { bytes, asm } = await buildCartridge(readFileSync(new URL('breakout.asm', dir), 'utf8'));
const vm = VM.fromCartridge(await parseCartridge(bytes), { seed: SEED });
const ram = (n: string) => vm.read16(asm.symbols.get(n)!);
const inputs: number[] = [];
for (let f = 0; f < FRAMES; f++) {
  let b = 0;
  if (ram('state') !== 1) b = f % 40 === 20 ? BUTTONS.A : 0;
  else if (f < 800) {
    const ball = ram('bx') >> 4;
    const pad = ram('pad_x') + 10 + ((f >> 6) % 3) * 4 - 4; // vary the hit point a little
    if (ball < pad - 1) b = BUTTONS.LEFT;
    else if (ball > pad + 1) b = BUTTONS.RIGHT;
  }
  inputs.push(b);
  vm.step(b);
}
// run-length encode
const rle: [number, number][] = [];
for (const b of inputs) {
  const last = rle[rle.length - 1];
  if (last && last[1] === b) last[0]++;
  else rle.push([1, b]);
}
writeFileSync(new URL('replay.json', dir), JSON.stringify({ seed: SEED, frames: FRAMES, inputs: rle }) + '\n');
console.log(`score ${ram('score')} lives ${ram('lives')} bricks ${ram('bricks_left')} state ${ram('state')}`);
