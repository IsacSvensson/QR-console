import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { randomBytes, testSeed } from '../../../test/helpers/rng';
import { CartridgeError, HEADER_FIXED_SIZE, deflateRaw, inflateRaw, parseCartridge, parseHeader, serializeCartridge, sha256, toHex } from '../src';

const SEED = testSeed(1234);

function compressible(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 7) % 13 === 0 ? i & 0xff : 0x20 + (i % 5);
  return out;
}

describe(`cartridge round trip (seed ${SEED})`, () => {
  const sizes = [0, 1, 1024, 50 * 1024];
  for (const size of sizes) {
    for (const compression of ['none', 'deflate-raw'] as const) {
      for (const kind of ['random', 'compressible'] as const) {
        it(`${size} B ${kind} body, ${compression}`, async () => {
          const code = kind === 'random' ? randomBytes(SEED + size, size) : compressible(size);
          const rodata = randomBytes(SEED + 1, size >> 3);
          const sound = randomBytes(SEED + 2, 5);
          const bytes = await serializeCartridge({ title: 'TEST ÅÄÖ', isaVersion: 1, sections: { code, rodata, sound }, compression });
          const cart = await parseCartridge(bytes);
          expect(cart.header.title).toBe('TEST ÅÄÖ');
          expect(cart.header.isaVersion).toBe(1);
          expect(cart.header.compression).toBe(compression === 'none' ? 0 : 1);
          expect(toHex(cart.sections.code)).toBe(toHex(code));
          expect(toHex(cart.sections.rodata)).toBe(toHex(rodata));
          expect(toHex(cart.sections.sound)).toBe(toHex(sound));
          expect(toHex(cart.id)).toBe(createHash('sha256').update(bytes).digest('hex'));
        });
      }
    }
  }

  it('auto compression picks deflate only when smaller', async () => {
    const small = await serializeCartridge({ title: 'A', isaVersion: 1, sections: { code: randomBytes(SEED, 300), rodata: new Uint8Array(), sound: new Uint8Array() } });
    expect(parseHeader(small).compression).toBe(0);
    const big = await serializeCartridge({ title: 'A', isaVersion: 1, sections: { code: compressible(4000), rodata: new Uint8Array(), sound: new Uint8Array() } });
    expect(parseHeader(big).compression).toBe(1);
  });

  it('rejects titles over 32 bytes', async () => {
    await expect(serializeCartridge({ title: 'X'.repeat(33), isaVersion: 1, sections: { code: new Uint8Array(), rodata: new Uint8Array(), sound: new Uint8Array() } })).rejects.toThrow(/title/);
  });
});

describe(`cartridge rejection (seed ${SEED})`, () => {
  const make = (compression: 'none' | 'deflate-raw' = 'deflate-raw') =>
    serializeCartridge({ title: 'REJECT', isaVersion: 1, sections: { code: compressible(1500), rodata: randomBytes(SEED, 200), sound: new Uint8Array([1, 2, 3]) }, compression });

  it('wrong magic', async () => {
    const b = await make();
    b[0] = 0x58;
    await expect(parseCartridge(b)).rejects.toThrow(/magic/);
  });

  it('unknown format version', async () => {
    const b = await make();
    b[4] = 2;
    await expect(parseCartridge(b)).rejects.toThrow(/format version/);
  });

  it('truncated data at every length', async () => {
    const b = await make();
    for (let len = 0; len < b.length; len++) {
      await expect(parseCartridge(b.subarray(0, len)), `length ${len}`).rejects.toThrow(CartridgeError);
    }
  });

  it('trailing bytes', async () => {
    const b = await make();
    const longer = new Uint8Array(b.length + 1);
    longer.set(b);
    await expect(parseCartridge(longer)).rejects.toThrow(/size mismatch/);
  });

  for (const compression of ['none', 'deflate-raw'] as const) {
    it(`every single flipped bit in the body is caught by the hash (${compression})`, async () => {
      const b = await make(compression);
      const headerSize = HEADER_FIXED_SIZE + 'REJECT'.length;
      let checked = 0;
      for (let i = headerSize; i < b.length; i++) {
        for (let bit = 0; bit < 8; bit++) {
          b[i]! ^= 1 << bit;
          expect(() => parseHeader(b), `byte ${i} bit ${bit}`).toThrow(/hash/);
          b[i]! ^= 1 << bit;
          checked++;
        }
      }
      expect(checked).toBe((b.length - headerSize) * 8);
      await expect(parseCartridge(b)).resolves.toBeTruthy();
    });
  }

  it('flipped bit in stored hash is caught', async () => {
    const b = await make();
    b[25]! ^= 0x10;
    await expect(parseCartridge(b)).rejects.toThrow(/hash/);
  });
});

describe(`compression paths agree (seed ${SEED})`, () => {
  const inputs = [new Uint8Array(0), new Uint8Array([7]), compressible(10_000), randomBytes(SEED, 50 * 1024)];
  inputs.forEach((data, i) => {
    it(`input #${i} (${data.length} B): zlib and DecompressionStream agree`, async () => {
      const zDeflated = deflateRawSync(data);
      expect(toHex(await inflateRaw(zDeflated))).toBe(toHex(inflateRawSync(zDeflated)));
      const sDeflated = await deflateRaw(data);
      expect(toHex(inflateRawSync(sDeflated))).toBe(toHex(data));
      expect(toHex(await inflateRaw(sDeflated))).toBe(toHex(data));
    });
  });
});

describe(`sha256 (seed ${SEED})`, () => {
  it('matches node:crypto for lengths 0..300 and 50 KB', () => {
    for (const n of [...Array.from({ length: 301 }, (_, i) => i), 50 * 1024]) {
      const d = randomBytes(SEED + n, n);
      expect(toHex(sha256(d)), `len ${n}`).toBe(createHash('sha256').update(d).digest('hex'));
    }
  });
});
