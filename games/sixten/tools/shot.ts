// Development aid: run the cartridge with a little input script and dump frames as PNG (4x), with cycles.
// Run: npx tsx games/sixten/tools/shot.ts <out dir> "<frames>:<buttons>,…" [level id]
//   e.g. "60:0,40:2,1:32,10:0" = 60 frames idle, 40 frames right, B once, 10 frames idle (buttons: VM bitmask)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeFramePng } from '@qrc/tools';
import { loadGame } from './bot';
import { levelIds } from './levels';

const [out = 'shots', script = '30:0', level] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const { vm, sym } = await loadGame();
vm.step(0);
if (level) {
  vm.write16(sym.get('dbg_level')!, levelIds().indexOf(level) + 1);
  vm.step(0);
}
let f = 0;
let max = 0;
for (const part of script.split(',')) {
  const [n, b] = part.split(':').map(Number);
  for (let i = 0; i < n!; i++) {
    vm.step(b!);
    max = Math.max(max, vm.cyclesLastFrame);
    f++;
  }
  writeFramePng(join(out, `f${String(f).padStart(5, '0')}.png`), vm.fb, 4);
}
console.log(`${f} frames, max cycles ${max}, fault ${vm.fault ?? 'none'}, px ${vm.read16(sym.get('px')!) >> 4} py ${vm.read16(sym.get('py')!) >> 4} mode ${vm.read16(sym.get('mode')!)}`);
