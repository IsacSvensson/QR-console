// Builds the e2e fixtures in .tmp/e2e: each game's animated QR GIF (default parameters) and the .y4m
// "camera" video made from it. Run by the Playwright global setup.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_FRAME_MS, planTransfer, renderQr, writeGif } from '@qrc/qr';
import { GAMES_DIR, REPO_ROOT, gifToY4m } from '@qrc/tools';

const out = join(REPO_ROOT, '.tmp/e2e');
mkdirSync(out, { recursive: true });
for (const game of ['breakout', 'pong']) {
  const bytes = new Uint8Array(readFileSync(join(GAMES_DIR, game, `${game}.qrc`)));
  const plan = planTransfer(bytes);
  const gif = writeGif(plan.packets.map((p) => renderQr(p, plan.params)), DEFAULT_FRAME_MS);
  writeFileSync(join(out, `${game}.gif`), gif);
  writeFileSync(join(out, `${game}.y4m`), gifToY4m(gif));
  console.log(`e2e fixture ${game}: ${bytes.length} B cartridge, ${plan.packets.length} frames`);
}
