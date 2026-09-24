// npm run refs:games — regenerates, for every games/<name>/:
//   <name>.qrc        the cartridge
//   frame1.png        frame 1 (seed 1, no input) dumped from the VM framebuffer
//   reference.json    frame-1 hashes and cartridge size
//   hashes.txt        per-frame VM state hashes of replay.json (if the game has one)
//   replays/*.hashes.txt  per-frame hashes of every replays/*.json (games with several replays)
// References always come from the headless VM, never from a browser canvas.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCartridge } from '@qrc/cartridge';
import { VM, replay, type ReplayFile } from '@qrc/vm';
import { GAMES_DIR, buildGame } from './games';
import { writeFramePng } from './png';

for (const name of readdirSync(GAMES_DIR)) {
  const dir = join(GAMES_DIR, name);
  if (!statSync(dir).isDirectory() || !readdirSync(dir).some((f) => f.endsWith('.asm'))) continue;
  const { bytes } = await buildGame(dir);
  writeFileSync(join(dir, `${name}.qrc`), bytes);
  const cart = await parseCartridge(bytes);
  const vm = VM.fromCartridge(cart, { seed: 1 });
  vm.step(0);
  writeFramePng(join(dir, 'frame1.png'), vm.fb);
  writeFileSync(join(dir, 'reference.json'), JSON.stringify({ frames: 1, seed: 1, frameHash: vm.frameHash(), stateHash: vm.stateHash(), cartridgeBytes: bytes.length }, null, 2) + '\n');
  let extra = '';
  const replayFile = join(dir, 'replay.json');
  if (existsSync(replayFile)) {
    const rf = JSON.parse(readFileSync(replayFile, 'utf8')) as ReplayFile & { frames: number };
    const hashes = replay(VM.fromCartridge(cart, { seed: rf.seed ?? 1 }), rf.inputs, rf.frames);
    writeFileSync(join(dir, 'hashes.txt'), hashes.join('\n') + '\n');
    extra = `, ${hashes.length} replay hashes`;
  }
  const replayDir = join(dir, 'replays');
  if (existsSync(replayDir)) {
    const files = readdirSync(replayDir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const rf = JSON.parse(readFileSync(join(replayDir, f), 'utf8')) as ReplayFile & { frames: number };
      const hashes = replay(VM.fromCartridge(cart, { seed: rf.seed ?? 1 }), rf.inputs, rf.frames);
      writeFileSync(join(replayDir, f.replace(/\.json$/, '.hashes.txt')), hashes.join('\n') + '\n');
    }
    extra += `, ${files.length} replays in replays/`;
  }
  console.log(`${name}: ${bytes.length} bytes${extra}`);
}
