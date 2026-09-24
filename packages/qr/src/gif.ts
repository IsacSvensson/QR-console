import { GifReader, GifWriter } from 'omggif';
import type { Bitmap } from './frames';

/** Lossless black/white GIF animation, looping forever (SPEC L10). */
export function writeGif(frames: Bitmap[], frameMs: number): Uint8Array {
  if (frames.length === 0) throw new Error('no frames');
  const { width, height } = frames[0]!;
  const buf = new Uint8Array(1024 + frames.length * (width * height + 2048));
  const gw = new GifWriter(buf, width, height, { loop: 0, palette: [0x000000, 0xffffff] });
  const delay = Math.max(2, Math.round(frameMs / 10)); // GIF delay unit is 10 ms
  const idx = new Uint8Array(width * height);
  for (const f of frames) {
    if (f.width !== width || f.height !== height) throw new Error('all frames must have the same size');
    for (let i = 0; i < idx.length; i++) idx[i] = f.data[i]! >= 128 ? 1 : 0;
    gw.addFrame(0, 0, width, height, idx as unknown as number[], { delay, disposal: 1 });
  }
  return buf.slice(0, gw.end());
}

export interface GifFrame {
  width: number;
  height: number;
  /** RGBA */
  rgba: Uint8ClampedArray;
  delayMs: number;
}

export function readGif(bytes: Uint8Array): GifFrame[] {
  const r = new GifReader(bytes);
  const out: GifFrame[] = [];
  const canvas = new Uint8ClampedArray(r.width * r.height * 4);
  for (let i = 0; i < r.numFrames(); i++) {
    r.decodeAndBlitFrameRGBA(i, canvas);
    out.push({ width: r.width, height: r.height, rgba: canvas.slice(), delayMs: r.frameInfo(i).delay * 10 });
  }
  return out;
}

export function bitmapToRgba(b: Bitmap): Uint8ClampedArray {
  const out = new Uint8ClampedArray(b.width * b.height * 4);
  for (let i = 0; i < b.data.length; i++) {
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = b.data[i]!;
    out[i * 4 + 3] = 255;
  }
  return out;
}
