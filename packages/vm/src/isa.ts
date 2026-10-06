// Instruction set, versions 1 and 2. Documented in ../VM.md. An identical opcode table lives in
// packages/asm/src/isa.ts (asm may not import vm); test/isa-sync.test.ts asserts they agree.

/** The newest ISA this VM runs. A cartridge declares the lowest ISA it needs; every version runs all older ones. */
export const ISA_VERSION = 2;
export const MIN_ISA_VERSION = 1;

export const OPCODES = {
  NOP: 0x00,
  MOV: 0x01,
  LD: 0x02,
  LDB: 0x03,
  ST: 0x04,
  STB: 0x05,
  ADD: 0x06,
  SUB: 0x07,
  MUL: 0x08,
  DIV: 0x09,
  MOD: 0x0a,
  AND: 0x0b,
  OR: 0x0c,
  XOR: 0x0d,
  SHL: 0x0e,
  SHR: 0x0f,
  SAR: 0x10,
  CMP: 0x11,
  NEG: 0x12,
  JMP: 0x13,
  JZ: 0x14,
  JNZ: 0x15,
  JLT: 0x16,
  JGE: 0x17,
  JGT: 0x18,
  JLE: 0x19,
  JB: 0x1a,
  JAE: 0x1b,
  CALL: 0x1c,
  RET: 0x1d,
  PUSH: 0x1e,
  POP: 0x1f,
  SYS: 0x20,
} as const;

export const SYSCALLS = {
  CLS: 0,
  PSET: 1,
  PGET: 2,
  RECT: 3,
  RECTFILL: 4,
  LINE: 5,
  SPR: 6,
  MAP: 7,
  TEXT: 8,
  NUM: 9,
  BTN: 10,
  BTNP: 11,
  OVERLAP: 12,
  RND: 13,
  SOUND: 14,
  SFX: 15,
  FRAME: 16,
  // ISA 2
  COPY: 17,
  FILL: 18,
  UNPACK: 19,
} as const;

/** The ISA version that introduced each syscall that is newer than ISA 1. */
export const SYSCALL_SINCE: Record<number, number> = { 17: 2, 18: 2, 19: 2 };

export const BUTTONS = { LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, A: 16, B: 32 } as const;

export const MEMORY = {
  ROM_START: 0x0000,
  ROM_END: 0x8000, // exclusive; ROM is read-only
  RAM_START: 0x8000,
  VECTOR_INIT: 0x0000,
  VECTOR_UPDATE: 0x0002,
  /** ISA 2 far addresses: values below are memory addresses, from here on xdata offsets (value - XDATA_BASE). */
  XDATA_BASE: 0x10000,
  /** ISA 2: maximum size of the xdata section. */
  XDATA_MAX: 0x40000,
} as const;

export const SCREEN = 128;
export const CYCLES_PER_FRAME = 50_000;
export const SYSCALL_CYCLES = 8;
export const NO_ENTRY = 0xffff;
