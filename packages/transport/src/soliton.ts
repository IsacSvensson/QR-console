// Robust soliton degree distribution (Luby 2002) quantised to uint32 CDF thresholds.
// Only +, -, *, / and sqrt are used (all correctly rounded in IEEE-754), plus a series-based ln,
// so encoder and decoder build bit-identical tables on every engine. Math.log is not used because
// its last-bit accuracy is implementation-defined.

export const SOLITON_C = 0.1;
export const SOLITON_DELTA = 0.5;

/** Natural log via x = m·2^e, m in [1,2): ln x = e·ln2 + 2·atanh((m-1)/(m+1)). */
export function detLn(x: number): number {
  if (!(x > 0)) throw new RangeError('detLn domain');
  let e = 0;
  while (x >= 2) {
    x /= 2;
    e++;
  }
  while (x < 1) {
    x *= 2;
    e--;
  }
  const LN2 = 0.6931471805599453;
  const y = (x - 1) / (x + 1);
  const y2 = y * y;
  let term = y;
  let sum = 0;
  for (let k = 1; k < 80; k += 2) {
    sum += term / k;
    term *= y2;
  }
  return e * LN2 + 2 * sum;
}

const cache = new Map<number, Uint32Array>();

/** cdf[d] for d = 1..K (index 0 unused): P(degree <= d) scaled to 2^32, cdf[K] = 2^32 - 1 sentinel. */
export function solitonCdf(K: number): Uint32Array {
  const hit = cache.get(K);
  if (hit) return hit;
  const rho = new Float64Array(K + 1);
  const tau = new Float64Array(K + 1);
  rho[1] = 1 / K;
  for (let d = 2; d <= K; d++) rho[d] = 1 / (d * (d - 1));
  const R = SOLITON_C * detLn(K / SOLITON_DELTA) * Math.sqrt(K);
  const spike = Math.max(1, Math.min(K, Math.floor(K / R)));
  for (let d = 1; d < spike; d++) tau[d] = R / (d * K);
  tau[spike] = (R * detLn(R / SOLITON_DELTA)) / K;
  if (!(tau[spike]! > 0)) tau[spike] = 0;
  let z = 0;
  for (let d = 1; d <= K; d++) z += rho[d]! + tau[d]!;
  const cdf = new Uint32Array(K + 1);
  let acc = 0;
  for (let d = 1; d <= K; d++) {
    acc += (rho[d]! + tau[d]!) / z;
    cdf[d] = Math.min(4294967295, Math.floor(acc * 4294967296));
  }
  cdf[K] = 4294967295;
  cache.set(K, cdf);
  return cdf;
}

export function sampleDegree(cdf: Uint32Array, r: number): number {
  const K = cdf.length - 1;
  // binary search: first d with r < cdf[d]
  let lo = 1;
  let hi = K;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r < cdf[mid]!) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
