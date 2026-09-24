// npm run demo — builds both games, writes their animated QR GIFs to demo/, decodes the GIFs back with
// the CLI and verifies that the recovered cartridges are byte-identical (SHA-256) to the built ones.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256, toHex } from '@qrc/cartridge';
import { REPO_ROOT } from './games';

const GAMES = ['breakout', 'pong', 'blackbox'];
const demo = join(REPO_ROOT, 'demo');
mkdirSync(demo, { recursive: true });
const qrc = (...args: string[]) =>
  execFileSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'packages/tools/src/cli.ts'), ...args], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

let ok = true;
for (const g of GAMES) {
  const built = join(demo, `${g}.qrc`);
  const gif = join(demo, `${g}.gif`);
  const back = join(demo, `${g}.decoded.qrc`);
  console.log(qrc('build', join('games', g), '--out', built));
  console.log(qrc('encode', built, '--out', gif));
  console.log(qrc('decode', gif, '--out', back));
  const a = toHex(sha256(new Uint8Array(readFileSync(built))));
  const b = toHex(sha256(new Uint8Array(readFileSync(back))));
  const same = a === b;
  ok &&= same;
  console.log(`${g}: sha256 built ${a.slice(0, 16)}… decoded ${b.slice(0, 16)}… ${same ? 'MATCH' : 'MISMATCH'}\n`);
}
if (!ok) {
  console.error('demo: hash mismatch');
  process.exit(1);
}
console.log(`demo OK: ${GAMES.map((g) => `demo/${g}.gif`).join(', ')} — show one full-screen and scan it with the app.`);
