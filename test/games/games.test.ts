import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCartridge } from '@qrc/asm';
import { parseCartridge, toHex } from '@qrc/cartridge';
import { GAMES_DIR, gameSource } from '@qrc/tools';
import { VM, replay, type ReplayFile } from '@qrc/vm';
import type { GameChecks } from './types';

// Every game with a replay.json is checked the same way (M7/M8). Nothing here knows about a specific game.
const games = readdirSync(GAMES_DIR).filter((g) => existsSync(join(GAMES_DIR, g, 'replay.json')));
const SIZE_TARGET = 10 * 1024;

describe.each(games)('games/%s', (name) => {
  const dir = join(GAMES_DIR, name);

  it('assembles; cartridge size reported; matches the committed .qrc sections', async () => {
    const { file, source } = gameSource(dir);
    const { bytes } = await buildCartridge(source, { file });
    const cart = await parseCartridge(bytes);
    const committed = await parseCartridge(new Uint8Array(readFileSync(join(dir, `${name}.qrc`))));
    for (const k of ['code', 'rodata', 'sound'] as const) expect(toHex(cart.sections[k])).toBe(toHex(committed.sections[k]));
    const rom = cart.sections.code.length + cart.sections.rodata.length + cart.sections.sound.length;
    console.log(`[size] ${name}: cartridge ${bytes.length} B (ROM ${rom} B, compression ${cart.header.compression ? 'deflate-raw' : 'none'}); target <= ${SIZE_TARGET} B: ${bytes.length <= SIZE_TARGET ? 'met' : 'NOT met'}`);
  });

  it('scripted input sequence (500+ frames) matches the committed per-frame hash reference', async () => {
    const rf = JSON.parse(readFileSync(join(dir, 'replay.json'), 'utf8')) as ReplayFile & { frames: number };
    expect(rf.frames).toBeGreaterThanOrEqual(500);
    const cart = await parseCartridge(new Uint8Array(readFileSync(join(dir, `${name}.qrc`))));
    const expected = readFileSync(join(dir, 'hashes.txt'), 'utf8').trim().split('\n');
    const vm = VM.fromCartridge(cart, { seed: rf.seed ?? 1 });
    const actual = replay(vm, rf.inputs, rf.frames);
    expect(vm.fault).toBeNull();
    expect(vm.overruns).toBe(0);
    const firstDiff = actual.findIndex((h, i) => h !== expected[i]);
    expect(firstDiff, `first differing frame: ${firstDiff + 1}`).toBe(-1);
    expect(actual.length).toBe(expected.length);
  });

  it('the scripted run demonstrates the game rules (games/<name>/checks.ts)', async () => {
    const checksFile = join(dir, 'checks.ts');
    expect(existsSync(checksFile), `${name} needs a checks.ts`).toBe(true);
    const checks = (await import(checksFile)).default as GameChecks;
    const { file, source } = gameSource(dir);
    const { bytes, asm } = await buildCartridge(source, { file });
    const rf = JSON.parse(readFileSync(join(dir, 'replay.json'), 'utf8')) as ReplayFile & { frames: number };
    const vm = VM.fromCartridge(await parseCartridge(bytes), { seed: rf.seed ?? 1 });
    const ram = (sym: string) => {
      const addr = asm.symbols.get(sym);
      if (addr === undefined) throw new Error(`no symbol ${sym}`);
      return vm.read16(addr);
    };
    const samples: Record<string, number>[] = [];
    replay(vm, rf.inputs, rf.frames, (f) => samples.push(checks.sample(ram, vm, f)));
    checks.verify(samples);
  });
});

it('at least two playable games are checked (Breakout + a second game)', () => {
  expect(games.length).toBeGreaterThanOrEqual(2);
});
