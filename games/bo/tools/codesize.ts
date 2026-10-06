// Development aid: code bytes per source file and per routine, from the listing (games/bo/bo.lst).
// Run: npm run qrc -- build games/bo && npx tsx games/bo/tools/codesize.ts [top N]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from './util';

const top = Number(process.argv[2] ?? 30);
const rows: { a: number; file: string; src: string }[] = [];
for (const l of readFileSync(join(GAME_DIR, 'bo.lst'), 'utf8').split(/\r?\n/)) {
  const m = /^([0-9a-f]{4})\s.*?(\S+?\.asm):(\d+)\s(.*)$/.exec(l);
  if (m) rows.push({ a: parseInt(m[1]!, 16), file: m[2]!, src: m[4]! });
}
// code ends where the first .data label is (the assembler places .data after all code)
const sym = readFileSync(join(GAME_DIR, 'bo.sym'), 'utf8');
const codeEnd = Math.min(...[...sym.matchAll(/^([0-9a-f]{4})\s+\w+\s+(phys|heightmaps)$/gm)].map((m) => parseInt(m[1]!, 16)));
const sizes = new Map<string, number>();
const fileOf = new Map<string, string>();
let label = '(start)';
for (let i = 0; i < rows.length; i++) {
  const { a, file, src } = rows[i]!;
  if (a >= codeEnd) continue;
  const m = /^\s*([A-Za-z_]\w*):/.exec(src);
  if (m) {
    label = m[1]!;
    fileOf.set(label, file);
  }
  const next = rows.slice(i + 1).find((r) => r.a !== a)?.a ?? a;
  if (next > a && next <= codeEnd) sizes.set(label, (sizes.get(label) ?? 0) + (next - a));
}
const byFile = new Map<string, number>();
for (const [k, v] of sizes) byFile.set(fileOf.get(k) ?? '?', (byFile.get(fileOf.get(k) ?? '?') ?? 0) + v);
console.log(`code ${codeEnd} bytes`);
for (const [f, v] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(6)} ${f}`);
console.log('---');
for (const [k, v] of [...sizes].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${String(v).padStart(6)} ${k} (${fileOf.get(k)})`);
