import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCartridge } from '@qrc/asm';
import { parseCartridge, toHex } from '@qrc/cartridge';
import { bitmapToRgba, decodeQrRgba, planTransfer, readGif, renderQr, writeGif } from '@qrc/qr';
import { readFramePng } from '@qrc/tools';
import { FountainDecoder } from '@qrc/transport';
import { VM } from '@qrc/vm';
import { rng, testSeed } from '../helpers/rng';

const HELLO = join(__dirname, '../../games/hello');
const SEED = testSeed(4);

async function helloCartridge() {
  const { bytes } = await buildCartridge(readFileSync(join(HELLO, 'hello.asm'), 'utf8'), { file: 'hello.asm' });
  return bytes;
}

async function verifyAndRun(bytes: Uint8Array) {
  const cart = await parseCartridge(bytes); // magic, version, sizes, body hash
  const vm = VM.fromCartridge(cart);
  vm.step(0);
  expect(vm.fault).toBeNull();
  const ref = readFramePng(join(HELLO, 'frame1.png'));
  expect(toHex(vm.fb)).toBe(toHex(ref));
  expect(vm.frameHash()).toBe(JSON.parse(readFileSync(join(HELLO, 'reference.json'), 'utf8')).frameHash);
}

describe('vertical slice, layer 2 (clean images)', () => {
  it('hello.asm -> cartridge -> packets -> QR images -> decode each image -> fountain -> verify -> VM -> frame 1 = reference', async () => {
    const bytes = await helloCartridge();
    const plan = planTransfer(bytes);
    const images = plan.packets.map((p) => renderQr(p, plan.params));
    const dec = new FountainDecoder();
    for (const img of images) {
      const raw = decodeQrRgba(bitmapToRgba(img), img.width, img.height);
      expect(raw).not.toBeNull();
      dec.receive(raw!);
    }
    expect(dec.done).toBe(true);
    expect(toHex(dec.getResult()!)).toBe(toHex(bytes));
    await verifyAndRun(dec.getResult()!);
  });

  it(`the same through a real GIF file, frames read back in shuffled order (seed ${SEED})`, async () => {
    const bytes = await helloCartridge();
    const plan = planTransfer(bytes);
    const gif = writeGif(plan.packets.map((p) => renderQr(p, plan.params)), 150);
    const frames = readGif(gif);
    expect(frames.length).toBe(plan.packets.length);
    const r = rng(SEED);
    const order = frames.map((_, i) => i).sort(() => r() - 0.5);
    const dec = new FountainDecoder();
    for (const i of order) {
      const f = frames[i]!;
      const raw = decodeQrRgba(f.rgba, f.width, f.height);
      expect(raw).not.toBeNull();
      dec.receive(raw!);
    }
    expect(dec.done).toBe(true);
    await verifyAndRun(dec.getResult()!);
  });

  it('a multi-block cartridge also survives the GIF path with every other frame dropped', async () => {
    // hello is a single block; pad a cartridge's rodata so K > 1 and the fountain actually mixes blocks.
    const { bytes } = await buildCartridge(readFileSync(join(HELLO, 'hello.asm'), 'utf8') + '\n.data\npad: .fill 3000, 0x5A\n', { compression: 'none' });
    const plan = planTransfer(bytes);
    expect(plan.encoder.K).toBeGreaterThan(10);
    const frames = readGif(writeGif(plan.packets.map((p) => renderQr(p, plan.params)), 150));
    const dec = new FountainDecoder();
    for (let loop = 0; loop < 3 && !dec.done; loop++) {
      frames.forEach((f, i) => {
        if ((i + loop) % 2 === 0) return;
        const raw = decodeQrRgba(f.rgba, f.width, f.height);
        if (raw) dec.receive(raw);
      });
    }
    expect(dec.done).toBe(true);
    expect(toHex(dec.getResult()!)).toBe(toHex(bytes));
    await verifyAndRun(dec.getResult()!);
  });
});
