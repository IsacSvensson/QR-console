import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCartridge, toHex } from '@qrc/cartridge';
import { AsmError, OPCODES, assemble, buildCartridge } from '../src';

const code = (src: string) => Array.from(assemble(`update:\n${src}`).sections.code.slice(4));

describe('assembler: instructions', () => {
  it('encodes register and immediate forms', () => {
    expect(code('MOV r1, r2')).toEqual([OPCODES.MOV, 1 | (2 << 3), 0, 0]);
    expect(code('MOV r1, 0x1234')).toEqual([OPCODES.MOV, 1 | 0x80, 0x34, 0x12]);
    expect(code('LDI r7, -1')).toEqual([OPCODES.MOV, 7 | 0x80, 0xff, 0xff]);
    expect(code('add r3, 5')).toEqual([OPCODES.ADD, 3 | 0x80, 5, 0]);
    expect(code('NEG r4')).toEqual([OPCODES.NEG, 4, 0, 0]);
    expect(code('RET')).toEqual([OPCODES.RET, 0, 0, 0]);
    expect(code('SYS TEXT')).toEqual([OPCODES.SYS, 0x80, 8, 0]);
  });
  it('encodes memory operands', () => {
    expect(code('LD r1, [r2]')).toEqual([OPCODES.LD, 1 | (2 << 3), 0, 0]);
    expect(code('LD r1, [r2 + 6]')).toEqual([OPCODES.LD, 1 | (2 << 3), 6, 0]);
    expect(code('LDB r1, [r2 - 1]')).toEqual([OPCODES.LDB, 1 | (2 << 3), 0xff, 0xff]);
    expect(code('ST [0x8000], r3')).toEqual([OPCODES.ST, 3 | 0x80, 0x00, 0x80]);
    expect(code('STB [r5+2*3], r0')).toEqual([OPCODES.STB, 0 | (5 << 3), 6, 0]);
  });
  it('jumps, calls, labels, local labels', () => {
    const r = assemble(`
update:
@loop: JMP @loop
    CALL other
    JEQ @loop
other: JNE @loop
@loop: RET
`);
    const c = Array.from(r.sections.code);
    expect(c.slice(4, 8)).toEqual([OPCODES.JMP, 0x80, 4, 0]);
    expect(c.slice(8, 12)).toEqual([OPCODES.CALL, 0x80, 16, 0]);
    expect(c.slice(12, 16)).toEqual([OPCODES.JZ, 0x80, 4, 0]);
    expect(c.slice(16, 20)).toEqual([OPCODES.JNZ, 0x80, 20, 0]); // other's own @loop
    expect(r.symbols.get('update@loop')).toBe(4);
    expect(r.symbols.get('other@loop')).toBe(20);
    expect(code('JMP r2')).toEqual([OPCODES.JMP, 2 << 3, 0, 0]);
  });
});

describe('assembler: data, constants, layout', () => {
  it('constant arithmetic with precedence and forward references', () => {
    const r = assemble(`
A = 3
B = A * (2 + 4) - 1 ; 17
C = (1 << 4) | 3 ^ 1 & 0xff  ; 16 | (3 ^ 1) = 18
D = -B / 2 ; -8 (truncating)
.const E, LATE + 1
update: RET
LATE = 'A'
`);
    expect([r.symbols.get('B'), r.symbols.get('C'), r.symbols.get('D'), r.symbols.get('E')]).toEqual([17, 18, -8, 66]);
  });
  it('rodata follows code; .byte/.word/.string/.fill/.sprite', () => {
    const r = assemble(`
update: RET
.data
tbl: .byte 1, 2, "AB", -1
w:   .word 0x1234, tbl
s:   .string "HI\\n"
f:   .fill 3, 7
spr: .sprite
  12345678
  ........
  ........
  ........
  ........
  ........
  ........
  fedcba98
`);
    expect(r.symbols.get('tbl')).toBe(8);
    expect(Array.from(r.sections.rodata.slice(0, 5))).toEqual([1, 2, 65, 66, 255]);
    expect(Array.from(r.sections.rodata.slice(5, 9))).toEqual([0x34, 0x12, 8, 0]);
    expect(Array.from(r.sections.rodata.slice(9, 13))).toEqual([72, 73, 10, 0]);
    expect(Array.from(r.sections.rodata.slice(13, 16))).toEqual([7, 7, 7]);
    const spr = r.sections.rodata.slice(16, 48);
    expect(Array.from(spr.slice(0, 4))).toEqual([0x12, 0x34, 0x56, 0x78]);
    expect(Array.from(spr.slice(28, 32))).toEqual([0xfe, 0xdc, 0xba, 0x98]);
  });
  it('.var allocates RAM and .sfx builds the sound table', () => {
    const r = assemble(`
.var x
.var buf, 10
.var y
.sfx BEEP, 0, 440, 6, 12
.sfx BOOM, 2, 200, 20, 15, -5
update: RET
`);
    expect([r.symbols.get('x'), r.symbols.get('buf'), r.symbols.get('y')]).toEqual([0x8000, 0x8002, 0x800c]);
    expect([r.symbols.get('BEEP'), r.symbols.get('BOOM')]).toEqual([0, 1]);
    expect(Array.from(r.sections.sound)).toEqual([2, 0, 12, 6, 0, 0xb8, 0x01, 0, 0, 2, 15, 20, 0, 200, 0, 0xfb, 0xff]);
  });
  it('vector table points at init and update', () => {
    const r = assemble('init: RET\nupdate: RET');
    expect(Array.from(r.sections.code.slice(0, 4))).toEqual([4, 0, 8, 0]);
    expect(Array.from(assemble('update: RET').sections.code.slice(0, 4))).toEqual([0xff, 0xff, 4, 0]);
  });
});

describe('assembler: errors carry file:line', () => {
  const err = (src: string) => {
    try {
      assemble(src, { file: 'x.asm' });
    } catch (e) {
      expect(e).toBeInstanceOf(AsmError);
      return (e as Error).message;
    }
    throw new Error('expected an error');
  };
  it.each([
    ['update: RET\nFOO r1', /x\.asm:2: unknown instruction 'FOO'/],
    ['update: JMP nowhere', /x\.asm:1: undefined symbol 'nowhere'/],
    ['update: RET\nupdate: RET', /x\.asm:2: duplicate symbol 'update'/],
    ['update: MOV r9, 1', /expected a register/],
    ['update: MOV r1, 70000', /does not fit in 16 bits/],
    ['RET', /missing required label 'update'/],
    ['update: LD r1, r2', /memory operand/],
    ['A = B\nB = A\nupdate: MOV r0, A', /circular/],
    ['CLS = 1\nupdate: RET', /built-in/],
    ['update: RET\n.data\n.sprite\n1234567\n', /sprite row/],
  ])('%s', (src, re) => {
    expect(err(src)).toMatch(re);
  });
});

describe('games/hello', () => {
  const dir = join(__dirname, '../../../games/hello');
  it('assembles to a cartridge whose sections match the committed hello.qrc', async () => {
    const { bytes, asm } = await buildCartridge(readFileSync(join(dir, 'hello.asm'), 'utf8'));
    const fresh = await parseCartridge(bytes);
    const committed = await parseCartridge(new Uint8Array(readFileSync(join(dir, 'hello.qrc'))));
    expect(asm.title).toBe('HELLO WORLD');
    expect(fresh.header.isaVersion).toBe(1);
    for (const k of ['code', 'rodata', 'sound'] as const) expect(toHex(fresh.sections[k])).toBe(toHex(committed.sections[k]));
  });
});
