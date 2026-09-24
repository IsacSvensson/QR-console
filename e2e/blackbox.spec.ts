import { expect, test } from '@playwright/test';
import { expectCanvasMatches, scanToCompletion } from './helpers';

// M18 acceptance: BLACKBOX is delivered like the other games. The fake camera plays .tmp/e2e/blackbox.y4m,
// made from the animated QR GIF of games/blackbox/blackbox.qrc (a 15 KB cartridge, ~58 blocks).
test('fake camera: scan BLACKBOX to 100 %, press PLAY, the first frame matches the VM reference', async ({ page }) => {
  await page.goto('./?test&seed=1&maxFrames=1');
  await scanToCompletion(page);
  await expect(page.locator('#scan-status')).toContainText('BLACKBOX');
  console.log(`scan stats: ${await page.locator('#scan-detail').textContent()}`);
  await page.click('#scan-play');
  await expectCanvasMatches(page, 'blackbox');
});
