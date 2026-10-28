import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { replay } from '@qrc/vm';
import { GENERATED, HMAX } from '../../games/fps/tools/tables';
import { type FpsBuild, buildFps, startVM } from '../../games/fps/tools/game';
import { CELL } from '../../games/fps/tools/art';
import {
  type Engine,
  FLASH_PX,
  GAME_DIR,
  GUN_PX,
  LEVEL,
  PERP_MIN,
  SPRITE_SIZES,
  VIEW_H,
  bufPixel,
  castRef,
  enemyPixel,
  loadReplay,
  replayNames,
  runReplay,
  s16,
  textureColumn,
  wallPixel,
} from './oracle';

// M26 acceptance: the FPS spike (PLAN.md Part 4, games/fps/SPIKE.md).
let b: FpsBuild;
beforeAll(async () => {
  b = await buildFps();
});

describe('FPS spike build', () => {
  it('generated files are up to date with the art, the map and the generator', () => {
    for (const [file, gen] of Object.entries(GENERATED)) expect(readFileSync(join(GAME_DIR, file), 'utf8'), file).toBe(gen());
  });

  it('matches the committed cartridge and reports its size', () => {
    expect(Buffer.from(b.bytes).equals(readFileSync(join(GAME_DIR, 'fps.qrc')))).toBe(true);
    const s = b.cart.sections;
    const rom = s.code.length + s.rodata.length + s.sound.length;
    console.log(`[size] fps: cartridge ${b.bytes.length} B, ROM ${rom} B of 32768 (code ${s.code.length}, data ${s.rodata.length}, sound ${s.sound.length}), xdata ${s.xdata?.length ?? 0} B, ISA ${b.cart.header.isaVersion}`);
    expect(rom).toBeLessThanOrEqual(32768);
    expect(b.cart.header.isaVersion).toBe(2);
  });

  it('the trig and reciprocal tables in ROM agree with the maths', () => {
    const vm = startVM(b);
    const sin = b.sym('sin_t');
    for (let a = 0; a < 1280; a++) expect(Math.abs(s16(vm.read16(sin + 2 * a)) / 256 - Math.sin((a / 1024) * 2 * Math.PI))).toBeLessThanOrEqual(0.5 / 256 + 1e-9);
    const rec = b.sym('recip_t');
    for (let i = 2; i < 512; i++) expect(Math.abs(vm.read16(rec + 2 * i) - Math.min(32767, 65536 / i))).toBeLessThanOrEqual(0.5);
  });

  it('the RAM buffer, tables, sprites and stack fit in RAM', () => {
    let top = 0;
    for (const [name, v] of b.asm.symbols) if (v >= 0x8000 && /^[a-z]/.test(name)) top = Math.max(top, v);
    const end = b.sym('spr_ram') + b.sym('SPR_BYTES');
    console.log(`[ram] fps: variables end at 0x${end.toString(16)} (${end - 0x8000} B of 32768); highest variable 0x${top.toString(16)}`);
    expect(end).toBeLessThan(0xff00);
  });
});

interface Stats {
  frames: number;
  maxCycles: number;
  rays: number;
  ambiguous: number;
  images: number;
  problems: string[];
}

/** Every frame of a replay against the oracle: rays, wall columns in the buffer, the presented screen. */
function check(name: string): Stats {
  const st: Stats = { frames: 0, maxCycles: 0, rays: 0, ambiguous: 0, images: 0, problems: [] };
  const fail = (m: string) => {
    if (st.problems.length < 20) st.problems.push(m);
  };
  runReplay(b, name, (e, f, rays, presented) => {
    st.frames++;
    st.maxCycles = Math.max(st.maxCycles, e.vm.cyclesLastFrame);
    if (e.vm.cyclesLastFrame > 25_000) fail(`frame ${f}: ${e.vm.cyclesLastFrame} cycles`);
    const cam = { x: e.s('cx') / 256, y: e.s('cy') / 256, ang: e.r16('cang') };
    const dopen = (cell: number) => e.vm.read8(e.b.sym('dopen') + cell);
    for (const c of rays) {
      st.rays++;
      const cell = e.vm.read8(e.b.sym('rcell') + c);
      const tx = e.vm.read8(e.b.sym('rtx') + c);
      const perp = e.vm.read16(e.b.sym('zb') + 2 * c);
      const h = e.vm.read16(e.b.sym('rh') + 2 * c);
      const u = tx & 15;
      const side = tx >> 4;
      // geometry against the floating-point cast
      const ref = castRef(cam, c, e.nrays, dopen);
      if (ref.hits.some((r) => r.cell !== ref.hits[0]!.cell || r.side !== ref.hits[0]!.side)) st.ambiguous++;
      // the engine's hit must be one of the reference hits: the same cell, or (at a texture edge) the next cell
      // along the same wall line with the same wall code, which shows the same picture (SPIKE.md §3.7)
      const code = LEVEL.cells[cell]!;
      const along = side === 1 ? 1 : 16;
      const edge = (v: number) => v <= 1 || v >= 14;
      const cu = (a: number, b2: number) => Math.min((a - b2 + 16) % 16, (b2 - a + 16) % 16);
      const ok = ref.hits.some((r) => {
        if (r.side !== side || LEVEL.cells[r.cell] !== code) return false;
        if (r.cell !== cell && !(Math.abs(r.cell - cell) === along && (edge(u) || edge(r.u)))) return false;
        const t = ref.tol(r);
        return Math.abs(perp / 256 - Math.max(PERP_MIN, r.perp)) <= t.perp && cu(u, r.u) <= t.u;
      });
      if (!ok) {
        const r = ref.hits[0]!;
        fail(`${name} frame ${f} ray ${c}: hit cell ${cell} side ${side} u ${u} at ${(perp / 256).toFixed(3)}; reference cell ${r.cell} side ${r.side} u ${r.u} at ${r.perp.toFixed(3)} (+- ${ref.tol(r).perp.toFixed(3)}, ${ref.tol(r).u} columns)`);
      }
      if (h !== Math.floor((97 * 256) / perp) || perp < 64) fail(`${name} frame ${f} ray ${c}: height ${h} for distance ${perp}`);
      // the column in the buffer: ceiling, wall texels, floor (SPIKE.md §3.4)
      if (code === CELL.EMPTY) {
        fail(`${name} frame ${f} ray ${c}: hit an empty cell ${cell}`);
        continue;
      }
      const column = textureColumn(code, side, u);
      for (let y = 0; y < VIEW_H; y++) {
        const want = wallPixel(h, y, column) ?? (y < VIEW_H / 2 ? e.b.sym('C_CEIL') : e.b.sym('C_FLOOR'));
        for (let x = c * e.colw; x < (c + 1) * e.colw; x++) {
          const got = bufPixel(e, x, y);
          if (got !== want) {
            fail(`${name} frame ${f} ray ${c}: pixel ${x},${y} is ${got}, want ${want} (h ${h}, u ${u}, side ${side})`);
            y = VIEW_H;
            break;
          }
        }
      }
    }
    if (presented) {
      st.images++;
      checkScreen(e, f, fail);
    }
  });
  return st;
}

/** The screen after an image: the buffer, the enemy where it is nearer than the wall, the gun (SPIKE.md §3.6). */
function checkScreen(e: Engine, f: number, fail: (m: string) => void) {
  const want: number[] = [];
  for (let y = 0; y < VIEW_H; y++) for (let x = 0; x < 128; x++) want.push(bufPixel(e, x, y));
  const put = (x: number, y: number, c: number) => {
    if (c !== 0 && x >= 0 && x < 128 && y >= 0 && y < VIEW_H) want[y * 128 + x] = c;
  };
  // the enemy, from the oracle's own projection
  const estate = e.r16('estate');
  {
    const cam = { x: e.s('cx') / 256, y: e.s('cy') / 256, ang: e.r16('cang') };
    const th = (cam.ang / 1024) * 2 * Math.PI;
    const rx = e.s('ex') / 256 - cam.x;
    const ry = e.s('ey') / 256 - cam.y;
    const depth = rx * Math.cos(th) + ry * Math.sin(th);
    const side = -rx * Math.sin(th) + ry * Math.cos(th);
    const vis = e.r16('e_vis');
    const refVisible = depth >= PERP_MIN + 0.01 && Math.abs(side) < 2 * depth - 0.01 && 0.75 * (97 / depth) >= 4.1;
    if (refVisible && !vis) fail(`frame ${f}: the enemy should be projected (depth ${depth.toFixed(2)}, side ${side.toFixed(2)})`);
    if (vis) {
      const size = SPRITE_SIZES[e.r16('e_size')]!;
      const left = e.s('e_left');
      const top = e.s('e_top');
      const h = 97 / Math.max(depth, 0.25);
      const sx = 64 + (97 * side) / depth;
      // position and size are compared where the enemy's centre is on screen (fmul works to 1/128)
      if (sx >= 0 && sx < 128) {
        if (Math.abs(left + size / 2 - sx) > 2.5) fail(`frame ${f}: enemy centre ${left + size / 2}, reference ${sx.toFixed(1)}`);
        const nearest = SPRITE_SIZES.reduce((best, s) => (Math.abs(s - 0.75 * h) < Math.abs(best - 0.75 * h) ? s : best));
        if (Math.abs(size - 0.75 * h) > Math.abs(nearest - 0.75 * h) + 1.5) fail(`frame ${f}: enemy size ${size}, want about ${(0.75 * h).toFixed(1)}`);
        if (Math.abs(top + size - (48 + h / 2)) > 2.5 + 0.02 * h) fail(`frame ${f}: enemy stands at ${top + size}, floor line ${(48 + h / 2).toFixed(1)}`);
      }
      if ((e.r16('epain') & 2) === 0) {
        const edepth = e.r16('e_depth');
        for (let j = 0; j < size / 8; j++) {
          const mid = left + 8 * j + 4;
          if (mid < 0 || mid >= 128) continue;
          if (edepth >= e.vm.read16(e.b.sym('zb') + 2 * Math.floor(mid / e.colw))) continue;
          for (let y = 0; y < size; y++) for (let x = 0; x < 8; x++) put(left + 8 * j + x, top + y, enemyPixel(estate === 2 ? 'dead' : 'alive', size, 8 * j + x, y));
        }
      }
    }
  }
  if (e.r16('flash') > 0) for (let y = 0; y < 8; y++) for (let x = 0; x < 24; x++) put(52 + x, 72 + y, FLASH_PX[y * 24 + x]!);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++) put(52 + x, 80 + y, GUN_PX[y * 24 + x]!);
  const hurt = e.r16('hurt') > 0;
  for (let y = 0; y < VIEW_H; y++)
    for (let x = 0; x < 128; x++) {
      if (hurt && (x < 2 || x > 125 || y < 2 || y > VIEW_H - 3)) continue;
      const got = e.vm.fb[y * 128 + x]!;
      if (got !== want[y * 128 + x]) {
        fail(`frame ${f}: screen pixel ${x},${y} is ${got}, want ${want[y * 128 + x]}`);
        return;
      }
    }
}

describe.each(replayNames())('replay %s', (name) => {
  it('matches the committed per-frame hashes; no fault, no overrun', () => {
    const rf = loadReplay(name);
    const vm = startVM(b, rf.seed ?? 1);
    const hashes = replay(vm, rf.inputs, rf.frames);
    expect(vm.fault).toBeNull();
    expect(vm.overruns).toBe(0);
    const expected = readFileSync(join(GAME_DIR, 'replays', `${name}.hashes.txt`), 'utf8').trim().split('\n');
    const first = hashes.findIndex((h, i) => h !== expected[i]);
    expect(first, `first differing frame: ${first + 1}`).toBe(-1);
    expect(hashes.length).toBe(expected.length);
  });

  it('every ray, wall column and image agrees with the oracle; every frame within 25 000 cycles', () => {
    const st = check(name);
    console.log(`[fps] ${name}: ${st.frames} frames, ${st.images} images, ${st.rays} rays (${st.ambiguous} where the error budget allows more than one hit), max ${st.maxCycles} cycles per frame`);
    expect(st.problems).toEqual([]);
    expect(st.images).toBeGreaterThan(st.frames / 2 - 2);
  });
});

describe('what the replays demonstrate', () => {
  const sample = (name: string, vars: string[]) => {
    const out: Record<string, number>[] = [];
    runReplay(b, name, (e, _f, _r, presented) => out.push({ ...Object.fromEntries(vars.map((v) => [v, e.s(v)])), presented: presented ? 1 : 0, door74: e.vm.read8(e.b.sym('dopen') + 4 * 16 + 7), door48: e.vm.read8(e.b.sym('dopen') + 8 * 16 + 4) }));
    return out;
  };

  it('spin: a full turn renders at 30 images per second', () => {
    const s = sample('spin', ['ang', 'fps']);
    const angles = new Set(s.map((x) => x.ang));
    expect(angles.size).toBeGreaterThanOrEqual(128);
    expect(s.slice(120).every((x) => x.fps === 30)).toBe(true);
  });

  it('door_fight: the door slides open and shut, three hits kill the enemy, ammo counts down', () => {
    const s = sample('door_fight', ['estate', 'ehp', 'ammo', 'px']);
    const opening = s.map((x) => x.door74);
    expect(opening.some((v) => v > 0 && v < 255)).toBe(true);
    expect(Math.max(...opening)).toBe(255);
    expect(opening[opening.length - 1]).toBe(0);
    const deadAt = s.findIndex((x) => x.estate === 2);
    expect(deadAt).toBeGreaterThan(0);
    expect(s[deadAt]!.ehp).toBe(0);
    const ammoUsed = s[0]!.ammo - s[deadAt]!.ammo;
    expect(ammoUsed).toBeGreaterThanOrEqual(3);
    expect(s.some((x) => x.px > 8 * 256)).toBe(true);
  });

  it('hall: through the south door into the hall', () => {
    const s = sample('hall', ['py']);
    expect(Math.max(...s.map((x) => x.door48))).toBe(255);
    expect(s.some((x) => x.py > 12 * 256)).toBe(true);
  });

  it('hurt: the enemy walks up and hits for 5', () => {
    const s = sample('hurt', ['health', 'estate', 'hurt']);
    const hp = [...new Set(s.map((x) => x.health))];
    expect(hp[0]).toBe(100);
    expect(hp.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < hp.length; i++) expect(hp[i - 1]! - hp[i]!).toBe(5);
    expect(s.some((x) => x.hurt > 0)).toBe(true);
  });

  it('the height table covers every distance the engine can produce', () => {
    expect(Math.floor((97 * 256) / 64)).toBe(HMAX);
  });
});
