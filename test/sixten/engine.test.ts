import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { BUTTONS } from '@qrc/vm';
import { generateArt, patternBytes, CELLS } from '../../games/sixten/tools/art';
import { generateLevels } from '../../games/sixten/tools/levels';
import { generateBook } from '../../games/sixten/tools/naturbok';
import { DESIGN_CELLS, GAME_DIR, LEVEL_IDS, type RefLevel, type Sixten, buildSixten, readLevel, refCells, replayNames, runReplay, symbol, typeOf, vmInLevel } from './oracle';

// M26 acceptance: cells, screens, walking, map and compass (PLAN.md Part 4).
let sx: Sixten;
beforeAll(async () => {
  sx = await buildSixten();
});
const S = (n: string) => symbol(sx.sym, n);
const MAP_Y = 20;
const MAP_CELL = 5;

describe('Sixten build', () => {
  it('generated data files are up to date with the art and the level sources', () => {
    expect(readFileSync(join(GAME_DIR, 'art.gen.asm'), 'utf8')).toBe(generateArt());
    expect(readFileSync(join(GAME_DIR, 'levels.gen.asm'), 'utf8')).toBe(generateLevels().asm);
    expect(readFileSync(join(GAME_DIR, 'naturbok.gen.asm'), 'utf8')).toBe(generateBook());
  });

  it('reports the cartridge and ROM size', () => {
    const s = sx.cart.sections;
    const rom = s.code.length + s.rodata.length + s.sound.length;
    console.log(`[size] sixten: cartridge ${sx.bytes.length} B, ROM ${rom} B of 32768 (code ${s.code.length}, data ${s.rodata.length}, sound ${s.sound.length}), xdata ${s.xdata?.length ?? 0} B`);
    expect(rom).toBeLessThanOrEqual(32768);
  });

  it('the cell tables in ROM equal DESIGN.md §4.1 (speed, map colour), and every type has its pattern', () => {
    expect(DESIGN_CELLS.length).toBe(CELLS.length);
    for (const d of DESIGN_CELLS) {
      expect(sx.rom[S('cell_speed') + d.type], `speed of ${d.ch}`).toBe(d.speed16);
      expect(sx.rom[S('map_fill') + d.type], `map colour of ${d.ch}`).toBe(d.fill);
      expect(CELLS[d.type]!.ch).toBe(d.ch);
      const pat = [...sx.rom.subarray(S('patterns') + d.type * 16, S('patterns') + d.type * 16 + 16)];
      expect(pat, `pattern of ${d.ch}`).toEqual(patternBytes(CELLS[d.type]!.pattern));
    }
  });
});

// ---- the map and the world agree cell for cell -------------------------------------------------------
/** the tiles a screen must have (DESIGN §4.1): pattern rows swapped for the variant bit, leaves at (1, 1) */
function refScreen(cells: number[], L: RefLevel, sc: number, sr: number): number[][] {
  const out = Array.from({ length: 16 }, () => new Array<number>(12).fill(0));
  for (let cy = 0; cy < 3; cy++)
    for (let cx = 0; cx < 4; cx++) {
      const b = cells[(sr * 3 + cy) * L.w + sc * 4 + cx]!;
      const pat = patternBytes(CELLS[b & 31]!.pattern);
      for (let ty = 0; ty < 4; ty++)
        for (let tx = 0; tx < 4; tx++) {
          let t = pat[(b & 0x20 ? ty ^ 2 : ty) * 4 + tx]!;
          if (b & 0x40 && tx === 1 && ty === 1) t = S('T_LEAVES');
          out[cx * 4 + tx]![cy * 4 + ty] = t;
        }
    }
  return out;
}

/** the 5 x 5 symbols of DESIGN §4.1 ("Kartsymbol"), as pixels [x, y, colour] from the cell's top-left */
const BLACK = 0;
const BLUE = 8;
const BROWN = 4;
const line = (x0: number, x1: number, y: number, c: number) => Array.from({ length: x1 - x0 + 1 }, (_, i): [number, number, number] => [x0 + i, y, c]);
const SYMBOL_PIXELS: Record<string, [number, number, number][]> = {
  '=': [[0, 2, BLACK], [2, 2, BLACK], [4, 2, BLACK]],
  '|': [[2, 0, BLACK], [2, 2, BLACK], [2, 4, BLACK]],
  '+': [[0, 2, BLACK], [2, 2, BLACK], [4, 2, BLACK], [2, 0, BLACK], [2, 4, BLACK]],
  '~': [...line(0, 2, 1, BLUE), ...line(2, 4, 3, BLUE)],
  '^': [...line(0, 4, 1, BROWN), ...line(0, 4, 3, BROWN)],
  v: line(0, 4, 2, BLUE),
  u: [[1, 1, BROWN], [1, 2, BROWN], [2, 3, BROWN], [3, 2, BROWN], [3, 1, BROWN]],
  H: [...line(1, 3, 1, BLACK), ...line(1, 3, 2, BLACK), ...line(1, 3, 3, BLACK)],
  o: [...line(2, 3, 2, BLACK), ...line(2, 3, 3, BLACK)],
  L: [[1, 1, BLACK], [2, 2, BLACK], [3, 3, BLACK], [1, 3, BLACK], [3, 1, BLACK]],
  X: [[1, 1, BLACK], [2, 2, BLACK], [3, 3, BLACK], [1, 3, BLACK], [3, 1, BLACK]],
  b: [...line(0, 4, 1, BLACK), ...line(0, 4, 3, BLACK)],
  B: [...line(1, 3, 1, 1), [1, 2, 1], [3, 2, 1], ...line(1, 3, 3, 1)],
  G: [[1, 1, BLACK], [2, 2, BLACK], [2, 3, BLACK], [3, 1, BLACK]],
  i: [...line(1, 3, 1, 11), ...line(1, 3, 2, 11), ...line(1, 3, 3, 11)],
};

/** compares the map screen in the framebuffer with DESIGN §4.1, cell by cell; returns the differences */
function mapProblems(fb: Uint8Array, L: RefLevel, cells: number[]): string[] {
  const x0 = (128 - L.w * MAP_CELL) >> 1;
  const north = (x: number, y: number) => (x - x0 - 12) % 30 === 0 && x >= x0 + 12 && (y - MAP_Y) % 3 === 0;
  const out: string[] = [];
  for (let r = 0; r < L.h; r++)
    for (let c = 0; c < L.w; c++) {
      const d = DESIGN_CELLS[cells[r * L.w + c]! & 31]!;
      const want = new Array<number>(25).fill(d.fill);
      for (const [x, y, col] of SYMBOL_PIXELS[d.ch] ?? []) want[y * 5 + x] = col;
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 5; x++) {
          const px = x0 + c * MAP_CELL + x;
          const py = MAP_Y + r * MAP_CELL + y;
          const got = fb[py * 128 + px]!;
          if (got === 6) continue; // the course (red) is drawn over the map
          if (north(px, py) && got === BLUE) continue;
          if (got !== want[y * 5 + x]) out.push(`${L.id} cell ${c},${r} ('${d.ch}') pixel ${x},${y}: ${got}, expected ${want[y * 5 + x]}`);
        }
    }
  return out;
}

const ramCells = (vm: ReturnType<typeof vmInLevel>, n: number) => [...Array(n)].map((_, i) => vm.read8(S('cells') + i));

describe('the map and the world agree cell for cell', () => {
  it('every symbol of DESIGN §4.1 has its pixels in the test (and only those types)', () => {
    for (const d of DESIGN_CELLS) expect(!!SYMBOL_PIXELS[d.ch], `symbol of '${d.ch}': ${d.symbol}`).toBe(!['–', 'triangel (banan)', 'dubbelring (banan)'].includes(d.symbol));
  });

  for (const id of LEVEL_IDS)
    it(`${id}: the RAM cell map after unpacking equals the .map source`, () => {
      const L = readLevel(id);
      const vm = vmInLevel(sx, id);
      expect(vm.read16(S('lv_w'))).toBe(L.w);
      expect(vm.read16(S('lv_h'))).toBe(L.h);
      expect(ramCells(vm, L.w * L.h)).toEqual(refCells(L));
    });

  for (const id of LEVEL_IDS)
    it(`${id}: every screen's tile buffer equals the reference expansion of its cells`, () => {
      const L = readLevel(id);
      const cells = refCells(L);
      const vm = vmInLevel(sx, id);
      for (let sr = 0; sr < L.h / 3; sr++)
        for (let sc = 0; sc < L.w / 4; sc++) {
          vm.write16(S('dbg_goto'), (sr * 3 + 1) * L.w + sc * 4 + 1 + 1);
          vm.step(0);
          expect([vm.read16(S('scr_c')), vm.read16(S('scr_r'))]).toEqual([sc, sr]);
          const got = Array.from({ length: 16 }, (_, c) => Array.from({ length: 12 }, (_, r) => vm.read8(S('tbuf') + c * 24 + r)));
          expect(got, `${id} screen ${sc},${sr}`).toEqual(refScreen(cells, L, sc, sr));
        }
    });

  for (const id of LEVEL_IDS)
    it(`${id}: the map screen's colour and symbol for every cell equal DESIGN §4.1 (read from the framebuffer)`, () => {
      const L = readLevel(id);
      const vm = vmInLevel(sx, id);
      // a cell where he does not know where he is: walkable, not a control, a crossing or the start
      const open = [...Array(L.w * L.h).keys()].find((i) => {
        const ch = L.rows[Math.floor(i / L.w)]![i % L.w]!;
        return typeOf(ch).speed16 > 0 && !'+S'.includes(ch) && !(refCells(L)[i]! >> 7);
      })!;
      vm.write16(S('dbg_goto'), open + 1);
      vm.step(0);
      expect(vm.read16(S('you_here'))).toBe(0);
      vm.step(BUTTONS.B);
      for (let i = 0; i < 8; i++) vm.step(0);
      expect(vm.read16(S('mode'))).toBe(S('M_MAP'));
      expect(mapProblems(vm.fb, L, refCells(L))).toEqual([]);
    });

  it('after a cell change, the next screen expansion and the next map screen show the new cell', () => {
    const L = readLevel('T1');
    const vm = vmInLevel(sx, 'T1');
    const target = 2 * L.w + 2; // (2, 2): open land on the first screen
    const windfall = typeOf('X').type;
    vm.write16(S('dbg_cell'), target + 1);
    vm.write16(S('dbg_cell_v'), windfall);
    vm.step(0);
    const cells = refCells(L);
    cells[target] = windfall;
    const got = Array.from({ length: 16 }, (_, c) => Array.from({ length: 12 }, (_, r) => vm.read8(S('tbuf') + c * 24 + r)));
    expect(got).toEqual(refScreen(cells, L, 0, 0));
    vm.write16(S('dbg_goto'), 2 * L.w + 3 + 1); // (3, 2): open land, he does not know where he is
    vm.step(0);
    vm.step(BUTTONS.B);
    for (let i = 0; i < 8; i++) vm.step(0);
    expect(mapProblems(vm.fb, L, cells)).toEqual([]);
  });
});

// ---- the replays ---------------------------------------------------------------------------------
// `under`: the cell byte under his feet, read live from RAM (whirlwinds change cells; whirl.test.ts checks that
// they change only as the .map says), interpreted with DESIGN §4.1
interface Frame { f: number; mode: number; x16: number; y16: number; under: number; input: number; here: number; pw: number; courseSet: number; courseDir: number; courseCtrl: number; steps: number; level: string; slideDx: number; slideDy: number; scr: [number, number] }
/** blocking (DESIGN §4.1: no speed) or outside the level, with the cell as it is in RAM now */
function liveBlocking(vm: { read8: (a: number) => number }, L: RefLevel, c: number, r: number) {
  if (c < 0 || r < 0 || c >= L.w || r >= L.h) return true;
  return DESIGN_CELLS[vm.read8(S('cells') + r * L.w + c) & 31]!.speed16 === 0;
}
const runs = new Map<string, { frames: Frame[]; problems: string[]; hashMismatch: number; maxCycles: number; overruns: number; fault: string | null; expectedFrames: number; rfFrames: number }>();
function play(name: string) {
  const hit = runs.get(name);
  if (hit) return hit;
  const frames: Frame[] = [];
  const problems: string[] = [];
  const levels = new Map<string, RefLevel>();
  const r = runReplay(sx, name, ({ f, vm, u, input }) => {
    const id = LEVEL_IDS[u('level')]!;
    if (!levels.has(id)) levels.set(id, readLevel(id));
    const L = levels.get(id)!;
    const fr: Frame = {
      f, mode: u('mode'), x16: u('px'), y16: u('py'), input, under: vm.read8(S('cells') + (u('py') >> 9) * u('lv_w') + (u('px') >> 9)), here: u('you_here'), pw: u('pw'), courseSet: u('course_set'), courseDir: u('course_dir'), courseCtrl: u('course_ctrl'), steps: u('steps'), level: id,
      slideDx: (u('slide_dx') << 16) >> 16, slideDy: (u('slide_dy') << 16) >> 16, scr: [u('scr_c'), u('scr_r')],
    };
    frames.push(fr);
    // Sixten's box (DESIGN §4.1: 6 x 4 px at the feet) never overlaps a blocking cell (in a level: not on the card)
    if (![S('M_PLAY'), S('M_SLIDE'), S('M_MAP')].includes(fr.mode)) return; // in a level, top-down
    const x = fr.x16 >> 4;
    const y = fr.y16 >> 4;
    for (const [cx, cy] of [[x - 3, y - 3], [x + 2, y - 3], [x - 3, y], [x + 2, y]] as const)
      if (liveBlocking(vm, L, Math.floor(cx / 32), Math.floor(cy / 32))) problems.push(`${name} frame ${f + 1}: box corner ${cx},${cy} on a blocking cell`);
  });
  const out = { frames, problems, hashMismatch: r.hashMismatch, maxCycles: r.maxCycles, overruns: r.vm.overruns, fault: r.vm.fault, expectedFrames: r.expectedFrames, rfFrames: r.rf.frames };
  runs.set(name, out);
  return out;
}

const NAMES = replayNames();
describe('replays', () => {
  it('there are replays on T1, T2 and 1-1', () => {
    expect(NAMES).toEqual(expect.arrayContaining(['m26-t1', 'm26-t2', 'm26-11']));
  });

  for (const name of NAMES)
    it(`${name}: per-frame hashes, no fault, no overrun, ≤ 25 000 cycles, the box never on a blocking cell`, () => {
      const p = play(name);
      console.log(`[cycles] ${name}: max ${p.maxCycles} per frame over ${p.rfFrames} frames`);
      expect(p.hashMismatch, 'first frame whose state hash differs').toBe(-1);
      expect(p.expectedFrames).toBe(p.rfFrames);
      expect(p.fault).toBeNull();
      expect(p.overruns).toBe(0);
      expect(p.maxCycles).toBeLessThanOrEqual(25000);
      expect(p.problems.slice(0, 5)).toEqual([]);
    });

  it('walking speed per cell type matches DESIGN §4.1 within ±1 px over a 32-frame stretch', () => {
    const measured = new Map<string, number>();
    for (const name of NAMES) {
      const fr = play(name).frames;
      for (let i = 1; i + 32 < fr.length; i++) {
        const a = fr[i]!;
        const dir = a.input & (BUTTONS.LEFT | BUTTONS.RIGHT);
        if (a.mode !== 0 || !dir || dir === (BUTTONS.LEFT | BUTTONS.RIGHT)) continue;
        const ch = (k: Frame) => DESIGN_CELLS[k.under & 31]!.ch;
        const t = ch(fr[i - 1]!);
        let ok = true;
        for (let k = i; k <= i + 32 && ok; k++) {
          const b = fr[k]!;
          ok = b.mode === 0 && b.input === a.input && ch(fr[k - 1]!) === t && b.y16 === a.y16 && b.level === a.level;
        }
        if (!ok || measured.has(t)) continue;
        const dx = Math.abs(fr[i + 31]!.x16 - fr[i - 1]!.x16);
        const want = typeOf(t).speed16 * 32;
        expect(Math.abs(dx - want), `type '${t}' in ${name} from frame ${i + 1}: moved ${dx / 16} px, expected ${want / 16}`).toBeLessThanOrEqual(16);
        measured.set(t, dx);
      }
    }
    console.log(`[speed] measured: ${[...measured].map(([t, d]) => `'${t}' ${d / 16} px`).join(', ')}`);
    for (const t of ['.', 'T', '#', '=', '|', '+', '~', 'v', 'u', 'o', 'L', 'b', 'B', 'i']) expect(measured.has(t), `a stretch on '${t}'`).toBe(true);
  });

  it('the map may show "you are here" in exactly the frames where Sixten stands on a control, a crossing or the start (or has the cucumber)', () => {
    let here = 0;
    for (const name of NAMES) {
      for (const fr of play(name).frames) {
        if (fr.mode !== 0) continue;
        const L = readLevel(fr.level);
        const c = fr.x16 >> 9;
        const r = fr.y16 >> 9;
        const ch = DESIGN_CELLS[fr.under & 31]!.ch;
        const ctrl = (fr.under & 0xc0) === 0x80 && L.controls.some((k) => k.c === c && k.r === r);
        const want = ctrl || ch === '+' || ch === 'S' || fr.pw === 1 ? 1 : 0;
        expect(fr.here, `${name} frame ${fr.f + 1} at ${c},${r} ('${ch}')`).toBe(want);
        here += want;
      }
    }
    expect(here).toBeGreaterThan(0);
  });

  it('the cucumber shows "you are here" anywhere (test hook)', () => {
    const vm = vmInLevel(sx, 'T1');
    const L = readLevel('T1');
    vm.write16(S('dbg_goto'), 2 * L.w + 3 + 1);
    vm.step(0);
    expect(vm.read16(S('you_here'))).toBe(0);
    vm.write16(S('dbg_pw'), 1 + 1);
    vm.step(0);
    vm.step(0);
    expect(vm.read16(S('you_here'))).toBe(1);
  });

  it('the course arrow points within one sixteenth of a turn at the chosen control, and the step counter equals the cells walked', () => {
    let courses = 0;
    for (const name of NAMES) {
      const fr = play(name).frames;
      let walked = 0;
      for (let i = 1; i < fr.length; i++) {
        const a = fr[i - 1]!;
        const b = fr[i]!;
        if (b.courseSet && !a.courseSet) {
          courses++;
          walked = 0;
          const L = readLevel(b.level);
          const k = L.controls[b.courseCtrl]!;
          const dx = k.c * 32 + 16 - (b.x16 >> 4);
          const dy = (b.y16 >> 4) - (k.r * 32 + 16);
          const exact = (Math.atan2(dy, dx) / (2 * Math.PI)) * 16;
          const diff = Math.abs((((b.courseDir - exact) % 16) + 24) % 16 - 8);
          expect(diff, `${name} frame ${i + 1}: course ${b.courseDir}, exact ${exact.toFixed(2)}`).toBeLessThanOrEqual(1);
        } else if (b.courseSet && b.level === a.level && (a.x16 >> 9 !== b.x16 >> 9 || a.y16 >> 9 !== b.y16 >> 9)) walked++;
        if (b.courseSet) expect(b.steps, `${name} frame ${i + 1}`).toBe(walked);
      }
    }
    expect(courses).toBeGreaterThanOrEqual(2);
  });

  it('the slides go in all four directions, and the T2 walk visits all 30 screens', () => {
    const fr = play('m26-t2').frames;
    const dirs = new Set(fr.filter((f) => f.mode === 1).map((f) => `${f.slideDx},${f.slideDy}`));
    expect([...dirs].sort()).toEqual(['-8,0', '0,-8', '0,8', '8,0']);
    const screens = new Set(fr.filter((f) => f.level === 'T2').map((f) => f.scr.join(',')));
    expect(screens.size).toBe(30);
  });
});
