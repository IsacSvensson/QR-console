import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { PALETTE, SCREEN, toRgba } from '@qrc/vm';

/** Framebuffer (palette indices) -> PNG file, optionally scaled up by an integer factor. */
export function framebufferToPng(fb: Uint8Array, scale = 1): Buffer {
  const size = SCREEN * scale;
  const png = new PNG({ width: size, height: size });
  const rgba = toRgba(fb);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = ((y / scale) | 0) * SCREEN + ((x / scale) | 0);
      png.data.set(rgba.subarray(s * 4, s * 4 + 4), (y * size + x) * 4);
    }
  }
  return PNG.sync.write(png);
}

export function writeFramePng(path: string, fb: Uint8Array, scale = 1) {
  writeFileSync(path, framebufferToPng(fb, scale));
}

/** Reads a 128x128 reference PNG back into palette indices; throws on any colour outside the palette. */
export function readFramePng(path: string): Uint8Array {
  const png = PNG.sync.read(readFileSync(path));
  if (png.width !== SCREEN || png.height !== SCREEN) throw new Error(`${path}: expected ${SCREEN}x${SCREEN}, got ${png.width}x${png.height}`);
  const lookup = new Map(PALETTE.map((c, i) => [c, i]));
  const fb = new Uint8Array(SCREEN * SCREEN);
  for (let i = 0; i < fb.length; i++) {
    const c = (png.data[i * 4]! << 16) | (png.data[i * 4 + 1]! << 8) | png.data[i * 4 + 2]!;
    const idx = lookup.get(c);
    if (idx === undefined) throw new Error(`${path}: pixel ${i} colour #${c.toString(16)} is not in the palette`);
    fb[i] = idx;
  }
  return fb;
}
