import { Mulberry32 } from '@qrc/transport';
import type { Bitmap } from './frames';

// Layer-3 camera simulator. Levels are defined in DECISIONS.md D-006 (fixed before measuring).

export interface DistortionLevel {
  scale: [number, number];
  rotationDeg: number;
  perspective: number;
  blur: number;
  contrast: number;
  noise: number;
  gradient: number;
}

export const LEVELS = {
  none: { scale: [1, 1], rotationDeg: 0, perspective: 0, blur: 0, contrast: 1, noise: 0, gradient: 0 },
  mild: { scale: [0.8, 1.25], rotationDeg: 3, perspective: 0.02, blur: 0.5, contrast: 0.8, noise: 4, gradient: 0.05 },
  moderate: { scale: [0.6, 1.4], rotationDeg: 7, perspective: 0.04, blur: 0.8, contrast: 0.6, noise: 8, gradient: 0.1 },
  strong: { scale: [0.5, 1.5], rotationDeg: 10, perspective: 0.06, blur: 1.2, contrast: 0.45, noise: 14, gradient: 0.2 },
} as const satisfies Record<string, DistortionLevel>;

export type LevelName = keyof typeof LEVELS;

/** Solves the 8x8 system for the homography mapping 4 points p -> q. Returns h (3x3, h[8] = 1). */
function homography(p: [number, number][], q: [number, number][]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = p[i]!;
    const [u, v] = q[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k < 9; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  return [...A.map((row, i) => row[8]! / row[i]!), 1];
}

/** Applies a random camera-like distortion (seeded) and returns an RGBA image. */
export function distort(src: Bitmap, level: DistortionLevel, seed: number): { width: number; height: number; rgba: Uint8ClampedArray } {
  const rng = new Mulberry32(seed);
  const uni = (a: number, b: number) => a + ((b - a) * rng.next()) / 4294967296;
  const s = uni(level.scale[0], level.scale[1]);
  const rot = (uni(-level.rotationDeg, level.rotationDeg) * Math.PI) / 180;
  const W = src.width;
  const out = Math.ceil(W * s * 1.3);
  const cx = out / 2;
  const cy = out / 2;
  const corners: [number, number][] = [
    [0, 0],
    [W, 0],
    [W, W],
    [0, W],
  ];
  const dst = corners.map(([x, y]) => {
    const dx = (x - W / 2) * s;
    const dy = (y - W / 2) * s;
    const px = cx + dx * Math.cos(rot) - dy * Math.sin(rot) + uni(-1, 1) * level.perspective * W * s;
    const py = cy + dx * Math.sin(rot) + dy * Math.cos(rot) + uni(-1, 1) * level.perspective * W * s;
    return [px, py] as [number, number];
  });
  const h = homography(dst, corners); // output pixel -> source coordinates

  // Resample (bilinear), white outside the source.
  let img = new Float32Array(out * out);
  const sample = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W - 1 || y >= src.height - 1) return 255;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const d = src.data;
    const i = y0 * W + x0;
    return (d[i]! * (1 - fx) + d[i + 1]! * fx) * (1 - fy) + (d[i + W]! * (1 - fx) + d[i + W + 1]! * fx) * fy;
  };
  for (let y = 0; y < out; y++) {
    for (let x = 0; x < out; x++) {
      const X = x + 0.5;
      const Y = y + 0.5;
      const w = h[6]! * X + h[7]! * Y + h[8]!;
      img[y * out + x] = sample((h[0]! * X + h[1]! * Y + h[2]!) / w - 0.5, (h[3]! * X + h[4]! * Y + h[5]!) / w - 0.5);
    }
  }

  // Gaussian blur (separable).
  if (level.blur > 0) {
    const r = Math.ceil(level.blur * 3);
    const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * level.blur ** 2)));
    const ks = k.reduce((a, b) => a + b);
    const pass = (a: Float32Array, horizontal: boolean) => {
      const b = new Float32Array(a.length);
      for (let y = 0; y < out; y++) {
        for (let x = 0; x < out; x++) {
          let acc = 0;
          for (let i = -r; i <= r; i++) {
            const xx = horizontal ? Math.min(out - 1, Math.max(0, x + i)) : x;
            const yy = horizontal ? y : Math.min(out - 1, Math.max(0, y + i));
            acc += a[yy * out + xx]! * k[i + r]!;
          }
          b[y * out + x] = acc / ks;
        }
      }
      return b;
    };
    img = pass(pass(img, true), false);
  }

  // Contrast, illumination gradient, noise.
  const gAngle = uni(0, 2 * Math.PI);
  const gx = Math.cos(gAngle);
  const gy = Math.sin(gAngle);
  const rgba = new Uint8ClampedArray(out * out * 4);
  for (let y = 0; y < out; y++) {
    for (let x = 0; x < out; x++) {
      let v = 128 + (img[y * out + x]! - 128) * level.contrast;
      v *= 1 + level.gradient * ((x / out - 0.5) * gx + (y / out - 0.5) * gy) * 2;
      if (level.noise > 0) {
        const u1 = Math.max(1e-12, rng.next() / 4294967296);
        const u2 = rng.next() / 4294967296;
        v += level.noise * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }
      const i = (y * out + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  return { width: out, height: out, rgba };
}
