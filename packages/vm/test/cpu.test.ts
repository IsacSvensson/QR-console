import { describe, expect, it } from 'vitest';
import { MEMORY, VMError, VM } from '../src';
import { ins, insRel, vmFor } from './helpers';

/** Runs body + RET for one frame, returns the VM. Registers are reset each frame, so results are stored in RAM. */
function run(body: number[][], opts?: Parameters<typeof vmFor>[1]) {
  const vm = vmFor([...body, ins('RET')], opts);
  vm.step(0);
  expect(vm.fault).toBeNull();
  return vm;
}
const R = 0x8000;
/** Store r0..r3 to RAM 0x8000.. so tests can inspect them after the frame. */
const dump = (n = 4) => Array.from({ length: n }, (_, i) => ins('ST', i, 0, R + i * 2));
const ramWord = (vm: VM, i: number) => vm.read16(R + i * 2);

describe('CPU opcodes', () => {
  it('MOV reg/imm and NOP', () => {
    const vm = run([ins('MOV', 0, 0, 1234), ins('NOP'), ins('MOV', 1, 0), ...dump(2)]);
    expect([ramWord(vm, 0), ramWord(vm, 1)]).toEqual([1234, 1234]);
  });

  it('ADD/SUB wrap at 16 bits', () => {
    const vm = run([ins('MOV', 0, 0, 0xffff), ins('ADD', 0, 0, 2), ins('MOV', 1, 0, 1), ins('SUB', 1, 0, 3), ...dump(2)]);
    expect([ramWord(vm, 0), ramWord(vm, 1)]).toEqual([1, 0xfffe]);
  });

  it('MUL, DIV (signed, truncating), MOD, div by zero = 0', () => {
    const vm = run([
      ins('MOV', 0, 0, 300), ins('MUL', 0, 0, 300), // 90000 & 0xffff = 24464
      ins('MOV', 1, 0, -7), ins('DIV', 1, 0, 2), // -3
      ins('MOV', 2, 0, -7), ins('MOD', 2, 0, 2), // -1
      ins('MOV', 3, 0, 5), ins('DIV', 3, 0, 0),
      ...dump(4),
    ]);
    expect([ramWord(vm, 0), ramWord(vm, 1), ramWord(vm, 2), ramWord(vm, 3)]).toEqual([24464, 0xfffd, 0xffff, 0]);
  });

  it('AND/OR/XOR/NEG', () => {
    const vm = run([
      ins('MOV', 0, 0, 0xf0f0), ins('AND', 0, 0, 0xff00),
      ins('MOV', 1, 0, 0x00f0), ins('OR', 1, 0, 0x0f00),
      ins('MOV', 2, 0, 0xffff), ins('XOR', 2, 0, 0x00ff),
      ins('MOV', 3, 0, 5), ins('NEG', 3),
      ...dump(4),
    ]);
    expect([ramWord(vm, 0), ramWord(vm, 1), ramWord(vm, 2), ramWord(vm, 3)]).toEqual([0xf000, 0x0ff0, 0xff00, 0xfffb]);
  });

  it('SHL/SHR/SAR (count masked to 4 bits)', () => {
    const vm = run([
      ins('MOV', 0, 0, 3), ins('SHL', 0, 0, 4),
      ins('MOV', 1, 0, 0x8000), ins('SHR', 1, 0, 15),
      ins('MOV', 2, 0, 0x8000), ins('SAR', 2, 0, 15),
      ins('MOV', 3, 0, 1), ins('SHL', 3, 0, 17),
      ...dump(4),
    ]);
    expect([ramWord(vm, 0), ramWord(vm, 1), ramWord(vm, 2), ramWord(vm, 3)]).toEqual([48, 1, 0xffff, 2]);
  });

  it('LD/ST/LDB/STB with [reg+imm] and [abs]; ROM is read-only', () => {
    const vm = run([
      ins('MOV', 1, 0, 0x9000),
      ins('MOV', 0, 0, 0xbeef),
      insRel('ST', 0, 1, 6), // [0x9006] = beef
      ins('LDB', 2, 0, 0x9006), // ef
      ins('MOV', 3, 0, 0x42),
      insRel('STB', 3, 1, 7), // [0x9007] = 42
      insRel('LD', 0, 1, 6), // 0x42ef
      ins('ST', 0, 0, 0x0010), // write to ROM: ignored
      ins('LD', 3, 0, 0x0010),
      ins('MOV', 1, 0, -2), insRel('LD', 1, 1, 0x9008), // negative base + offset wraps: [0x9006]
      ...dump(4),
    ]);
    expect(ramWord(vm, 0)).toBe(0x42ef);
    expect(ramWord(vm, 2)).toBe(0xef);
    expect(ramWord(vm, 1)).toBe(0x42ef);
    expect(ramWord(vm, 3)).not.toBe(0x42ef);
    expect(vm.read16(0x10)).not.toBe(0x42ef);
  });

  // Conditional jumps: set r0 = 1 if taken
  const cond = (op: Parameters<typeof ins>[0], x: number, y: number) => {
    // CMP x, y ; Jcc +8 ; MOV r0,0 ; RET-path... layout with absolute addresses
    const base = 4;
    const body = [
      ins('MOV', 1, 0, x),
      ins('CMP', 1, 0, y),
      ins(op, 0, 0, base + 6 * 4), // -> taken
      ins('MOV', 0, 0, 0),
      ins('ST', 0, 0, R),
      ins('RET'),
      ins('MOV', 0, 0, 1), // taken
      ins('ST', 0, 0, R),
    ];
    const vm = run(body);
    return ramWord(vm, 0) === 1;
  };
  it.each([
    ['JZ', 5, 5, true], ['JZ', 5, 6, false],
    ['JNZ', 5, 6, true], ['JNZ', 5, 5, false],
    ['JLT', -3, 2, true], ['JLT', 2, -3, false], ['JLT', 0x7fff, -1, false],
    ['JGE', 2, 2, true], ['JGE', -1, 0, false], ['JGE', -32768, 1, false],
    ['JGT', 3, 2, true], ['JGT', 2, 2, false],
    ['JLE', 2, 2, true], ['JLE', 3, -2, false],
    ['JB', 1, 0xffff, true], ['JB', 0xffff, 1, false],
    ['JAE', 0xffff, 1, true], ['JAE', 1, 2, false],
  ] as const)('%s %d vs %d taken=%s', (op, x, y, taken) => {
    expect(cond(op, x, y)).toBe(taken);
  });

  it('JMP reg, CALL imm/reg, RET, PUSH/POP', () => {
    // 4: MOV r1, fn ; 8: CALL r1 ; 12: CALL fn ; 16: POP r0?? use stack via PUSH/POP
    const fn = 4 + 8 * 4;
    const body = [
      ins('MOV', 1, 0, fn), // 4
      ins('CALL', 0, 1), // 8  (reg)
      ins('CALL', 0, 0, fn), // 12 (imm)
      ins('MOV', 2, 0, 4 + 6 * 4), // 16
      ins('JMP', 0, 2), // 20 -> 28
      ins('MOV', 3, 0, 999), // 24 skipped
      ins('ST', 3, 0, R + 6), // 28
      ins('RET'), // 32
      // fn at 36: increments [R]
      ins('PUSH', 0),
      ins('LD', 0, 0, R),
      ins('ADD', 0, 0, 1),
      ins('ST', 0, 0, R),
      ins('POP', 0),
      ins('RET'),
    ];
    const vm = vmFor(body);
    vm.step(0);
    expect(vm.fault).toBeNull();
    expect(vm.read16(R)).toBe(2);
    expect(vm.read16(R + 6)).toBe(0);
  });

  it('illegal opcode faults deterministically and stops the VM', () => {
    const vm = vmFor([[0xee, 0, 0, 0]]);
    vm.step(0);
    expect(vm.fault).toMatch(/illegal opcode 0xee/);
    const h = vm.stateHash();
    vm.step(0);
    expect(vm.stateHash()).not.toBe(h); // frame counter still advances
    expect(vm.fault).toMatch(/illegal/);
  });

  it('init runs once before the first update; registers and stack reset per frame', () => {
    const code = [
      12, 0, 24, 0, // init = 12, update = 24
      ...ins('NOP'), ...ins('NOP'),
      ...ins('MOV', 0, 0, 7), ...ins('ST', 0, 0, R), ...ins('RET'), // 12: init
      ...ins('LD', 1, 0, R), ...ins('ADD', 1, 0, 1), ...ins('ST', 1, 0, R), ...ins('ADD', 5, 0, 1), ...ins('ST', 5, 0, R + 2), ...ins('RET'),
    ];
    const vm = new VM({ isaVersion: 1, code: new Uint8Array(code), rodata: new Uint8Array(), sound: new Uint8Array() });
    vm.step(0);
    vm.step(0);
    expect(vm.read16(R)).toBe(9);
    expect(vm.read16(R + 2)).toBe(1); // r5 starts at 0 every frame
  });
});

describe('cartridge acceptance', () => {
  it('rejects unsupported ISA versions', () => {
    for (const v of [0, 2, 0xffff]) {
      expect(() => new VM({ isaVersion: v, code: new Uint8Array(8), rodata: new Uint8Array(), sound: new Uint8Array() })).toThrow(VMError);
      expect(() => new VM({ isaVersion: v, code: new Uint8Array(8), rodata: new Uint8Array(), sound: new Uint8Array() })).toThrow(/unsupported ISA version/);
    }
  });
  it('rejects ROM larger than 32 KB', () => {
    expect(() => new VM({ isaVersion: 1, code: new Uint8Array(8), rodata: new Uint8Array(MEMORY.ROM_END), sound: new Uint8Array() })).toThrow(/ROM/);
  });
});
