import { describe, expect, it } from 'vitest';
import * as asm from '@qrc/asm';
import * as vm from '@qrc/vm';

describe('ISA tables', () => {
  it('assembler and VM agree on opcodes, syscalls, buttons, memory map and ISA version', () => {
    expect(asm.ISA_VERSION).toBe(vm.ISA_VERSION);
    expect(asm.OPCODES).toEqual(vm.OPCODES);
    expect(asm.SYSCALLS).toEqual(vm.SYSCALLS);
    expect(asm.BUTTONS).toEqual(vm.BUTTONS);
    expect(asm.MEMORY).toEqual(vm.MEMORY);
  });
});
