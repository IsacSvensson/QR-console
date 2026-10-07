import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { BUTTONS, VM, expandInputs, type ReplayFile } from '@qrc/vm';
import { GAME_DIR, LEVEL_IDS, type Sixten, buildSixten, readLevel, symbol, vmInLevel } from './oracle';

// M28 acceptance: the side view as a code overlay (PLAN.md Part 4). The side views' tiles are read from the .side
// sources and DESIGN §3.2's tile table with the test's own parsers.
let sx: Sixten;
beforeAll(async () => {
  sx = await buildSixten();
});
const S = (n: string) => symbol(sx.sym, n);
const OVL_RAM = 0xe000;

// ---- DESIGN §3.2: the side tiles, and the .side sources -----------------------------------------------
const SIDE_FLAGS: Map<string, 'fast' | 'klättra' | '–'> = (() => {
  const text = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');
  const start = text.indexOf('| Tecken | Tile i sidovyn | Fast/klättra |');
  const m = new Map<string, 'fast' | 'klättra' | '–'>();
  for (const line of text.slice(start).split('\n').slice(2)) {
    if (!line.startsWith('|')) break;
    const cols = line.split('|').slice(1, -1).map((c) => c.trim());
    const flag = cols[2] as 'fast' | 'klättra' | '–';
    const range = /^`(.)`–`(.)`$/.exec(cols[0]!);
    if (range) for (let c = range[1]!.charCodeAt(0); c <= range[2]!.charCodeAt(0); c++) m.set(String.fromCharCode(c), flag);
    else m.set(/^`(.)`$/.exec(cols[0]!)![1]!, flag);
  }
  return m;
})();
interface RefSide { id: string; wind: number; right: string; rows: string[]; w: number; start: [number, number] }
const SIDE_IDS = readdirSync(join(GAME_DIR, 'levels')).filter((f) => f.endsWith('.side')).map((f) => f.slice(0, -5)).sort();
function readSide(id: string): RefSide {
  const lines = readFileSync(join(GAME_DIR, 'levels', `${id}.side`), 'utf8').split(/\r?\n/);
  const k = lines.indexOf('cells:');
  const head = Object.fromEntries(lines.slice(0, k).filter((l) => /^\w+:/.test(l)).map((l) => [l.split(':')[0]!, l.slice(l.indexOf(':') + 1).split('#')[0]!.trim()]));
  const rows = lines.slice(k + 1, k + 15);
  const w = Math.max(...rows.map((r) => r.length));
  return { id, wind: Number(head.wind), right: head.right!, rows: rows.map((r) => r.padEnd(w)), w, start: head.start!.split(/\s+/).map(Number) as [number, number] };
}
const flagAt = (s: RefSide, x: number, y: number) => {
  if (y >= 14 * 8) return 'fast';
  if (y < 0 || x < 0 || x >= s.w * 8) return '–';
  return SIDE_FLAGS.get(s.rows[y >> 3]![x >> 3]!)!;
};
const DIR: Record<string, number> = { 'Ö': 0, N: 4, V: 8, S: 12 };

// ---- one run of the T4 replay with a tracer --------------------------------------------------------
interface Fr { f: number; modeBefore: number; modeAfter: number; inOverlay: boolean; side: string | null; x16: number; y16: number; dx: number; crouch: number; climb: number; lee: number; face: number; dir: number; cell: number; fb: string }
let run: { frames: Fr[]; firstOverlayOk: boolean | null; cycles: number };
function play() {
  if (run) return run;
  const rf = JSON.parse(readFileSync(join(GAME_DIR, 'replays', 'm28-t4.json'), 'utf8')) as ReplayFile & { frames: number };
  const vm = VM.fromCartridge(sx.cart, { seed: rf.seed ?? 1 });
  const inputs = expandInputs(rf.inputs, rf.frames);
  const u = (n: string) => vm.read16(S(n));
  const ovl = overlayBytes();
  let inOverlay: boolean;
  let firstOverlayOk: boolean | null = null;
  vm.tracer = (pc: number) => {
    if (pc >= OVL_RAM && pc < OVL_RAM + ovl.length) {
      if (firstOverlayOk === null) firstOverlayOk = ovl.every((b, i) => vm.read8(OVL_RAM + i) === b);
      inOverlay = true;
    }
  };
  const frames: Fr[] = [];
  let cycles = 0;
  for (let f = 0; f < rf.frames; f++) {
    const modeBefore = u('mode');
    inOverlay = false;
    vm.step(inputs[f]!);
    cycles = Math.max(cycles, vm.cyclesLastFrame);
    const side = u('mode') === S('M_SIDE') ? SIDE_IDS[(u('sd_rec') - S('side_table')) / 16]! : null;
    frames.push({
      f, modeBefore, modeAfter: u('mode'), inOverlay, side, x16: u('sd_x'), y16: u('sd_y'), dx: (u('sd_dx') << 16) >> 16, crouch: u('sd_crouch'), climb: u('sd_climb'),
      lee: u('sd_lee'), face: u('sd_face'), dir: u('sd_dir'), cell: u('cell_i'), fb: vm.frameHash(),
    });
  }
  run = { frames, firstOverlayOk, cycles };
  return run;
}
/** the overlay's bytes, as assembled into xdata */
function overlayBytes(): Uint8Array {
  const a = S('ovl_side') - 0x10000;
  const b = S('ovl_side_end') - 0x10000;
  return sx.cart.sections.xdata!.subarray(a, b);
}

describe('the side-view engine is a code overlay', () => {
  it('RAM variables stay below the overlay area; ROM and the overlay are reported', () => {
    const vars = [...sx.asm.symbolKinds].filter(([, k]) => k === 'var').map(([n]) => S(n));
    expect(Math.max(...vars)).toBeLessThan(OVL_RAM - 1024); // and room for the stack's neighbours
    const s = sx.cart.sections;
    const rom = s.code.length + s.rodata.length + s.sound.length;
    console.log(`[size] sixten: ROM ${rom} B; the side-view overlay ${overlayBytes().length} B of code in xdata (not in ROM)`);
  });

  it('every jump inside the overlay lands inside it; calls go into it or into ROM code', () => {
    const o = overlayBytes();
    expect(o.length % 4).toBe(0);
    let jumps = 0;
    for (let i = 0; i < o.length; i += 4) {
      const op = o[i]!;
      const imm = o[i + 2]! | (o[i + 3]! << 8);
      if (op < 0x13 || op > 0x1c) continue;
      expect(o[i + 1]! & 0x80, `instruction at +${i}: an immediate target`).toBe(0x80);
      const inside = imm >= OVL_RAM && imm < OVL_RAM + o.length;
      if (op === 0x1c) expect(inside || imm < sx.cart.sections.code.length, `CALL at +${i} to ${imm.toString(16)}`).toBe(true);
      else expect(inside, `jump at +${i} to ${imm.toString(16)}`).toBe(true);
      jumps++;
    }
    expect(jumps).toBeGreaterThan(50);
  });

  it('it is copied to RAM before its first instruction runs; it runs in side-view frames and never in top-down frames', () => {
    const r = play();
    expect(r.firstOverlayOk).toBe(true);
    let side = 0;
    for (const fr of r.frames) {
      if (fr.modeBefore === S('M_SIDE') && fr.modeAfter === S('M_SIDE')) {
        expect(fr.inOverlay, `frame ${fr.f + 1}`).toBe(true);
        side++;
      }
      if (fr.modeBefore === S('M_PLAY') && fr.modeAfter === S('M_PLAY')) expect(fr.inOverlay, `frame ${fr.f + 1}`).toBe(false);
    }
    expect(side).toBeGreaterThan(500);
    console.log(`[cycles] m28-t4 (traced): max ${r.cycles} per frame`);
    expect(r.cycles).toBeLessThanOrEqual(25000);
  });

  it('entering and leaving the cave twice with the same inputs gives the same frames both times', () => {
    const visits: string[][] = [];
    let cur: string[] | null = null;
    for (const fr of play().frames) {
      if (fr.side === 'T4-cave') (cur ??= (visits.push([]), visits[visits.length - 1]!)).push(fr.fb);
      else cur = null;
    }
    expect(visits.length).toBe(2);
    expect(visits[1]).toEqual(visits[0]);
  });
});

describe('the side view', () => {
  it('in every frame his body overlaps no solid tile of the .side source (DESIGN §3.2 tile table)', () => {
    for (const fr of play().frames) {
      if (!fr.side || fr.modeBefore !== S('M_SIDE')) continue;
      const s = readSide(fr.side);
      const x = fr.x16 >> 4;
      const y = fr.y16 >> 4;
      const h = fr.crouch ? 9 : 14;
      for (const px of [x - 3, x + 2])
        for (const py of [y - 1, y - 8, y - h]) expect(flagAt(s, px, py), `${fr.side} frame ${fr.f + 1}: ${px},${py}`).not.toBe('fast');
    }
  });

  it('the wind pushes by exactly its speed each frame unless he is in the lee (computed from the source) or climbs', () => {
    let pushed = 0;
    let sheltered = 0;
    const fr = play().frames;
    for (let i = 1; i < fr.length; i++) {
      const a = fr[i - 1]!;
      const b = fr[i]!;
      if (!b.side || a.side !== b.side || b.modeBefore !== S('M_SIDE')) continue;
      const s = readSide(b.side);
      if (!s.wind) continue;
      // the lee, from the source: solid within 14 px upwind at the feet (and the head, standing). The engine decides
      // it before the horizontal move: at last frame's x and this frame's y.
      const up = s.wind < 0 ? 1 : -1;
      const x = a.x16 >> 4;
      const y = b.y16 >> 4;
      const solidUp = (py: number) => [6, 14].some((d) => flagAt(s, x + up * d, py) === 'fast');
      const want = solidUp(y - 4) && (b.crouch === 1 || solidUp(y - 12));
      expect(b.lee, `${b.side} frame ${b.f + 1}: lee`).toBe(want ? 1 : 0);
      const moved = b.x16 - a.x16;
      const expected = b.dx + (b.lee || b.climb ? 0 : s.wind);
      if (moved !== 0) expect(moved, `${b.side} frame ${b.f + 1}`).toBe(expected);
      if (b.dx === 0 && !b.lee && !b.climb && moved === s.wind) pushed++;
      if (b.dx === 0 && b.lee && moved === 0) sheltered++;
    }
    expect(pushed, 'frames standing, pushed by the wind').toBeGreaterThan(20);
    expect(sheltered, 'frames standing in the lee, not moved').toBeGreaterThan(50);
  });

  it('chocolate: the wind does not push him (test hooks)', () => {
    const vm = vmInLevel(sx, 'T4');
    const L = readLevel('T4');
    vm.write16(S('dbg_pw'), 3 + 1);
    vm.write16(S('dbg_goto'), 3 * L.w + 1 + 1); // (1, 3), north of the ravine's cell
    vm.step(0);
    vm.step(BUTTONS.DOWN); // face south (the water blocks)
    vm.step(0);
    vm.step(BUTTONS.A);
    for (let i = 0; i < 5; i++) vm.step(0);
    expect(vm.read16(S('mode'))).toBe(S('M_SIDE'));
    const x0 = vm.read16(S('sd_x'));
    for (let i = 0; i < 40; i++) vm.step(0);
    expect(vm.read16(S('sd_x'))).toBe(x0);
    vm.write16(S('pw'), 0);
    for (let i = 0; i < 10; i++) vm.step(0);
    expect(vm.read16(S('sd_x'))).toBe(x0 - 6 * 10);
  });

  it('A facing a linked cell starts its side view at its start; leaving at an edge puts him on that edge`s cell', () => {
    const L = readLevel('T4');
    const links = readFileSync(join(GAME_DIR, 'levels', 'T4.map'), 'utf8').split(/\r?\n/).filter((l) => l.startsWith('side:')).map((l) => {
      const t = l.slice(5).split('#')[0]!.trim().split(/\s+/);
      return { cell: Number(t[1]) * L.w + Number(t[0]), side: t[2]!, exitL: Number(t[4]) * L.w + Number(t[3]), exitR: Number(t[6]) * L.w + Number(t[5]) };
    });
    const fr = play().frames;
    const seen = new Set<string>();
    for (let i = 1; i < fr.length; i++) {
      const a = fr[i - 1]!;
      const b = fr[i]!;
      if (a.modeAfter === S('M_PLAY') && b.modeAfter === S('M_SIDE')) {
        const s = readSide(b.side!);
        const link = links.find((k) => k.side === b.side)!;
        expect(link, b.side!).toBeTruthy();
        expect([b.x16, b.y16]).toEqual([(s.start[0] * 8 + 4) * 16, (s.start[1] + 1) * 8 * 16]);
        seen.add(`in ${b.side}`);
      }
      if (a.modeAfter === S('M_SIDE') && b.modeAfter === S('M_PLAY')) {
        const link = links.find((k) => k.side === a.side)!;
        const left = a.x16 >> 4 < 10;
        expect(b.cell, `${a.side}: out at the ${left ? 'left' : 'right'}`).toBe(left ? link.exitL : link.exitR);
        seen.add(`out ${a.side} ${left ? 'L' : 'R'}`);
      }
    }
    expect([...seen].sort()).toEqual(['in T4-cave', 'in T4-cliff', 'in T4-ravine', 'out T4-cave L', 'out T4-cliff R', 'out T4-ravine L', 'out T4-ravine R']);
  });

  it('the compass shows the way he faces: the side view`s right edge, or the opposite when he faces left', () => {
    let n = 0;
    for (const fr of play().frames) {
      if (!fr.side || fr.modeBefore !== S('M_SIDE') || fr.modeAfter !== S('M_SIDE')) continue;
      const right = DIR[readSide(fr.side).right]!;
      expect(fr.dir, `${fr.side} frame ${fr.f + 1}`).toBe(fr.face ? (right + 8) % 16 : right);
      n++;
    }
    expect(n).toBeGreaterThan(500);
  });

  it('the level list has the side-view test level', () => {
    expect(LEVEL_IDS).toContain('T4');
    expect(SIDE_IDS).toEqual(['T4-cave', 'T4-cliff', 'T4-ravine']);
  });
});
