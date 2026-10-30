// PLAN.md M26: generated data is up to date, the ROM holds no jump into data, RAM and stack limits, sizes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPCODES, VM, expandInputs } from '@qrc/vm';
import { generated } from '../../games/nadir/tools/gen';
import { GAME_DIR, K } from './ref';
import { buildNadir, loadReplay } from './play';

const JUMPS = new Set<number>([OPCODES.JMP, OPCODES.CALL, OPCODES.JZ, OPCODES.JNZ, OPCODES.JLT, OPCODES.JGE, OPCODES.JGT, OPCODES.JLE, OPCODES.JB, OPCODES.JAE]);

describe('M26-M27 data and ROM', () => {
  it('every generated file equals what the generators write from DESIGN.md, art/ and levels/', () => {
    for (const [file, data] of Object.entries(generated())) {
      const committed = readFileSync(join(GAME_DIR, file));
      expect(Buffer.compare(committed, Buffer.from(data)), `${file} is out of date: npm run nadir:gen`).toBe(0);
    }
  });

  it('F256 follows FOV_DEG (DESIGN §3.3)', () => {
    expect(K.F256).toBe(Math.round((64 / Math.tan(((K.FOV_DEG! / 2) * Math.PI) / 180)) * 256));
  });

  it('static ROM check: every code word is an instruction, every immediate jump lands on an instruction in the code; the code compiled for RAM too', async () => {
    const n = await buildNadir();
    // jumpsTo: undefined = any jump into the ROM code; a number = straight-line code that may only JMP there
    const check = (code: Uint8Array, base: number, what: string, jumpsTo?: number) => {
      for (let p = what === 'ROM' ? 4 : 0; p < code.length; p += 4) {
        const op = code[p]!;
        expect(op, `${what} 0x${(base + p).toString(16)}: opcode 0x${op.toString(16)}`).toBeLessThanOrEqual(OPCODES.SYS);
        const I = code[p + 1]! & 0x80;
        if (JUMPS.has(op) && (I || op !== OPCODES.JMP && op !== OPCODES.CALL)) {
          const t = code[p + 2]! | (code[p + 3]! << 8);
          if (jumpsTo !== undefined) expect(op === OPCODES.JMP && t === jumpsTo, `${what} 0x${(base + p).toString(16)}: a jump in straight-line code`).toBe(true);
          else expect(t % 4 === 0 && t >= 4 && t < code.length, `${what} 0x${(base + p).toString(16)}: jump to 0x${t.toString(16)}`).toBe(true);
        }
      }
    };
    check(n.cart.sections.code, 0, 'ROM');
    // the compiled texture columns (xdata, copied to coderam) are straight-line code ending in RET; the stubs of
    // nocompile materials jump to col_data (DESIGN §3.6)
    const x = n.cart.sections.xdata!;
    const start = n.S('code_x') - 0x10000;
    const code = x.subarray(start, start + n.S('CODE_BYTES'));
    check(code, n.S('coderam'), 'compiled columns', n.S('col_data'));
    expect(code[code.length - 4]).toBe(OPCODES.RET);
  });

  it('RAM variables stay below 0xFE00 and the deepest stack is under 512 bytes; sizes reported', async () => {
    const n = await buildNadir();
    const vars = [...n.asm.symbols].filter(([k]) => n.asm.symbolKinds.get(k) === 'var');
    const top = Math.max(...vars.map(([k, v]) => v + (k === 'coderam' ? n.S('CODE_BYTES') : 0)));
    const rf = loadReplay('m27-masks');
    const inputs = expandInputs(rf.inputs, rf.frames);
    const vm = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
    let minSp = 0x10000;
    vm.tracer = () => {
      if (vm.sp !== 0 && vm.sp < minSp) minSp = vm.sp;
    };
    for (let f = 0; f < rf.frames; f++) vm.step(inputs[f]!);
    const s = n.cart.sections;
    const rom = s.code.length + s.rodata.length + s.sound.length;
    console.log(`[size] nadir: ROM ${rom} B (code ${s.code.length}, data ${s.rodata.length}), xdata ${s.xdata?.length ?? 0} B, cartridge ${n.bytes.length} B; RAM variables up to 0x${top.toString(16)}; deepest stack ${0x10000 - minSp} B`);
    expect(rom).toBeLessThanOrEqual(32 * 1024);
    expect(vars.every(([, v]) => v < 0xfe00)).toBe(true);
    expect(0x10000 - minSp).toBeLessThan(512);
  });
});
