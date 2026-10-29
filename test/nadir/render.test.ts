// PLAN.md M26: the renderer against the floating-point oracle and DESIGN.md's light rule, in every frame of the
// fly-through; coverage; the hard per-frame budget. (The M26 cycle gate itself is in gate.test.ts.)
import { describe, expect, it } from 'vitest';
import { VM, expandInputs } from '@qrc/vm';
import { castRef, colOff, readRefMap, refLevel, refLight } from './ref';
import { buildNadir, loadReplay, runReplay } from './play';

const map = readRefMap('proto');
const W = map.grid[0]!.length;

/**
 * True if the oracle's ray passes the engine's face (cell * 4 + side) within the fixed-point error before its own
 * hit: max(0.02, t / 128) cells beyond either end of the face (u8.8 positions, half-step angles and DDA rounding).
 */
function nearMiss(face: number, r: ReturnType<typeof castRef>, x: number, y: number, a: number, c: number): boolean {
  const cell = face >> 2;
  const side = face & 3;
  const fx = cell % W;
  const fy = Math.floor(cell / W);
  const th = ((a + colOff(c) + 0.5) * 2 * Math.PI) / 4096;
  const dx = Math.cos(th);
  const dy = Math.sin(th);
  const eps = Math.max(0.02, r.t / 128);
  let t: number;
  let along: number;
  let lo: number;
  if (side < 2) {
    const px = side === 0 ? fx : fx + 1;
    t = (px - x) / dx;
    along = y + t * dy;
    lo = fy;
  } else {
    const py = side === 2 ? fy : fy + 1;
    t = (py - y) / dy;
    along = x + t * dx;
    lo = fx;
  }
  return t > 0 && t <= r.t + eps && along > lo - eps && along < lo + 1 + eps;
}
const light = refLight(map);

describe('M26 renderer', () => {
  it('the fly-through replays with its committed per-frame hashes, no fault, no overrun, <= 25 000 cycles per frame', async () => {
    const n = await buildNadir();
    const run = runReplay(n, 'm26-fly');
    expect(run.rf.frames).toBeGreaterThanOrEqual(1200);
    expect(run.vm.fault).toBeNull();
    expect(run.vm.overruns).toBe(0);
    expect(run.hashMismatch, `first differing frame ${run.hashMismatch}`).toBe(-1);
    expect(run.expectedFrames).toBe(run.rf.frames);
    console.log(`[budget] m26-fly: ${run.rf.frames} frames, max ${run.max}, mean ${run.mean.toFixed(0)} cycles per frame`);
    expect(run.max).toBeLessThanOrEqual(25_000);
  });

  it('every column of every frame matches the floating-point raycaster (face, height, texture u) and the light rule', async () => {
    const n = await buildNadir();
    let cols = 0;
    let corner = 0;
    let faceOk = 0;
    let faceN = 0;
    let h1 = 0;
    let h2 = 0;
    let uOk = 0;
    let lvlOk = 0;
    const bad: string[] = [];
    runReplay(n, 'm26-fly', (f, vm) => {
      const cx = vm.read16(n.S('cam_x')) / 256;
      const cy = vm.read16(n.S('cam_y')) / 256;
      const ca = vm.read16(n.S('cam_a'));
      const tick = vm.read16(n.S('tick'));
      for (let c = 0; c < 64; c++) {
        cols++;
        const r = castRef(map, cx, cy, ca, c);
        const face = vm.read16(n.S('col_face') + 2 * c);
        const h = vm.read16(n.S('col_h') + 2 * c);
        const front = vm.read16(n.S('col_front') + 2 * c);
        const lvl = vm.read8(n.S('col_lvl') + c);
        // the light level follows DESIGN §3.5 from the column's own height and cell in front
        if (lvl === refLevel(map, light, front, h, c, tick)) lvlOk++;
        else if (bad.length < 10) bad.push(`frame ${f + 1} col ${c}: level ${lvl}, rule ${refLevel(map, light, front, h, c, tick)}`);
        if (r.frac < 0.02 || r.frac > 0.98) {
          corner++;
          continue;
        }
        if (face !== r.face && nearMiss(face, r, cx, cy, ca, c)) {
          corner++; // the oracle's ray passes the engine's face within the fixed-point error: a corner case
          continue;
        }
        faceN++;
        if (face !== r.face) {
          if (bad.length < 10) bad.push(`frame ${f + 1} col ${c}: face ${face}, oracle ${r.face}`);
          continue;
        }
        faceOk++;
        if (front !== r.front && bad.length < 10) bad.push(`frame ${f + 1} col ${c}: front ${front}, oracle ${r.front}`);
        const dh = Math.abs(h - r.h);
        if (dh <= Math.max(1, r.h / 64)) h1++;
        if (dh <= Math.max(2, r.h / 32)) h2++;
        else if (bad.length < 10) bad.push(`frame ${f + 1} col ${c}: h ${h}, oracle ${r.h.toFixed(2)}`);
        const du = Math.abs(vm.read8(n.S('col_u') + c) - r.u);
        if (du <= 1 || du === 31) uOk++;
      }
    });
    console.log(`[oracle] ${cols} columns (${corner} within 0.02 cells of a corner): face ${((100 * faceOk) / faceN).toFixed(3)} %, height ±max(1, h/64) ${((100 * h1) / faceOk).toFixed(2)} %, ±max(2, h/32) ${((100 * h2) / faceOk).toFixed(2)} %, u ±1 ${((100 * uOk) / faceOk).toFixed(2)} %, light level ${((100 * lvlOk) / cols).toFixed(2)} %`);
    expect(faceOk / faceN).toBeGreaterThanOrEqual(0.995);
    expect(h1 / faceOk).toBeGreaterThanOrEqual(0.99);
    expect(h2, bad.join('\n')).toBe(faceOk);
    expect(uOk / faceOk).toBeGreaterThanOrEqual(0.99);
    expect(lvlOk, bad.join('\n')).toBe(cols);
  });

  it('coverage: two runs that differ only in the CLS colour differ only where the background is transparent (black far band)', async () => {
    const n = await buildNadir();
    const rf = loadReplay('m26-fly');
    const inputs = expandInputs(rf.inputs, rf.frames);
    const a = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
    const b = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
    a.write16(n.S('dbg_sentinel'), 6);
    b.write16(n.S('dbg_sentinel'), 11);
    let checked = 0;
    let problems = 0;
    for (let f = 0; f < rf.frames; f++) {
      a.step(inputs[f]!);
      b.step(inputs[f]!);
      if (f % 10 !== 9) continue;
      checked++;
      // the background tile under each differing pixel must be transparent there
      const zone = a.read16(n.S('cam_zone'));
      const bob = a.read16(n.S('bob')) << 16 >> 16;
      const base = n.S('bgram') + zone * n.S('BG_ZONE_BYTES');
      for (let i = 0; i < 128 * 128; i++) {
        if (a.fb[i] === b.fb[i]) continue;
        const x = i & 127;
        const y = i >> 7;
        const ty = y - bob + 8;
        const row = ty >> 3;
        const byte = a.read8(base + row * 32 + (ty & 7) * 4 + (x >> 1 & 3));
        const px = x & 1 ? byte & 15 : byte >> 4;
        if (px !== 0) problems++;
      }
    }
    console.log(`[coverage] ${checked} frames checked, ${problems} pixels left unwritten outside the transparent band`);
    expect(problems).toBe(0);
  });
});
