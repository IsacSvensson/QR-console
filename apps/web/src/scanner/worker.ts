// QR decoding off the main thread with the locally bundled zxing-wasm (D-007). Returns raw bytes (L9).
import { decodeQrRgbaZxing, initZxing } from '@qrc/qr/zxing';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export interface DecodeRequest {
  id: number;
  width: number;
  height: number;
  rgba: ArrayBuffer;
}
export interface DecodeResponse {
  id: number;
  bytes: Uint8Array | null;
  ms: number;
  error?: string;
}

const ready = fetch(wasmUrl)
  .then((r) => r.arrayBuffer())
  .then((buf) => initZxing(buf));

const scope = self as unknown as { onmessage: ((e: MessageEvent<DecodeRequest>) => void) | null; postMessage(m: DecodeResponse, t?: Transferable[]): void };

scope.onmessage = async (e) => {
  const { id, width, height, rgba } = e.data;
  const t = performance.now();
  try {
    await ready;
    const bytes = await decodeQrRgbaZxing(new Uint8ClampedArray(rgba), width, height);
    scope.postMessage({ id, bytes, ms: performance.now() - t }, bytes ? [bytes.buffer] : []);
  } catch (err) {
    scope.postMessage({ id, bytes: null, ms: performance.now() - t, error: String(err) });
  }
};
