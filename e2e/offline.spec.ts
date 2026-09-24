import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Request } from '@playwright/test';
import { GAMES, expectCanvasMatches, scanToCompletion, type QrcWindow } from './helpers';

// M10 acceptance. Fake camera = .tmp/e2e/pong.y4m (see playwright.config.ts).
const LOG = join(import.meta.dirname, '../.tmp/e2e/requests.log');
const serverLog = () => readFileSync(LOG, 'utf8').trim().split('\n');

test('offline: after one online load the app starts, lists the Library, scans Pong and plays it — with zero network requests', async ({ page, context }) => {
  // 1. online: first load installs the service worker, which precaches the whole app
  await page.goto('./?test&seed=1&maxFrames=1');
  await expect.poll(() => page.evaluate(() => (window as unknown as QrcWindow).__qrc.swReady()), { timeout: 30_000 }).toBe(true);
  // store a cartridge through the normal UI (file picker) so the Library has something to show
  await page.setInputFiles('#file-input', join(GAMES, 'breakout/breakout.qrc'));
  await expect(page.locator('#library-list li .title')).toHaveText(['BREAKOUT']);

  // 2. go offline and record everything that happens from here on
  const serverLinesBefore = serverLog().length;
  const seen: { url: string; fromSW: boolean; byServiceWorker: boolean; failed?: string }[] = [];
  const track = (r: Request) => seen.push({ url: r.url(), fromSW: false, byServiceWorker: !!r.serviceWorker() });
  context.on('request', track);
  context.on('requestfinished', async (r) => {
    const e = seen.find((s) => s.url === r.url() && !s.fromSW);
    if (e) e.fromSW = (await r.response())?.fromServiceWorker() ?? false;
  });
  context.on('requestfailed', (r) => seen.push({ url: r.url(), fromSW: false, byServiceWorker: !!r.serviceWorker(), failed: r.failure()?.errorText }));
  await context.setOffline(true);
  await page.reload();

  // 3. app starts and shows the stored cartridge
  await expect(page.locator('#library-list li .title')).toHaveText(['BREAKOUT']);

  // 4. scan the second game with the (fake) camera, fully offline, then play it
  await scanToCompletion(page);
  await expect(page.locator('#scan-status')).toContainText('PONG');
  console.log(`scan stats: ${await page.locator('#scan-detail').textContent()}`);
  await page.click('#scan-play');
  await expectCanvasMatches(page, 'pong');
  await page.click('#nav-library');
  await expect(page.locator('#library-list li .title')).toHaveText(['PONG', 'BREAKOUT']);

  // 5. zero network requests after going offline
  const newServerRequests = serverLog().slice(serverLinesBefore);
  expect(newServerRequests, 'requests that reached the server after going offline').toEqual([]);
  const networkBySW = seen.filter((s) => s.byServiceWorker);
  const failed = seen.filter((s) => s.failed);
  const notFromCache = seen.filter((s) => !s.byServiceWorker && !s.failed && !s.fromSW && !s.url.startsWith('blob:') && !s.url.startsWith('data:'));
  console.log(`browser requests after going offline: ${seen.length} (all answered by the service worker cache: ${notFromCache.length === 0})`);
  expect(networkBySW, 'network fetches made by the service worker').toEqual([]);
  expect(failed, 'failed (attempted network) requests').toEqual([]);
  expect(notFromCache, 'page requests not served from the service worker').toEqual([]);
});
