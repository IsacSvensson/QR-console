import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planTransfer, renderQr, writeGif } from '@qrc/qr';
import { SCREEN } from '@qrc/vm';
import { GAMES_DIR, gifToY4m, readFramePng, writeFramePng } from '../src';

describe('tools', () => {
  it('reference PNGs round-trip palette indices exactly', () => {
    const fb = new Uint8Array(SCREEN * SCREEN).map((_, i) => (i * 7) & 15);
    const p = join(mkdtempSync(join(tmpdir(), 'qrc-')), 'f.png');
    writeFramePng(p, fb);
    expect(Array.from(readFramePng(p))).toEqual(Array.from(fb));
  });

  it('gifToY4m writes one 4:2:0 frame per GIF frame at the GIF frame rate', () => {
    const plan = planTransfer(new Uint8Array(readFileSync(join(GAMES_DIR, 'hello/hello.qrc'))));
    const gif = writeGif(plan.packets.map((p) => renderQr(p, plan.params)), 150);
    const y4m = gifToY4m(gif, { width: 320, height: 240, scale: 1 });
    const header = 'YUV4MPEG2 W320 H240 F1000:150 Ip A1:1 C420jpeg\n';
    expect(new TextDecoder().decode(y4m.subarray(0, header.length))).toBe(header);
    const frameBytes = 'FRAME\n'.length + 320 * 240 * 1.5;
    expect(y4m.length).toBe(header.length + plan.packets.length * frameBytes);
    // QR black modules appear in the luma plane
    const y = y4m.subarray(header.length + 6, header.length + 6 + 320 * 240);
    expect(y.includes(0)).toBe(true);
    expect(y.includes(255)).toBe(true);
  });
});
