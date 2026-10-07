import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { unpack } from '@qrc/asm';
import { VM, expandInputs, type ReplayFile } from '@qrc/vm';
import { DESIGN_CELLS, GAME_DIR, LEVEL_IDS, type RefLevel, type Sixten, buildSixten, readLevel, refCells, symbol, typeOf } from './oracle';

// M29 acceptance: World 1 and the game around it (PLAN.md Part 4).
let sx: Sixten;
beforeAll(async () => {
  sx = await buildSixten();
});
const S = (n: string) => symbol(sx.sym, n);
const WORLD1 = ['1-1', '1-2', '1-3', '1-4'];
const radius = (s: number) => 24 + 8 * s;

// ---- NATURBOK.md, read here with the test's own parser and word wrap -----------------------------------
interface BookRow { n: number; name: string; world: number; text: string; source: string; check: string }
const BOOK: BookRow[] = readFileSync(join(GAME_DIR, 'NATURBOK.md'), 'utf8')
  .split(/\r?\n/)
  .filter((l) => /^\| \d+ \|/.test(l))
  .map((l) => {
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    return { n: Number(c[0]), name: c[1]!, world: Number(c[3]), text: c[4]!, source: c[5]!, check: c[6]! };
  });
const FONT = [' ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Å', 'Ä', 'Ö', ...'0123456789', '!', '?', '.', ',', "'", '-', ':', '/'];
const glyphs = (s: string) => [...s].map((ch) => FONT.indexOf(ch));
function wrap(text: string): string[][] {
  const lines: string[] = [];
  for (const w of text.split(' ')) {
    if (lines.length && lines[lines.length - 1]!.length + 1 + w.length <= 20) lines[lines.length - 1] += ` ${w}`;
    else lines.push(w);
  }
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
  return pages;
}

// ---- the World 1 replays, sampled every frame -----------------------------------------------------------
interface Fr {
  f: number; mode: number; level: string; stamped: number; aj: number; wood: number; pw: number; pwT: number; course: number; here: number;
  ws: number; wx: number; wy: number; x16: number; y16: number; under: number; cell: [number, number]; world: number; lvDone: number; input: number;
}
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
    const c = u('px') >> 9;
    const r = u('py') >> 9;
    frames.push({
      f, mode: u('mode'), level: LEVEL_IDS[u('level')]!, stamped: u('stamped'), aj: u('n_aj'), wood: u('wood'), pw: u('pw'), pwT: u('pw_t'), course: u('course_set'), here: u('you_here'),
      ws: u('wh_s'), wx: u('wh_x') >> 4, wy: u('wh_y') >> 4, x16: u('px'), y16: u('py'), under: vm.read8(S('cells') + r * u('lv_w') + c), cell: [c, r],
      world: u('world'), lvDone: u('lv_done'), input: inputs[f]!,
    });
  }
  const out = { frames, vm };
  cache.set(name, out);
  return out;
}
/** the frames of each level played (top-down play, slides, the map, pages, side views) */
const inLevel = (fr: Fr, id: string) => fr.level === id && [S('M_PLAY'), S('M_SLIDE'), S('M_MAP'), S('M_SIDE'), S('M_PAGE')].includes(fr.mode);
const oMask = (L: RefLevel) => L.controls.reduce((m, k, i) => (k.kind === 'O' ? m | (1 << i) : m), 0);

describe('World 1 safe routes (m29-safe)', () => {
  for (const id of WORLD1)
    it(`${id}: start to goal, every obligatory control, no heart lost, no wood, no power-up, no compass course`, () => {
      const L = readLevel(id);
      const fr = play('m29-safe').frames.filter((f) => inLevel(f, id));
      expect(fr.length).toBeGreaterThan(100);
      const last = fr[fr.length - 1]!;
      expect(last.stamped & oMask(L)).toBe(oMask(L));
      for (const f of fr) {
        expect(f.aj, `frame ${f.f + 1}`).toBe(0);
        expect(f.wood).toBe(0);
        expect(f.pw).toBe(0);
        expect(f.course).toBe(0);
      }
      const tally = play('m29-safe').frames.find((x) => x.level === id && x.mode === S('M_TALLY'))!;
      expect(tally.cell).toEqual(goalOf(L)); // the frame he steps onto the goal is already the tally's
      expect((tally.lvDone >> LEVEL_IDS.indexOf(id)) & 1).toBe(1);
    });

  it('the replay goes from the title to the World 2 map', () => {
    const fr = play('m29-safe').frames;
    expect(fr[0]!.mode).toBe(S('M_TITLE'));
    const last = fr[fr.length - 1]!;
    expect(last.mode).toBe(S('M_WMAP'));
    expect(last.world).toBe(2);
  });
});
function goalOf(L: RefLevel): [number, number] {
  for (let r = 0; r < L.h; r++) for (let c = 0; c < L.w; c++) if (L.rows[r]![c] === 'M') return [c, r];
  throw new Error('no goal');
}

describe('World 1 collected (m29-all)', () => {
  it('every control of every World 1 level is stamped, and every World 1 entry of NATURBOK.md is placed and found', () => {
    const { frames, vm } = play('m29-all');
    for (const id of WORLD1) {
      const L = readLevel(id);
      const fr = frames.filter((f) => inLevel(f, id));
      expect(fr[fr.length - 1]!.stamped, id).toBe((1 << L.controls.length) - 1);
    }
    const placed = WORLD1.flatMap((id) => readLevel(id).objects.filter((o) => o.kind === 'entry').map((o) => o.name));
    const w1 = BOOK.filter((b) => b.world === 1).map((b) => b.name);
    expect([...placed].sort()).toEqual([...w1].sort());
    for (const b of BOOK) {
      const found = (vm.read8(S('book') + ((b.n - 1) >> 3)) >> ((b.n - 1) & 7)) & 1;
      expect(found, b.name).toBe(b.world === 1 ? 1 : 0);
    }
  });

  it('power-ups do what DESIGN §8.1 says: the cucumber shows "you are here", chips go 1.5 x, each lasts 900 frames', () => {
    const fr = play('m29-all').frames;
    let cucumber = 0;
    let chips = 0;
    for (let i = 1; i < fr.length; i++) {
      const a = fr[i - 1]!;
      const b = fr[i]!;
      if (b.mode !== S('M_PLAY') || a.mode !== S('M_PLAY')) continue;
      if (b.pw === 1) {
        expect(b.here, `frame ${b.f + 1}`).toBe(1);
        cucumber++;
      }
      const dir = b.input & 3; // left/right
      if (b.pw === 2 && a.pw === 2 && dir && a.y16 === b.y16 && a.under === b.under && b.x16 !== a.x16) {
        const speed = DESIGN_CELLS[b.under & 31]!.speed16;
        expect(Math.abs(b.x16 - a.x16), `frame ${b.f + 1}`).toBe(speed + (speed >> 1));
        chips++;
      }
      if (b.pw && !a.pw) expect(b.pwT).toBe(900);
      if (!b.pw && a.pw) expect(a.pwT).toBe(1);
    }
    expect(cucumber).toBeGreaterThan(100);
    expect(chips).toBeGreaterThan(30);
  });
});

describe('1-1 (DESIGN §13.2)', () => {
  const L = readLevel('1-1');
  it('the first control is at most 6 cells from the start; the whirlwind is started by control 3', () => {
    const start = (() => {
      for (let r = 0; r < L.h; r++) for (let c = 0; c < L.w; c++) if (L.rows[r]![c] === 'S') return [c, r];
      return [0, 0];
    })();
    expect(Math.abs(L.controls[0]!.c - start[0]!) + Math.abs(L.controls[0]!.r - start[1]!)).toBeLessThanOrEqual(6);
    expect(L.whirls.map((w) => w.trigger)).toEqual([3]);
  });

  it('on the safe route: no whirlwind before control 3; while it is at strength >= 3 a shelter is at most 2 cells away and he is never in forest inside its radius', () => {
    const fr = play('m29-safe').frames.filter((f) => inLevel(f, '1-1'));
    const shelter = new Set(['v', 'u', 'H']);
    let strong = 0;
    for (const f of fr) {
      if (!((f.stamped >> 2) & 1)) expect(f.ws, `frame ${f.f + 1}`).toBe(0);
      if (f.ws < 3) continue;
      strong++;
      const [c, r] = f.cell;
      let near = false;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (Math.abs(dc) + Math.abs(dr) <= 2 && shelter.has(L.rows[r + dr]?.[c + dc] ?? '')) near = true;
      expect(near, `frame ${f.f + 1} at ${c},${r}`).toBe(true);
      const inside = Math.hypot((f.x16 >> 4) - f.wx, (f.y16 >> 4) - f.wy) <= radius(f.ws);
      if (inside) expect(DESIGN_CELLS[f.under & 31]!.ch, `frame ${f.f + 1}`).not.toBe('T');
    }
    expect(strong).toBeGreaterThan(100);
  });
});

describe('building sites are optional shortcuts (DESIGN §8.4)', () => {
  it('every World 1 site: the safe route never needs it, and built it makes the way from it to the goal shorter', () => {
    let sites = 0;
    for (const id of WORLD1) {
      const L = readLevel(id);
      for (const o of L.objects.filter((x) => x.kind === 'build')) {
        sites++;
        const rows = L.rows.map((r) => [...r]);
        // the whirlwinds' changes happen before (the trees fall), then compare without and with the site built
        for (const w of L.whirls) for (const ch of w.changes) if (ch.ch) rows[ch.r]![ch.c] = ch.ch;
        const dist = (g: string[][]) => {
          const goal = goalOf(L);
          const seen = new Map([[`${o.c},${o.r}`, 0]]);
          const q: [number, number][] = [[o.c, o.r]];
          while (q.length) {
            const [c, r] = q.shift()!;
            if (c === goal[0] && r === goal[1]) return seen.get(`${c},${r}`)!;
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const n = `${c + dc!},${r + dr!}`;
              const ch = g[r + dr!]?.[c + dc!];
              if (!ch || seen.has(n) || typeOf(ch).speed16 === 0) continue;
              seen.set(n, seen.get(`${c},${r}`)! + 1);
              q.push([c + dc!, r + dr!]);
            }
          }
          return Infinity;
        };
        const before = dist(rows);
        rows[o.tr!]![o.tc!] = o.ch!;
        expect(dist(rows), `${id} site ${o.c},${o.r}`).toBeLessThan(before);
      }
    }
    expect(sites).toBeGreaterThan(0);
  });
});

describe('facts and texts', () => {
  it('every safety rule of DESIGN §1.3 has a source and a recorded check', () => {
    const text = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');
    const rows = text.split(/\r?\n/).filter((l) => /^\| S\d+ \|/.test(l));
    expect(rows.length).toBe(10);
    for (const r of rows) {
      const c = r.split('|').slice(1, -1).map((x) => x.trim());
      expect(c[3]!.length, c[0]).toBeGreaterThan(5);
      expect(c[4], c[0]).toContain('✓ Claude');
    }
  });

  it('NATURBOK.md: 40 entries, 8 a world, each with a source and a recorded check', () => {
    expect(BOOK.map((b) => b.n)).toEqual([...Array(40)].map((_, i) => i + 1));
    for (let w = 1; w <= 5; w++) expect(BOOK.filter((b) => b.world === w).length).toBe(8);
    for (const b of BOOK) {
      expect(b.source.length, b.name).toBeGreaterThan(3);
      expect(b.check, b.name).toContain('✓ Claude');
    }
  });

  it('the names in ROM and the pages in xdata equal NATURBOK.md, glyph for glyph', () => {
    const xdata = sx.cart.sections.xdata!;
    BOOK.forEach((b, i) => {
      const name = S(`nb_name_${i}`);
      const got: number[] = [];
      for (let a = name; sx.rom[a] !== 255; a++) got.push(sx.rom[a]!);
      expect(got, b.name).toEqual(glyphs(b.name));
      const packed = unpack(xdata.subarray(S(`nb_text_${i}`) - 0x10000));
      const pages = wrap(b.text);
      const want = [pages.length];
      for (const p of pages) for (let k = 0; k < 2; k++) want.push(...(p[k] ? glyphs(p[k]!) : []), 255);
      expect([...packed], b.name).toEqual(want);
      expect(pages.length).toBeLessThanOrEqual(3);
      for (const p of pages) for (const l of p) expect(l.length).toBeLessThanOrEqual(20);
    });
  });
});

describe('the save code and the budget', () => {
  it('the world map shows the code of the state (DESIGN §10.2), computed here independently', () => {
    const { vm } = play('m29-all');
    const world = vm.read16(S('world'));
    const bits: number[] = [];
    for (let k = 2; k >= 0; k--) bits.push((world >> k) & 1);
    for (let e = 0; e < 40; e++) bits.push((vm.read8(S('book') + (e >> 3)) >> (e & 7)) & 1);
    const sum = bits.reduce((s, b, i) => s + b * (i + 1), 0) % 128;
    for (let k = 6; k >= 0; k--) bits.push((sum >> k) & 1);
    const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let j = 0; j < 10; j++) {
      let v = 0;
      for (let t = 0; t < 5; t++) v = v * 2 + bits[j * 5 + t]!;
      code += alpha[v ^ ((j * 7 + 3) & 31)];
    }
    const got: number[] = [];
    for (let a = S('code_str'); vm.read8(a) !== 255; a++) got.push(vm.read8(a));
    expect(got).toEqual(glyphs(code));
  });

  it('budget gate: ROM, code and xdata measured (DECISIONS records the projection)', () => {
    const s = sx.cart.sections;
    const rom = s.code.length + s.rodata.length + s.sound.length;
    const ovl = S('ovl_side_end') - S('ovl_side');
    console.log(`[budget] sixten after World 1: ROM ${rom} B (code ${s.code.length}, data ${s.rodata.length}, sound ${s.sound.length}), side overlay ${ovl} B, xdata ${s.xdata!.length} B, cartridge ${sx.bytes.length} B`);
    expect(rom).toBeLessThanOrEqual(32768);
    expect(sx.bytes.length).toBeLessThan(25 * 1024);
    void refCells;
  });
});
