// Writes the contact sheet games/nadir/m27-sheet.png: every camera pose of levels/nadir.map as the VM draws it,
// scale 2, in the order of the map's `poses` (5 per row). For review as an image (PLAN.md M26-M27).
// Run: npx tsx games/nadir/tools/sheet.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { PALETTE } from '@qrc/vm';
import { atPose, loadGame } from './game';
import { readMap } from './maps';
import { GAME_DIR } from './util';

const S = 2;
const PER_ROW = 5;
const poses = readMap('nadir').poses;
const g = await loadGame(1);
g.vm.step(0);
const cell = 128 * S + 4;
const W = cell * PER_ROW + 4;
const H = cell * Math.ceil(poses.length / PER_ROW) + 4;
const png = new PNG({ width: W, height: H });
png.data.fill(255);
poses.forEach((p, i) => {
  atPose(g, i + 1);
  atPose(g, i + 1);
  const ox = 4 + (i % PER_ROW) * cell;
  const oy = 4 + Math.floor(i / PER_ROW) * cell;
  for (let y = 0; y < 128 * S; y++)
    for (let x = 0; x < 128 * S; x++) {
      const c = PALETTE[g.vm.fb[((y / S) | 0) * 128 + ((x / S) | 0)]!]!;
      const d = ((oy + y) * W + ox + x) * 4;
      png.data[d] = c >> 16;
      png.data[d + 1] = (c >> 8) & 255;
      png.data[d + 2] = c & 255;
    }
  console.log(`${p.name}: ${g.vm.cyclesLastFrame} cycles`);
});
writeFileSync(join(GAME_DIR, 'm27-sheet.png'), PNG.sync.write(png));
console.log('wrote games/nadir/m27-sheet.png');
