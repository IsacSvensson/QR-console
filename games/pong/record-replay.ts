// Records games/pong/replay.json: a bot plays well for a while, then stops moving so the CPU wins.
// Run: npx tsx games/pong/record-replay.ts  (then `npm run refs:games`)
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCartridge } from '@qrc/asm';
import { parseCartridge } from '@qrc/cartridge';
import { BUTTONS, VM } from '@qrc/vm';

const FRAMES = Number(process.env.FRAMES ?? 1800);
const SEED = 11;
const dir = new URL('.', import.meta.url);
const { bytes, asm } = await buildCartridge(readFileSync(new URL('pong.asm', dir), 'utf8'));
const vm = VM.fromCartridge(await parseCartridge(bytes), { seed: SEED });
const ram = (n: string) => vm.read16(asm.symbols.get(n)!);
const s16 = (v: number) => (v << 16) >> 16;
const inputs: number[] = [];
for (let f = 0; f < FRAMES; f++) {
  let b = 0;
  const state = ram('state');
  if (state === 0 || state === 3) b = f % 60 === 30 ? BUTTONS.A : 0;
  else if (f < 1000) {
    const ball = (s16(ram('by')) >> 4) + 1;
    const pad = ram('p_y') + 8 + ((f >> 7) % 3) * 5 - 5; // aim off-centre to vary angles
    if (ball < pad - 1) b = BUTTONS.UP;
    else if (ball > pad + 1) b = BUTTONS.DOWN;
  }
  inputs.push(b);
  vm.step(b);
  if (process.env.TRACE && f % 100 === 0) console.log(f, 'state', ram('state'), 'score', ram('p_score'), ram('c_score'), 'rally', ram('rally'));
}
const rle: [number, number][] = [];
for (const b of inputs) {
  const last = rle[rle.length - 1];
  if (last && last[1] === b) last[0]++;
  else rle.push([1, b]);
}
writeFileSync(new URL('replay.json', dir), JSON.stringify({ seed: SEED, frames: FRAMES, inputs: rle }) + '\n');
console.log(`final: state ${ram('state')} score ${ram('p_score')}:${ram('c_score')} rally ${ram('rally')} fault ${vm.fault}`);
