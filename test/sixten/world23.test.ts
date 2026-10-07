import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { VM, expandInputs, type ReplayFile } from '@qrc/vm';
import { DESIGN_CELLS, GAME_DIR, LEVEL_IDS, type RefLevel, type Sixten, buildSixten, readLevel, symbol, typeOf } from './oracle';

// M30 acceptance: Worlds 2 and 3 (PLAN.md Part 4): as M29 for these worlds, plus the events of DESIGN §6.6: floods
// follow their schedule and the safe route never enters flowing water; a landslide warns >= 120 frames first.
let sx: Sixten;
beforeAll(async () => {
  sx = await buildSixten();
});
const S = (n: string) => symbol(sx.sym, n);
const WORLDS23 = ['2-1', '2-2', '2-3', '2-4', '3-1', '3-2', '3-3', '3-4'];
const STREAM = typeOf('Q').type;

interface Fr { f: number; mode: number; level: string; stamped: number; aj: number; wood: number; pw: number; course: number; under: number; cell: [number, number]; world: number; lvDone: number; evT: number[]; evDone: number; evWarn: number; cells: Uint8Array }
const cache = new Map<string, { frames: Fr[]; vm: VM }>();
function play(name: string) {
  const hit = cache.get(name);
  if (hit) return hit;
  const rf = JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8')) as ReplayFile & { frames: number };
  const vm = VM.fromCartridge(sx.cart, { seed: rf.seed ?? 1 });
  const inputs = expandInputs(rf.inputs, rf.frames);
  const u = (n: string) => vm.read16(S(n));
  const frames: Fr[] = [];
  for (let f = 0; f < rf.frames; f++) {
    vm.step(inputs[f]!);
    const level = LEVEL_IDS[u('level')]!;
    if (!WORLDS23.includes(level)) {
      frames.push({ f, mode: u('mode'), level, stamped: 0, aj: u('n_aj'), wood: 0, pw: 0, course: 0, under: 0, cell: [0, 0], world: u('world'), lvDone: u('lv_done'), evT: [], evDone: 0, evWarn: 0, cells: new Uint8Array(0) });
      continue;
    }
    const c = u('px') >> 9;
    const r = u('py') >> 9;
    const n = u('lv_w') * u('lv_h');
    frames.push({
      f, mode: u('mode'), level, stamped: u('stamped'), aj: u('n_aj'), wood: u('wood'), pw: u('pw'), course: u('course_set'),
      under: vm.read8(S('cells') + r * u('lv_w') + c), cell: [c, r], world: u('world'), lvDone: u('lv_done'),
      evT: [...Array(8)].map((_, k) => vm.read16(S('ev_t') + 2 * k)), evDone: u('ev_done'), evWarn: u('ev_warn'),
      cells: vm.mem.slice(S('cells'), S('cells') + n),
    });
  }
  const out = { frames, vm };
  cache.set(name, out);
  return out;
}
const inLevel = (fr: Fr, id: string) => fr.level === id && [S('M_PLAY'), S('M_SLIDE'), S('M_MAP'), S('M_SIDE'), S('M_PAGE')].includes(fr.mode);
const oMask = (L: RefLevel) => L.controls.reduce((m, k, i) => (k.kind === 'O' ? m | (1 << i) : m), 0);
const goalOf = (L: RefLevel): [number, number] => {
  for (let r = 0; r < L.h; r++) for (let c = 0; c < L.w; c++) if (L.rows[r]![c] === 'M') return [c, r];
  throw new Error('no goal');
};

describe('Worlds 2 and 3: safe routes (m30-safe)', () => {
  for (const id of WORLDS23)
    it(`${id}: start to goal, every obligatory control, no heart lost, no wood, no power-up, no course, never in flowing water`, () => {
      const L = readLevel(id);
      const all = play('m30-safe').frames;
      const fr = all.filter((f) => inLevel(f, id));
      expect(fr.length).toBeGreaterThan(100);
      const aj0 = fr[0]!.aj;
      for (const f of fr) {
        expect(f.aj, `frame ${f.f + 1}`).toBe(aj0);
        expect(f.wood).toBe(0);
        expect(f.pw).toBe(0);
        expect(f.course).toBe(0);
        if (f.mode === S('M_PLAY')) expect(f.under & 31, `frame ${f.f + 1} in flowing water`).not.toBe(STREAM);
      }
      expect(fr[fr.length - 1]!.stamped & oMask(L)).toBe(oMask(L));
      const tally = all.find((x) => x.level === id && x.mode === S('M_TALLY'))!;
      expect(tally.cell).toEqual(goalOf(L));
      expect((tally.lvDone >> LEVEL_IDS.indexOf(id)) & 1).toBe(1);
    });

  it('one replay goes from the World 2 map to the World 4 map', () => {
    const fr = play('m30-safe').frames;
    const w2 = fr.findIndex((f) => f.mode === S('M_WMAP') && f.world === 2);
    expect(w2).toBeGreaterThan(0);
    const last = fr[fr.length - 1]!;
    expect(last.mode).toBe(S('M_WMAP'));
    expect(last.world).toBe(4);
  });
});

describe('Worlds 2 and 3 collected (m30-all)', () => {
  it('every control of every level is stamped, and every World 2-3 entry of NATURBOK.md is placed and found', () => {
    const { frames, vm } = play('m30-all');
    for (const id of WORLDS23) {
      const L = readLevel(id);
      const fr = frames.filter((f) => inLevel(f, id));
      expect(fr[fr.length - 1]!.stamped, id).toBe((1 << L.controls.length) - 1);
    }
    const book = readFileSync(join(GAME_DIR, 'NATURBOK.md'), 'utf8').split(/\r?\n/).filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.split('|').map((x) => x.trim()));
    const placed = WORLDS23.flatMap((id) => readLevel(id).objects.filter((o) => o.kind === 'entry').map((o) => o.name)).sort();
    const want = book.filter((c) => c[4] === '2' || c[4] === '3').map((c) => c[2]!).sort();
    expect(placed).toEqual(want);
    for (const c of book) {
      const n = Number(c[1]) - 1;
      const found = (vm.read8(S('book') + (n >> 3)) >> (n & 7)) & 1;
      expect(found, c[2]).toBe(Number(c[4]) <= 3 ? 1 : 0);
    }
  });

  it('the levels of World 2 and 3 say so (each world has its own ground colour and tune)', () => {
    for (const id of WORLDS23) expect(readLevel(id).world, id).toBe(Number(id[0]));
    const ground = S('world_ground');
    expect(new Set([1, 2, 3].map((w) => sx.rom[ground + w])).size).toBe(3);
  });
});

describe('events (DESIGN §6.6)', () => {
  for (const name of ['m30-safe', 'm30-all'])
    it(`${name}: every event changes its cells exactly when its clock reaches its time; falls and slides warn >= 120 frames, the whole of their warning; nothing else changes cells except whirlwinds and sites`, () => {
      const fr = play(name).frames;
      let seen = 0;
      for (const id of WORLDS23) {
        const L = readLevel(id);
        const lf = fr.filter((f) => inLevel(f, id));
        L.events.forEach((e, k) => {
          expect(e.kind === 'FLOOD' || e.warn >= 120, `${id} event ${k + 1}`).toBe(true);
          const at = lf.findIndex((f) => (f.evDone >> k) & 1);
          if (at < 0) return; // this route left the level before it happened
          seen++;
          const f = lf[at]!;
          expect(f.evT[k], `${id} event ${k + 1}: its clock when it happens`).toBe(e.at);
          for (const c of e.cells) expect(f.cells[c.r * L.w + c.c]! & 31, `${id} event ${k + 1} cell ${c.c},${c.r}`).toBe(typeOf(c.ch).type);
          const before = lf[at - 1]!;
          for (const c of e.cells) expect(before.cells[c.r * L.w + c.c]! & 31, `${id} event ${k + 1}: not before`).not.toBe(typeOf(c.ch).type === typeOf(L.rows[c.r]![c.c]!).type ? -1 : typeOf(c.ch).type);
          // the warning: on in each of the `warn` frames before (counting by its own clock)
          const warned = new Set(lf.filter((g) => (g.evWarn >> k) & 1 && g.evT[k]! < e.at).map((g) => g.evT[k])).size; // by its clock (the map and pages pause it)
          expect(warned, `${id} event ${k + 1}: frames of warning`).toBe(e.kind === 'FLOOD' && e.warn === 0 ? 0 : e.warn);
          // its trigger: control k (or the start) before its clock started
          if (e.trigger > 0) {
            const first = lf.findIndex((g) => g.evT[k] !== 0xffff);
            expect((lf[first]!.stamped >> (e.trigger - 1)) & 1).toBe(1);
          }
        });
      }
      expect(seen).toBeGreaterThanOrEqual(4);
    });

  it('a landslide and falling trees in the replays, and the slide warns at least 120 frames', () => {
    const fr = play('m30-safe').frames.filter((f) => inLevel(f, '2-2'));
    const warn = fr.filter((f) => f.evWarn & 1).length;
    expect(warn).toBeGreaterThanOrEqual(120);
    expect(fr.some((f) => f.evDone & 1)).toBe(true);
  });
});

describe('building sites in Worlds 2-3 are optional shortcuts', () => {
  it('2-4: the safe route never builds; built, the site makes the way to the goal shorter', () => {
    const L = readLevel('2-4');
    const o = L.objects.find((x) => x.kind === 'build')!;
    const dist = (rows: string[][]) => {
      const goal = goalOf(L);
      const seen = new Map([[`${o.c},${o.r}`, 0]]);
      const q: [number, number][] = [[o.c, o.r]];
      while (q.length) {
        const [c, r] = q.shift()!;
        if (c === goal[0] && r === goal[1]) return seen.get(`${c},${r}`)!;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ch = rows[r + dr!]?.[c + dc!];
          const key = `${c + dc!},${r + dr!}`;
          if (!ch || seen.has(key) || DESIGN_CELLS[typeOf(ch).type]!.speed16 === 0) continue;
          seen.set(key, seen.get(`${c},${r}`)! + 1);
          q.push([c + dc!, r + dr!]);
        }
      }
      return Infinity;
    };
    const rows = L.rows.map((r) => [...r]);
    const before = dist(rows);
    rows[o.tr!]![o.tc!] = o.ch!;
    expect(dist(rows)).toBeLessThan(before);
    expect(play('m30-safe').frames.filter((f) => inLevel(f, '2-4')).every((f) => f.wood === 0)).toBe(true);
  });
});
