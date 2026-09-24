import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCartridge, serializeCartridge } from '@qrc/cartridge';
import { VM } from '../src';
import { readFramePng } from './helpers';

const GAME = join(__dirname, '../../../games/hello');

// games/hello/hello.qrc is built by `npm run qrc -- build games/hello`; the asm tests assert that it
// matches a fresh assembly of hello.asm. The reference PNG was dumped from the VM framebuffer
// (`qrc run --dump-frame`), never from a browser canvas.
describe('games/hello', () => {
  it('runs headless and frame 1 matches the committed reference image', async () => {
    const cart = await parseCartridge(new Uint8Array(readFileSync(join(GAME, 'hello.qrc'))));
    expect(cart.header.title).toBe('HELLO WORLD');
    const vm = VM.fromCartridge(cart);
    vm.step(0);
    expect(vm.fault).toBeNull();
    const ref = readFramePng(join(GAME, 'frame1.png'));
    const diff = ref.reduce((n, v, i) => n + (v !== vm.fb[i] ? 1 : 0), 0);
    expect(diff).toBe(0);
    expect(vm.frameHash()).toBe(JSON.parse(readFileSync(join(GAME, 'reference.json'), 'utf8')).frameHash);
  });

  it('the VM refuses the same cartridge re-labelled with an unsupported ISA version', async () => {
    const cart = await parseCartridge(new Uint8Array(readFileSync(join(GAME, 'hello.qrc'))));
    const bytes = await serializeCartridge({ title: 'HELLO', isaVersion: 2, sections: cart.sections });
    const relabelled = await parseCartridge(bytes); // valid cartridge format...
    expect(() => VM.fromCartridge(relabelled)).toThrow(/unsupported ISA version 2/); // ...but not runnable
  });
});
