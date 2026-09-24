import jsQR from 'jsqr';

/**
 * Decodes one QR symbol from an RGBA image and returns the decoder's **raw bytes** (SPEC L9),
 * never a text string. Returns null when no symbol is found.
 */
export function decodeQrRgba(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array | null {
  const r = jsQR(rgba, width, height, { inversionAttempts: 'dontInvert' });
  if (!r || r.binaryData.length === 0) return null;
  return Uint8Array.from(r.binaryData);
}
