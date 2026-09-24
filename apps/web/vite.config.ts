import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const root = import.meta.dirname;
const publicDir = join(root, 'public');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

/**
 * Emits sw.js: a cache-first service worker that precaches every file of the build (bundle, wasm,
 * worker, manifest, icons), so the app runs fully offline after the first load (SPEC L11).
 */
function serviceWorker(): Plugin {
  return {
    name: 'qrc-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = [
        ...Object.keys(bundle),
        ...listFiles(publicDir).map((p) => relative(publicDir, p).split('\\').join('/')),
      ].filter((f) => f !== 'sw.js');
      const hash = createHash('sha256');
      for (const f of Object.keys(bundle).sort()) {
        const item = bundle[f]!;
        hash.update(f).update(item.type === 'chunk' ? item.code : item.source);
      }
      const version = hash.digest('hex').slice(0, 12);
      const precache = [...new Set(['./', './index.html', ...files.map((f) => `./${f}`)])];
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(version, precache) });
    },
  };
}

function swSource(version: string, files: string[]): string {
  return `// Generated at build time by apps/web/vite.config.ts. Cache-first; everything is precached on install.
const CACHE = 'qrc-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('qrc-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const index = await cache.match('./index.html') || await cache.match('./');
      if (index) return index;
    }
    return fetch(req);
  })());
});
`;
}

/** `npm run preview:https` sets QRC_HTTPS=1 after creating a self-signed certificate in .tmp/cert. */
function httpsOptions() {
  if (process.env.QRC_HTTPS !== '1') return undefined;
  const dir = join(root, '../../.tmp/cert');
  if (!existsSync(join(dir, 'key.pem'))) throw new Error('run scripts/https-cert.mjs first (npm run preview:https does)');
  return { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
}

export default defineConfig({
  root,
  base: './',
  plugins: [serviceWorker()],
  worker: { format: 'es' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', assetsInlineLimit: 0 },
  preview: { host: true, https: httpsOptions() },
  server: { host: true },
});
