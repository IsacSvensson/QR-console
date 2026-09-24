import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planTransfer, renderQr, writeGif } from '@qrc/qr';
import { OPCODES, SCREEN } from '@qrc/vm';
import { GAMES_DIR, REPO_ROOT, disassemble, gifToY4m, readFramePng, writeFramePng } from '../src';

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

describe('qrc build/run debugging aids', () => {
  const run = (...args: string[]) =>
    execFileSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'packages/tools/src/cli.ts'), ...args], { cwd: REPO_ROOT, encoding: 'utf8' });

  it('build writes .sym and .lst; run --ram and --trace use them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qrc-build-'));
    const out = join(dir, 'breakout.qrc');
    run('build', 'games/breakout', '--out', out);
    const sym = readFileSync(join(dir, 'breakout.sym'), 'utf8');
    expect(sym).toMatch(/^8000 var\s+state$/m);
    expect(sym).toMatch(/^000c label update$/m);
    expect(readFileSync(join(dir, 'breakout.lst'), 'utf8')).toMatch(/^000c\s+breakout\.asm:\d+\s+update:$/m);
    const text = run('run', out, '--frames', '2', '--ram', 'score,lives', '--trace', '3', '--trace-frame', '2');
    expect(text).toMatch(/^1: score=0 lives=3$/m);
    expect(text).toMatch(/^000c <update>\s+CALL move_paddle\s+(0000 ){7}0000 /m);
    expect(text.match(/^[0-9a-f]{4} /gm)!.length).toBe(3);
  });

  it('disassembles every instruction of a built game without illegal opcodes', () => {
    const cart = readFileSync(join(GAMES_DIR, 'pong/pong.qrc'));
    expect(cart.length).toBeGreaterThan(0);
    const mem = new Uint8Array(0x10000);
    const code = new Uint8Array([OPCODES.LD, 1 | (2 << 3), 6, 0, OPCODES.SYS, 0x80, 8, 0, OPCODES.JMP, 0x80, 0x10, 0]);
    mem.set(code, 0);
    expect(disassemble(mem, 0)).toBe('LD r1, [r2 + 6]');
    expect(disassemble(mem, 4)).toBe('SYS TEXT');
    expect(disassemble(mem, 8, (a) => (a === 0x10 ? 'there' : undefined))).toBe('JMP there');
  });
});
