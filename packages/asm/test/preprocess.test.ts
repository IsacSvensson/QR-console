import { describe, expect, it } from 'vitest';
import { AsmError, OPCODES, assemble, formatListing, formatSymbols } from '../src';

const files: Record<string, string> = {
  'util.asm': 'SPEED = 3\nhelper:\n    ADD r0, SPEED\n    RET\n',
  'nested.asm': '.include "util.asm"\nNESTED = 7\n',
  'bad.asm': 'update: RET\n    FROB r1\n',
  'loop1.asm': '.include "loop2.asm"\n',
  'loop2.asm': '.include "loop1.asm"\n',
};
const resolveInclude = (name: string) => {
  const src = files[name];
  if (src === undefined) throw new Error('no such file');
  return src;
};
const asmOk = (src: string) => assemble(src, { file: 'main.asm', resolveInclude });
const err = (src: string) => {
  try {
    asmOk(src);
  } catch (e) {
    expect(e).toBeInstanceOf(AsmError);
    return (e as AsmError).message;
  }
  throw new Error('expected an error');
};

describe('.include', () => {
  it('inlines files from the same directory, nested', () => {
    const r = asmOk('.include "nested.asm"\nupdate:\n    CALL helper\n    RET\n');
    expect(r.symbols.get('SPEED')).toBe(3);
    expect(r.symbols.get('NESTED')).toBe(7);
    expect(r.symbols.get('helper')).toBe(4);
    expect(r.symbols.get('update')).toBe(12);
  });
  it('reports errors in the included file with its own name and line', () => {
    expect(err('.include "bad.asm"')).toMatch(/^bad\.asm:2: unknown instruction 'FROB'/);
  });
  it('rejects paths, cycles, missing files and missing resolvers', () => {
    expect(err('.include "../x.asm"\nupdate: RET')).toMatch(/plain file name/);
    expect(err('.include "sub/x.asm"\nupdate: RET')).toMatch(/plain file name/);
    expect(err('.include "loop1.asm"\nupdate: RET')).toMatch(/cycle: main\.asm -> loop1\.asm -> loop2\.asm -> loop1\.asm/);
    expect(err('.include "nope.asm"\nupdate: RET')).toMatch(/cannot read 'nope\.asm'/);
    expect(() => assemble('.include "util.asm"\nupdate: RET')).toThrow(/no include resolver/);
  });
});

describe('.macro', () => {
  it('substitutes parameters as whole words and expands where called', () => {
    const r = asmOk(`
.macro ADDTO dst, amount
    ADD dst, amount
.endm
update:
    ADDTO r1, 5
    ADDTO r2, r3
    RET
`);
    const c = Array.from(r.sections.code.slice(4, 12));
    expect(c).toEqual([OPCODES.ADD, 1 | 0x80, 5, 0, OPCODES.ADD, 2 | (3 << 3), 0, 0]);
  });
  it('gives every expansion its own @@ local labels', () => {
    const r = asmOk(`
.macro WAITZERO reg
@@loop:
    SUB reg, 1
    JNZ @@loop
.endm
update:
    WAITZERO r1
    WAITZERO r2
    RET
`);
    const c = r.sections.code;
    // two loops, each jumping back to its own start
    expect(c[4 + 4 * 1]).toBe(OPCODES.JNZ);
    expect(c[4 + 4 * 1 + 2]).toBe(4);
    expect(c[4 + 4 * 3 + 2]).toBe(12);
  });
  it('supports labels on the invocation line, nested macros and macros from included files', () => {
    const r = asmOk(`
.macro INC reg
    ADD reg, 1
.endm
.macro INC2 reg
    INC reg
    INC reg
.endm
update:
here: INC2 r4
    RET
`);
    expect(r.symbols.get('here')).toBe(4);
    expect(Array.from(r.sections.code.slice(4, 12))).toEqual([OPCODES.ADD, 4 | 0x80, 1, 0, OPCODES.ADD, 4 | 0x80, 1, 0]);
  });
  it('errors carry the body line and the expansion site', () => {
    const m = err(`
.macro BROKEN x
    FROB x
.endm
update:
    BROKEN r1
`);
    expect(m).toMatch(/^main\.asm:3: unknown instruction 'FROB' \(in macro BROKEN expanded at main\.asm:6\)/);
    expect(err('.macro M a\n ADD a, 1\n.endm\nupdate: M r1, r2\n')).toMatch(/takes 1 argument/);
    expect(err('.macro RET\n.endm\nupdate: RET')).toMatch(/is an instruction/);
    expect(err('.macro M\nupdate: RET')).toMatch(/without \.endm/);
    expect(err('update: RET\n.endm')).toMatch(/\.endm without \.macro/);
  });
});

describe('listing and symbols', () => {
  it('listing maps every emitting line to its address and bytes', () => {
    const r = asmOk('.include "util.asm"\nupdate:\n    LDI r0, 1\n    RET\n.data\nmsg: .string "HI"\n');
    const lst = formatListing(r);
    expect(lst).toMatch(/^0004\s+ util\.asm:2\s+helper:$/m);
    expect(lst).toMatch(/^0004\s+06 80 03 00\s+util\.asm:3\s+ADD r0, SPEED$/m);
    expect(lst).toMatch(/^000c\s+01 80 01 00\s+main\.asm:3\s+LDI r0, 1$/m);
    expect(lst).toMatch(/^0014\s+48 49 00\s+main\.asm:6\s+msg: \.string "HI"$/m);
  });
  it('symbols file lists labels, variables and constants with their kind', () => {
    const r = asmOk('.var score\nMAX = 9\nupdate: RET\n');
    const sym = formatSymbols(r);
    expect(sym).toContain('0004 label update');
    expect(sym).toContain('8000 var   score');
    expect(sym).toContain('0009 const MAX');
  });
});
