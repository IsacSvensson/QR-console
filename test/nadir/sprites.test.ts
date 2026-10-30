// PLAN.md M28: sprites and props against DESIGN §3.12 as read by test/nadir/ref.ts: the rectangle lists against the
// source pixels, the projection, LODs, budget and order of every image of every replay, occlusion (two VMs), and the
// cost of drawing them in the stress replay.
import { describe, expect, it } from 'vitest';
import { VM, expandInputs } from '@qrc/vm';
import { K, T, readRefMap, readRefSprites, refK, refLod } from './ref';
import { REPLAYS, buildNadir, loadReplay, runReplay, type Nadir } from './play';

const map = readRefMap('nadir');
const sprites = readRefSprites();
const LIMITS = [48, 20, 8];

/** the rectangle list of sprite type t at LOD k, read from the cartridge's ROM */
function romRects(n: Nadir, vm: VM, t: number, k: number) {
  const e = n.S('spr_type') + 16 * t;
  let p = vm.read16(e + 6 + 2 * k);
  const out: { x0: number; y0: number; x1: number; y1: number; c: number }[] = [];
  while (vm.read8(p) !== 255) {
    out.push({ x0: vm.read8(p), y0: vm.read8(p + 1), x1: vm.read8(p + 2), y1: vm.read8(p + 3), c: vm.read8(p + 4) });
    p += 5;
  }
  return out;
}

interface Rec {
  prop: number;
  z: number;
  h: number;
  s: number;
  cx: number;
  hgt: number;
  wid: number;
  left: number;
  top: number;
  lod: number;
  type: number;
}
const s16 = (v: number) => (v << 16) >> 16;
function records(n: Nadir, vm: VM): { cand: Rec[]; drawn: Rec[] } {
  const cn = vm.read16(n.S('spr_cn'));
  const o0 = vm.read16(n.S('spr_o0')) / 2;
  const rd = (a: number): Rec => ({
    prop: (vm.read16(a) - n.S('props')) / 8,
    z: s16(vm.read16(a + 2)),
    h: vm.read16(a + 4),
    s: vm.read16(a + 6),
    cx: s16(vm.read16(a + 8)),
    hgt: vm.read16(a + 10),
    wid: vm.read16(a + 12),
    left: s16(vm.read16(a + 14)),
    top: s16(vm.read16(a + 16)),
    lod: vm.read16(a + 18),
    type: (vm.read16(a + 20) - n.S('spr_type')) / 16,
  });
  const ord = Array.from({ length: cn }, (_, i) => rd(vm.read16(n.S('spr_ord') + 2 * i)));
  return { cand: ord, drawn: ord.slice(o0) };
}

describe('M28 sprites', () => {
  it('every rectangle list, drawn at 1x-4x with DESIGN §3.12\'s edge formula, equals nearest-neighbour upscaling of its source; LOD limits', async () => {
    const n = await buildNadir();
    const vm = VM.fromCartridge(n.cart, { seed: 1 });
    expect(n.S('NUM_SPR_TYPES')).toBe(sprites.length);
    const counts: string[] = [];
    sprites.forEach((sp, t) => {
      const e = n.S('spr_type') + 16 * t;
      expect([vm.read8(e), vm.read8(e + 1), vm.read8(e + 2), vm.read8(e + 3), vm.read16(e + 4)], sp.name).toEqual([sp.w, sp.h, refK(sp), sp.pick, sp.block]);
      for (let k = 0; k < 3; k++) {
        const src = refLod(sp.px, k);
        const rects = romRects(n, vm, t, k);
        expect(rects.length, `${sp.name} LOD ${k}`).toBeLessThanOrEqual(LIMITS[k]!);
        expect(vm.read8(e + 12 + k)).toBe(rects.length);
        // the LOD image's pixel (bx, by) covers source pixels [bx 2^k, (bx + 1) 2^k) clipped to the source
        for (let s = 1; s <= 4; s++) {
          const W = sp.w * s;
          const H = sp.h * s;
          const img = Array.from({ length: H }, () => new Array<number>(W).fill(T));
          for (const r of rects)
            for (let y = (r.y0 * 64 * s + 32) >> 6; y < (r.y1 * 64 * s + 32) >> 6; y++) for (let x = (r.x0 * 64 * s + 32) >> 6; x < (r.x1 * 64 * s + 32) >> 6; x++) img[y]![x] = r.c;
          const nn = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => src[Math.floor(y / s) >> k]![Math.floor(x / s) >> k]!));
          expect(img, `${sp.name} LOD ${k} at ${s}x`).toEqual(nn);
        }
        counts.push(`${sp.name}/${k}: ${rects.length}`);
      }
    });
    console.log(`[sprites] rectangles: ${counts.join(', ')}`);
  });

  for (const name of REPLAYS)
    it(`${name}: projection, LOD, budget and order of the sprites in every image; every prop seen on screen is a candidate`, async () => {
      const n = await buildNadir();
      let images = 0;
      let drawnN = 0;
      let cxOk = 0;
      let hOk = 0;
      let maxDrawn = 0;
      let seen = 0;
      const bad: string[] = [];
      const note = (s: string) => bad.length < 10 && bad.push(s);
      let castOpen = false;
      runReplay(n, name, (f, vm) => {
        // the records are those of the image's rays (they stay while a paced image is drawn)
        if (vm.read16(n.S('pace')) === 1) castOpen = true;
        else if (castOpen) {
          castOpen = false;
          return;
        }
        images++;
        const { cand, drawn } = records(n, vm);
        const cx0 = vm.read16(n.S('rcam_x'));
        const cy0 = vm.read16(n.S('rcam_y'));
        const a = vm.read16(n.S('rcam_a'));
        const th = ((a + 0.5) * 2 * Math.PI) / 4096;
        const hor = 64 + s16(vm.read16(n.S('rbob')));
        maxDrawn = Math.max(maxDrawn, drawn.length);
        // order: far to near; the dropped ones are the farthest
        for (let i = 1; i < cand.length; i++) expect(cand[i]!.z, `frame ${f + 1}: order`).toBeLessThanOrEqual(cand[i - 1]!.z);
        expect(drawn.length).toBe(Math.min(cand.length, K.SPR_MAX!));
        // LOD by height, then the budget: demote the farthest non-LOD-2 one until the rectangles fit
        const lods = drawn.map((r) => (r.hgt >= K.SPR_LOD1_H! ? 0 : r.hgt >= K.SPR_LOD2_H! ? 1 : 2));
        const cnt = (i: number) => vm.read8(n.S('spr_type') + 16 * drawn[i]!.type + 12 + lods[i]!);
        for (;;) {
          if (drawn.reduce((s, _, i) => s + cnt(i), 0) <= K.SPR_RECTS!) break;
          const j = lods.findIndex((l) => l < 2);
          if (j < 0) break;
          lods[j]!++;
        }
        expect(drawn.map((r) => r.lod), `frame ${f + 1}: LODs`).toEqual(lods);
        // projection against floating point (DESIGN §3.12)
        for (const r of drawn) {
          drawnN++;
          const p = map.props[r.prop]!;
          const sp = sprites.find((s) => s.char === p.s)!;
          const dx = Math.round(p.x * 256) - cx0;
          const dy = Math.round(p.y * 256) - cy0;
          const z = dx * Math.cos(th) + dy * Math.sin(th);
          const lat = dy * Math.cos(th) - dx * Math.sin(th);
          const h = (K.F256! / z) * 1;
          const cx = 64 + (lat * h) / 256;
          const hgt = (sp.h * h * refK(sp)) / 2048;
          if (Math.abs(r.cx - cx) <= 1) cxOk++;
          else note(`frame ${f + 1} prop ${r.prop}: cx ${r.cx}, oracle ${cx.toFixed(2)}`);
          if (Math.abs(r.hgt - hgt) <= 1) hOk++;
          else note(`frame ${f + 1} prop ${r.prop}: height ${r.hgt}, oracle ${hgt.toFixed(2)}`);
          expect(r.top + r.hgt, `frame ${f + 1}: stands on the floor`).toBe(hor + (r.h >> 1));
        }
        // every prop that shows on screen (nearer than the wall in a column it covers, by the engine's z-buffer)
        // is a candidate
        map.props.forEach((p, i) => {
          if (vm.read8(n.S('props') + 8 * i + 5) === 0) return;
          const sp = sprites.find((s) => s.char === p.s)!;
          const dx = Math.round(p.x * 256) - cx0;
          const dy = Math.round(p.y * 256) - cy0;
          const z = dx * Math.cos(th) + dy * Math.sin(th);
          if (z < K.SPR_NEAR! + 8 || z > K.SPR_FAR! - 8) return;
          const lat = dy * Math.cos(th) - dx * Math.sin(th);
          const h = K.F256! / z;
          const wid = (sp.w * h * refK(sp)) / 2048;
          const cx = 64 + (lat * h) / 256;
          let shows = false;
          for (let x = Math.ceil(cx - wid / 2 + 1); x < cx + wid / 2 - 1; x++) if (x >= 0 && x < 128 && h > vm.read16(n.S('col_h') + 2 * (x >> 1)) + 1) shows = true;
          if (!shows) return;
          seen++;
          if (!cand.some((r) => r.prop === i)) note(`frame ${f + 1}: prop ${i} shows on screen but is not a candidate`);
          expect(cand.some((r) => r.prop === i), `frame ${f + 1}: prop ${i} shows on screen but is not a candidate`).toBe(true);
        });
      });
      console.log(`[sprites] ${name}: ${images} images, ${drawnN} sprites drawn (at most ${maxDrawn} in one image), ${seen} props on screen; centre x ±1 px ${((100 * cxOk) / Math.max(1, drawnN)).toFixed(2)} %, height ±1 px ${((100 * hOk) / Math.max(1, drawnN)).toFixed(2)} %`);
      expect(cxOk, bad.join('\n')).toBe(drawnN);
      expect(hOk, bad.join('\n')).toBe(drawnN);
      if (name === 'm28-props') expect(maxDrawn).toBe(K.SPR_MAX);
    });

  it('occlusion: with sprites off (two VMs), images differ only inside drawn sprites and only where the sprite is nearer than the wall (m28-props)', async () => {
    const n = await buildNadir();
    const rf = loadReplay('m28-props');
    const inputs = expandInputs(rf.inputs, rf.frames);
    const a = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
    const b = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
    a.step(inputs[0]!);
    b.step(inputs[0]!);
    a.write16(n.S('dbg_flags'), n.S('FL_NOPACE'));
    b.write16(n.S('dbg_flags'), n.S('FL_NOPACE') | n.S('FL_NOSPR'));
    let diff = 0;
    let bad = 0;
    let sprPx = 0;
    for (let f = 1; f < rf.frames; f++) {
      a.step(inputs[f]!);
      b.step(inputs[f]!);
      const { drawn } = records(n, a);
      for (let i = 0; i < 128 * 128; i++) {
        if (a.fb[i] === b.fb[i]) continue;
        diff++;
        const x = i & 127;
        const y = i >> 7;
        const colH = a.read16(n.S('col_h') + 2 * (x >> 1));
        if (!drawn.some((r) => x >= r.left && x < r.left + r.wid && y >= r.top && y < r.top + r.hgt && r.h > colH)) bad++;
      }
      for (const r of drawn) sprPx += Math.max(0, r.wid) * Math.max(0, r.hgt);
    }
    console.log(`[occlusion] ${diff} pixels differ with sprites off, ${bad} outside a sprite that is nearer than the wall there`);
    expect(diff).toBeGreaterThan(10_000);
    expect(bad).toBe(0);
    expect(sprPx).toBeGreaterThan(0);
  });

  it('stress (m28-props, eight sprites drawn): drawing them costs <= 5 000 cycles per frame; the frame <= 25 000', async () => {
    const n = await buildNadir();
    let maxDraw = 0;
    let maxSel = 0;
    let maxFrame = 0;
    let eight = 0;
    const entries = [n.S('draw_sprites'), n.S('spr_frame')];
    runReplay(n, 'm28-props', undefined, (vm) => {
      const ret = [-1, -1];
      const cyc = [0, 0];
      vm.tracer = (pc) => {
        for (let k = 0; k < 2; k++) {
          if (pc === entries[k]) ret[k] = vm.read16(vm.sp);
          else if (pc === ret[k]) ret[k] = -1;
          if (ret[k] >= 0) cyc[k]! += vm.mem[pc] !== 0x20 ? 1 : 8 + (vm.mem[pc + 2] === 17 ? Math.ceil(vm.regs[3]! / 8) : vm.mem[pc + 2] === 18 ? Math.ceil(vm.regs[2]! / 8) : 0);
        }
      };
      const step = vm.step.bind(vm);
      vm.step = (b: number) => {
        cyc[0] = 0;
        cyc[1] = 0;
        const out = step(b);
        if (vm.frame > 1) {
          maxDraw = Math.max(maxDraw, cyc[0]!);
          maxSel = Math.max(maxSel, cyc[1]!);
          maxFrame = Math.max(maxFrame, vm.cyclesLastFrame);
          if (vm.read16(n.S('spr_cn')) - vm.read16(n.S('spr_o0')) / 2 >= 8 && vm.read16(n.S('pace')) === 0) eight++;
        }
        return out;
      };
    });
    console.log(`[stress] m28-props: drawing sprites max ${maxDraw} cycles per frame, choosing them (spr_frame) max ${maxSel}, frame max ${maxFrame}; ${eight} frames drew eight sprites`);
    expect(eight).toBeGreaterThan(0);
    expect(maxDraw).toBeLessThanOrEqual(5_000);
    expect(maxFrame).toBeLessThanOrEqual(25_000);
  });
});
