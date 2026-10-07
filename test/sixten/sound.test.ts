import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { VM, expandInputs, type AudioCommand, type ReplayFile } from '@qrc/vm';
import { GAME_DIR, LEVEL_IDS, type Sixten, buildSixten, symbol } from './oracle';

// M32 acceptance: music and sound (DESIGN.md §15). Each world has its own loop, and every loop is heard whole in
// the replays (m31-all plays every level); the whirlwind's noise follows its strength: higher and louder with
// each step, dull in shelter.
let sx: Sixten;
beforeAll(async () => {
  sx = await buildSixten();
});
const S = (n: string) => symbol(sx.sym, n);

interface Heard { f: number; world: number; level: string; mode: number; mode0: number; audio: AudioCommand[]; s0: number; s1: number; sheltered: number; whState: number }
let heard: Heard[] = [];
function listen(name: string) {
  const rf = JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8')) as ReplayFile & { frames: number };
  const vm = VM.fromCartridge(sx.cart, { seed: rf.seed ?? 1 });
  const inputs = expandInputs(rf.inputs, rf.frames);
  const out: Heard[] = [];
  for (let f = 0; f < rf.frames; f++) {
    const s0 = vm.read16(S('wh_s'));
    const mode0 = vm.read16(S('mode'));
    const audio = vm.step(inputs[f]!);
    const level = LEVEL_IDS[vm.read16(S('level'))]!;
    out.push({ f, world: Number(level[0]), level, mode: vm.read16(S('mode')), mode0, audio: [...audio], s0, s1: vm.read16(S('wh_s')), sheltered: vm.read16(S('sheltered')), whState: vm.read16(S('wh_state')) });
  }
  return out;
}
const tune = (w: number): number[] => {
  const a = S(`tune_w${w}`);
  return [...Array(32)].map((_, i) => sx.rom[a + 2 * i]! | (sx.rom[a + 2 * i + 1]! << 8));
};
// the music's notes: square channel 1, 8 frames, volume 3 (the sound effects on channel 1 are SFX with other values)
const isNote = (a: AudioCommand) => a.channel === 1 && a.duration === 8 && a.volume === 3;
const isWind = (a: AudioCommand) => a.channel === 2 && a.duration === 18;

describe('music (DESIGN §15)', () => {
  beforeAll(() => {
    heard = listen('m31-all');
  });

  it('five different tunes, one per world', () => {
    const t = [1, 2, 3, 4, 5].map((w) => tune(w).join(','));
    expect(new Set(t).size).toBe(5);
  });

  it("in each world's levels the notes heard are that world's tune, in order, and all 32 steps are heard", () => {
    for (let w = 1; w <= 5; w++) {
      const notes = tune(w);
      const steps = new Set<number>();
      // the steps of the tune the notes so far can be at; each new note must be the next sounding step of one of them
      let at: number[] = [];
      let lastLevel = '';
      let n = 0;
      const next = (k: number) => {
        let j = (k + 1) % 32;
        while (notes[j] === 0) j = (j + 1) % 32;
        return j;
      };
      for (const h of heard) {
        if (h.world !== w || h.level[0] === 'T') continue;
        for (const a of h.audio.filter(isNote)) {
          n++;
          const fresh = h.level !== lastLevel;
          lastLevel = h.level;
          const cand = fresh ? notes.map((_, k) => k) : at.map(next);
          at = cand.filter((k) => notes[k] === a.freq);
          expect(at.length, `world ${w} frame ${h.f + 1}: ${a.freq} Hz is not the next note of the tune`).toBeGreaterThan(0);
          if (at.length === 1) steps.add(at[0]!);
        }
      }
      expect(n, `world ${w}`).toBeGreaterThan(200);
      expect(steps.size, `world ${w}: steps heard`).toBe(notes.filter((x) => x).length);
    }
  });

  it('no music outside the levels (title, world map, tally, book)', () => {
    const outside = [S('M_TITLE'), S('M_WMAP'), S('M_TALLY'), S('M_BOOK'), S('M_END'), S('M_CODE')];
    for (const h of heard) if (outside.includes(h.mode0)) expect(h.audio.filter(isNote), `frame ${h.f + 1}`).toEqual([]);
  });
});

describe("the whirlwind's sound (DESIGN §15)", () => {
  it('its pitch and volume follow its strength (180 + 60 s Hz, volume 2 s + 3, halved in shelter)', () => {
    let n = 0;
    const strengths = new Set<number>();
    for (const h of heard) {
      for (const a of h.audio.filter(isWind)) {
        n++;
        const s = [h.s0, h.s1].find((x) => a.freq === 180 + 60 * x);
        expect(s, `frame ${h.f + 1}: ${a.freq} Hz at strength ${h.s0}/${h.s1}`).toBeDefined();
        const vol = 2 * s! + 3;
        expect(a.volume, `frame ${h.f + 1}`).toBe(h.sheltered ? vol >> 1 : vol);
        strengths.add(s!);
      }
    }
    expect(n).toBeGreaterThan(50);
    for (const s of [1, 2, 3, 4, 5]) expect(strengths.has(s), `strength ${s} heard`).toBe(true);
  });

  it('it is only heard while a whirlwind is under way', () => {
    for (const h of heard) if (h.audio.some(isWind)) expect(h.whState, `frame ${h.f + 1}`).not.toBe(S('WH_NONE'));
  });
});
