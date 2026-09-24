import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assemble, buildCartridge } from '@qrc/asm';
import { parseCartridge } from '@qrc/cartridge';
import { VM } from '@qrc/vm';

// Keeps docs/PROGRAMMING.md honest: every complete program in it (an ```asm block with an `update:` label)
// must assemble and run 300 frames without faults or cycle-budget overruns, and the encoding examples in
// §11 must match the assembler.
const guide = readFileSync(join(__dirname, '../docs/PROGRAMMING.md'), 'utf8');
const programs = [...guide.matchAll(/```asm\n([\s\S]*?)```/g)].map((m) => m[1]!).filter((src) => /^update:/m.test(src));

describe('docs/PROGRAMMING.md', () => {
  it('contains complete example programs', () => {
    expect(programs.length).toBeGreaterThanOrEqual(3);
  });

  programs.forEach((src, i) => {
    const title = /\.title "([^"]+)"/.exec(src)?.[1] ?? `#${i}`;
    it(`example ${title} assembles and runs 300 frames cleanly`, async () => {
      const { bytes } = await buildCartridge(src, { file: `PROGRAMMING.md example ${title}` });
      const vm = VM.fromCartridge(await parseCartridge(bytes), { seed: 1 });
      for (let f = 0; f < 300; f++) vm.step(f % 50 < 25 ? 2 | 8 | 16 : 1 | 4); // exercise some input
      expect(vm.fault).toBeNull();
      expect(vm.overruns).toBe(0);
    });
  });

  it('bytecode examples in §11 match the assembler', () => {
    const code = Array.from(assemble('update:\nADD r3, 5\nLD r1, [r2 + 6]\nSYS TEXT\n').sections.code.slice(4));
    const hex = code.map((b) => b.toString(16).padStart(2, '0'));
    expect(hex.join(' ')).toBe('06 83 05 00 02 11 06 00 20 80 08 00');
    for (const ex of ['`ADD r3, 5` = `06 83 05 00`', '`LD r1, [r2 + 6]` = `02 11 06 00`', '`SYS TEXT` = `20 80 08 00`']) {
      expect(guide).toContain(ex);
    }
  });
});
