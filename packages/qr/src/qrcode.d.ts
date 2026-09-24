// Minimal typings for the internal qrcode modules we use.
declare module 'qrcode/lib/core/version.js' {
  export function getCapacity(version: number, ecl: unknown, mode: unknown): number;
}
declare module 'qrcode/lib/core/error-correction-level.js' {
  export function from(v: string): unknown;
}
declare module 'qrcode/lib/core/mode.js' {
  export const BYTE: unknown;
}
