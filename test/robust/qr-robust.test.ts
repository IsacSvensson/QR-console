import { describe, expect, it } from 'vitest';
import { DEFAULT_QR, LEVELS, distort, planTransfer, renderQr } from '@qrc/qr';
import { FountainDecoder, decodePacket, toHex } from '@qrc/transport';
import { loadDecoders } from '../helpers/decoders';
import { randomBytes, testSeed } from '../helpers/rng';
import { CHOSEN_DECODER } from '../../apps/web/src/scanner/decoder-choice';

const SEED = testSeed(31337);
const FRAMES = 200;

describe(`layer 3: simulated camera distortion (seed ${SEED})`, () => {
  it(`default parameters (v${DEFAULT_QR.version}-${DEFAULT_QR.ecc}, ${CHOSEN_DECODER}) decode >= 95 % of frames at moderate distortion`, async () => {
    const decode = (await loadDecoders())[CHOSEN_DECODER];
    const data = randomBytes(SEED, 20 * 1024); // K = 79 blocks, 200 frames (source + repair)
    const plan = planTransfer(data, { frames: FRAMES });
    let ok = 0;
    let wrong = 0;
    const fountain = new FountainDecoder();
    for (let i = 0; i < plan.packets.length; i++) {
      const pkt = plan.packets[i]!;
      const img = distort(renderQr(pkt, plan.params), LEVELS.moderate, SEED + i);
      const raw = await decode(img.rgba, img.width, img.height);
      if (!raw) continue;
      if (toHex(raw) === toHex(pkt)) ok++;
      else {
        wrong++;
        expect(typeof decodePacket(raw)).toBe('string'); // a wrong decode must be rejected by the packet CRC
      }
      fountain.receive(raw);
    }
    const rate = ok / plan.packets.length;
    console.log(`moderate: ${ok}/${plan.packets.length} frames decoded (${(rate * 100).toFixed(1)} %), ${wrong} wrong`);
    expect(rate).toBeGreaterThanOrEqual(0.95);
    // and the transfer itself completes and verifies from the frames that survived
    expect(fountain.done).toBe(true);
    expect(toHex(fountain.getResult()!)).toBe(toHex(data));
  });
});
