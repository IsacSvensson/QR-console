import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { BUTTONS, VM, expandInputs, type ReplayFile } from '@qrc/vm';
import { GAME_DIR, LEVEL_IDS, type Sixten, buildSixten, symbol } from './oracle';

// M32 acceptance: the save code (PLAN.md Part 4). The code is made here from DESIGN.md §10.2 (its table, its
// alphabet and its rules) and entered into the VM's code screen; the VM must read back the world and the book,
// and make the same code again on the world map. Wrong checksums and impossible worlds are rejected.
let sx: Sixten;
beforeAll(async () => {
  sx = await buildSixten();
});
const S = (n: string) => symbol(sx.sym, n);

// ---- DESIGN §10.2, read here ---------------------------------------------------------------------
const design = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');
const section = design.slice(design.indexOf('### 10.2'), design.indexOf('## 11.'));
const ALPHA = /`([A-Z2-9]{32})`/.exec(section)![1]!;
const FIELDS = section
  .split(/\r?\n/)
  .filter((l) => /^\| \d+ \|/.test(l))
  .map((l) => Number(l.split('|')[1]!.trim()));
const [W_BITS, BOOK_BITS, SUM_BITS] = FIELDS as [number, number, number];

/** the reference encoder: world (highest bit first), the book (entry 1 first), the checksum */
function encode(world: number, book: boolean[]): string {
  const bits: number[] = [];
  for (let k = W_BITS - 1; k >= 0; k--) bits.push((world >> k) & 1);
  for (let e = 0; e < BOOK_BITS; e++) bits.push(book[e] ? 1 : 0);
  const sum = bits.reduce((s, b, i) => s + b * (i + 1), 0) % 128;
  for (let k = SUM_BITS - 1; k >= 0; k--) bits.push((sum >> k) & 1);
  let code = '';
  for (let j = 0; j < bits.length / 5; j++) {
    let v = 0;
    for (let t = 0; t < 5; t++) v = v * 2 + bits[j * 5 + t]!;
    code += ALPHA[v ^ ((7 * j + 3) % 32)];
  }
  return code;
}
const FONT = [' ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Å', 'Ä', 'Ö', ...'0123456789', '!', '?', '.', ',', "'", '-', ':', '/'];
const WORLD_LEVELS = (w: number) => [1, 2, 3, 4].map((k) => LEVEL_IDS.indexOf(`${w}-${k}`));

/** a VM on the code screen */
function codeScreen() {
  const vm = VM.fromCartridge(sx.cart, { seed: 1 });
  vm.step(0);
  vm.step(BUTTONS.B);
  vm.step(0);
  expect(vm.read16(S('mode'))).toBe(S('M_CODE'));
  return vm;
}
/** type the code in with the buttons the code screen has, then A */
function enter(vm: VM, code: string) {
  for (let j = 0; j < code.length; j++) {
    let at = vm.read8(S('code_in') + j);
    const want = ALPHA.indexOf(code[j]!);
    while (at !== want) {
      const up = (want - at + 32) % 32 <= 16;
      vm.step(up ? BUTTONS.UP : BUTTONS.DOWN);
      vm.step(0);
      at = vm.read8(S('code_in') + j);
    }
    if (j < code.length - 1) {
      vm.step(BUTTONS.RIGHT);
      vm.step(0);
    }
  }
  vm.step(BUTTONS.A);
  vm.step(0);
}
const bookOf = (vm: VM) => [...Array(BOOK_BITS)].map((_, e) => ((vm.read8(S('book') + (e >> 3)) >> (e & 7)) & 1) === 1);
const lvDone = (vm: VM) => vm.read8(S('lv_done')) | (vm.read8(S('lv_done') + 1) << 8) | (vm.read8(S('lv_done') + 2) << 16) | (vm.read8(S('lv_done') + 3) << 24);
const shownCode = (vm: VM) => {
  let s = '';
  for (let a = S('code_str'); vm.read8(a) !== 255; a++) s += FONT[vm.read8(a)];
  return s;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('the save code (DESIGN §10.2)', () => {
  it('the layout in DESIGN adds up to 10 characters of 32', () => {
    expect(ALPHA).toHaveLength(32);
    expect(new Set(ALPHA).size).toBe(32);
    for (const ch of 'IO01') expect(ALPHA.includes(ch)).toBe(false);
    expect(W_BITS + BOOK_BITS + SUM_BITS).toBe(50);
    expect(BOOK_BITS).toBe(S('NB_COUNT'));
  });

  const SEED = 32;
  it(`every code round-trips: worlds 1-6 x 12 seeded books (seed ${SEED}) + the empty and the full book`, () => {
    const rnd = mulberry32(SEED);
    for (let world = 1; world <= 6; world++) {
      const books: boolean[][] = [Array(BOOK_BITS).fill(false), Array(BOOK_BITS).fill(true)];
      for (let k = 0; k < 12; k++) {
        const p = rnd();
        books.push([...Array(BOOK_BITS)].map(() => rnd() < p));
      }
      for (const book of books) {
        const code = encode(world, book);
        const why = `seed ${SEED}, world ${world}, code ${code}`;
        const vm = codeScreen();
        enter(vm, code);
        expect(vm.fault, why).toBeNull();
        expect(vm.read16(S('mode')), why).toBe(world === 6 ? S('M_END') : S('M_WMAP'));
        expect(vm.read16(S('world')), why).toBe(world);
        expect(bookOf(vm), why).toEqual(book);
        let want = 0;
        for (let w = 1; w < world; w++) for (const i of WORLD_LEVELS(w)) want |= 1 << i;
        expect(lvDone(vm) >>> 0, why).toBe(want >>> 0);
        expect(shownCode(vm), `${why}: the VM's encoder makes the same code`).toBe(code);
      }
    }
  });

  it('a wrong checksum is rejected: FEL KOD, the state unchanged, still on the code screen', () => {
    const rnd = mulberry32(7);
    for (let k = 0; k < 20; k++) {
      const book = [...Array(BOOK_BITS)].map(() => rnd() < 0.5);
      const code = encode(1 + (k % 5), book);
      const j = k % 10;
      const bad = code.slice(0, j) + ALPHA[(ALPHA.indexOf(code[j]!) + 1 + (k % 31)) % 32] + code.slice(j + 1);
      // one in 128 wrong codes has a matching checksum by chance; skip those (the reference decoder says so)
      if (decodes(bad)) continue;
      const vm = codeScreen();
      enter(vm, bad);
      expect(vm.read16(S('mode')), bad).toBe(S('M_CODE'));
      expect(vm.read16(S('code_err')), bad).toBeGreaterThan(0);
      expect(vm.read16(S('world')), bad).toBe(1);
      expect(bookOf(vm).some(Boolean), bad).toBe(false);
    }
  });

  it('impossible worlds (0 and 7) are rejected even with a right checksum', () => {
    for (const world of [0, 7]) {
      const code = encode(world, Array(BOOK_BITS).fill(true));
      const vm = codeScreen();
      enter(vm, code);
      expect(vm.read16(S('mode')), code).toBe(S('M_CODE'));
      expect(vm.read16(S('world')), code).toBe(1);
    }
  });

  it('B leaves the code screen for the title; B with DOWN held still opens the level card', () => {
    const vm = codeScreen();
    vm.step(BUTTONS.B);
    expect(vm.read16(S('mode'))).toBe(S('M_TITLE'));
    vm.step(0);
    vm.step(BUTTONS.B | BUTTONS.DOWN);
    expect(vm.read16(S('mode'))).toBe(S('M_CARD'));
  });
});

/** the reference decoder: does the code's checksum match and its world lie in 1-6? */
function decodes(code: string): boolean {
  const bits: number[] = [];
  [...code].forEach((ch, j) => {
    const v = ALPHA.indexOf(ch) ^ ((7 * j + 3) % 32);
    for (let t = 4; t >= 0; t--) bits.push((v >> t) & 1);
  });
  const n = W_BITS + BOOK_BITS;
  const sum = bits.slice(0, n).reduce((s, b, i) => s + b * (i + 1), 0) % 128;
  const stored = bits.slice(n).reduce((s, b) => s * 2 + b, 0);
  const world = bits.slice(0, W_BITS).reduce((s, b) => s * 2 + b, 0);
  return sum === stored && world >= 1 && world <= 6;
}

describe('a replay enters a code and resumes (m32-code)', () => {
  it('the title, the code for World 3 with a book, the World 3 map, then 3-1 is played to its goal', () => {
    // the route (tools/routes.ts) types the code of World 3 with the entries of Worlds 1 and 2 (1-16)
    const rf = { ...(JSON.parse(readFileSync(join(GAME_DIR, 'replays', 'm32-code.json'), 'utf8')) as ReplayFile & { frames: number }), world: 3 };
    const vm = VM.fromCartridge(sx.cart, { seed: rf.seed ?? 1 });
    const inputs = expandInputs(rf.inputs, rf.frames);
    const book = [...Array(BOOK_BITS)].map((_, e) => e < 16);
    const code = encode(rf.world, book);
    let seenCode = false;
    let onMap = -1;
    let tally = -1;
    for (let f = 0; f < rf.frames; f++) {
      vm.step(inputs[f]!);
      const mode = vm.read16(S('mode'));
      if (mode === S('M_CODE')) seenCode = true;
      if (onMap < 0 && mode === S('M_WMAP')) {
        onMap = f;
        expect(vm.read16(S('world'))).toBe(rf.world);
        expect(bookOf(vm)).toEqual(book);
        expect(shownCode(vm)).toBe(code);
      }
      if (tally < 0 && mode === S('M_TALLY')) tally = f;
    }
    expect(seenCode).toBe(true);
    expect(onMap).toBeGreaterThan(0);
    expect(tally).toBeGreaterThan(onMap);
    expect(LEVEL_IDS[vm.read16(S('level'))]).toBe(`${rf.world}-1`);
    expect((lvDone(vm) >> LEVEL_IDS.indexOf(`${rf.world}-1`)) & 1).toBe(1);
  });
});
