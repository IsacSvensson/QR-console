// Generates public/icons/icon-{192,512}.png (committed). Run: npx tsx apps/web/scripts/make-icons.ts
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

// 16x16 design: a QR-ish finder pattern with a "play" triangle. 0 bg, 1 white, 2 yellow.
const art = [
  '................',
  '.1111111........',
  '.1.....1..1.1.1.',
  '.1.111.1...1..1.',
  '.1.111.1.1.1.1..',
  '.1.111.1........',
  '.1.....1..22....',
  '.1111111..222...',
  '..........2222..',
  '.1.1.1....22222.',
  '..1.1.1...2222..',
  '.1.1..1...222...',
  '..11.1....22....',
  '.1.1.11.........',
  '..1.1.1.1.......',
  '................',
];
const colours = [[0x14, 0x0c, 0x1c], [0xde, 0xee, 0xd6], [0xda, 0xd4, 0x5e]];
for (const size of [192, 512]) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = art[Math.floor((y * 16) / size)]![Math.floor((x * 16) / size)]!;
      const rgb = colours[c === '.' ? 0 : Number(c)]!;
      png.data.set([...rgb, 255], (y * size + x) * 4);
    }
  }
  writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), PNG.sync.write(png));
}
