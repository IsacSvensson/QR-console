// Minimal static server for the production build (apps/web/dist). Every request is appended to
// .tmp/e2e/requests.log so the offline test can prove that nothing reached the network.
import { appendFileSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '../apps/web/dist');
const logDir = join(import.meta.dirname, '../.tmp/e2e');
mkdirSync(logDir, { recursive: true });
const port = Number(process.env.PORT ?? 4180);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  appendFileSync(join(logDir, 'requests.log'), `${Date.now()} ${req.method} ${url.pathname}\n`);
  let path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!path.startsWith(root)) return res.writeHead(403).end();
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!existsSync(path)) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  createReadStream(path).pipe(res);
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
