// Development aid: renders named camera poses of the map (levels/*.map `poses`) as the VM draws them and writes
// .tmp/nadir/<pose>.png (scale 4), printing the cycles of each frame. Optional render flags (FL_* in defs.asm).
// Run: npx tsx games/nadir/tools/shot.ts [pose ...] [--flags N]
import { mkdirSync } from 'node:fs';
import { writeFramePng } from '@qrc/tools';
import { atPose, loadGame } from './game';
import { readMap } from './maps';

const args = process.argv.slice(2);
const fi = args.indexOf('--flags');
const flags = fi >= 0 ? Number(args[fi + 1]) : 0;
const names = args.filter((a, i) => !a.startsWith('--') && i !== fi + 1);
const poses = readMap('nadir').poses;
const g = await loadGame(1);
g.vm.step(0); // init
mkdirSync('.tmp/nadir', { recursive: true });
for (const [i, p] of poses.entries()) {
  if (names.length && !names.includes(p.name)) continue;
  const cycles = atPose(g, i + 1, flags);
  atPose(g, i + 1, flags); // a second frame so per-frame state (flicker) is settled
  const out = `.tmp/nadir/${p.name}.png`;
  writeFramePng(out, g.vm.fb, 4);
  console.log(`${p.name.padEnd(14)} ${String(g.vm.cyclesLastFrame).padStart(6)} cycles (first frame ${cycles})  ${out}`);
  if (g.vm.fault) throw new Error(g.vm.fault);
}
