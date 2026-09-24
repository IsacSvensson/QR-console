import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { randomBytes, rng, testSeed } from '../../../test/helpers/rng';
import { FountainDecoder, FountainEncoder, Mode, PACKET_OVERHEAD, crc32, decodePacket, detLn, neighbours, sha256, solitonCdf, toHex } from '../src';

const SEED = testSeed(20260924);
const BLOCK = 262; // realistic: QR v12-M byte capacity (287) minus packet overhead (25)

function shuffle<T>(arr: T[], r: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Feeds packets seed 0,1,2,... with random loss until complete. Returns packets received. */
function transfer(data: Uint8Array, mode: Mode, seed: number, loss: number, cap: number) {
  const enc = new FountainEncoder(data, { blockSize: BLOCK, mode });
  const dec = new FountainDecoder();
  const r = rng(seed);
  let s = 0;
  while (!dec.done && s < cap) {
    const pkt = enc.packet(s++);
    if (r() < loss) continue;
    dec.receive(pkt);
  }
  return { enc, dec, sent: s };
}

describe('primitives', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });
  it('detLn is accurate', () => {
    for (const x of [0.001, 0.5, 1, 2, 3.7, 64, 400, 1e6]) expect(Math.abs(detLn(x) - Math.log(x))).toBeLessThan(1e-12);
  });
  it('soliton CDF is monotone and ends at 2^32-1', () => {
    for (const K of [1, 2, 3, 10, 32, 64, 128, 200, 256, 1000]) {
      const cdf = solitonCdf(K);
      for (let d = 2; d <= K; d++) expect(cdf[d]!).toBeGreaterThanOrEqual(cdf[d - 1]!);
      expect(cdf[K]).toBe(4294967295);
    }
  });
  it('neighbour sets are deterministic, distinct and in range', () => {
    for (let seed = 0; seed < 2000; seed++) {
      const n = neighbours(Mode.LT, seed, 200);
      expect(new Set(n).size).toBe(n.length);
      expect(n.every((x) => x >= 0 && x < 200)).toBe(true);
      expect(neighbours(Mode.LT, seed, 200)).toEqual(n);
    }
    expect(neighbours(Mode.Systematic, 17, 200)).toEqual([17]);
  });
  it('packet id is the first 8 bytes of SHA-256 of the input', () => {
    const data = randomBytes(SEED, 1000);
    const enc = new FountainEncoder(data, { blockSize: BLOCK });
    expect(toHex(enc.id)).toBe(createHash('sha256').update(data).digest('hex').slice(0, 16));
    expect(enc.packet(0).length).toBe(BLOCK + PACKET_OVERHEAD);
  });
});

describe(`round trip of random 50 KB input (seed ${SEED})`, () => {
  const TRIALS = 200;
  for (const mode of [Mode.Systematic, Mode.LT]) {
    it(`${TRIALS} seeded trials, ${Mode[mode]}, 20 % loss, random order and duplicates`, () => {
      const used: number[] = [];
      for (let t = 0; t < TRIALS; t++) {
        const trialSeed = SEED + t * 7919;
        const data = randomBytes(trialSeed, 50 * 1024);
        const enc = new FountainEncoder(data, { blockSize: BLOCK, mode });
        const dec = new FountainDecoder();
        const r = rng(trialSeed);
        // Stream seeds in a shuffled order with duplicates and 20 % loss; keep going until complete.
        let sent = 0;
        let next = 0;
        while (!dec.done) {
          expect(sent, `trial seed ${trialSeed}: decoder never completed`).toBeLessThan(enc.K * 10);
          const batch = shuffle(Array.from({ length: 16 }, (_, i) => next + i), r);
          next += 16;
          for (const s of batch) {
            if (dec.done) break;
            sent++;
            if (r() < 0.2) continue;
            const pkt = enc.packet(s);
            expect(dec.receive(pkt), `trial seed ${trialSeed}`).not.toBe('hash-mismatch');
            if (r() < 0.1) dec.receive(pkt); // duplicate
          }
        }
        expect(toHex(dec.getResult()!), `trial seed ${trialSeed}`).toBe(toHex(data));
        used.push(dec.received);
      }
      const K = Math.ceil((50 * 1024) / BLOCK);
      const max = Math.max(...used);
      console.log(`${Mode[mode]}: K=${K}, packets received to decode: mean ${(used.reduce((a, b) => a + b) / used.length).toFixed(1)}, max ${max}`);
    });
  }

  it('extra packets after completion are handled', () => {
    const data = randomBytes(SEED, 50 * 1024);
    const { enc, dec, sent } = transfer(data, Mode.Systematic, SEED, 0, 10_000);
    for (let s = sent; s < sent + 50; s++) expect(dec.receive(enc.packet(s))).toBe('already-complete');
    expect(dec.receive(enc.packet(0))).toBe('already-complete');
    expect(toHex(dec.getResult()!)).toBe(toHex(data));
  });

  it('pure repair packets alone (no systematic seeds) reconstruct the input', () => {
    const data = randomBytes(SEED + 1, 50 * 1024);
    const enc = new FountainEncoder(data, { blockSize: BLOCK, mode: Mode.Systematic });
    const dec = new FountainDecoder();
    let s = enc.K;
    while (!dec.done) dec.receive(enc.packet(s++));
    expect(toHex(dec.getResult()!)).toBe(toHex(data));
  });

  it('peeling-only decoder also completes when fed enough packets (keeps accepting repair packets)', () => {
    const data = randomBytes(SEED + 2, 50 * 1024);
    const enc = new FountainEncoder(data, { blockSize: BLOCK, mode: Mode.LT });
    const dec = new FountainDecoder({ gaussian: false });
    let s = 0;
    while (!dec.done && s < 10 * enc.K) dec.receive(enc.packet(s++));
    expect(dec.done).toBe(true);
    expect(dec.gaussianRuns).toBe(0);
    expect(toHex(dec.getResult()!)).toBe(toHex(data));
  });

  it('small and edge-case lengths', () => {
    for (const len of [0, 1, BLOCK - 1, BLOCK, BLOCK + 1, 3 * BLOCK]) {
      for (const mode of [Mode.LT, Mode.Systematic]) {
        const data = randomBytes(SEED + len, len);
        const { dec } = transfer(data, mode, SEED + len, 0.3, 10_000);
        expect(dec.done, `len ${len} ${Mode[mode]}`).toBe(true);
        expect(toHex(dec.getResult()!)).toBe(toHex(data));
      }
    }
  });
});

describe(`corruption and foreign packets (seed ${SEED})`, () => {
  const data = randomBytes(SEED, 5000);
  const enc = new FountainEncoder(data, { blockSize: BLOCK });

  it('every single corrupted byte (any position, any value) is rejected by CRC and never enters the decoder', () => {
    const r = rng(SEED);
    const pkt = enc.packet(3);
    const dec = new FountainDecoder();
    for (let i = 0; i < pkt.length; i++) {
      for (let k = 0; k < 4; k++) {
        const bad = pkt.slice();
        bad[i]! ^= 1 + Math.floor(r() * 255);
        const st = dec.receive(bad);
        expect(['bad-crc', 'bad-magic', 'bad-fields'], `byte ${i}`).toContain(st);
        expect(dec.received).toBe(0);
        expect(dec.K).toBe(0);
      }
    }
    expect(decodePacket(pkt.subarray(0, pkt.length - 1))).toBe('bad-crc');
  });

  it('decoding still succeeds when corrupted packets are interleaved', () => {
    const r = rng(SEED + 5);
    const dec = new FountainDecoder();
    let s = 0;
    let bad = 0;
    while (!dec.done) {
      const pkt = enc.packet(s++);
      if (r() < 0.3) {
        const c = pkt.slice();
        c[Math.floor(r() * c.length)]! ^= 0x5a;
        expect(dec.receive(c)).not.toBe('accepted');
        bad++;
      }
      dec.receive(pkt);
    }
    expect(bad).toBeGreaterThan(0);
    expect(toHex(dec.getResult()!)).toBe(toHex(data));
  });

  it('packets from a different cartridge id are ignored', () => {
    const other = new FountainEncoder(randomBytes(SEED + 99, 5000), { blockSize: BLOCK });
    const dec = new FountainDecoder();
    let s = 0;
    while (!dec.done) {
      dec.receive(enc.packet(s));
      expect(dec.receive(other.packet(s))).toBe(dec.done ? 'other-cartridge' : 'other-cartridge');
      s++;
    }
    expect(dec.ignoredOtherCartridge).toBe(s);
    expect(toHex(dec.getResult()!)).toBe(toHex(data));
  });

  it('expectId rejects everything else from the start', () => {
    const other = new FountainEncoder(randomBytes(SEED + 98, 5000), { blockSize: BLOCK });
    const dec = new FountainDecoder({ expectId: enc.id });
    expect(dec.receive(other.packet(0))).toBe('other-cartridge');
    expect(dec.K).toBe(0);
  });

  it('reconstructed bytes are verified against the id', () => {
    const dec = new FountainDecoder();
    for (let s = 0; !dec.done; s++) dec.receive(enc.packet(s));
    expect(toHex(sha256(dec.getResult()!).slice(0, 8))).toBe(toHex(enc.id));
  });
});

describe(`looping-animation order (seed ${SEED})`, () => {
  it('repair packets seen before the remaining source packets still decode as soon as rank allows', () => {
    // The camera may join a looping GIF mid-way: repair packets first, then source packets.
    for (let t = 0; t < 50; t++) {
      const data = randomBytes(SEED + t, 50 * 1024);
      const enc = new FountainEncoder(data, { blockSize: BLOCK, mode: Mode.Systematic });
      const K = enc.K;
      const dec = new FountainDecoder();
      const r = rng(SEED + t);
      const repair = 5 + Math.floor(r() * 20);
      for (let s = K; s < K + repair; s++) dec.receive(enc.packet(s));
      let fed = repair;
      for (let s = 0; s < K && !dec.done; s++, fed++) dec.receive(enc.packet(s));
      // K - repair source packets + repair dense packets = K equations: full rank needs at most a couple more
      for (let s = K + repair; !dec.done; s++, fed++) dec.receive(enc.packet(s));
      expect(fed, `trial seed ${SEED + t}`).toBeLessThanOrEqual(K + 3);
      expect(toHex(dec.getResult()!)).toBe(toHex(data));
    }
  });
});
