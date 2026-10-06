import { beforeAll, describe, expect, it } from 'vitest';
import { VM, expandInputs } from '@qrc/vm';
import { gridOf } from './frames';
import { type Bo, LEVEL_IDS, ROWS, buildBo, loadReplay, readRefLevel, replayFiles, symbol } from './oracle';
import { type F, play } from './play';

// M24 acceptance: Worlds 4 and 5, the theft and the ending (PLAN.md Part 3).
let bo: Bo;
const S = (n: string) => symbol(bo.sym, n);
const W4 = ['4-1', '4-2', '4-3', '4-4', '4-5'];
const W5 = ['5-1', '5-2', '5-3', '5-4', '5-5'];
const ALL = [1, 2, 3, 4, 5].flatMap((w) => [1, 2, 3, 4, 5].map((l) => `${w}-${l}`));
const REPLAYS = ['m24-game', 'm24-4-1', 'm24-4-2', 'm24-4-3', 'm24-4-4', 'm24-4-5', 'm24-5-1', 'm24-5-2', 'm24-5-3', 'm24-5-4', 'm24-final', 'm24-final-retry', 'm24-super-before', 'm24-alts'];
const BOSS5 = 25;
const TR = { R360: 4, SUPER: 7 };
const runs = new Map<string, F[]>();

beforeAll(async () => {
  bo = await buildBo();
  for (const r of REPLAYS) runs.set(r, play(bo, r).frames);
});

for (const name of REPLAYS) {
  describe(`replay ${name} (M24)`, () => {
    it('matches the committed per-frame hashes; budgets; reference grid checks', () => {
      const { run, problems } = play(bo, name);
      expect(run.hashMismatch, 'first frame whose state hash differs').toBe(-1);
      expect(run.expectedFrames).toBe(run.rf.frames);
      expect(problems.slice(0, 10)).toEqual([]);
      expect(run.vm.fault).toBeNull();
      expect(run.vm.overruns).toBe(0);
      console.log(`[budget] ${name}: ${run.rf.frames} frames, max ${run.maxCycles} cycles per frame`);
      expect(run.maxCycles).toBeLessThanOrEqual(25_000);
    });
  });
}

describe('the whole game (M24)', () => {
  it('one replay plays from the title to the end of the game: all 25 levels from their start to their goal, no code entry', () => {
    const s = runs.get('m24-game')!;
    expect(s.slice(0, 40).some((x) => x.mode === S('M_TITLE'))).toBe(true);
    const end = s.findIndex((x) => x.mode === S('M_END'));
    expect(end, 'the ending').toBeGreaterThan(0);
    expect(s.slice(0, end).some((x) => x.mode === S('M_CODE') || x.mode === S('M_MENU')), 'no picture code before the end').toBe(false);
    let f = 0;
    for (const id of ALL) {
      f = s.findIndex((x, k) => k >= f && x.level === id && x.playing);
      expect(f, `${id} played, in order`).toBeGreaterThan(0);
      expect(s[f]!.cx, `${id} starts at its start column`).toBe(readRefLevel(id).start * 8 + 4);
      expect(s.some((x, k) => k > f && k < end && x.level === id && x.mode === S('M_TALLY')), `${id} finished`).toBe(true);
    }
  });

  it('it collects every star and skate part of Worlds 4 and 5 (the .lvl sources) and all 60 stars of the game: the golden board', () => {
    const vm = ramAtEnd('m24-game');
    [...W4, ...W5].forEach((id) => {
      const L = readRefLevel(id);
      const p = vm.read8(S('progress') + ALL.indexOf(id));
      for (const n of L.objects.filter((o) => o.kind === 'star').map((o) => Number(o.args[1]))) expect((p >> (n - 1)) & 1, `${id} star ${n}`).toBe(1);
      if (L.objects.some((o) => o.kind === 'part')) expect(p & S('PR_PART'), `${id} part`).toBe(S('PR_PART'));
      expect(p & S('PR_DONE'), `${id} done`).toBe(S('PR_DONE'));
    });
    const stars = ALL.map((id) => readRefLevel(id).objects.filter((o) => o.kind === 'star').length).reduce((a, b) => a + b, 0);
    expect(stars, 'stars in the .lvl sources').toBe(60);
    expect(vm.read16(S('stars_total'))).toBe(60);
    // the statistics screen of the ending: Bo on the golden board
    const goldAt = replayFind('m24-game', (v) => v.read16(S('mode')) === S('M_END') && v.read16(S('board_sel')) === S('BD_GOLD'));
    expect(goldAt, 'the golden board shown at the end').toBeGreaterThan(0);
    const fb = screenAt('m24-game', goldAt + 2);
    expect(fb.some((c) => c === 14), 'yellow (the golden board) on the screen').toBe(true);
  });

  it('the Backhoppet jump is the longest in the game (measured in RAM over every replay)', () => {
    // the distance from takeoff to landing, of jumps in the game's levels (not the test levels) that end on the
    // ground (not in water); a trampoline's bounces are long in time but short in distance
    let best = { name: '', level: '', frames: 0, dx: 0 };
    for (const name of replayFiles()) {
      const s = play(bo, name).frames;
      let start = -1;
      s.forEach((x, k) => {
        const air = x.playing && x.state === 1;
        if (air && start < 0) start = k;
        if (!air && start >= 0) {
          const level = s[start]!.level;
          const dx = Math.abs(x.cx - s[start]!.cx);
          if (ALL.includes(level) && x.grounded && dx > best.dx) best = { name, level, frames: k - start, dx };
          start = -1;
        }
      });
    }
    console.log(`[measured] longest jump: ${best.dx} px in ${best.frames} frames, in ${best.level} (${best.name})`);
    expect(best.level).toBe('4-5');
  });

  it('after the theft the board flag is set and World 5 is played on the licorice board', () => {
    const s = runs.get('m24-game')!;
    const before = s.findIndex((x) => x.level === '4-5' && x.mode === S('M_TALLY'));
    const w5 = s.findIndex((x) => x.level === '5-1' && x.playing);
    expect(ramSeries('m24-game', 'stolen')[before], 'not before the theft').toBe(0);
    const stolen = ramSeries('m24-game', 'stolen');
    const sel = ramSeries('m24-game', 'board_sel');
    expect(stolen[w5], 'the seagull has the board').toBe(1);
    const w5frames = s.map((x, k) => (x.playing && W5.includes(x.level) ? k : -1)).filter((k) => k >= 0);
    expect(w5frames.length).toBeGreaterThan(1000);
    expect(w5frames.every((k) => sel[k] === S('BD_LIQ')), 'the licorice board in every World 5 frame').toBe(true);
    const end = s.findIndex((x) => x.mode === S('M_END'));
    expect(stolen[end], 'his board back after the final').toBe(0);
  });

  it('SUPERBOSSE after the final: 3000 points; before the final the same input is a 360', () => {
    const after = runs.get('m24-game')!;
    const end = after.findIndex((x) => x.mode === S('M_END'));
    const sup = after.findIndex((x, k) => k > end && x.trick === TR.SUPER);
    expect(sup, 'SUPERBOSSE after the final').toBeGreaterThan(0);
    const scoreBefore = after[sup - 1]!.score;
    const landed = after.findIndex((x, k) => k > sup && x.grounded);
    expect(after[landed + 1]!.score - scoreBefore).toBe(3000);
    const before = runs.get('m24-super-before')!;
    expect(before.some((x) => x.trick === TR.SUPER), 'no SUPERBOSSE before the final').toBe(false);
    expect(before.some((x) => x.trick === TR.R360), 'the same input is a 360').toBe(true);
    // the same input: from the takeoff table on, both replays press the same buttons
    const tail = (s: F[], from: number) => s.slice(from).map((x) => x.input);
    const fromA = after.findIndex((x, k) => k > end && x.level === '4-5' && x.playing);
    const fromB = before.findIndex((x) => x.level === '4-5' && x.playing);
    expect(tail(after, fromA).slice(0, 300)).toEqual(tail(before, fromB).slice(0, 300));
  });
});

describe('the final (M24, DESIGN §10.5)', () => {
  const subs = (s: F[]) => s.map((x) => x.actors.find((a) => a.type === BOSS5 && a.st === 0)?.sub ?? -1);
  it('one replay wins with three hits: dizzy on the ground, dizzy high up (kicker + A), in the nest with a trick', () => {
    const s = runs.get('m24-final')!;
    const sub = subs(s);
    const hits = s.map((x, k) => (k > 0 && x.evN !== s[k - 1]!.evN && x.evType === BOSS5 && x.evKind === 1 ? k : -1)).filter((k) => k > 0);
    expect(hits.length).toBe(3);
    const [h1, h2, h3] = hits as [number, number, number];
    expect(sub[h1 - 1], 'hit 1: dizzy').toBe(3);
    expect(s[h1 - 1]!.foot, 'hit 1: Bo jumped from the ground').toBeGreaterThan(160);
    expect(sub[h2 - 1], 'hit 2: dizzy').toBe(3);
    const boss2 = s[h2 - 1]!.actors.find((a) => a.type === BOSS5)!;
    expect(boss2.y, 'hit 2: high up, not on the ground').toBeLessThan(224 - 32);
    expect(sub[h3 - 1], 'hit 3: in the nest').toBe(5);
    expect(s[h3 - 1]!.trick !== 0 || s[h3 - 1]!.comboN >= 2, 'hit 3 with a trick').toBe(true);
    const popcorn = ['m24-final', 'm24-final-retry'].some((r) => runs.get(r)!.some((x) => x.level === '5-5' && x.actors.some((a) => a.type === 16)));
    expect(popcorn, 'phase 1: it drops popcorn').toBe(true);
    expect(play(bo, 'm24-final').run.vm.read16(S('goal_t')), 'won').toBeGreaterThan(0);
  });

  it('another replay loses a life to the dive and tries again', () => {
    const s = runs.get('m24-final-retry')!;
    const sub = subs(s);
    const f = s.findIndex((x, k) => k > 0 && x.evN !== s[k - 1]!.evN && x.evType === BOSS5 && x.evKind === 2);
    expect(f).toBeGreaterThan(0);
    expect(sub[f - 1], 'hit by the dive').toBe(2);
    const back = s.findIndex((x, k) => k > f && x.state === 0 && x.playing);
    expect(s[back]!.lives).toBe(s[f - 1]!.lives - 1);
    expect(s.filter((x, k) => k > back && x.evN !== s[k - 1]!.evN && x.evType === BOSS5 && x.evKind === 1).length).toBe(3);
  });
});

describe('the seagull and its food (M24, DESIGN §11.1)', () => {
  it('every world has its own food, first in its asset block, and the tally shows it', () => {
    const cart = bo.cart.sections.xdata!;
    const foods = [1, 2, 3, 4, 5].map((w) => [...cart.subarray(S(`wa_${w}`) - 0x10000, S(`wa_${w}`) - 0x10000 + 32)].join(','));
    expect(new Set(foods).size, 'five different foods').toBe(5);
    expect(S('RA_FOOD')).toBe(S('wasset'));
    // on the screen: during a tally of each world the food sprite is drawn (match its opaque pixels)
    const s = runs.get('m24-game')!;
    for (const w of [1, 2, 3, 4, 5]) {
      const sprite = cart.subarray(S(`wa_${w}`) - 0x10000, S(`wa_${w}`) - 0x10000 + 32);
      const px = Array.from({ length: 64 }, (_, i) => (i & 1 ? sprite[i >> 1]! & 15 : sprite[i >> 1]! >> 4));
      const tally = s.findIndex((x, k) => x.mode === S('M_TALLY') && x.level.startsWith(`${w}-`) && s[k - 30]?.mode === S('M_TALLY'));
      expect(tally, `a tally in world ${w}`).toBeGreaterThan(0);
      let seen = false;
      for (let k = tally; k < tally + 60 && !seen; k += 3) {
        const fb = screenAt('m24-game', k);
        for (let y = 0; y < 120 && !seen; y++) {
          for (let x = 0; x < 120 && !seen; x++) {
            let ok = true;
            for (let i = 0; i < 64 && ok; i++) if (px[i] && fb[(y + (i >> 3)) * 128 + x + (i & 7)] !== px[i]) ok = false;
            seen = ok;
          }
        }
      }
      expect(seen, `world ${w}: its food at the tally`).toBe(true);
    }
  });
});

describe('Worlds 4 and 5: secrets, apples, budget (M24)', () => {
  it('every godis leads to a secret it is needed for (DESIGN §8.5)', () => {
    for (const id of [...W4, ...W5]) {
      const L = readRefLevel(id);
      const g = gridOf(id);
      for (const o of L.objects.filter((x) => (x.kind === 'pickup' && x.args[0] === 'godis') || (x.kind === 'box' && x.args[1] === 'godis'))) {
        const height = (c: { col: number; args: string[] }) => {
          const m = /^g([+-]\d+)?$/.exec(c.args[0]!);
          return m ? g.ground[c.col]! + Number(m[1] ?? 0) : Number(c.args[0]);
        };
        const secret = L.objects.filter((c) => (c.kind === 'star' || c.kind === 'part') && c.col >= o.col && c.col <= o.col + 40 && height(c) - g.ground[c.col]! >= 6);
        expect(secret.length, `${id}: the godis at ${o.col} leads to something high`).toBeGreaterThan(0);
        for (const c of secret) {
          const row = ROWS - 1 - height(c);
          const withGodis = REPLAYS.some((r) => replayFind(r, (vm, f, prev) => prev !== null && vm.read16(S('mode')) === S('M_PLAY') && LEVEL_IDS[vm.read16(S('level'))] === id && prev[c.col * ROWS + row] !== 0 && vm.read8(S('lvl') + c.col * ROWS + row) === 0 && vm.read16(S('pw_kind')) === S('PW_GODIS')) > 0);
          expect(withGodis, `${id}: ${c.kind} at ${c.col} taken with the godis`).toBe(true);
        }
      }
    }
  });

  it('apples never lie: every apple pattern of Worlds 4 and 5 is followed by a replay that loses no life', () => {
    const taken = new Map<string, Set<string>>();
    for (const name of REPLAYS) {
      const s = runs.get(name)!;
      if (s.some((x, f) => f > 0 && x.lives < s[f - 1]!.lives && x.playing)) continue;
      for (const [id, set] of cellSeries(name)) taken.set(id, new Set([...(taken.get(id) ?? []), ...set]));
    }
    const missing: string[] = [];
    let patterns = 0;
    for (const id of [...W4, ...W5]) {
      for (const [line, cells] of gridOf(id).patterns) {
        patterns++;
        const got = taken.get(id) ?? new Set();
        const lost = cells.filter(([c, r]) => !got.has(`${c},${r}`));
        if (lost.length) missing.push(`${id} line ${line}: ${lost.length} of ${cells.length} apples not taken`);
      }
    }
    console.log(`[measured] apple patterns in Worlds 4-5: ${patterns}, not followed: ${missing.length}`);
    expect(missing).toEqual([]);
  });

  it('ROM (code + read-only data + sounds) fits in 32 KB; the world assets fit their RAM area', () => {
    const { code, rodata, sound } = bo.cart.sections;
    const rom = code.length + rodata.length + sound.length;
    console.log(`[measured] ROM ${rom} B (code ${code.length}, data ${rodata.length + sound.length}), xdata ${bo.cart.sections.xdata!.length} B, cartridge ${bo.bytes.length} B`);
    expect(rom).toBeLessThanOrEqual(32 * 1024);
    for (const w of [1, 2, 3, 4, 5]) expect(S(`wa_${w}_end`) - S(`wa_${w}`), `world ${w}`).toBeLessThanOrEqual(S('WASSET_MAX'));
  });
});

// ---- helpers ---------------------------------------------------------------------------------------------
function replayVm(name: string, each: (f: number, vm: VM) => boolean | void) {
  const rf = loadReplay(name);
  const vm = VM.fromCartridge(bo.cart, { seed: rf.seed ?? 1 });
  const inputs = expandInputs(rf.inputs, rf.frames);
  for (let f = 0; f < rf.frames; f++) {
    vm.step(inputs[f]!);
    if (each(f, vm)) return vm;
  }
  return vm;
}
function ramAtEnd(name: string) {
  return replayVm(name, () => false);
}
const seriesCache = new Map<string, number[]>();
function ramSeries(name: string, sym: string) {
  const key = `${name}:${sym}`;
  if (!seriesCache.has(key)) {
    const out: number[] = [];
    replayVm(name, (_, vm) => void out.push(vm.read16(S(sym))));
    seriesCache.set(key, out);
  }
  return seriesCache.get(key)!;
}
function screenAt(name: string, frame: number) {
  let fb = new Uint8Array(0);
  replayVm(name, (f, vm) => {
    if (f === frame) {
      fb = vm.fb.slice();
      return true;
    }
    return false;
  });
  return fb;
}
function replayFind(name: string, test: (vm: VM, f: number, prev: Uint8Array | null) => boolean) {
  let found = -1;
  let prev: Uint8Array | null = null;
  const lvl = S('lvl');
  replayVm(name, (f, vm) => {
    if (test(vm, f, prev)) {
      found = f;
      return true;
    }
    prev = vm.mem.slice(lvl, lvl + 384 * ROWS);
    return false;
  });
  return found;
}
function cellSeries(name: string) {
  const out = new Map<string, Set<string>>();
  let prev: Uint8Array | null = null;
  let prevLevel = '';
  const apple = S('T_APPLE');
  const lvl = S('lvl');
  const frames = runs.get(name)!;
  replayVm(name, (f, vm) => {
    const x = frames[f]!;
    if (!x.playing) {
      prev = null;
      return;
    }
    const w = gridOf(x.level).level.width;
    const now = vm.mem.slice(lvl, lvl + w * ROWS);
    if (prev && prevLevel === x.level) {
      const set = out.get(x.level) ?? new Set<string>();
      for (let i = 0; i < now.length; i++) if (prev[i] === apple && now[i] === 0) set.add(`${Math.floor(i / ROWS)},${i % ROWS}`);
      out.set(x.level, set);
    }
    prev = now;
    prevLevel = x.level;
  });
  return out;
}
