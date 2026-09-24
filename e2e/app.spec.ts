import { expect, test } from '@playwright/test';
import { cartridgeBytes, expectCanvasMatches, scanToCompletion, type QrcWindow } from './helpers';

// M9 acceptance. The fake camera (see playwright.config.ts) plays .tmp/e2e/breakout.y4m, which is made
// from the animated QR GIF of games/breakout/breakout.qrc.

test.describe('player', () => {
  for (const game of ['hello', 'breakout', 'pong']) {
    test(`${game}: cartridge loaded via test hook renders exactly the VM reference frame`, async ({ page }) => {
      await page.goto('./?test&seed=1&maxFrames=1');
      await page.evaluate(() => (window as unknown as QrcWindow).__qrc.ready);
      await page.evaluate((bytes) => (window as unknown as QrcWindow).__qrc.play(bytes), cartridgeBytes(game));
      await expectCanvasMatches(page, game);
    });
  }
});

test('fake camera: scan Breakout to 100 %, press PLAY, first frame matches; persists in Library after reload', async ({ page }) => {
  await page.goto('./?test&seed=1&maxFrames=1');
  await scanToCompletion(page);
  await expect(page.locator('#scan-status')).toContainText('BREAKOUT');
  const detail = await page.locator('#scan-detail').textContent();
  console.log(`scan stats: ${detail}`);
  await page.click('#scan-play');
  await expect(page.locator('#screen-play')).toBeVisible();
  await expectCanvasMatches(page, 'breakout');

  await page.reload();
  await expect(page.locator('#library-list li')).toHaveCount(1);
  await expect(page.locator('#library-list li .title')).toHaveText('BREAKOUT');
  // and it still plays from the Library
  await page.locator('#library-list li button', { hasText: 'Play' }).click();
  await expectCanvasMatches(page, 'breakout');
});
