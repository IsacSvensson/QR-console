import { Mode } from './packet';
import { Mulberry32 } from './prng';
import { sampleDegree, solitonCdf } from './soliton';

/**
 * Source-block indices combined in the packet with this seed (PACKET.md §Derivation).
 * Systematic mode: seed < K -> [seed]. Otherwise: PRNG = mulberry32(seed); degree from the
 * robust soliton CDF using the first draw; neighbours by a partial Fisher–Yates shuffle of 0..K-1.
 * Systematic repair packets (seed >= K) use degree max(d, ceil(K/2)): after the source phase only the
 * lost blocks are unknown, and low-degree repair packets almost never touch them (bench/fountain.md, D-003).
 */
export function neighbours(mode: Mode, seed: number, K: number): number[] {
  if (mode === Mode.Systematic && seed < K) return [seed];
  if (K === 1) return [0];
  const rng = new Mulberry32(seed);
  let d = sampleDegree(solitonCdf(K), rng.next());
  if (mode === Mode.Systematic) d = Math.max(d, Math.ceil(K / 2));
  const idx = new Array<number>(K);
  for (let i = 0; i < K; i++) idx[i] = i;
  for (let i = 0; i < d; i++) {
    const j = i + rng.below(K - i);
    const t = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = t;
  }
  return idx.slice(0, d);
}
