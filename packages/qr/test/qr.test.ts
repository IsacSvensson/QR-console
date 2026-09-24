import { describe, expect, it } from 'vitest';
import { FountainDecoder, toHex } from '@qrc/transport';
import { randomBytes, testSeed } from '../../../test/helpers/rng';
import { bitmapToRgba, blockSizeFor, decodeQrRgba, planTransfer, qrByteCapacity, readGif, renderQr, writeGif } from '../src';

const SEED = testSeed(77);

describe('QR frames (layer 2 building blocks)', () => {
  it('capacity and block size for the defaults (v12-M)', () => {
    expect(qrByteCapacity(12, 'M')).toBe(287);
    expect(blockSizeFor(12, 'M')).toBe(262);
  });

  it('raw binary payloads (every byte value) survive render -> decode in byte mode', () => {
    for (const [version, ecc] of [[10, 'L'], [12, 'M'], [15, 'Q']] as const) {
      const cap = qrByteCapacity(version, ecc);
      const payload = randomBytes(SEED + version, cap);
      payload.set(Array.from({ length: 256 }, (_, i) => i).slice(0, cap));
      const bmp = renderQr(payload, { version, ecc });
      expect(bmp.width).toBe((17 + 4 * version + 8) * 4);
      expect(new Set(bmp.data)).toEqual(new Set([0, 255])); // pure black/white
      const out = decodeQrRgba(bitmapToRgba(bmp), bmp.width, bmp.height);
      expect(out && toHex(out), `v${version}-${ecc}`).toBe(toHex(payload));
    }
  });

  it('rejects payloads that do not fit the requested version', () => {
    expect(() => renderQr(new Uint8Array(288), { version: 12, ecc: 'M' })).toThrow();
  });

  it('GIF round trip is lossless and keeps frame timing', () => {
    const plan = planTransfer(randomBytes(SEED, 3000));
    const bitmaps = plan.packets.slice(0, 5).map((p) => renderQr(p));
    const frames = readGif(writeGif(bitmaps, 150));
    expect(frames.length).toBe(5);
    frames.forEach((f, i) => {
      expect(f.delayMs).toBe(150);
      for (let p = 0; p < bitmaps[i]!.data.length; p++) {
        if (f.rgba[p * 4] !== bitmaps[i]!.data[p]) throw new Error(`frame ${i} pixel ${p} differs`);
      }
    });
  });

  it(`50 KB arbitrary binary survives bytes -> packets -> QR images -> decode -> fountain (seed ${SEED})`, () => {
    const data = randomBytes(SEED, 50 * 1024);
    const plan = planTransfer(data);
    const dec = new FountainDecoder();
    for (const pkt of plan.packets) {
      const bmp = renderQr(pkt, plan.params);
      const raw = decodeQrRgba(bitmapToRgba(bmp), bmp.width, bmp.height);
      expect(raw).not.toBeNull();
      dec.receive(raw!);
      if (dec.done) break;
    }
    expect(dec.done).toBe(true);
    expect(toHex(dec.getResult()!)).toBe(toHex(data));
  });
});
