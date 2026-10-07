import { expect, test } from '@playwright/test';
import { expectCanvasMatches, scanToCompletion } from './helpers';

// M32 acceptance: Sixtens expedition is delivered like the other games. The fake camera plays .tmp/e2e/sixten.y4m,
// made from the animated QR GIF of games/sixten/sixten.qrc (an ISA 2 cartridge, ~19 KB).
test('fake camera: scan Sixten to 100 %, press PLAY, the first frame matches the VM reference', async ({ page }) => {
  await page.goto('./?test&seed=1&maxFrames=1');
  await scanToCompletion(page);
  await expect(page.locator('#scan-status')).toContainText('SIXTENS EXPEDITION');
  console.log(`scan stats: ${await page.locator('#scan-detail').textContent()}`);
  await page.click('#scan-play');
  await expectCanvasMatches(page, 'sixten');
});
