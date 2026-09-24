import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { decodeQrRgbaZxing, initZxing } from '@qrc/qr';

let ready: Promise<void> | null = null;

/** zxing-wasm in Node, loaded from the local node_modules wasm file (no network). */
export async function zxingDecoder() {
  ready ??= (async () => {
    const require = createRequire(import.meta.url);
    const wasm = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));
    await initZxing(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
  })();
  await ready;
  return decodeQrRgbaZxing;
}
