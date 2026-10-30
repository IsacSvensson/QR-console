// Writes tables.gen.asm: the renderer's constants (from DESIGN.md §3.3), trigonometry, the per-column angle and
// cosine tables, the head bob, the fog, cone, flicker and zone tables, and the shade tables (DESIGN.md §3.4–3.5).
// Run: npx tsx games/nadir/tools/tables.ts   (or npm run nadir:gen)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PALETTE } from '@qrc/vm';
import { CONE, FLICKER, ZONES, k } from './design';
import { GAME_DIR, byteLines, isMain, wordLines } from './util';

export const ANGLES = k('ANGLES');
export const COLS = k('COLS');
const QUARTER = ANGLES / 4;

/** Angle offset of sample column c in angle units (DESIGN §3.2), exact (float). */
export function colOffset(c: number): number {
  const camX = (2 * c + 1 - k('SCREEN_W') / 2) / (k('SCREEN_W') / 2);
  const half = ((k('FOV_DEG') / 2) * Math.PI) / 180;
  return (Math.atan(camX * Math.tan(half)) * ANGLES) / (2 * Math.PI);
}

/**
 * Ray tables sampled at half steps: entry i is the value at (i + 1/2) * 90 / 1024 degrees, i = 0..1023, so the
 * mirrored index 1023 - i is exactly the complementary angle and folding an angle is one XOR (DESIGN §3.2: every
 * ray is cast half an angle unit to the right of its tabulated angle).
 */
const half = (i: number) => ((i + 0.5) * 2 * Math.PI) / ANGLES;
export const SIN_H = Array.from({ length: QUARTER }, (_, i) => Math.round(Math.sin(half(i)) * 16384));
export const RCP_H = Array.from({ length: QUARTER }, (_, i) => Math.min(32767, Math.round(256 / Math.cos(half(i)))));
export const COLANG = Array.from({ length: COLS }, (_, c) => Math.round(colOffset(c)));
/** F256 / cos(column offset): the wall height is this divided by the ray length t (u8.8), DESIGN §3.2 */
export const COLF = COLANG.map((a) => Math.round(k('F256') / Math.cos(((a + 0.5) * 2 * Math.PI) / ANGLES)));

/** DESIGN §3.5: the distance in quarter cells that the light rule uses for a wall drawn h px tall. */
export function qOfH(h: number): number {
  return h === 0 ? 255 : Math.min(255, Math.floor(k('F256') / (64 * Math.min(h, 255))));
}

/** DESIGN §3.5: fog level for a distance of q quarter cells. */
export function fogLevel(q: number): number {
  const near = k('FOG_NEAR_Q');
  const step = k('FOG_STEP_Q');
  return q < near ? 0 : Math.min(7, 1 + Math.floor((q - near) / step));
}

// ---- shade tables -------------------------------------------------------------------------------------
const rgb = (i: number) => [(PALETTE[i]! >> 16) & 255, (PALETTE[i]! >> 8) & 255, PALETTE[i]! & 255] as const;
/** Relative luminance (sRGB weights, no gamma: enough to order the palette). */
export const lum = (i: number) => {
  const [r, g, b] = rgb(i);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** "redmean" colour distance */
function dist(a: readonly number[], b: readonly number[]) {
  const rm = (a[0]! + b[0]!) / 2;
  const dr = a[0]! - b[0]!;
  const dg = a[1]! - b[1]!;
  const db = a[2]! - b[2]!;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}
const BRIGHT = [1, 0.84, 0.7, 0.56, 0.44, 0.32, 0.2, 0];
const TINT = [0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.85, 1];
const LEVELS = k('LEVELS');
/** added to the fog tables so that fog - cone + amb - light is never negative when it indexes clamp_tab */
export const FOG_BIAS = 16;

/** shade[zone][level][index 0..31]: palette colour drawn for texture colour `index` at `level` (DESIGN §3.5). */
export function shadeTables(): number[][][] {
  return ZONES.map((z) => {
    const fog = rgb(z.fog);
    const plain: number[][] = Array.from({ length: LEVELS }, () => new Array<number>(16).fill(0));
    for (let c = 0; c < 16; c++) {
      let prev = c;
      plain[0]![c] = c;
      for (let L = 1; L < LEVELS; L++) {
        if (L === LEVELS - 1 || c === 0) {
          plain[L]![c] = 0;
          prev = 0;
          continue;
        }
        const src = rgb(c);
        const target = [0, 1, 2].map((i) => (src[i]! * (1 - TINT[L]!) + fog[i]! * TINT[L]!) * BRIGHT[L]!);
        let best = 0;
        let bd = Infinity;
        for (let p = 0; p < 16; p++) {
          if (lum(p) > lum(prev) + 1e-6) continue; // never brighter than the level before
          const d = dist(target, rgb(p));
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        plain[L]![c] = best;
        prev = best;
      }
    }
    return plain.map((row, L) => [...row, ...row.map((_, c) => (L <= 5 ? c : plain[L === 6 ? 2 : 4]![c]!))]);
  });
}

export function tablesAsm(): string {
  const consts = ['SCREEN_W', 'COLS', 'COL_W', 'HORIZON', 'ANGLES', 'CELL', 'MAP_W', 'MAP_H', 'TEX', 'F256', 'PERP_MIN', 'FOG_NEAR_Q', 'FOG_STEP_Q', 'FL_RANGE_Q', 'LOD1_H', 'LOD2_H', 'FEAT_H', 'FLICK_SHIFT', 'LEVELS', 'DOOR_SPEED', 'DOOR_WAIT', 'DOOR_REACH', 'P_RAD', 'WALK_MAX', 'BACK_MAX', 'WALK_ACC', 'TURN_MIN', 'TURN_ACC', 'TURN_MAX', 'DTAP_FRAMES', 'DASH_V', 'DASH_FRAMES', 'BOB_SHIFT', 'PACE_MCOLS'];
  const shade = shadeTables();
  const L: string[] = [
    '; GENERATED by games/nadir/tools/tables.ts from DESIGN.md §3.3-3.5 - do not edit.',
    ...consts.map((c) => `${c} = ${k(c)}`),
    `FOG_BIAS = ${FOG_BIAS}`,
    '',
    '.data',
    '; sin((i + 1/2) * 90 / 1024 degrees), s1.14, and 1 / cos of the same angle, u8.8 clamped at 32767 (tiny cosines: ray.asm)',
    'sin_h:',
    ...wordLines(SIN_H),
    'rcp_h:',
    ...wordLines(RCP_H),
    '; per sample column: angle offset (u12 units, signed) and F256 / cos(offset)',
    'colang:',
    ...wordLines(COLANG.map((a) => a & 0xffff)),
    'colf:',
    ...wordLines(COLF),
    '; by wall height h (0..512; t >= 1/4 cell keeps h <= 512): the fog level of q = F256 / (64 h) (DESIGN §3.5) minus the',
    '; flashlight cone k (k = 0, 1, 2) within its range, plus FOG_BIAS so that the sum with a span base indexes clamp_tab',
    ...[0, 1, 2].flatMap((c) => [`fog_t${c}:`, ...byteLines(Array.from({ length: 513 }, (_, h) => {
      const q = qOfH(h);
      return fogLevel(q) - (q < k('FL_RANGE_Q') ? c : 0) + FOG_BIAS;
    }))]),
    '; per sample column: its fog table (the one with its flashlight cone)',
    'colfog:',
    ...wordLines(CONE.map((c) => `fog_t${c}`)),
    '; clamp_tab[fog + bias + amb - light] = the light level, clamped to 0..7',
    'clamp_tab:',
    ...byteLines(Array.from({ length: 2 * FOG_BIAS }, (_, i) => Math.max(0, Math.min(7, i - FOG_BIAS)))),
    '; flashlight cone per sample column (for reference; the fog tables apply it)',
    'cone_tab:',
    ...byteLines(CONE),
    '; head bob by phase index (DESIGN §5)',
    'bob_tab:',
    ...wordLines(Array.from({ length: 16 }, (_, i) => Math.round(k('BOB_AMP') * Math.sin((2 * Math.PI * i) / 16)) & 0xffff)),
    '; flicker patterns: 4 groups x 32 steps, 1 = lit',
    'flick_tab:',
    ...FLICKER.flatMap((p) => byteLines([...p].map(Number))),
    '; zones: amb (darkness), then per zone the shade table set (8 levels x 32 colours)',
    'zone_amb:',
    ...byteLines(ZONES.map((z) => z.amb)),
    'shade:',
    ...shade.flatMap((zone, zi) => [`    ; zone ${zi} ${ZONES[zi]!.name}`, ...zone.flatMap((lvl) => byteLines(lvl, 32))]),
    '',
  ];
  return L.join('\n');
}

if (isMain(import.meta.url)) {
  writeFileSync(join(GAME_DIR, 'tables.gen.asm'), tablesAsm());
  console.log('tables.gen.asm written');
}
