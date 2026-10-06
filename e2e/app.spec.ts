import { expect, test } from '@playwright/test';
import { buildCartridge } from '@qrc/asm';
import { parseCartridge, serializeCartridge } from '@qrc/cartridge';
import { VM } from '@qrc/vm';
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

test.describe('input', () => {
  test.use({ hasTouch: true });
  test('keyboard and on-screen touch buttons reach the VM input mask', async ({ page }) => {
    await page.goto('./?test&seed=1');
    await page.evaluate(() => (window as unknown as QrcWindow).__qrc.ready);
    await page.evaluate((bytes) => (window as unknown as QrcWindow).__qrc.play(bytes), cartridgeBytes('pong'));
    const buttons = () => page.evaluate(() => (window as unknown as QrcWindow).__qrc.buttons());
    const expected: [string, number][] = [['ArrowLeft', 1], ['ArrowRight', 2], ['ArrowUp', 4], ['ArrowDown', 8], ['z', 16], ['x', 32]];
    for (const [key, bit] of expected) {
      await page.keyboard.down(key);
      expect(await buttons(), key).toBe(bit);
      await page.keyboard.up(key);
      expect(await buttons()).toBe(0);
    }
    // on-screen A button (pointer events, as a finger would produce)
    const a = page.locator('.ab .a');
    await a.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true });
    expect(await buttons()).toBe(16);
    await a.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true });
    expect(await buttons()).toBe(0);
    // and input actually drives the game: pressing A on the title screen starts a match (frame changes)
    const before = await page.evaluate(() => (window as unknown as QrcWindow).__qrc.canvasRgba());
    await page.keyboard.down('z');
    await page.waitForTimeout(300);
    await page.keyboard.up('z');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => (window as unknown as QrcWindow).__qrc.canvasRgba());
    expect(after).not.toEqual(before);
  });
});

test.describe('ISA versions (M22b)', () => {
  test('an ISA 2 cartridge (xdata, UNPACK) plays; an ISA 3 cartridge is stored but marked and cannot start', async ({ page }) => {
    // ISA 2: unpack a sprite from xdata into RAM and draw it from there
    const src = [
      'update:',
      '    MOV r0, 0x9000',
      '    MOV r1, spr >> 16',
      '    MOV r2, spr & 0xFFFF',
      '    SYS UNPACK',
      '    MOV r0, 0x9000',
      '    MOV r1, 60',
      '    MOV r2, 60',
      '    MOV r3, 0',
      '    SYS SPR',
      '    RET',
      '.xdata',
      'spr:',
      '.pack',
      '.fill 32, 0x77',
      '.endpack',
    ].join('\n');
    const two = await buildCartridge(src, { title: 'ISA TWO' });
    expect(two.asm.isaVersion).toBe(2);
    const vm = VM.fromCartridge(await parseCartridge(two.bytes));
    vm.step(0);
    expect(vm.fb[60 * 128 + 60]).toBe(7);
    await page.goto('./?test&seed=1&maxFrames=1');
    await page.evaluate(() => (window as unknown as QrcWindow).__qrc.ready);
    await page.evaluate((bytes) => (window as unknown as QrcWindow).__qrc.play(bytes), [...two.bytes]);
    const at = (60 * 128 + 60) * 4;
    await expect
      .poll(async () => {
        const px = await page.evaluate(() => (window as unknown as QrcWindow).__qrc.canvasRgba());
        return px.slice(at, at + 3).join(',') !== px.slice(0, 3).join(',');
      })
      .toBe(true);

    // ISA 3: a future cartridge
    const three = await serializeCartridge({ title: 'FUTURE', isaVersion: 3, sections: { code: new Uint8Array([0xff, 0xff, 0xff, 0xff]), rodata: new Uint8Array(0), sound: new Uint8Array(0) } });
    await page.goto('./?test');
    await page.evaluate(() => (window as unknown as QrcWindow).__qrc.ready);
    await page.setInputFiles('#file-input', { name: 'future.qrc', mimeType: 'application/octet-stream', buffer: Buffer.from(three) });
    const li = page.locator('#library-list li', { hasText: 'FUTURE' });
    await expect(li).toHaveCount(1);
    await expect(li.locator('.needs-update')).toContainText('Needs a newer QR Console (ISA 3');
    await expect(li.locator('button', { hasText: 'Play' })).toBeDisabled();
  });
});
