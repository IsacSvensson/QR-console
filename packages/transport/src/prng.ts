// Packet PRNG (documented in PACKET.md): mulberry32, 32-bit state, integer-only (Math.imul),
// so every JS engine produces the same sequence.
export class Mulberry32 {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  /** Next uint32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  /** Uniform integer in [0, n) computed as floor(next * n / 2^32); exact in float64 for n < 2^21. */
  below(n: number): number {
    return Math.floor((this.next() * n) / 4294967296);
  }
}
