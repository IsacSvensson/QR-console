import { describe, expect, it } from 'vitest';
import { BUTTONS, SCREEN, SYSCALLS as S, VM } from '../src';
import { ins, vmFor } from './helpers';

const R = 0x8000;
type Prog = number[][];
const set = (vals: Record<number, number>): Prog => Object.entries(vals).map(([r, v]) => ins('MOV', Number(r), 0, v));
const sys = (n: number) => ins('SYS', 0, 0, n);
const px = (vm: VM, x: number, y: number) => vm.fb[y * SCREEN + x];
/** Build a VM whose update = body + RET; rodata is placed right after the code. */
function build(body: Prog, rodata: number[] = [], sound: number[] = [], seed = 1) {
  const vm = vmFor([...body, ins('RET')], { rodata, sound, seed });
  return vm;
}

describe('drawing syscalls', () => {
  it('CLS fills the framebuffer', () => {
    const vm = build([...set({ 0: 7 }), sys(S.CLS)]);
    vm.step(0);
    expect(vm.fb.every((c) => c === 7)).toBe(true);
  });

  it('PSET/PGET with clipping; colour masked to 4 bits', () => {
    const vm = build([
      ...set({ 0: 5, 1: 6, 2: 0x1c }), sys(S.PSET),
      ...set({ 0: -1, 1: 0, 2: 3 }), sys(S.PSET), // off-screen: ignored
      ...set({ 0: 5, 1: 6 }), sys(S.PGET), ins('ST', 0, 0, R),
      ...set({ 0: 200, 1: 6 }), sys(S.PGET), ins('ST', 0, 0, R + 2),
    ]);
    vm.step(0);
    expect(px(vm, 5, 6)).toBe(0xc);
    expect(vm.read16(R)).toBe(0xc);
    expect(vm.read16(R + 2)).toBe(0);
  });

  it('RECTFILL clips at the screen edge, RECT draws only the outline', () => {
    const vm = build([
      ...set({ 0: 120, 1: -2, 2: 20, 3: 5, 4: 9 }), sys(S.RECTFILL),
      ...set({ 0: 10, 1: 10, 2: 4, 3: 3, 4: 8 }), sys(S.RECT),
    ]);
    vm.step(0);
    let filled = 0;
    for (let i = 0; i < vm.fb.length; i++) if (vm.fb[i] === 9) filled++;
    expect(filled).toBe(8 * 3);
    expect([px(vm, 10, 10), px(vm, 13, 10), px(vm, 10, 12), px(vm, 13, 12)]).toEqual([8, 8, 8, 8]);
    expect([px(vm, 11, 11), px(vm, 12, 11)]).toEqual([0, 0]);
  });

  it('LINE draws both endpoints and a diagonal', () => {
    const vm = build([...set({ 0: 0, 1: 0, 2: 5, 3: 5, 4: 3 }), sys(S.LINE)]);
    vm.step(0);
    for (let i = 0; i <= 5; i++) expect(px(vm, i, i)).toBe(3);
    expect(px(vm, 1, 0)).toBe(0);
  });

  const sprite = [
    0x10, 0x00, 0x00, 0x02, // row 0: pixel0 = 1, pixel7 = 2
    ...new Array(24).fill(0),
    0x30, 0x00, 0x00, 0x04, // row 7: pixel0 = 3, pixel7 = 4
  ];
  it('SPR draws 8x8 4bpp with transparency and flips', () => {
    // 12 instructions + RET: rodata starts at 4 + 13 * 4
    const prog: Prog = [...set({ 0: 11 }), sys(S.CLS)];
    const a = 4 + (2 + 5 + 5 + 1) * 4;
    prog.push(...set({ 0: a, 1: 10, 2: 20, 3: 0 }), sys(S.SPR));
    prog.push(...set({ 0: a, 1: 30, 2: 20, 3: 3 }), sys(S.SPR));
    const v = build(prog, sprite);
    v.step(0);
    expect(v.fault).toBeNull();
    expect([px(v, 10, 20), px(v, 17, 20), px(v, 10, 27), px(v, 17, 27), px(v, 11, 20)]).toEqual([1, 2, 3, 4, 11]);
    // flipped x and y: pixel (0,0) of the sprite lands at (7,7)
    expect([px(v, 37, 27), px(v, 30, 27), px(v, 37, 20), px(v, 30, 20)]).toEqual([1, 2, 3, 4]);
  });

  it('MAP draws tiles; tile 0 is empty', () => {
    // rodata: tiles (tile 0 unused, tile 1 = solid colour 6), then a 3x2 map
    const solid = new Array(32).fill(0x66);
    const tiles = [...new Array(32).fill(0), ...solid];
    const map = [1, 0, 1, 0, 1, 0];
    const prog: Prog = [];
    const base = 4 + (6 + 1 + 1) * 4;
    prog.push(...set({ 0: base + 64, 1: base, 2: 3, 3: 2, 4: 4, 5: 8 }), sys(S.MAP));
    const vm = build(prog, [...tiles, ...map]);
    vm.step(0);
    expect(vm.fault).toBeNull();
    expect([px(vm, 4, 8), px(vm, 11, 15), px(vm, 12, 8), px(vm, 20, 8), px(vm, 12, 16), px(vm, 4, 16)]).toEqual([6, 6, 0, 6, 6, 0]);
  });

  it('TEXT draws the built-in font, handles newline and returns the end x; NUM draws decimals', () => {
    const str = [...'A1\nB'].map((c) => c.charCodeAt(0)).concat(0);
    const prog: Prog = [];
    const base = 4 + (4 + 1 + 1 + 4 + 1 + 1 + 1) * 4;
    prog.push(...set({ 0: base, 1: 2, 2: 3, 3: 15 }), sys(S.TEXT), ins('ST', 0, 0, R));
    prog.push(...set({ 0: 1234, 1: 50, 2: 50, 3: 14 }), sys(S.NUM), ins('ST', 0, 0, R + 2));
    const vm = build(prog, str);
    vm.step(0);
    expect(vm.fault).toBeNull();
    // 'A' = .#. / #.# / ### / #.# / #.#
    expect([px(vm, 2, 3), px(vm, 3, 3), px(vm, 2, 5), px(vm, 4, 5)]).toEqual([0, 15, 15, 15]);
    // 'B' on the second line at y = 3 + 6
    expect(px(vm, 2, 9)).toBe(15);
    expect(vm.read16(R)).toBe(2 + 4); // after one char on line 2
    expect(vm.read16(R + 2)).toBe(50 + 4 * 4);
    let yellow = 0;
    for (const c of vm.fb) if (c === 14) yellow++;
    expect(yellow).toBeGreaterThan(20);
  });

  it('syscalls preserve every register except the r0 result', () => {
    const prog: Prog = [...set({ 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8 }), sys(S.RND)];
    for (let r = 1; r < 8; r++) prog.push(ins('ST', r, 0, R + r * 2));
    const vm = build(prog);
    vm.step(0);
    for (let r = 1; r < 8; r++) expect(vm.read16(R + r * 2)).toBe(r + 1);
  });
});

describe('input, collision, rng, sound, frame', () => {
  it('BTN reports held buttons and BTNP only new presses', () => {
    const vm = build([sys(S.BTN), ins('ST', 0, 0, R), sys(S.BTNP), ins('ST', 0, 0, R + 2)]);
    const f = (b: number) => {
      vm.step(b);
      return [vm.read16(R), vm.read16(R + 2)];
    };
    expect(f(BUTTONS.LEFT)).toEqual([1, 1]);
    expect(f(BUTTONS.LEFT | BUTTONS.A)).toEqual([17, 16]);
    expect(f(BUTTONS.A)).toEqual([16, 0]);
    expect(f(0)).toEqual([0, 0]);
    expect(f(0xff)).toEqual([63, 63]); // only six buttons exist
  });

  it.each([
    [[0, 0, 10, 10, 5, 5, 10, 10], 1],
    [[0, 0, 10, 10, 10, 0, 5, 5], 0], // touching edges do not overlap
    [[-5, -5, 6, 6, 0, 0, 2, 2], 1], // signed coordinates
    [[0, 0, 0, 10, 0, 0, 10, 10], 0], // zero width
  ])('OVERLAP %j -> %d', (rect, expected) => {
    const vm = build([...set(Object.fromEntries(rect.map((v, i) => [i, v]))), sys(S.OVERLAP), ins('ST', 0, 0, R)]);
    vm.step(0);
    expect(vm.read16(R)).toBe(expected);
  });

  it('RND is in range, seeded, and reproducible', () => {
    const run = (seed: number) => {
      const vm = build([...set({ 0: 6 }), sys(S.RND), ins('ST', 0, 0, R)], [], [], seed);
      const out: number[] = [];
      for (let i = 0; i < 300; i++) {
        vm.step(0);
        out.push(vm.read16(R));
      }
      return out;
    };
    const a = run(42);
    expect(a.every((v) => v >= 0 && v < 6)).toBe(true);
    expect(new Set(a).size).toBe(6);
    expect(run(42)).toEqual(a);
    expect(run(43)).not.toEqual(a);
  });

  it('SOUND and SFX produce audio commands for the frame', () => {
    const sound = [2, 0, 12, 6, 0, 0xb8, 0x01, 0, 0, 2, 15, 20, 0, 200, 0, 0xfb, 0xff];
    const vm = build([...set({ 0: 1, 1: 880, 2: 10, 3: 9 }), sys(S.SOUND), ...set({ 0: 1 }), sys(S.SFX), ...set({ 0: 7 }), sys(S.SFX)], [], sound);
    const cmds = vm.step(0);
    expect(cmds).toEqual([
      { channel: 1, freq: 880, duration: 10, volume: 9, sweep: 0 },
      { channel: 2, freq: 200, duration: 20, volume: 15, sweep: -5 },
    ]); // unknown sfx id 7: nothing
    expect(vm.step(0).length).toBe(3 - 1); // commands are per frame
  });

  it('FRAME returns the frame counter', () => {
    const vm = build([sys(S.FRAME), ins('ST', 0, 0, R)]);
    for (let i = 0; i < 5; i++) vm.step(0);
    expect(vm.read16(R)).toBe(4);
  });

  it('unknown syscall faults', () => {
    const vm = build([sys(99)]);
    vm.step(0);
    expect(vm.fault).toMatch(/unknown syscall 99/);
  });
});

describe('cycle budget', () => {
  it('an infinite loop ends the frame deterministically and the VM keeps running', () => {
    // update: [R] += 1 ; loop forever
    const body: Prog = [ins('LD', 0, 0, R), ins('ADD', 0, 0, 1), ins('ST', 0, 0, R), ins('JMP', 0, 0, 4 + 3 * 4)];
    const mk = () => vmFor(body, { cycles: 1000 });
    const a = mk();
    const b = mk();
    const ha: string[] = [];
    const hb: string[] = [];
    for (let i = 0; i < 10; i++) {
      a.step(0);
      b.step(0);
      ha.push(a.stateHash());
      hb.push(b.stateHash());
    }
    expect(a.overruns).toBe(10);
    expect(a.cyclesLastFrame).toBe(1000);
    expect(a.read16(R)).toBe(10); // restarted from the entry every frame
    expect(a.fault).toBeNull();
    expect(ha).toEqual(hb);
  });

  it('the default budget is 50 000 cycles; syscalls cost 8', () => {
    const vm = vmFor([ins('SYS', 0, 0, S.FRAME), ins('JMP', 0, 0, 4)]);
    vm.step(0);
    expect(vm.overruns).toBe(1);
    expect(vm.cyclesLastFrame).toBeGreaterThanOrEqual(50_000);
    expect(vm.cyclesLastFrame).toBeLessThan(50_008);
  });
});
