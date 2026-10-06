// ISA 2 (PLAN M22b): extended data, far addresses, SYS COPY / FILL / UNPACK, the version rule, and the proof
// that ISA 1 programs are untouched.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AsmError, assemble, buildCartridge, pack, unpack } from '@qrc/asm';
import { decodeBody, encodeBody, parseCartridge } from '@qrc/cartridge';
import { buildGame, includeFrom } from '@qrc/tools';
import { ISA_VERSION, MIN_ISA_VERSION, VM, VMError, isaSupported } from '@qrc/vm';

const vmOf = (src: string, isaVersion?: number) => {
  const a = assemble(src);
  return new VM({ ...a.sections, isaVersion: isaVersion ?? a.isaVersion });
};
const frame = (src: string, isaVersion?: number) => {
  const vm = vmOf(src, isaVersion);
  vm.step(0);
  return vm;
};

/** xorshift32 with an explicit seed (printed by the tests that use it). */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 2 ** 32;
  };
}
function sample(kind: number, n: number, r: () => number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (kind === 0) out[i] = (r() * 256) | 0; // incompressible
    else if (kind === 1) out[i] = r() < 0.9 && i > 0 ? out[i - 1]! : (r() * 4) | 0; // runs
    else if (kind === 2) out[i] = i > 40 && r() < 0.8 ? out[i - 1 - ((r() * 40) | 0)]! : (r() * 16) | 0; // repeats
    else out[i] = i >= 300 && r() < 0.95 ? out[i - 300]! : (r() * 256) | 0; // far repeats
  }
  return out;
}

describe('the version rule', () => {
  it('this VM runs ISA 1 and 2 and refuses others with a clear message', () => {
    expect([MIN_ISA_VERSION, ISA_VERSION]).toEqual([1, 2]);
    expect([0, 1, 2, 3].map(isaSupported)).toEqual([false, true, true, false]);
    const src = 'update:\n RET';
    expect(() => vmOf(src, 3)).toThrow(VMError);
    expect(() => vmOf(src, 3)).toThrow(/ISA version 3.*needs a newer QR Console/);
    expect(() => vmOf(src, 0)).toThrow(/unsupported ISA version 0/);
  });

  it('an xdata section needs ISA 2', () => {
    const a = assemble('update:\n RET\n.xdata\n.byte 1');
    expect(a.isaVersion).toBe(2);
    expect(() => new VM({ ...a.sections, isaVersion: 1 })).toThrow(/xdata section needs ISA 2/);
  });

  it('in an ISA 1 cartridge the ISA 2 syscalls are unknown, exactly as before they existed', () => {
    for (const n of [17, 18, 19]) {
      const vm = frame(`update:\n SYS ${n}\n RET`, 1);
      expect(vm.fault).toBe(`unknown syscall ${n} at 0x4`);
    }
    expect(frame('update:\n SYS 20\n RET', 2).fault).toBe('unknown syscall 20 at 0x4');
  });
});

describe('the assembler picks the lowest ISA a program needs', () => {
  it('1 without ISA 2 features; 2 with xdata or an ISA 2 syscall (also through a constant)', () => {
    expect(assemble('update:\n SYS CLS\n RET').isaVersion).toBe(1);
    expect(assemble('update:\n SYS COPY\n RET').isaVersion).toBe(2);
    expect(assemble('N = 18\nupdate:\n SYS N\n RET').isaVersion).toBe(2);
    expect(assemble('update:\n RET\n.data\n.pack\n.byte 1,1,1,1\n.endpack').isaVersion).toBe(1); // packed data alone is just bytes
  });

  it('buildCartridge writes it into the header; an ISA 1 cartridge has no xdata section', async () => {
    const one = await buildCartridge('update:\n RET', { compression: 'none' });
    expect(one.bytes[6]).toBe(1);
    const two = await buildCartridge('update:\n RET\n.xdata\nx: .byte 7, 8', { compression: 'none' });
    expect(two.bytes[6]).toBe(2);
    const c = await parseCartridge(two.bytes);
    expect([...c.sections.xdata!]).toEqual([7, 8]);
    expect((await parseCartridge(one.bytes)).sections.xdata).toBeUndefined();
  });

  it('xdata labels are far addresses: XDATA_BASE + offset', () => {
    const a = assemble('update:\n RET\n.xdata\n.fill 70000\nfar: .byte 1\n.data\nnear: .byte 2');
    expect(a.symbols.get('far')).toBe(0x10000 + 70000);
    expect(a.symbols.get('near')).toBeLessThan(0x8000);
  });
});

describe('SYS COPY, FILL and UNPACK', () => {
  it('COPY from ROM, from xdata beyond 64 KB, into RAM; writes to ROM are ignored', () => {
    const vm = frame(`
update:
    MOV r0, 0x9000
    MOV r1, 0
    MOV r2, src
    MOV r3, 4
    SYS COPY
    ST [0x8000], r0          ; other registers are preserved (r0 stays the destination)
    MOV r0, 0x9010
    MOV r1, far >> 16
    MOV r2, far & 0xFFFF
    MOV r3, 3
    SYS COPY
    MOV r0, 0x0100           ; into ROM: ignored
    SYS COPY
    RET
.data
src: .byte 1, 2, 3, 4
.xdata
.fill 70000, 9
far: .byte 5, 6, 7`);
    expect(vm.fault).toBeNull();
    expect([...vm.mem.slice(0x9000, 0x9004)]).toEqual([1, 2, 3, 4]);
    expect([...vm.mem.slice(0x9010, 0x9013)]).toEqual([5, 6, 7]);
    expect(vm.read16(0x8000)).toBe(0x9000);
    expect(vm.read8(0x0100)).not.toBe(5);
  });

  it('COPY past the end of xdata reads zeros; FILL fills', () => {
    const vm = frame(`
update:
    MOV r0, 0x9000
    MOV r1, 0x55
    MOV r2, 6
    SYS FILL
    MOV r1, 1
    MOV r2, 1
    MOV r3, 3
    SYS COPY
    RET
.xdata
.byte 8, 9`);
    expect([...vm.mem.slice(0x9000, 0x9006)]).toEqual([9, 0, 0, 0x55, 0x55, 0x55]);
  });

  it('UNPACK a .pack block from rodata and from xdata, returns the length, costs 8 + n/4 cycles', () => {
    const vm = frame(`
update:
    MOV r0, 0x9000
    MOV r1, 0
    MOV r2, packed
    SYS UNPACK
    ST [0x8000], r0
    MOV r0, 0xA000
    MOV r1, xp >> 16
    MOV r2, xp & 0xFFFF
    SYS UNPACK
    RET
.data
packed:
.pack
.string "ABABABABABABABAB HELLO HELLO HELLO"
.fill 200, 7
.endpack
.xdata
xp:
.pack
.byte 1, 2, 3, 1, 2, 3, 1, 2, 3
.endpack`);
    expect(vm.fault).toBeNull();
    const want = [...new TextEncoder().encode('ABABABABABABABAB HELLO HELLO HELLO'), 0, ...new Array(200).fill(7)];
    expect(vm.read16(0x8000)).toBe(want.length);
    expect([...vm.mem.slice(0x9000, 0x9000 + want.length)]).toEqual(want);
    expect([...vm.mem.slice(0xa000, 0xa009)]).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3]);
    // cycles: 7 plain instructions + RET, and two syscalls of 8 + ceil(n / 4) each
    expect(vm.cyclesLastFrame).toBe(7 + 1 + (8 + Math.ceil(want.length / 4)) + (8 + Math.ceil(9 / 4)));
  });

  it('COPY and FILL cost 8 + ceil(n/8) cycles', () => {
    const vm = frame('update:\n MOV r0, 0x9000\n MOV r2, 100\n SYS FILL\n RET');
    expect(vm.cyclesLastFrame).toBe(2 + 8 + Math.ceil(100 / 8) + 1);
  });
});

describe('the packed format', () => {
  it('pack -> unpack (asm reference) -> SYS UNPACK (VM) give back the input; seeded samples', () => {
    for (let t = 0; t < 40; t++) {
      const seed = 1000 + t;
      const r = rng(seed);
      const n = [0, 1, 2, 3, 66, 67, 129, 300, 1000, 5000][t % 10]! + ((r() * 3) | 0);
      const data = sample(t % 4, n, r);
      const p = pack(data);
      try {
        expect([...unpack(p)]).toEqual([...data]);
        const vm = new VM({ isaVersion: 2, code: assemble('update:\n MOV r0, 0x9000\n MOV r1, 1\n MOV r2, 0\n SYS UNPACK\n ST [0x8000], r0\n RET').sections.code, rodata: new Uint8Array(0), sound: new Uint8Array(0), xdata: p });
        vm.step(0);
        expect(vm.read16(0x8000)).toBe(n);
        expect([...vm.mem.slice(0x9000, 0x9000 + n)]).toEqual([...data]);
      } catch (e) {
        throw new Error(`seed ${seed} (kind ${t % 4}, ${n} bytes): ${(e as Error).message}`, { cause: e });
      }
    }
  });

  it('[measured] packs the data of the existing games', () => {
    const rows: string[] = [];
    for (const g of ['breakout', 'blackbox', 'bo']) {
      const dir = join(__dirname, '../games', g);
      const a = assemble(readFileSync(join(dir, `${g}.asm`), 'utf8'), { file: `${g}.asm`, resolveInclude: includeFrom(dir) });
      const p = pack(a.sections.rodata);
      expect([...unpack(p)]).toEqual([...a.sections.rodata]);
      rows.push(`${g} rodata ${a.sections.rodata.length} -> ${p.length} (${Math.round((100 * p.length) / a.sections.rodata.length)} %)`);
    }
    console.log(`[measured] ${rows.join('; ')}`);
  });

  it('.pack rejects labels, instructions, a missing .endpack and data over 64 KB', () => {
    expect(() => assemble('update:\n RET\n.pack\nx: .byte 1\n.endpack')).toThrow(/no labels inside .pack/);
    expect(() => assemble('update:\n RET\n.pack\n MOV r0, 1\n.endpack')).toThrow(/only .byte/);
    expect(() => assemble('update:\n RET\n.pack\n.byte 1')).toThrow(/.pack without .endpack/);
    expect(() => assemble('update:\n RET\n.endpack')).toThrow(/.endpack without .pack/);
    expect(() => assemble('update:\n RET\n.pack\n.word later\n.endpack\nlater: .byte 0')).toThrow(AsmError);
    expect(() => assemble('update:\n RET\n.xdata\n.pack\n.fill 70000\n.endpack')).toThrow(/more than 65535/);
  });
});

describe('ISA 1 is untouched', () => {
  it('every game still assembles to its committed cartridge, byte for byte, as ISA 1', async () => {
    const games = readdirSync(join(__dirname, '../games')).filter((g) => existsSync(join(__dirname, '../games', g, `${g}.qrc`)));
    expect(games.length).toBeGreaterThanOrEqual(5);
    for (const g of games) {
      const dir = join(__dirname, '../games', g);
      const committed = new Uint8Array(readFileSync(join(dir, `${g}.qrc`)));
      const { bytes, asm } = await buildGame(dir);
      if (asm.isaVersion !== 1) continue; // a game that moved to ISA 2 is checked by its own tests
      expect(Buffer.from(bytes).equals(Buffer.from(committed)), g).toBe(true);
    }
  });

  it('a body without xdata has exactly the three sections it always had', () => {
    const s = { code: new Uint8Array([1, 2]), rodata: new Uint8Array([3]), sound: new Uint8Array(0) };
    const body = encodeBody(s);
    expect(body[0]).toBe(3);
    expect(encodeBody({ ...s, xdata: new Uint8Array(0) })).toEqual(body);
    expect(decodeBody(body).xdata).toBeUndefined();
    const withX = encodeBody({ ...s, xdata: new Uint8Array([9]) });
    expect(withX[0]).toBe(4);
    expect([...decodeBody(withX).xdata!]).toEqual([9]);
  });
});
