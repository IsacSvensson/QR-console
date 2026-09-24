import { OPCODES, SYSCALLS } from '@qrc/vm';

const OPNAME = new Map<number, string>(Object.entries(OPCODES).map(([k, v]) => [v, k]));
const SYSNAME = new Map<number, string>(Object.entries(SYSCALLS).map(([k, v]) => [v, k]));
const hex = (v: number) => `0x${v.toString(16).padStart(4, '0')}`;

/** Disassembles the 4-byte instruction at `pc` (ISA 1). `label` maps an address to a symbol name, if any. */
export function disassemble(mem: Uint8Array, pc: number, label: (addr: number) => string | undefined = () => undefined): string {
  const op = mem[pc & 0xffff]!;
  const m = mem[(pc + 1) & 0xffff]!;
  const imm = mem[(pc + 2) & 0xffff]! | (mem[(pc + 3) & 0xffff]! << 8);
  const a = `r${m & 7}`;
  const b = `r${(m >> 3) & 7}`;
  const I = (m & 0x80) !== 0;
  const name = OPNAME.get(op);
  const target = () => label(imm) ?? hex(imm);
  const addr = () => (I ? `[${label(imm) ?? hex(imm)}]` : imm ? `[${b} + ${imm > 0x7fff ? imm - 0x10000 : imm}]` : `[${b}]`);
  const src = () => (I ? String(imm > 0x7fff ? imm - 0x10000 : imm) : b);
  switch (name) {
    case undefined:
      return `.byte 0x${op.toString(16)} ; illegal`;
    case 'NOP':
    case 'RET':
      return name;
    case 'LD':
    case 'LDB':
      return `${name} ${a}, ${addr()}`;
    case 'ST':
    case 'STB':
      return `${name} ${addr()}, ${a}`;
    case 'NEG':
    case 'PUSH':
    case 'POP':
      return `${name} ${a}`;
    case 'JMP':
    case 'CALL':
      return `${name} ${I ? target() : b}`;
    case 'SYS':
      return `SYS ${SYSNAME.get(imm) ?? imm}`;
    default:
      return name.startsWith('J') ? `${name} ${target()}` : `${name} ${a}, ${src()}`;
  }
}
