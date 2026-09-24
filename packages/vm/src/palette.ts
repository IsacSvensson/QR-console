// Fixed 16-colour runtime palette (SPEC L3): DawnBringer 16. Index -> 0xRRGGBB.
export const PALETTE: readonly number[] = [
  0x140c1c, 0x442434, 0x30346d, 0x4e4a4e, 0x854c30, 0x346524, 0xd04648, 0x757161,
  0x597dce, 0xd27d2c, 0x8595a1, 0x6daa2c, 0xd2aa99, 0x6dc2ca, 0xdad45e, 0xdeeed6,
];

export const COLOR_NAMES = [
  'BLACK', 'PURPLE', 'NAVY', 'DARKGRAY', 'BROWN', 'DARKGREEN', 'RED', 'GRAY',
  'BLUE', 'ORANGE', 'LIGHTGRAY', 'GREEN', 'PEACH', 'CYAN', 'YELLOW', 'WHITE',
] as const;

/** Framebuffer (palette indices) -> RGBA bytes. */
export function toRgba(fb: Uint8Array, out = new Uint8Array(fb.length * 4)): Uint8Array {
  for (let i = 0; i < fb.length; i++) {
    const c = PALETTE[fb[i]! & 15]!;
    out[i * 4] = c >>> 16;
    out[i * 4 + 1] = (c >>> 8) & 0xff;
    out[i * 4 + 2] = c & 0xff;
    out[i * 4 + 3] = 255;
  }
  return out;
}
