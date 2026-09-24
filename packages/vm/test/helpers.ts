import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { OPCODES, PALETTE, SCREEN, VM } from '../src';

type Op = keyof typeof OPCODES;
/** Hand-encodes one instruction (the vm tests may not use the assembler: SPEC §3). */
export function ins(op: Op, a = 0, b = 0, imm: number | null = null): number[] {
  const I = imm !== null;
  const v = (imm ?? 0) & 0xffff;
  return [OPCODES[op], (a & 7) | ((b & 7) << 3) | (I ? 0x80 : 0), v & 0xff, v >>> 8];
}

/** Code with vector table: init = none, update = 4. */
export function vmFor(body: number[][], opts: { rodata?: number[]; sound?: number[]; seed?: number; cycles?: number } = {}): VM {
  const code = [0xff, 0xff, 4, 0, ...body.flat()];
  return new VM(
    { isaVersion: 1, code: new Uint8Array(code), rodata: new Uint8Array(opts.rodata ?? []), sound: new Uint8Array(opts.sound ?? []) },
    { seed: opts.seed, cyclesPerFrame: opts.cycles },
  );
}

export function readFramePng(path: string): Uint8Array {
  const png = PNG.sync.read(readFileSync(path));
  const lookup = new Map(PALETTE.map((c, i) => [c, i]));
  const fb = new Uint8Array(SCREEN * SCREEN);
  for (let i = 0; i < fb.length; i++) {
    const c = (png.data[i * 4]! << 16) | (png.data[i * 4 + 1]! << 8) | png.data[i * 4 + 2]!;
    const idx = lookup.get(c);
    if (idx === undefined) throw new Error(`pixel ${i} not in palette`);
    fb[i] = idx;
  }
  return fb;
}

/** Memory op with [base + off] addressing (I flag clear). */
export function insRel(op: 'LD' | 'LDB' | 'ST' | 'STB', a: number, base: number, off: number): number[] {
  return [OPCODES[op], (a & 7) | ((base & 7) << 3), off & 0xff, (off >>> 8) & 0xff];
}
