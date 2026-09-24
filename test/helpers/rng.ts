/** Seeded PRNG for tests (mulberry32). Tests print the seed in their names/messages so failures reproduce. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBytes(seed: number, n: number): Uint8Array {
  const r = rng(seed);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(r() * 256);
  return out;
}

/** Test seed: from QRC_SEED env var if set, else the given default. */
export function testSeed(fallback: number): number {
  const env = process.env.QRC_SEED;
  return env ? Number(env) : fallback;
}
