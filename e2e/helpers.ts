import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

export const GAMES = join(import.meta.dirname, '../games');

/** window.__qrc test hooks exposed by apps/web/src/main.ts when the URL has ?test. */
export interface QrcWindow {
  __qrc: {
    ready: Promise<void>;
    play(bytes: number[]): Promise<void>;
    frame(): number;
    canvasRgba(): number[];
    screen(): string;
    swReady(): Promise<boolean>;
  };
}

/** Reference frame RGBA, dumped from the headless VM framebuffer (never from a browser). */
export function referenceRgba(game: string): number[] {
  return Array.from(PNG.sync.read(readFileSync(join(GAMES, game, 'frame1.png'))).data);
}

export function cartridgeBytes(game: string): number[] {
  return Array.from(readFileSync(join(GAMES, game, `${game}.qrc`)));
}

export async function expectCanvasMatches(page: Page, game: string) {
  await expect.poll(() => page.evaluate(() => (window as unknown as QrcWindow).__qrc.frame())).toBe(1);
  const canvas: number[] = await page.evaluate(() => (window as unknown as QrcWindow).__qrc.canvasRgba());
  const ref = referenceRgba(game);
  expect(canvas.length).toBe(ref.length);
  let diff = 0;
  for (let i = 0; i < ref.length; i++) if (canvas[i] !== ref[i]) diff++;
  expect(diff, `${game}: canvas bytes differing from the VM reference frame`).toBe(0);
}

/** Scan with the fake camera until the verified cartridge is stored and PLAY appears. */
export async function scanToCompletion(page: Page) {
  await page.click('#nav-scan');
  await expect(page.locator('#scan-status')).toContainText(/Receiving cartridge|Point the camera/, { timeout: 30_000 });
  await expect(page.locator('#scan-play')).toBeVisible({ timeout: 120_000 });
  expect(await page.locator('#scan-progress').evaluate((p: HTMLProgressElement) => p.value)).toBe(1);
}
