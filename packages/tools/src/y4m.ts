import { readGif } from '@qrc/qr';

/**
 * Converts a (black/white) GIF animation into a YUV4MPEG2 file that Chromium can play as a fake
 * camera (`--use-file-for-fake-video-capture`). Each GIF frame becomes one video frame at a frame rate
 * matching the GIF delay; the image is centred on a grey background, optionally scaled (nearest).
 */
export function gifToY4m(gif: Uint8Array, opts: { width?: number; height?: number; scale?: number; background?: number } = {}): Uint8Array {
  const W = opts.width ?? 640;
  const H = opts.height ?? 480;
  const scale = opts.scale ?? 1;
  const bg = opts.background ?? 110;
  const frames = readGif(gif);
  if (frames.length === 0) throw new Error('GIF has no frames');
  const delay = frames[0]!.delayMs;
  // frame rate as a fraction: 1000 / delay
  const header = `YUV4MPEG2 W${W} H${H} F1000:${delay} Ip A1:1 C420jpeg\n`;
  const ySize = W * H;
  const cSize = (W / 2) * (H / 2);
  const frameHeader = 'FRAME\n';
  const out = new Uint8Array(header.length + frames.length * (frameHeader.length + ySize + 2 * cSize));
  const enc = new TextEncoder();
  out.set(enc.encode(header), 0);
  let off = header.length;
  for (const f of frames) {
    out.set(enc.encode(frameHeader), off);
    off += frameHeader.length;
    const y = out.subarray(off, off + ySize);
    y.fill(bg);
    const fw = f.width * scale;
    const fh = f.height * scale;
    const x0 = Math.floor((W - fw) / 2);
    const y0 = Math.floor((H - fh) / 2);
    for (let py = 0; py < fh; py++) {
      const ty = y0 + py;
      if (ty < 0 || ty >= H) continue;
      for (let px = 0; px < fw; px++) {
        const tx = x0 + px;
        if (tx < 0 || tx >= W) continue;
        const s = (Math.floor(py / scale) * f.width + Math.floor(px / scale)) * 4;
        // BT.601 luma, full range (C420jpeg)
        y[ty * W + tx] = Math.round(0.299 * f.rgba[s]! + 0.587 * f.rgba[s + 1]! + 0.114 * f.rgba[s + 2]!);
      }
    }
    off += ySize;
    out.fill(128, off, off + 2 * cSize); // no colour
    off += 2 * cSize;
  }
  return out;
}
