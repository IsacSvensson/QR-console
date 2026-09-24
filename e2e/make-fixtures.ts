// Builds the e2e fixtures in .tmp/e2e: each game's animated QR GIF (default parameters) and the .y4m
// "camera" video made from it. Run by the Playwright global setup.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serializeCartridge } from '@qrc/cartridge';
import { DEFAULT_FRAME_MS, planTransfer, renderQr, writeGif } from '@qrc/qr';
import { GAMES_DIR, REPO_ROOT, gifToY4m } from '@qrc/tools';

const out = join(REPO_ROOT, '.tmp/e2e');
mkdirSync(out, { recursive: true });
for (const game of ['breakout', 'pong', 'blackbox']) {
  const bytes = new Uint8Array(readFileSync(join(GAMES_DIR, game, `${game}.qrc`)));
  const plan = planTransfer(bytes);
  const gif = writeGif(plan.packets.map((p) => renderQr(p, plan.params)), DEFAULT_FRAME_MS);
  writeFileSync(join(out, `${game}.gif`), gif);
  writeFileSync(join(out, `${game}.y4m`), gifToY4m(gif));
  console.log(`e2e fixture ${game}: ${bytes.length} B cartridge, ${plan.packets.length} frames`);
}

// Only for `npm run bench:scan`: a 50 KB cartridge (hello's code + 50 KB of incompressible rodata).
if (process.env.QRC_BIG_FIXTURE === '1') {
  const hello = readFileSync(join(GAMES_DIR, 'hello/hello.qrc'));
  const { parseCartridge } = await import('@qrc/cartridge');
  const cart = await parseCartridge(new Uint8Array(hello));
  let x = 12345;
  const rodata = new Uint8Array(50 * 1024 - 200).map(() => ((x = (x * 1103515245 + 12345) >>> 0) >>> 24));
  const bytes = await serializeCartridge({ title: 'BIG 50K', isaVersion: 1, sections: { ...cart.sections, rodata: new Uint8Array([...cart.sections.rodata, ...rodata]) }, compression: 'none' });
  writeFileSync(join(out, 'big.qrc'), bytes);
  const plan = planTransfer(bytes);
  const gif = writeGif(plan.packets.map((p) => renderQr(p, plan.params)), DEFAULT_FRAME_MS);
  writeFileSync(join(out, 'big.y4m'), gifToY4m(gif));
  console.log(`e2e fixture big: ${bytes.length} B cartridge, K=${plan.encoder.K}, ${plan.packets.length} frames`);
}
