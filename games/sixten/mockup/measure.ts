// Builds the Sixten mockup, runs all four scenes in the VM and reports the cycles per frame of each scene,
// writes the reference pictures to games/sixten/docs/ (4x), and checks the QR round trip:
// qrc encode -> mockup.gif -> qrc decode -> the same cartridge (SHA-256).
// Run: npx tsx games/sixten/mockup/measure.ts      (after gen.ts)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCartridge, sha256, toHex } from '@qrc/cartridge';
import { REPO_ROOT, buildGame, writeFramePng } from '@qrc/tools';
import { VM } from '@qrc/vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, '..', 'docs');
const SCENE = 300;
const NAMES = ['uppifrån (tromb styrka 3)', 'kartskärm', 'sidovy', 'overlay A / B'];
/** frames (0-based step index) whose picture goes into docs/ */
const SHOTS: Record<number, string> = { 160: 'topdown', 305: 'karta', 760: 'sidovy', 1000: 'overlay-a', 1199: 'overlay-b' };

const { bytes, asm } = await buildGame(HERE);
const qrc = join(HERE, 'mockup.qrc');
writeFileSync(qrc, bytes);
mkdirSync(DOCS, { recursive: true });

const vm = VM.fromCartridge(await parseCartridge(bytes), { seed: 1 });
const max = [0, 0, 0, 0];
const at = [0, 0, 0, 0];
const top = { expand: 0, other: 0 }; // the top-down scene: frames that expand the screen (every 8th) and the rest
for (let f = 0; f < SCENE * 4; f++) {
  vm.step(0);
  if (f > 0 && f < SCENE) {
    const k = f % 8 === 0 ? 'expand' : 'other';
    top[k] = Math.max(top[k], vm.cyclesLastFrame);
  }
  const s = Math.floor(f / SCENE);
  if (vm.cyclesLastFrame > max[s]!) {
    max[s] = vm.cyclesLastFrame;
    at[s] = f;
  }
  const shot = SHOTS[f];
  if (shot) writeFramePng(join(DOCS, `${shot}.png`), vm.fb, 4);
}
if (vm.fault) throw new Error(`VM fault: ${vm.fault}`);

const s = asm.sections;
console.log(`cartridge ${bytes.length} B (ISA ${asm.isaVersion}); code ${s.code.length} B, rodata ${s.rodata.length} B, xdata ${s.xdata?.length ?? 0} B`);
console.log(`overruns ${vm.overruns}, fault ${vm.fault ?? 'none'}`);
console.log('| scen | högst cykler per bildruta | bildruta (i scenen) |\n|---|---:|---:|');
NAMES.forEach((n, i) => console.log(`| ${n} | ${max[i]} | ${at[i]! - i * SCENE} |`));
console.log(`top-down after frame 0: frames with the screen expansion max ${top.expand}, the others max ${top.other}`);

// the QR round trip, with the same CLI the other games use
const cli = (...args: string[]) =>
  execFileSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'packages/tools/src/cli.ts'), ...args], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
const gif = join(HERE, 'mockup.gif');
const back = join(HERE, 'mockup.decoded.qrc');
console.log(cli('encode', qrc, '--out', gif));
console.log(cli('decode', gif, '--out', back));
const a = toHex(sha256(new Uint8Array(readFileSync(qrc))));
const b = toHex(sha256(new Uint8Array(readFileSync(back))));
rmSync(back);
console.log(`sha256 built ${a.slice(0, 16)}… decoded ${b.slice(0, 16)}… ${a === b ? 'MATCH' : 'MISMATCH'}`);
if (a !== b) process.exit(1);
