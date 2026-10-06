import { beforeAll, describe, expect, it } from 'vitest';
import { VM } from '@qrc/vm';
import { type Bo, buildBo, symbol } from './oracle';
import { play } from './play';

// M25 acceptance: picture codes (DESIGN §7.3, "Exakt format"). A reference encoder written from the design text;
// every code goes through the VM's code screen (the four pictures, A) and comes out as the game state; the map
// shows the code of that state again (the VM's encoder). Codes that cannot exist are rejected.
let bo: Bo;
const S = (n: string) => symbol(bo.sym, n);

/** DESIGN §7.3: v = world * 2^13 + boards * 2^8 + full * 2^3 + (3 world + 5 boards + 7 full + 1) mod 8 */
export function encode(world: number, boards: number, full: number): number {
  return (world << 13) | (boards << 8) | (full << 3) | ((3 * world + 5 * boards + 7 * full + 1) & 7);
}
const nibbles = (v: number) => [(v >> 12) & 15, (v >> 8) & 15, (v >> 4) & 15, v & 15];

let vm: VM;
beforeAll(async () => {
  bo = await buildBo();
  vm = VM.fromCartridge(bo.cart, { seed: 1 });
  for (let f = 0; f < 40; f++) vm.step(0); // to the title
});

/** enters the four pictures on the code screen and presses A; returns the mode afterwards */
function enter(pics: number[]) {
  vm.write16(S('mode'), S('M_CODE'));
  pics.forEach((p, i) => vm.write8(S('code_v') + i, p));
  vm.write16(S('code_bad'), 0);
  vm.step(0);
  vm.step(16); // A
  return vm.read16(S('mode'));
}

describe('picture codes (M25, DESIGN §7.3)', () => {
  it('every code round-trips: all worlds (and 6, the game done) x board sets x star sets; impossible codes are rejected', () => {
    let good = 0;
    let bad = 0;
    for (let world = 1; world <= 6; world++) {
      const doneMask = (1 << (world - 1)) - 1; // the worlds before the code's world
      for (let boards = 0; boards < 32; boards++) {
        for (let full = 0; full < 32; full++) {
          const v = encode(world, boards, full);
          const mode = enter(nibbles(v));
          const possible = ((boards | full) & ~doneMask) === 0;
          if (!possible) {
            expect(mode, `code ${v.toString(16)} (world ${world}, boards ${boards}, full ${full}) rejected`).toBe(S('M_CODE'));
            expect(vm.read16(S('code_bad'))).toBeGreaterThan(0);
            bad++;
            continue;
          }
          const tag = `world ${world}, boards ${boards.toString(2)}, full ${full.toString(2)}`;
          expect(mode, tag).toBe(S('M_MAP'));
          expect(vm.read16(S('map_world')), `${tag}: the map`).toBe(Math.min(world, 5) - 1);
          // the state: each world's board, its stars, the levels done, the theft, SUPERBOSSE
          const b = vm.read16(S('boards'));
          for (let w = 0; w < 5; w++) expect((b >> (w + 1)) & 1, `${tag}: board ${w + 1}`).toBe((boards >> w) & 1);
          for (let l = 0; l < 25; l++) {
            const p = vm.read8(S('progress') + l);
            const w = Math.floor(l / 5);
            expect((p & S('PR_DONE')) !== 0, `${tag}: level ${l} done`).toBe(l < (world - 1) * 5);
            if (l % 5 < 4) expect(p & 7, `${tag}: stars of level ${l}`).toBe((full >> w) & 1 ? 7 : 0);
          }
          expect(vm.read16(S('super_ok')), `${tag}: SUPERBOSSE`).toBe(world === 6 ? 1 : 0);
          expect(vm.read16(S('stolen')), `${tag}: the seagull has the board`).toBe(world === 5 ? 1 : 0);
          expect((b >> S('BD_LIQ')) & 1, `${tag}: the licorice board`).toBe(world >= 5 ? 1 : 0);
          expect((b >> S('BD_GOLD')) & 1, `${tag}: the golden board`).toBe(full === 31 ? 1 : 0);
          vm.step(0); // the map draws its code: the VM's encoder gives the same code back
          expect(vm.read16(S('map_code')), `${tag}: the map shows the same code`).toBe(v);
          good++;
        }
      }
    }
    console.log(`[measured] codes: ${good} round-trip, ${bad} impossible ones rejected`);
    expect(good).toBe([1, 2, 3, 4, 5, 6].reduce((n, w) => n + 4 ** (w - 1), 0));
  });

  it('a wrong checksum is rejected (FEL KOD), and the four Bos still open the test levels', () => {
    for (const [world, boards, full] of [[1, 0, 0], [3, 3, 1], [6, 31, 31]] as const) {
      const v = encode(world, boards, full) ^ 1;
      expect(enter(nibbles(v))).toBe(S('M_CODE'));
      expect(vm.read16(S('code_bad'))).toBeGreaterThan(0);
    }
    expect(enter([15, 15, 15, 15])).toBe(S('M_MENU'));
  });

  it('replay m25-code: from the title the code of World 3 (boards of Worlds 1-2, all stars of World 1) is entered; the game resumes in World 3 with those boards', () => {
    const { run, problems, frames } = play(bo, 'm25-code');
    expect(run.hashMismatch, 'first frame whose state hash differs').toBe(-1);
    expect(run.expectedFrames).toBe(run.rf.frames);
    expect(problems.slice(0, 10)).toEqual([]);
    expect(run.vm.fault).toBeNull();
    expect(run.vm.overruns).toBe(0);
    console.log(`[budget] m25-code: ${run.rf.frames} frames, max ${run.maxCycles} cycles per frame`);
    expect(run.maxCycles).toBeLessThanOrEqual(25_000);
    const code = frames.findIndex((x) => x.mode === S('M_CODE'));
    const map = frames.findIndex((x, k) => k > code && x.mode === S('M_MAP'));
    expect(code, 'the code screen').toBeGreaterThan(0);
    expect(map, 'the map after A').toBeGreaterThan(code);
    expect(frames.slice(0, code).some((x) => x.playing), 'no level before the code').toBe(false);
    const played = frames.find((x, k) => k > map && x.playing);
    expect(played?.level, 'the first level played after the code').toBe('3-1');
    const vm = run.vm;
    expect(vm.read16(S('map_world'))).toBe(2);
    const b = vm.read16(S('boards'));
    expect(b & 0b111111, 'own board + the boards of Worlds 1 and 2').toBe(0b000111);
    for (let l = 0; l < 4; l++) expect(vm.read8(S('progress') + l) & 7, `level 1-${l + 1}: all stars`).toBe(7);
    for (let l = 5; l < 9; l++) expect(vm.read8(S('progress') + l) & 7, `level 2-${l - 4}: no stars`).toBe(0);
    expect(frames.some((x, k) => k > map && x.level === '3-1' && x.mode === S('M_TALLY')), '3-1 finished').toBe(true);
  });
});
