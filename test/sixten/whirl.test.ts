import { beforeAll, describe, expect, it } from 'vitest';
import { VM } from '@qrc/vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandInputs, type ReplayFile } from '@qrc/vm';
import { GAME_DIR, LEVEL_IDS, type RefLevel, type RefWhirl, type Sixten, buildSixten, readLevel, refCells, symbol, typeOf, vmInLevel } from './oracle';

// M27 acceptance: the whirlwind and the wind (PLAN.md Part 4). The rules are PLAN's numbers: a warning at least
// 300 frames before strength 3, the wind turning at least 120 frames before the whirlwind, no frame moving more
// than its speed, at most one strength step per 60 frames.
let sx: Sixten;
beforeAll(async () => {
  sx = await buildSixten();
});
const S = (n: string) => symbol(sx.sym, n);
const WARNING = 300;
const TURN = 120;
const STEP = 60;
const radius = (s: number) => 24 + 8 * s; // DESIGN §6.1

interface W { state: number; idx: number; t: number; x: number; y: number; s: number; wind: number }
interface Fr { f: number; level: string; w: W; cells: number[]; hearts: number; aj: number; danger: number; sheltered: number; cell: [number, number] }
const cache = new Map<string, Fr[]>();
function frames(name: string, seed?: number): Fr[] {
  const key = `${name}/${seed ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rf = JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8')) as ReplayFile & { frames: number };
  const vm = VM.fromCartridge(sx.cart, { seed: seed ?? rf.seed ?? 1 });
  const inputs = expandInputs(rf.inputs, rf.frames);
  const u = (n: string) => vm.read16(S(n));
  const out: Fr[] = [];
  for (let f = 0; f < rf.frames; f++) {
    vm.step(inputs[f]!);
    const level = LEVEL_IDS[u('level')]!;
    const n = u('lv_w') * u('lv_h');
    out.push({
      f, level,
      w: { state: u('wh_state'), idx: u('wh_idx'), t: u('wh_t'), x: u('wh_x'), y: u('wh_y'), s: u('wh_s'), wind: u('wh_wind') },
      cells: [...Array(n)].map((_, i) => vm.read8(S('cells') + i)),
      hearts: u('hearts'), aj: u('n_aj'), danger: u('danger'), sheltered: u('sheltered'),
      cell: [u('px') >> 9, u('py') >> 9],
    });
  }
  cache.set(key, out);
  return out;
}
const WHIRL_REPLAYS = ['m27-strengths', 'm27-ditch', 'm27-hollow', 'm27-cabin', 'm27-forest', 'm27-open', 'm27-11'];

/** the frames of each run of a whirlwind (from its trigger to when it is gone), per level and index */
function runsOf(fr: Fr[]) {
  const runs: { level: string; idx: number; frames: Fr[] }[] = [];
  let cur: (typeof runs)[number] | null = null;
  for (const a of fr) {
    if (a.w.state === 0) {
      cur = null;
      continue;
    }
    if (!cur || cur.idx !== a.w.idx || a.w.t < cur.frames[cur.frames.length - 1]!.w.t) {
      cur = { level: a.level, idx: a.w.idx, frames: [] };
      runs.push(cur);
    }
    cur.frames.push(a);
  }
  return runs;
}
const centre = (c: number, r: number) => [(c * 32 + 16) * 16, (r * 32 + 16) * 16];
const dir16 = (dx: number, dy: number) => (Math.round((Math.atan2(-dy, dx) * 8) / Math.PI) + 16) % 16;

describe('the whirlwind is never random and never follows Sixten', () => {
  it('every whirlwind of every level is seen in the replays, from its trigger until it is gone', () => {
    const seen = new Set(WHIRL_REPLAYS.flatMap((n) => runsOf(frames(n)).filter((r) => r.frames[r.frames.length - 1]!.w.state).map((r) => `${r.level}#${r.idx}`)));
    for (const id of LEVEL_IDS) readLevel(id).whirls.forEach((_, k) => expect(seen.has(`${id}#${k}`), `${id} whirlwind ${k + 1}`).toBe(true));
  });

  it('two runs with different RNG seeds give the identical whirlwind in every frame', () => {
    for (const name of ['m27-strengths', 'm27-11']) {
      const a = frames(name).map((f) => f.w);
      const b = frames(name, 777).map((f) => f.w);
      expect(b, name).toEqual(a);
    }
  });

  it('routes that go different ways give the same whirlwind state at every moment of its own clock', () => {
    const byT = (name: string) => {
      const m = new Map<number, string>();
      for (const r of runsOf(frames(name))) if (r.level === 'T3' && r.idx === 2) for (const f of r.frames) m.set(f.w.t, JSON.stringify(f.w));
      return m;
    };
    const ref = byT('m27-ditch');
    expect(ref.size).toBeGreaterThan(1000);
    for (const name of ['m27-hollow', 'm27-cabin', 'm27-forest', 'm27-open', 'm27-strengths']) {
      const m = byT(name);
      for (const [t, s] of ref) if (m.has(t)) expect(m.get(t), `${name} at t ${t}`).toBe(s);
      expect(m.size, name).toBe(ref.size);
    }
  });
});

describe('fair warning, no jumps', () => {
  for (const name of WHIRL_REPLAYS)
    it(`${name}: warning ≥ ${WARNING} frames before strength 3; the wind turns ≥ ${TURN} frames before the whirlwind; no frame moves more than its speed; ≤ 1 strength step per ${STEP} frames`, () => {
      for (const run of runsOf(frames(name))) {
        const L = readLevel(run.level);
        const W: RefWhirl = L.whirls[run.idx]!;
        const fr = run.frames;
        // the warning: from the trigger (its first frame) to the first frame of strength >= 3
        const three = fr.find((f) => f.w.s >= 3);
        if (three) expect(three.f - fr[0]!.f, `${name} ${run.level} whirl ${run.idx + 1}`).toBeGreaterThanOrEqual(WARNING);
        // legs from the .map waypoints; which leg it is on follows from the waypoints it has reached
        let wp = 0;
        let lastStep = fr[0]!.f;
        const firstMove: number[] = [];
        for (let i = 1; i < fr.length; i++) {
          const a = fr[i - 1]!.w;
          const b = fr[i]!.w;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          if (dx || dy) {
            const v = W.wps[wp]!.v;
            expect(Math.hypot(dx, dy), `${name} frame ${fr[i]!.f + 1}: moved ${dx},${dy} (1/16 px), speed ${v}`).toBeLessThanOrEqual(v);
            if (firstMove[wp] === undefined) firstMove[wp] = i;
            const [tx, ty] = centre(W.wps[wp + 1]!.c, W.wps[wp + 1]!.r);
            if (b.x === tx && b.y === ty) wp++;
          }
          if (b.s !== a.s) {
            expect(Math.abs(b.s - a.s)).toBe(1);
            expect(fr[i]!.f - lastStep, `${name} strength step at frame ${fr[i]!.f + 1}`).toBeGreaterThanOrEqual(STEP);
            lastStep = fr[i]!.f;
          }
        }
        // the wind: for every leg after the first that goes another way, the wind blew that way TURN frames before
        for (let k = 1; k < firstMove.length; k++) {
          const leg = (j: number) => dir16(W.wps[j + 1]!.c - W.wps[j]!.c, W.wps[j + 1]!.r - W.wps[j]!.r);
          if (firstMove[k] === undefined || leg(k) === leg(k - 1)) continue;
          for (let i = firstMove[k]! - TURN; i < firstMove[k]!; i++) expect(fr[i]!.w.wind, `${name} leg ${k + 1}, frame ${fr[i]!.f + 1}`).toBe(leg(k));
        }
        // during its first leg the wind blows the first leg's way from the trigger on
        expect(fr[0]!.w.wind).toBe(dir16(W.wps[1]!.c - W.wps[0]!.c, W.wps[1]!.r - W.wps[0]!.r));
      }
    });

  it('the whirlwind that turns (T3 whirlwind 2) is in the replays, with its turn', () => {
    const run = runsOf(frames('m27-strengths')).find((r) => r.idx === 1)!;
    const winds = new Set(run.frames.map((f) => f.w.wind));
    expect([...winds].sort((a, b) => a - b)).toEqual([0, 4]);
  });
});

describe('the world changes only where and when the whirlwind is', () => {
  for (const name of WHIRL_REPLAYS)
    it(`${name}: cells change only at a waypoint, within its radius, as the .map lists; afterwards RAM = the .map with the changes`, () => {
      const fr = frames(name);
      const levels = new Map<string, RefLevel>();
      for (let i = 1; i < fr.length; i++) {
        const a = fr[i - 1]!;
        const b = fr[i]!;
        if (a.level !== b.level || a.cells.length !== b.cells.length) continue;
        const L = levels.get(b.level) ?? readLevel(b.level);
        levels.set(b.level, L);
        for (let k = 0; k < b.cells.length; k++) {
          if (a.cells[k] === b.cells[k]) continue;
          const c = k % L.w;
          const r = Math.floor(k / L.w);
          const W = L.whirls[b.w.idx]!;
          const ch = W.changes.find((x) => x.c === c && x.r === r);
          expect(ch, `${name} frame ${b.f + 1}: cell ${c},${r} changed`).toBeTruthy();
          const wp = W.wps[ch!.wp]!;
          const [wx, wy] = centre(wp.c, wp.r);
          expect([b.w.x, b.w.y], `${name}: the change at ${c},${r} happens when the whirlwind is at waypoint ${ch!.wp}`).toEqual([wx, wy]);
          expect(Math.hypot((c - wp.c) * 32, (r - wp.r) * 32)).toBeLessThanOrEqual(radius(wp.s));
          const want = ch!.reveal ? a.cells[k]! & ~0x40 : typeOf(ch!.ch!).type | (a.cells[k]! & 0xc0);
          expect(b.cells[k]).toBe(want);
        }
      }
      // at the end: every whirlwind that ran left exactly its changes
      const last = fr[fr.length - 1]!;
      const L = readLevel(last.level);
      const want = refCells(L);
      const ran = new Set(runsOf(fr).filter((r) => r.level === last.level).map((r) => r.idx));
      L.whirls.forEach((W, k) => {
        if (!ran.has(k)) return;
        for (const ch of W.changes) {
          const i = ch.r * L.w + ch.c;
          want[i] = ch.reveal ? want[i]! & ~0x40 : typeOf(ch.ch!).type | (want[i]! & 0xc0);
        }
      });
      expect(last.cells).toEqual(want);
    });
});

describe('shelter is real (DESIGN §6.5)', () => {
  for (const name of ['m27-ditch', 'm27-hollow', 'm27-cabin'])
    it(`${name}: standing still in shelter while the strength-3 whirlwind passes over: no heart lost`, () => {
      const fr = frames(name);
      expect(fr.some((f) => f.danger && f.sheltered), 'it passed over him').toBe(true);
      expect(fr[fr.length - 1]!.aj).toBe(0);
      expect(fr[fr.length - 1]!.hearts).toBe(5);
    });

  for (const name of ['m27-forest', 'm27-open'])
    it(`${name}: in forest or on open land inside the radius: one heart lost (AJ!) and back at the last control`, () => {
      const fr = frames(name);
      const i = fr.findIndex((f) => f.aj === 1);
      expect(i).toBeGreaterThan(0);
      expect(fr[fr.length - 1]!.aj).toBe(1);
      expect(fr[fr.length - 1]!.hearts).toBe(4);
      expect(fr[i]!.cell).toEqual([8, 12]); // control 3, which started this whirlwind
    });

  it('chocolate does not protect from the whirlwind: inside the radius he still loses a heart (test hooks)', () => {
    const vm = vmInLevel(sx, 'T3');
    const L = readLevel('T3');
    vm.write16(S('dbg_pw'), 3 + 1); // PW_CHOCOLATE
    vm.step(0);
    vm.write16(S('dbg_goto'), 12 * L.w + 8 + 1); // control 3: starts whirlwind 3
    vm.step(0);
    vm.write16(S('dbg_goto'), 7 * L.w + 20 + 1); // open land on its track
    for (let i = 0; i < 2500 && vm.read16(S('n_aj')) === 0; i++) vm.step(0);
    expect(vm.read16(S('pw'))).toBe(3);
    expect(vm.read16(S('n_aj'))).toBe(1);
  });
});
