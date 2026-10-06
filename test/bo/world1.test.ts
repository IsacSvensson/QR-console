import { beforeAll, describe, expect, it } from 'vitest';
import { FONT } from '@qrc/vm';
import { gridOf } from './frames';
import { type Bo, ROWS, buildBo, readRefLevel, symbol } from './oracle';
import { type F, play } from './play';

// M22 acceptance: World 1 and the game around it (PLAN.md Part 3). The budget gate is recorded in DECISIONS.md.
let bo: Bo;
const S = (n: string) => symbol(bo.sym, n);
const W1 = ['1-1', '1-2', '1-3', '1-4', '1-5'];
const REPLAYS = ['m22-world1', 'm22-1-1', 'm22-1-2', 'm22-1-3', 'm22-1-4', 'm22-boss', 'm22-boss-retry', 'm22-first10', 'm22-alts'];
const runs = new Map<string, F[]>();

beforeAll(async () => {
  bo = await buildBo();
  for (const r of REPLAYS) runs.set(r, play(bo, r).frames);
});

for (const name of REPLAYS) {
  describe(`replay ${name} (M22)`, () => {
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

describe('World 1 (M22)', () => {
  it('one replay goes from the title to the World 2 map, riding every World 1 level from its start to its goal', () => {
    const s = runs.get('m22-world1')!;
    expect(s.slice(0, 40).some((x) => x.mode === S('M_TITLE'))).toBe(true);
    const last = s[s.length - 1]!;
    expect(last.mode).toBe(S('M_MAP'));
    const { run } = play(bo, 'm22-world1');
    expect(run.vm.read16(S('map_world')), 'the World 2 map').toBe(1);
    // every level: played (from its start) until the goal ended it (the tally follows)
    for (const id of W1) {
      const f = s.findIndex((x) => x.level === id && x.playing);
      expect(f, `${id} played`).toBeGreaterThan(0);
      expect(s[f]!.cx, `${id} starts at its start column`).toBe(readRefLevel(id).start * 8 + 4);
      expect(s.some((x, k) => k > f && x.level === id && x.mode === S('M_TALLY')), `${id} finished`).toBe(true);
    }
  });

  it('together the World 1 replays collect every star and skate part of World 1 (checked against the .lvl sources)', () => {
    const { run } = play(bo, 'm22-world1');
    W1.forEach((id, g) => {
      const L = readRefLevel(id);
      const stars = L.objects.filter((o) => o.kind === 'star').map((o) => Number(o.args[1]));
      const parts = L.objects.filter((o) => o.kind === 'part').length;
      const p = run.vm.read8(S('progress') + g);
      for (const n of stars) expect((p >> (n - 1)) & 1, `${id} star ${n}`).toBe(1);
      if (parts) expect(p & S('PR_PART'), `${id} part`).toBe(S('PR_PART'));
      expect(p & S('PR_DONE'), `${id} done`).toBe(S('PR_DONE'));
    });
  });

  it('the tally on screen equals the RAM counters', () => {
    const { run } = play(bo, 'm22-world1');
    void run;
    // re-run to the tally frames and read the screen back
    let checked = 0;
    const s = runs.get('m22-world1')!;
    const tallies = s.map((x, f) => (x.mode === S('M_TALLY') && s[f - 1]?.mode === S('M_TALLY') && s[f + 1]?.mode === S('M_TALLY') ? f : -1)).filter((f) => f > 0);
    expect(tallies.length).toBeGreaterThan(0);
    const firstOfEach = tallies.filter((f, i) => i === 0 || tallies[i - 1] !== f - 1).map((f) => f + 40);
    const vm = play(bo, 'm22-world1').run.vm; // the end state is not needed; replay frames for the screen
    void vm;
    for (const f of firstOfEach) {
      const fb = screenAt('m22-world1', f);
      const ram = ramAt('m22-world1', f, ['lv_apples', 'score_lo', 'score_hi', 'lv_stars', 'lv_part']);
      expect(readNumber(fb, S('TALLY_X'), S('TALLY_Y1')), `apples, frame ${f + 1}`).toBe(ram.lv_apples);
      expect(readNumber(fb, S('TALLY_X'), S('TALLY_Y3')), `score, frame ${f + 1}`).toBe(ram.score_hi * 10000 + ram.score_lo);
      for (let k = 0; k < 3; k++) {
        const yellow = fb[(S('TALLY_Y2') + 2) * 128 + S('TALLY_X') + k * 10 + 3] === 14;
        expect(yellow, `star ${k + 1} on screen, frame ${f + 1}`).toBe(((ram.lv_stars >> k) & 1) === 1);
      }
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(5);
  });
});

describe('Stora Måsen (M22, DESIGN §10.1)', () => {
  const bossSubs = (s: F[]) => s.map((x) => x.actors.find((a) => a.type === 17 && a.st === 0)?.sub ?? -1);
  it('one replay wins with exactly three hits, each in the pattern: flying, warning, diving, dizzy on the ground', () => {
    const s = runs.get('m22-boss')!;
    const subs = bossSubs(s);
    const hits = s.map((x, f) => (f > 0 && x.evN !== s[f - 1]!.evN && x.evType === 17 ? f : -1)).filter((f) => f > 0);
    expect(hits.map((f) => s[f]!.evKind)).toEqual([1, 1, 1]);
    for (const f of hits) {
      expect(subs[f - 1], 'landed on it while it was dizzy').toBe(3);
      // before the dizzy spell: a dive, before that a warning, before that flying
      let k = f - 1;
      const seq: number[] = [];
      while (k > 0 && seq.length < 4) {
        if (subs[k] !== seq[seq.length - 1]) seq.push(subs[k]!);
        k--;
      }
      expect(seq.slice(0, 4), `the pattern before hit at frame ${f + 1}`).toEqual([3, 2, 1, 0]);
    }
    expect(s.some((x) => x.mode === S('M_TALLY')), 'the level is won').toBe(true);
  });

  it('another replay loses a life to the dive and tries again', () => {
    const s = runs.get('m22-boss-retry')!;
    const subs = bossSubs(s);
    const f = s.findIndex((x, k) => k > 0 && x.evN !== s[k - 1]!.evN && x.evType === 17 && x.evKind === 2);
    expect(f).toBeGreaterThan(0);
    expect(subs[f - 1], 'hit by the dive').toBe(2);
    const back = s.findIndex((x, k) => k > f && x.state === 0 && x.playing);
    expect(s[back]!.lives).toBe(s[f - 1]!.lives - 1);
    const stomps = s.filter((x, k) => k > back && x.evN !== s[k - 1]!.evN && x.evType === 17 && x.evKind === 1).length;
    expect(stomps).toBe(3);
  });
});

describe('the first ten minutes (M22, FIRST10.md §8)', () => {
  const L11 = () => readRefLevel('1-1');
  it('1: no pits, water or enemies before flag 1 in 1-1, no pits or water at all in 1-1 and 1-2', () => {
    const flag1 = L11().objects.find((o) => o.kind === 'flag')!.col;
    expect(L11().objects.filter((o) => o.kind === 'enemy' && o.col < flag1)).toEqual([]);
    for (const id of ['1-1', '1-2']) {
      const L = readRefLevel(id);
      expect(L.terrain.filter((t) => t.op === 'gap' || t.op === 'liquid'), id).toEqual([]);
      const g = gridOf(id);
      expect([...g.attr].filter((a) => (a & 15) === 6).length, `${id}: hazards`).toBe(0);
    }
  });

  it('2: the first apple lies at most 4 columns from Bo’s start; 3: the big apple comes before the first enemy in 1-1', () => {
    const L = L11();
    const g = gridOf('1-1');
    const cols = [...g.patterns.values()].flat().map(([c]) => c);
    expect(Math.min(...cols.map((c) => Math.abs(c - L.start)))).toBeLessThanOrEqual(4);
    const big = L.objects.find((o) => o.kind === 'box' && o.args[1] === 'apple')!.col;
    const enemy = L.objects.find((o) => o.kind === 'enemy')!.col;
    expect(big).toBeLessThan(enemy);
  });

  it('5: every sign stands at least 3 columns before the first place it is needed', () => {
    // A and B: the first obstacle or kicker after the sign; the arrow: where Bo stops rolling after one push
    for (const id of ['1-1', '1-2']) {
      const L = readRefLevel(id);
      for (const s of L.objects.filter((o) => o.kind === 'sign')) {
        const kind = s.args[0];
        if (kind === 'right') {
          const f = runs.get('m22-first10')!;
          const push = f.findIndex((x, k) => k > 0 && x.input === 2 && f[k - 1]!.input === 0 && f[k + 1]?.input === 2);
          const stop = f.findIndex((x, k) => k > push && x.vx === 0 && x.input === 0 && f[k - 1]!.vx !== 0);
          expect(s.col, `${id}: the arrow`).toBeLessThanOrEqual((f[stop]!.cx >> 3) - 3);
        } else {
          const need = L.objects.find((o) => o.col > s.col && (o.kind.startsWith('ramp') || (o.kind === 'prefab' && o.args[0]!.startsWith('bin'))))!;
          expect(need.col - s.col, `${id}: sign ${kind} at ${s.col}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('6: 10 s without a button: the little trick at 3 s, a blinking arrow at 3 s, balancing at 8 s; Bo does not move', () => {
    const s = runs.get('m22-first10')!;
    const start = s.findIndex((x) => x.playing && x.level === '1-1');
    let idle = 0;
    const seen: Record<string, number> = {};
    for (let f = start + 1; f < s.length && s[f]!.input === 0; f++) {
      idle++;
      const x = s[f]!;
      expect(x.x16, 'Bo does not move').toBe(s[start + 1]!.x16);
      expect(x.crouch).toBe(false);
      if (x.pose === S('P_POP') && seen.pop === undefined) seen.pop = idle;
      if (x.pose === S('P_BALANCE') && seen.bal === undefined) seen.bal = idle;
      const hint = play(bo, 'm22-first10').frames[f]!;
      void hint;
    }
    expect(idle).toBeGreaterThanOrEqual(600);
    expect(Math.abs(seen.pop! - 180)).toBeLessThanOrEqual(1);
    expect(Math.abs(seen.bal! - 480)).toBeLessThanOrEqual(1);
    const hintAt = ramSeries('m22-first10', 'hint');
    const firstArrow = hintAt.findIndex((h, f) => f > start && h === S('HINT_ARROW'));
    expect(Math.abs(firstArrow - start - 180)).toBeLessThanOrEqual(1);
  });

  it('7: riding into the first bin without jumping costs no life, and A blinks after 2 s', () => {
    const s = runs.get('m22-first10')!;
    const hintAt = ramSeries('m22-first10', 'hint');
    const bump = s.findIndex((x, f) => f > 0 && x.vx === 0 && s[f - 1]!.vx > 0 && x.cx > 40 * 8);
    expect(bump).toBeGreaterThan(0);
    expect(s[bump]!.lives).toBe(5);
    const a = hintAt.findIndex((h, f) => f > bump && h === S('HINT_A'));
    expect(a - bump).toBeGreaterThanOrEqual(118);
    expect(a - bump).toBeLessThanOrEqual(122);
    expect(s.slice(bump).every((x) => x.lives === 5)).toBe(true);
  });

  it('8: Bo moves in the same frame as → is pressed for the first time', () => {
    const s = runs.get('m22-first10')!;
    const f = s.findIndex((x) => x.playing && x.input & 2);
    expect(s[f]!.x16).toBeGreaterThan(s[f - 1]!.x16);
  });

  it('9: a reference route finishes 1-1 within 2 minutes with all three stars and the wheel', () => {
    const s = runs.get('m22-1-1')!;
    const start = s.findIndex((x) => x.playing && x.level === '1-1');
    const goal = s.findIndex((x) => x.mode === S('M_TALLY'));
    expect(goal - start).toBeLessThanOrEqual(2 * 60 * 60);
    const ram = ramAt('m22-1-1', goal, ['lv_stars', 'lv_part']);
    expect(ram.lv_stars).toBe(7);
    expect(ram.lv_part).toBe(1);
  });
});

describe('apples never lie (M22, DESIGN §8.4, FIRST10 §8 rule 4)', () => {
  it('for every apple pattern of World 1 a replay follows it, takes all of its apples and loses no life', () => {
    const lvl = S('lvl');
    const taken = new Map<string, Set<string>>(); // level -> cells taken in life-safe replays
    for (const name of REPLAYS) {
      const s = runs.get(name)!;
      if (s.some((x, f) => f > 0 && x.lives < s[f - 1]!.lives && x.playing)) continue; // a replay that loses a life
      const cells = cellSeries(name, lvl);
      for (const [id, set] of cells) {
        const all = taken.get(id) ?? new Set();
        for (const c of set) all.add(c);
        taken.set(id, all);
      }
    }
    const missing: string[] = [];
    let patterns = 0;
    for (const id of W1) {
      const g = gridOf(id);
      for (const [line, cells] of g.patterns) {
        patterns++;
        const got = taken.get(id) ?? new Set();
        const lost = cells.filter(([c, r]) => !got.has(`${c},${r}`));
        if (lost.length) missing.push(`${id} line ${line}: ${lost.length} of ${cells.length} apples not taken`);
      }
    }
    console.log(`[measured] apple patterns in World 1: ${patterns}, not followed: ${missing.length}`);
    expect(missing).toEqual([]);
  });
});

// ---- helpers: replay the frames again for RAM series and screens ---------------------------------------
import { VM, expandInputs } from '@qrc/vm';
import { loadReplay } from './oracle';

function replayVm(name: string, each: (f: number, vm: VM) => void) {
  const rf = loadReplay(name);
  const vm = VM.fromCartridge(bo.cart, { seed: rf.seed ?? 1 });
  const inputs = expandInputs(rf.inputs, rf.frames);
  for (let f = 0; f < rf.frames; f++) {
    vm.step(inputs[f]!);
    each(f, vm);
  }
}
function ramSeries(name: string, sym: string) {
  const out: number[] = [];
  replayVm(name, (_, vm) => out.push(vm.read16(S(sym))));
  return out;
}
function ramAt(name: string, frame: number, syms: string[]) {
  const out: Record<string, number> = {};
  replayVm(name, (f, vm) => {
    if (f === frame) for (const s of syms) out[s] = vm.read16(S(s));
  });
  return out;
}
function screenAt(name: string, frame: number) {
  let fb = new Uint8Array(0);
  replayVm(name, (f, vm) => {
    if (f === frame) fb = vm.fb.slice();
  });
  return fb;
}
/** apple cells taken (APPLE tile -> empty) per level, from RAM */
function cellSeries(name: string, lvl: number) {
  const out = new Map<string, Set<string>>();
  let prev: Uint8Array | null = null;
  let prevLevel = '';
  const apple = S('T_APPLE');
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
/** reads a decimal number drawn with the built-in font at (x, y) in any colour */
function readNumber(fb: Uint8Array, x: number, y: number): number {
  let s = '';
  for (let cx = x; cx < 124; cx += 4) {
    let bits = 0;
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) bits = (bits << 1) | (fb[(y + gy) * 128 + cx + gx] === 15 ? 1 : 0);
    const d = FONT.slice(16, 26).indexOf(bits);
    if (d < 0) break;
    s += d;
  }
  return Number(s || 'NaN');
}
