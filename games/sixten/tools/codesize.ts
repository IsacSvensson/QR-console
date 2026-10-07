// Code and data bytes per source file (the budget gate, DESIGN.md §12). Run: npx tsx games/sixten/tools/codesize.ts
import { buildGame } from '@qrc/tools';
import { GAME_DIR } from './util';

const { asm, bytes } = await buildGame(GAME_DIR);
const s = asm.sections;
const codeLen = s.code.length;
const per = new Map<string, { code: number; data: number; xdata: number }>();
for (const l of asm.listing) {
  const e = per.get(l.file) ?? { code: 0, data: 0, xdata: 0 };
  if (l.address >= 0x10000) e.xdata += l.bytes.length;
  else if (l.address < codeLen) e.code += l.bytes.length;
  else e.data += l.bytes.length;
  per.set(l.file, e);
}
console.log(`cartridge ${bytes.length} B; ROM ${s.code.length + s.rodata.length + s.sound.length} B (code ${s.code.length}, data ${s.rodata.length}, sound ${s.sound.length}); xdata ${s.xdata?.length ?? 0} B`);
for (const [f, e] of [...per].sort((a, b) => b[1].code + b[1].xdata - a[1].code - a[1].xdata)) console.log(`  ${f.padEnd(18)} code ${String(e.code).padStart(5)}  data ${String(e.data).padStart(5)}  xdata ${String(e.xdata).padStart(5)}`);
