// Development aid: renders a camera pose (levels/*.map `poses`) without pacing and prints the 3D boxes among the
// sprite records (boxes.asm: corners in camera space, their projections, the screen box) and, per column, the
// nearest box side drawn there (col_bface = prop * 4 + side) and its top y.
// Run: npx tsx games/nadir/tools/dbgbox.ts <pose>
import { atPose, loadGame } from './game';
import { readMap } from './maps';

const name = process.argv[2] ?? 'storeroom';
const poses = readMap('nadir').poses;
const i = poses.findIndex((p) => p.name === name);
if (i < 0) throw new Error(`no pose ${name}`);
const g = await loadGame(1);
g.vm.step(0);
atPose(g, i + 1, 64);
const s16 = (a: number) => (g.vm.read16(a) << 16) >> 16;
const SR_SIZE = 58;
console.log(`${name}: ${g.vm.cyclesLastFrame} cycles${g.vm.fault ? `, fault ${g.vm.fault}` : ''}`);
for (let k = 0; k < g.vm.read16(g.S('spr_cn')); k++) {
  const a = g.S('spr_cand') + SR_SIZE * k;
  if (!g.vm.read8(g.vm.read16(a + 20) + 15)) continue;
  const c = [0, 1, 2, 3].map((j) => `${s16(a + 24 + 4 * j)},${s16(a + 26 + 4 * j)}`).join(' ');
  const p = [0, 1, 2, 3].map((j) => `${s16(a + 40 + 4 * j)},${s16(a + 42 + 4 * j)}`).join(' ');
  console.log(`box prop ${(g.vm.read16(a) - g.S('props')) / 8}: z ${s16(a + 2)} h ${s16(a + 4)} left ${s16(a + 14)} wid ${s16(a + 12)} top ${s16(a + 16)} hgt ${s16(a + 10)} hmax ${s16(a + 56)}; corners (z, lat) ${c}; projected (x16, h8) ${p}`);
}
const col = (s: string) => Array.from({ length: 64 }, (_, j) => s16(g.S(s) + 2 * j));
console.log(`col_bface ${col('col_bface').join(' ')}`);
console.log(`col_btop  ${col('col_btop').join(' ')}`);
