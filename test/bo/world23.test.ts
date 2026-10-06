import { beforeAll, describe, expect, it } from 'vitest';
import { VM, expandInputs } from '@qrc/vm';
import { PLATFORMS, gridOf } from './frames';
import { type Bo, LEVEL_IDS, ROWS, buildBo, loadReplay, readRefLevel, symbol } from './oracle';
import { type F, play } from './play';

// M23 acceptance: Worlds 2 and 3 (PLAN.md Part 3): every level ridden from its start, every star and part, apples
// never lie, every godis leads to a secret it is needed for (DESIGN §8.5), the chase (§10.2), the bulldozer (§10.3),
// the moving platforms (§9 PLATTFORM), and one replay from the World 2 map to the World 4 map.
let bo: Bo;
const S = (n: string) => symbol(bo.sym, n);
const W2 = ['2-1', '2-2', '2-3', '2-4', '2-5'];
const W3 = ['3-1', '3-2', '3-3', '3-4', '3-5'];
const LEVELS = [...W2, ...W3];
const REPLAYS = ['m23-worlds', 'm23-2-1', 'm23-2-2', 'm23-2-3', 'm23-2-4', 'm23-chase', 'm23-chase-caught', 'm23-3-1', 'm23-3-2', 'm23-3-3', 'm23-3-4', 'm23-dozer', 'm23-alts'];
const RABBIT = 20;
const DOZER = 21;
const EV = { STOMP: 1, HIT: 2 };
const runs = new Map<string, F[]>();

beforeAll(async () => {
  bo = await buildBo();
  for (const r of REPLAYS) runs.set(r, play(bo, r).frames);
});

for (const name of REPLAYS) {
  describe(`replay ${name} (M23)`, () => {
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

describe('Worlds 2 and 3 (M23)', () => {
  it('one replay goes from the World 2 map to the World 4 map, riding every level of Worlds 2 and 3 from its start to its goal', () => {
    const s = runs.get('m23-worlds')!;
    const { run } = play(bo, 'm23-worlds');
    const mapAt = (world: number) =>
      replayFind('m23-worlds', (vm) => vm.read16(S('mode')) === S('M_MAP') && vm.read16(S('map_world')) === world);
    const w2 = mapAt(1);
    expect(w2, 'the World 2 map').toBeGreaterThan(0);
    expect(s[s.length - 1]!.mode).toBe(S('M_MAP'));
    expect(run.vm.read16(S('map_world')), 'the World 4 map').toBe(3);
    for (const id of LEVELS) {
      const f = s.findIndex((x, k) => k > w2 && x.level === id && x.playing);
      expect(f, `${id} played after the World 2 map`).toBeGreaterThan(0);
      expect(s[f]!.cx, `${id} starts at its start column`).toBe(readRefLevel(id).start * 8 + 4);
      expect(s.some((x, k) => k > f && x.level === id && x.mode === S('M_TALLY')), `${id} finished`).toBe(true);
    }
  });

  it('together the replays collect every star and skate part of Worlds 2 and 3 (checked against the .lvl sources)', () => {
    const { run } = play(bo, 'm23-worlds');
    LEVELS.forEach((id, i) => {
      const L = readRefLevel(id);
      const stars = L.objects.filter((o) => o.kind === 'star').map((o) => Number(o.args[1]));
      const parts = L.objects.filter((o) => o.kind === 'part').length;
      const p = run.vm.read8(S('progress') + 5 + i);
      for (const n of stars) expect((p >> (n - 1)) & 1, `${id} star ${n}`).toBe(1);
      if (parts) expect(p & S('PR_PART'), `${id} part`).toBe(S('PR_PART'));
      expect(p & S('PR_DONE'), `${id} done`).toBe(S('PR_DONE'));
    });
  });

  it('every godis leads to a secret it is needed for: a star or part above ollie height, taken with the godis (DESIGN §8.5)', () => {
    let godis = 0;
    for (const id of LEVELS) {
      const L = readRefLevel(id);
      const g = gridOf(id);
      for (const o of L.objects.filter((x) => (x.kind === 'pickup' && x.args[0] === 'godis') || (x.kind === 'box' && x.args[1] === 'godis'))) {
        godis++;
        const height = (c: { col: number; args: string[] }) => {
          const m = /^g([+-]\d+)?$/.exec(c.args[0]!);
          return m ? g.ground[c.col]! + Number(m[1] ?? 0) : Number(c.args[0]);
        };
        // a star or part within 40 columns that no ollie from the ground reaches (feet at most 3.3 tiles up, the
        // body 2 tiles tall: cells up to ground + 5)
        const secret = L.objects.filter((c) => (c.kind === 'star' || c.kind === 'part') && c.col >= o.col && c.col <= o.col + 40 && height(c) - g.ground[c.col]! >= 6);
        expect(secret.length, `${id}: the godis at ${o.col} leads to something high`).toBeGreaterThan(0);
        // and a replay takes it while the godis is on
        for (const c of secret) {
          const row = ROWS - 1 - height(c);
          const takenWithGodis = REPLAYS.some((r) => replayFind(r, (vm, f, prev) => prev !== null && vm.read16(S('mode')) === S('M_PLAY') && levelOf(vm) === id && prev[c.col * ROWS + row] !== 0 && vm.read8(S('lvl') + c.col * ROWS + row) === 0 && vm.read16(S('pw_kind')) === S('PW_GODIS')) > 0);
          expect(takenWithGodis, `${id}: ${c.kind} at ${c.col} taken with the godis`).toBe(true);
        }
      }
    }
    expect(godis, 'godis in Worlds 2-3').toBeGreaterThanOrEqual(1);
  });
});

describe('Jättekaninen (M23, DESIGN §10.2)', () => {
  const rabbit = (x: F) => x.actors.find((a) => a.type === RABBIT);
  const overlaps = (x: F) => {
    const r = rabbit(x);
    if (!r) return false;
    return x.cx - 3 < r.x + 7 && r.x - 7 < x.cx + 3 && x.foot - 16 < r.y && r.y - 14 < x.foot;
  };
  it('in the winning chase the rabbit follows Bo the whole way and never touches him; it stops at the brook', () => {
    const s = runs.get('m23-chase')!.filter((x) => x.playing && x.level === '2-5');
    expect(s.filter((x) => rabbit(x)).length / s.length, 'the rabbit is there most of the time').toBeGreaterThan(0.8);
    expect(s.filter(overlaps).length, 'frames where the rabbit overlaps Bo').toBe(0);
    expect(s.some((x) => x.evType === RABBIT && x.evKind === EV.HIT)).toBe(false);
    const stop = readRefLevel('2-5').objects.find((o) => o.kind === 'enemy' && o.args[0] === 'rabbit')!.col * 8;
    const last = rabbit(s[s.length - 1]!)!;
    expect(last.x, 'it stopped at the brook edge').toBe(stop - 12);
    expect(s[s.length - 1]!.cx, 'Bo is over the brook').toBeGreaterThan(stop + 8 * 4);
    const { run } = play(bo, 'm23-chase');
    expect(run.vm.read16(S('goal_t')), 'the chase is won').toBeGreaterThan(0);
  });

  it('another replay is caught: a hit, then the chase starts again at the flag with the rabbit further back, and is won', () => {
    const s = runs.get('m23-chase-caught')!;
    const f = s.findIndex((x, k) => k > 0 && x.evN !== s[k - 1]!.evN && x.evType === RABBIT && x.evKind === EV.HIT);
    expect(f, 'caught').toBeGreaterThan(0);
    const back = s.findIndex((x, k) => k > f && x.state === 0 && x.playing);
    expect(s[back]!.lives).toBe(s[f - 1]!.lives - 1);
    const flags = readRefLevel('2-5').objects.filter((o) => o.kind === 'flag' && o.col * 8 < s[f]!.cx).map((o) => o.col);
    expect(s[back]!.cx, 'back at the last flag').toBe(Math.max(...flags) * 8 + 4);
    const firstAgain = s.findIndex((x, k) => k > back && rabbit(x));
    const firstAtStart = s.findIndex((x) => x.playing && rabbit(x)) - s.findIndex((x) => x.playing);
    expect(firstAgain - back, 'it comes again later than at the start').toBeGreaterThan(firstAtStart);
    expect(play(bo, 'm23-chase-caught').run.vm.read16(S('goal_t')), 'and won').toBeGreaterThan(0);
  });
});

describe('Bulldozern (M23, DESIGN §10.3)', () => {
  it('stops after exactly three STOP presses: phases 1-3, and it never moves again after the third', () => {
    const s = runs.get('m23-dozer')!;
    const presses = s.map((x, k) => (k > 0 && x.evN !== s[k - 1]!.evN && x.evType === DOZER && x.evKind === EV.STOMP ? k : -1)).filter((k) => k > 0);
    expect(presses.length).toBe(3);
    const dozer = (x: F) => x.actors.find((a) => a.type === DOZER);
    const third = presses[2]!;
    const xs = s.slice(third + 1).filter((x) => x.playing).map((x) => dozer(x)?.x);
    expect(new Set(xs).size, 'it stands still after the third press').toBe(1);
    expect(dozer(s[third + 1]!)!.sub, 'it is switched off').toBe(3);
    // phase 3: the press comes from a grind and a trick (the combo of that airtime)
    expect(s[third - 1]!.comboN >= 2 || s[third - 1]!.trick !== 0, 'the third press with a trick').toBe(true);
    expect(play(bo, 'm23-dozer').run.vm.read16(S('goal_t')), 'the level is won').toBeGreaterThan(0);
    expect(s.some((x) => x.lives < s[0]!.lives && x.playing), 'no life lost').toBe(false);
  });
});

describe('moving platforms (M23, DESIGN §9 PLATTFORM)', () => {
  it('every log drifts back and forth over its range at its speed; the bus drives off with Bo and stops at the end of its range', () => {
    for (const [name, type] of [['m23-2-4', 18], ['m23-3-3', 19]] as const) {
      const spec = PLATFORMS[type]!;
      const s = runs.get(name)!;
      // follow each platform slot: its first position is its home
      const homes = new Map<number, number>();
      let moving = 0;
      for (let k = 1; k < s.length; k++) {
        for (const a of s[k]!.actors.filter((x) => x.type === type)) {
          if (!homes.has(a.slot) || !s[k - 1]!.actors.some((p) => p.slot === a.slot && p.type === type)) homes.set(a.slot, a.x);
          const home = homes.get(a.slot)!;
          expect(a.x, `${name}: inside its range`).toBeGreaterThanOrEqual(home - 1);
          expect(a.x, `${name}: inside its range`).toBeLessThanOrEqual(home + spec.range + 1);
          const p = s[k - 1]!.actors.find((q) => q.slot === a.slot && q.type === type);
          if (p) {
            const dx = a.x - p.x;
            expect(Math.abs(dx), `${name}: speed`).toBeLessThanOrEqual(Math.ceil(spec.speed / 16));
            if (dx) moving++;
            if (spec.move === 'bus') expect(dx, 'the bus only drives forward').toBeGreaterThanOrEqual(0);
          }
        }
      }
      expect(moving).toBeGreaterThan(100);
    }
    // the bus waited until Bo stood on it, and arrived at the end of its range
    const s = runs.get('m23-3-3')!;
    const bus = (x: F) => x.actors.find((a) => a.type === 19);
    const start = s.findIndex((x, k) => k > 0 && bus(x) && bus(s[k - 1]!) && bus(x)!.x !== bus(s[k - 1]!)!.x);
    expect(s[start]!.grounded && s[start]!.foot === bus(s[start]!)!.y, 'Bo is on its roof when it starts').toBe(true);
    const end = Math.max(...s.filter((x) => bus(x)).map((x) => bus(x)!.x));
    const home = s.find((x) => bus(x))!.actors.find((a) => a.type === 19)!.x;
    expect(end - home).toBe(PLATFORMS[19]!.range);
  });

  it('the world assets (music, boss sprites) of every world fit their RAM area', () => {
    for (const w of [1, 2, 3]) {
      const size = S(`wa_${w}_end`) - S(`wa_${w}`);
      expect(size, `world ${w}`).toBeLessThanOrEqual(S('WASSET_MAX'));
      expect(S(`wa_${w}`), `world ${w} is in xdata`).toBeGreaterThanOrEqual(0x10000);
    }
  });
});

describe('apples never lie (M23, DESIGN §8.4)', () => {
  it('for every apple pattern of Worlds 2 and 3 a replay follows it, takes all of its apples and loses no life', () => {
    const taken = new Map<string, Set<string>>();
    for (const name of REPLAYS) {
      const s = runs.get(name)!;
      if (s.some((x, f) => f > 0 && x.lives < s[f - 1]!.lives && x.playing)) continue; // a replay that loses a life
      for (const [id, set] of cellSeries(name)) taken.set(id, new Set([...(taken.get(id) ?? []), ...set]));
    }
    const missing: string[] = [];
    let patterns = 0;
    for (const id of LEVELS) {
      for (const [line, cells] of gridOf(id).patterns) {
        patterns++;
        const got = taken.get(id) ?? new Set();
        const lost = cells.filter(([c, r]) => !got.has(`${c},${r}`));
        if (lost.length) missing.push(`${id} line ${line}: ${lost.length} of ${cells.length} apples not taken`);
      }
    }
    console.log(`[measured] apple patterns in Worlds 2-3: ${patterns}, not followed: ${missing.length}`);
    expect(missing).toEqual([]);
  });
});

// ---- helpers: replay the frames again for RAM ----------------------------------------------------------
function levelOf(vm: VM) {
  return LEVEL_IDS[vm.read16(S('level'))]!;
}
function replayVm(name: string, each: (f: number, vm: VM) => boolean | void) {
  const rf = loadReplay(name);
  const vm = VM.fromCartridge(bo.cart, { seed: rf.seed ?? 1 });
  const inputs = expandInputs(rf.inputs, rf.frames);
  for (let f = 0; f < rf.frames; f++) {
    vm.step(inputs[f]!);
    if (each(f, vm)) return;
  }
}
/** the first frame where `test` holds (prev = the level buffer one frame before), or -1 */
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
/** apple cells taken (APPLE tile -> empty) per level */
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
