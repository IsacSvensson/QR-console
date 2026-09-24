import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { decodeQrRgba, decodeQrRgbaZxing, initZxing } from '@qrc/qr';

export type DecoderName = 'jsqr' | 'zxing-single' | 'zxing';
export type Decoder = (rgba: Uint8ClampedArray, w: number, h: number) => Promise<Uint8Array | null>;

export async function loadDecoders(): Promise<Record<DecoderName, Decoder>> {
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));
  await initZxing(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
  return {
    jsqr: async (d, w, h) => decodeQrRgba(d, w, h),
    'zxing-single': (d, w, h) => decodeQrRgbaZxing(d, w, h, { fallback: false }),
    zxing: (d, w, h) => decodeQrRgbaZxing(d, w, h),
  };
}
