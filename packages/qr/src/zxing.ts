import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

/**
 * zxing-wasm decoder. The caller supplies the wasm binary (Node: read the file; browser: fetch a locally
 * bundled asset), so nothing is ever loaded from a CDN (SPEC L11).
 */
export async function initZxing(wasmBinary: ArrayBuffer): Promise<void> {
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
}

type Binarizer = 'LocalAverage' | 'GlobalHistogram';

async function readWith(img: ImageData, binarizer: Binarizer): Promise<Uint8Array | null> {
  const res = await readBarcodes(img, { formats: ['QRCode'], maxNumberOfSymbols: 1, tryHarder: true, binarizer });
  const r = res.find((x) => x.isValid && x.bytes.length > 0);
  return r ? Uint8Array.from(r.bytes) : null;
}

/**
 * Decodes one QR symbol and returns its raw bytes. Tries zxing's default LocalAverage binarizer first
 * and, only if that finds nothing, GlobalHistogram, which copes better with small, blurred modules
 * (D-007). `fallback: false` gives the single-pass behaviour for benchmarking.
 */
export async function decodeQrRgbaZxing(rgba: Uint8ClampedArray, width: number, height: number, opts: { fallback?: boolean } = {}): Promise<Uint8Array | null> {
  const img = { data: rgba, width, height, colorSpace: 'srgb' } as ImageData;
  const first = await readWith(img, 'LocalAverage');
  if (first || opts.fallback === false) return first;
  return readWith(img, 'GlobalHistogram');
}
