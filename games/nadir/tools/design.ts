// Reads the tables of games/nadir/DESIGN.md that the generators use: the constants (§3.3), the flicker patterns,
// the flashlight cone and the zones (§3.5). The tests read the same document with their own code
// (test/nadir/ref.ts), so DESIGN.md stays the single specification.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from './util';

const design = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');

function section(start: string, end: string): string {
  const a = design.indexOf(start);
  const b = design.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`DESIGN.md: no section ${start}`);
  return design.slice(a, b);
}

/** The constant tables (§3.3, §3.10, §5): NAME -> value. */
export const K: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const m of design.matchAll(/^\| `([A-Z_0-9]+)` \| (-?\d+) \|/gm)) out[m[1]!] = Number(m[2]);
  return out;
})();

export function k(name: string): number {
  const v = K[name];
  if (v === undefined) throw new Error(`DESIGN.md: no constant ${name}`);
  return v;
}

const light = section('### 3.5', '### 3.6');

/** §3.5: flicker patterns, one string of 32 '0'/'1' per group. */
export const FLICKER: string[] = [...light.matchAll(/^\| (\d) \| `([01]{32})` \|/gm)].sort((a, b) => Number(a[1]) - Number(b[1])).map((m) => m[2]!);

/** §3.5: cone value per sample column. */
export const CONE: number[] = (() => {
  const out = new Array<number>(64).fill(0);
  for (const m of light.matchAll(/^\| (\d) \| ([\d–, -]+) \|$/gm)) {
    for (const part of m[2]!.split(',')) {
      const [a, b] = part.trim().split('–').map(Number);
      for (let c = a!; c <= (b ?? a!); c++) out[c] = Number(m[1]);
    }
  }
  return out;
})();

export interface Zone {
  id: number;
  name: string;
  amb: number;
  fog: number;
  /** floor and ceiling colours from near to far (DESIGN §3.7) */
  floor: number[];
  ceil: number[];
  light: number;
  /** the light pool's outer ring */
  rim: number;
}

/** §3.5: the zones. */
export const ZONES: Zone[] = [...light.matchAll(/^\| (\d) \| (\S+) \| (\d) \| (\d+) \| ([\d ]+) \| ([\d ]+) \| (\d+) \| (\d+) \|$/gm)].map((m) => ({
  id: Number(m[1]),
  name: m[2]!,
  amb: Number(m[3]),
  fog: Number(m[4]),
  floor: m[5]!.trim().split(/\s+/).map(Number),
  ceil: m[6]!.trim().split(/\s+/).map(Number),
  light: Number(m[7]),
  rim: Number(m[8]),
}));

if (FLICKER.length !== 4) throw new Error(`DESIGN.md §3.5: expected 4 flicker patterns, found ${FLICKER.length}`);
if (ZONES.length !== 4) throw new Error(`DESIGN.md §3.5: expected 4 zones, found ${ZONES.length}`);
