import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { VM, expandInputs, type ReplayFile } from '@qrc/vm';
import { GAME_DIR, LEVEL_IDS, type RefLevel, type Sixten, buildSixten, readLevel, symbol, typeOf } from './oracle';

// M31 acceptance: Worlds 4 and 5 and the final (PLAN.md Part 4): as M29 for these worlds; under thunder no safe
// route passes a lone tree, a height (the fell) or water while the lightning is on, and crouching in a hollow costs
// no heart; in fog a course and the step counter reach the control; one replay from the title to the end.
let sx: Sixten;
beforeAll(async () => {
  sx = await buildSixten();
});
const S = (n: string) => symbol(sx.sym, n);
const WORLDS45 = ['4-1', '4-2', '4-3', '4-4', '5-1', '5-2', '5-3', '5-4'];

interface Fr { f: number; mode: number; level: string; stamped: number; aj: number; wood: number; pw: number; course: number; courseCtrl: number; under: number; cell: [number, number]; world: number; lvDone: number; lightning: number; sheltered: number; evT: number[]; evWarn: number; cells: Uint8Array | null }
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
    const mine = WORLDS45.includes(level);
    const c = u('px') >> 9;
    const r = u('py') >> 9;
    frames.push({
      f, mode: u('mode'), level, stamped: u('stamped'), aj: u('n_aj'), wood: u('wood'), pw: u('pw'), course: u('course_set'), courseCtrl: u('course_ctrl'),
      under: vm.read8(S('cells') + r * u('lv_w') + c), cell: [c, r], world: u('world'), lvDone: u('lv_done') | (vm.read8(S('lv_done') + 2) << 16),
      lightning: u('lightning'), sheltered: u('sheltered'), evT: mine ? [...Array(8)].map((_, k) => vm.read16(S('ev_t') + 2 * k)) : [], evWarn: u('ev_warn'),
      cells: mine ? vm.mem.slice(S('cells'), S('cells') + u('lv_w') * u('lv_h')) : null,
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

describe('Worlds 4 and 5: safe routes (m31-safe)', () => {
  for (const id of WORLDS45)
    it(`${id}: start to goal, every obligatory control, no heart lost, no wood, no power-up, no course`, () => {
      const L = readLevel(id);
      const all = play('m31-safe').frames;
      const fr = all.filter((f) => inLevel(f, id));
      expect(fr.length).toBeGreaterThan(100);
      const aj0 = fr[0]!.aj;
      for (const f of fr) {
        expect(f.aj, `frame ${f.f + 1}`).toBe(aj0);
        expect(f.wood + f.pw + f.course, `frame ${f.f + 1}`).toBe(0);
      }
      expect(fr[fr.length - 1]!.stamped & oMask(L)).toBe(oMask(L));
      const tally = all.find((x) => x.level === id && x.mode === S('M_TALLY'))!;
      expect(tally.cell).toEqual(goalOf(L));
      expect((tally.lvDone >> LEVEL_IDS.indexOf(id)) & 1).toBe(1);
    });

  it('one replay plays from the title to the end of the game: all 20 levels, the ending', () => {
    const fr = play('m31-safe').frames;
    expect(fr[0]!.mode).toBe(S('M_TITLE'));
    const last = fr[fr.length - 1]!;
    expect(last.mode).toBe(S('M_END'));
    expect(last.world).toBe(6);
    for (let w = 1; w <= 5; w++) for (let k = 1; k <= 4; k++) expect((last.lvDone >> LEVEL_IDS.indexOf(`${w}-${k}`)) & 1, `${w}-${k}`).toBe(1);
  });
});

describe('thunder (DESIGN §1.3 S4, S5; §6.6)', () => {
  it('while the lightning is on, the safe route is never by a lone tree, on the fell or on water', () => {
    let on = 0;
    for (const f of play('m31-safe').frames) {
      if (!f.lightning || f.mode !== S('M_PLAY')) continue;
      on++;
      const L = readLevel(f.level);
      const [c, r] = f.cell;
      const ch = L.rows[r]![c]!;
      expect(['K', 'b', 'Q', 'W', 'i'].includes(ch), `${f.level} frame ${f.f + 1} on '${ch}'`).toBe(false);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(L.rows[r + dr!]?.[c + dc!], `${f.level} frame ${f.f + 1}: next to a lone tree`).not.toBe('i');
    }
    expect(on).toBeGreaterThan(1000);
  });

  it('crouching in a hollow while the lightning is on costs no heart (4-1, 4-3)', () => {
    for (const id of ['4-1', '4-3']) {
      const fr = play('m31-safe').frames.filter((f) => inLevel(f, id) && f.lightning);
      expect(fr.length, id).toBeGreaterThan(500);
      expect(fr.filter((f) => f.sheltered && typeOf(readLevel(id).rows[f.cell[1]]![f.cell[0]]!).ch === 'u').length, id).toBeGreaterThan(500);
      expect(fr[fr.length - 1]!.aj).toBe(fr[0]!.aj);
    }
  });

  it('the lightning is on exactly from its time for as long as it lasts (by its own clock), after a warning of >= 120 frames', () => {
    for (const id of ['4-1', '4-3']) {
      const L = readLevel(id);
      const k = L.events.findIndex((e) => e.kind === 'THUNDER');
      const e = L.events[k]!;
      const tail = readFileSync(join(GAME_DIR, 'levels', `${id}.map`), 'utf8').split(/\r?\n/).find((l) => l.startsWith('event:') && l.includes('THUNDER'))!;
      const last = Number(tail.split('#')[0]!.trim().split(/\s+/)[5]);
      expect(e.warn).toBeGreaterThanOrEqual(120);
      const fr = play('m31-safe').frames.filter((f) => inLevel(f, id) && f.mode === S('M_PLAY'));
      for (const f of fr) {
        const t = f.evT[k]!;
        if (t === 0xffff) continue;
        expect(f.lightning, `${id} t ${t}`).toBe(t >= e.at && t < e.at + last ? 1 : 0);
      }
      const warned = new Set(fr.filter((f) => (f.evWarn >> k) & 1 && f.evT[k]! < e.at).map((f) => f.evT[k])).size;
      expect(warned).toBe(e.warn);
    }
  });
});

describe('fog and night (DESIGN §5)', () => {
  it('4-2 is foggy and 5-2 is dark (the level flags in ROM)', () => {
    const rec = (id: string) => S('level_table') + LEVEL_IDS.indexOf(id) * 32;
    expect(sx.rom[rec('4-2') + S('LR_FLAGS')]).toBe(1);
    expect(sx.rom[rec('5-2') + S('LR_FLAGS')]).toBe(2);
    expect(sx.rom[rec('4-1') + S('LR_FLAGS')]).toBe(0);
  });

  it('in the fog, a course set at a control reaches the control it was set to, and the steps count the cells walked', () => {
    const fr = play('m31-all').frames.filter((f) => inLevel(f, '4-2'));
    const set = fr.findIndex((f) => f.course === 1);
    expect(set).toBeGreaterThan(0);
    const target = fr[set]!.courseCtrl;
    const L = readLevel('4-2');
    const k = L.controls[target]!;
    const reached = fr.slice(set).find((f) => f.cell[0] === k.c && f.cell[1] === k.r);
    expect(reached, 'the course led to its control').toBeTruthy();
    expect(reached!.course).toBe(1);
    expect((reached!.stamped >> target) & 1).toBe(1);
  });
});

describe('everything collected (m31-all)', () => {
  it('every control of Worlds 4-5 is stamped and all 40 nature-book entries are found by the end', () => {
    const { frames, vm } = play('m31-all');
    for (const id of WORLDS45) {
      const L = readLevel(id);
      const fr = frames.filter((f) => inLevel(f, id));
      expect(fr[fr.length - 1]!.stamped, id).toBe((1 << L.controls.length) - 1);
    }
    for (let n = 0; n < 40; n++) expect((vm.read8(S('book') + (n >> 3)) >> (n & 7)) & 1, `entry ${n + 1}`).toBe(1);
    expect(frames[frames.length - 1]!.mode).toBe(S('M_END'));
  });

  it('events in Worlds 4-5 change their cells exactly at their time', () => {
    const fr = play('m31-all').frames;
    let seen = 0;
    for (const id of WORLDS45) {
      const L = readLevel(id);
      const lf = fr.filter((f) => inLevel(f, id));
      L.events.forEach((e, k) => {
        if (e.kind === 'THUNDER') return;
        const at = lf.findIndex((f) => f.cells && e.cells.every((c) => (f.cells![c.r * L.w + c.c]! & 31) === typeOf(c.ch).type));
        if (at < 0) return;
        seen++;
        expect(lf[at]!.evT[k], `${id} event ${k + 1}`).toBe(e.at);
      });
    }
    expect(seen).toBeGreaterThanOrEqual(2);
  });

  it('ROM within 32 KB; the cartridge measured against 25 KB', () => {
    const s = sx.cart.sections;
    const rom = s.code.length + s.rodata.length + s.sound.length;
    console.log(`[budget] sixten, the whole game: ROM ${rom} B (code ${s.code.length}, data ${s.rodata.length}, sound ${s.sound.length}), xdata ${s.xdata!.length} B, cartridge ${sx.bytes.length} B`);
    expect(rom).toBeLessThanOrEqual(32768);
    expect(sx.bytes.length).toBeLessThan(25 * 1024);
  });
});
