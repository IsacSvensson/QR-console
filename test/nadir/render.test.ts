// PLAN.md M26-M27: the renderer against the floating-point oracle and DESIGN.md's light rule in every image of every
// replay (walls, doors, masked planes); coverage; see-through masked walls (two VMs); the hard per-frame budget.
// (The cycle gates themselves are in gate.test.ts.)
import { describe, expect, it } from 'vitest';
import { VM, expandInputs } from '@qrc/vm';
import { K, MASKED_CHARS, MATERIAL_CHARS, castRef, colOff, readRefMap, refLevel, refLight, transparency, type RefHit } from './ref';
import { REPLAYS, buildNadir, loadReplay, runReplay, type Nadir } from './play';


const map = readRefMap('nadir');
const W = map.grid[0]!.length;
const light = refLight(map);

/**
 * True if the oracle's ray passes the engine's face (cell * 4 + side) within the fixed-point error: max(0.02, t / 128)
 * cells beyond either end of the face, before `tmax` (u8.8 positions, half-step angles and DDA rounding). A face of
 * a thin cell (DESIGN §3.10) is its centre plane.
 */
function nearMiss(face: number, tmax: number, x: number, y: number, a: number, c: number): boolean {
  const cell = face >> 2;
  const side = face & 3;
  const fx = cell % W;
  const fy = Math.floor(cell / W);
  const th = ((a + colOff(c) + 0.5) * 2 * Math.PI) / 4096;
  const dx = Math.cos(th);
  const dy = Math.sin(th);
  const eps = Math.max(0.02, tmax / 128);
  const thin = map.grid[fy]![fx] === '+' || MASKED_CHARS.has(map.grid[fy]![fx]!);
  let t: number;
  let along: number;
  let lo: number;
  if (side < 2) {
    const px = thin ? fx + 0.5 : side === 0 ? fx : fx + 1;
    t = (px - x) / dx;
    along = y + t * dy;
    lo = fy;
  } else {
    const py = thin ? fy + 0.5 : side === 2 ? fy : fy + 1;
    t = (py - y) / dy;
    along = x + t * dx;
    lo = fx;
  }
  return t > 0 && t <= tmax + eps && along > lo - eps && along < lo + 1 + eps;
}

interface Image {
  cx: number;
  cy: number;
  ca: number;
  tick: number;
  /** DESIGN §6.1: the muzzle flash's light steps in this image (rflash) */
  flash: number;
  open: (cell: number) => number;
}

/**
 * Runs a replay and calls `onImage` once per image after it is drawn (DESIGN §3.11): with the camera, frame and door
 * openings of the frame whose rays it was cast with.
 */
function eachImage(n: Nadir, name: string, onImage: (f: number, vm: VM, im: Image) => void) {
  let cast: Map<number, number> | null = null;
  const opens = (vm: VM) => new Map(map.doors.map((d, i) => [d.y * W + d.x, vm.read16(n.S('doors') + 16 * i + 2)]));
  return runReplay(n, name, (f, vm) => {
    // pace 2 then 1: a heavy image's rays were cast two frames before it is drawn (DESIGN §3.11)
    if (vm.read16(n.S('pace')) !== 0) {
      cast ??= opens(vm);
      return;
    }
    const o = cast ?? opens(vm);
    cast = null;
    onImage(f, vm, { cx: vm.read16(n.S('rcam_x')) / 256, cy: vm.read16(n.S('rcam_y')) / 256, ca: vm.read16(n.S('rcam_a')), tick: vm.read16(n.S('rtick')), flash: vm.read16(n.S('rflash')), open: (cell) => o.get(cell) ?? 0 });
  });
}

describe('M26-M27 renderer', () => {
  for (const name of REPLAYS)
    it(`${name}: per-frame hashes, no fault, no overrun, <= 25 000 cycles per frame`, async () => {
      const n = await buildNadir();
      const run = runReplay(n, name);
      if (name === 'm26-fly') expect(run.rf.frames).toBeGreaterThanOrEqual(1200);
      expect(run.vm.fault).toBeNull();
      expect(run.vm.overruns).toBe(0);
      expect(run.hashMismatch, `first differing frame ${run.hashMismatch}`).toBe(-1);
      expect(run.expectedFrames).toBe(run.rf.frames);
      console.log(`[budget] ${name}: ${run.rf.frames} frames, max ${run.max}, mean ${run.mean.toFixed(0)} cycles per frame`);
      expect(run.max).toBeLessThanOrEqual(25_000);
    });

  for (const name of REPLAYS)
    it(`${name}: every column of every image matches the floating-point raycaster (walls, doors, masked planes) and the light rule`, async () => {
      const n = await buildNadir();
      let images = 0;
      let cols = 0;
      let corner = 0;
      let faceOk = 0;
      let faceN = 0;
      let h1 = 0;
      let h2 = 0;
      let uOk = 0;
      let lvlOk = 0;
      let mN = 0;
      let mOk = 0;
      let mh = 0;
      let mu = 0;
      let mLvl = 0;
      let mCorner = 0;
      let doors = 0;
      const bad: string[] = [];
      const note = (s: string) => bad.length < 12 && bad.push(s);
      const rd = (vm: VM, s: string, c: number, w = 2) => (w === 2 ? vm.read16(n.S(s) + 2 * c) : vm.read8(n.S(s) + c));
      eachImage(n, name, (f, vm, im) => {
        images++;
        for (let c = 0; c < 64; c++) {
          cols++;
          const r = castRef(map, im.cx, im.cy, im.ca, c, im.open);
          const face = rd(vm, 'col_face', c);
          const h = rd(vm, 'col_h', c);
          const front = rd(vm, 'col_front', c);
          const lvl = rd(vm, 'col_lvl', c, 1);
          // the light level follows DESIGN §3.5 from the column's own height and cell in front
          const want = refLevel(map, light, front, h, c, im.tick, -im.flash);
          if (lvl === want) lvlOk++;
          else note(`frame ${f + 1} col ${c}: level ${lvl}, rule ${want}`);
          // ---- the masked layer (DESIGN §3.10)
          const mface = rd(vm, 'col_mface', c);
          const m: RefHit | undefined = r.mask;
          if (mface !== 0xffff || m) {
            const edge = (x: RefHit) => x.frac < 0.02 || x.frac > 0.98;
            if (m && edge(m)) mCorner++;
            else if (mface !== 0xffff && (!m || m.face !== mface) && nearMiss(mface, r.t, im.cx, im.cy, im.ca, c)) mCorner++;
            else if (m && mface === 0xffff && nearMiss(m.face, r.t, im.cx, im.cy, im.ca, c) && Math.abs(m.t - r.t) < 0.05) mCorner++;
            else {
              mN++;
              if (m && mface === m.face) {
                mOk++;
                const dh = Math.abs(rd(vm, 'col_mh', c) - m.h);
                if (dh <= Math.max(2, m.h / 32)) mh++;
                else note(`frame ${f + 1} col ${c}: masked h ${rd(vm, 'col_mh', c)}, oracle ${m.h.toFixed(2)}`);
                const du = Math.abs(rd(vm, 'col_mu', c, 1) - m.u);
                if (du <= 1 || du === 31) mu++;
                if (rd(vm, 'col_mfront', c) !== m.front) note(`frame ${f + 1} col ${c}: masked front ${rd(vm, 'col_mfront', c)}, oracle ${m.front}`);
                if (rd(vm, 'col_mlvl', c, 1) === refLevel(map, light, m.front, rd(vm, 'col_mh', c), c, im.tick, -im.flash)) mLvl++;
              } else note(`frame ${f + 1} col ${c}: masked face ${mface}, oracle ${m?.face ?? 'none'}`);
            }
          }
          // ---- the wall (or door)
          if (r.frac < 0.02 || r.frac > 0.98) {
            corner++;
            continue;
          }
          if (face !== r.face && nearMiss(face, r.t, im.cx, im.cy, im.ca, c)) {
            corner++; // the oracle's ray passes the engine's face within the fixed-point error: a corner case
            continue;
          }
          faceN++;
          if (face !== r.face) {
            note(`frame ${f + 1} col ${c}: face ${face}, oracle ${r.face}`);
            continue;
          }
          faceOk++;
          if (map.grid[r.cell / W | 0]![r.cell % W] === '+') doors++;
          if (front !== r.front) note(`frame ${f + 1} col ${c}: front ${front}, oracle ${r.front}`);
          const dh = Math.abs(h - r.h);
          if (dh <= Math.max(1, r.h / 64)) h1++;
          if (dh <= Math.max(2, r.h / 32)) h2++;
          else note(`frame ${f + 1} col ${c}: h ${h}, oracle ${r.h.toFixed(2)}`);
          const du = Math.abs(rd(vm, 'col_u', c, 1) - r.u);
          if (du <= 1 || du === 31) uOk++;
        }
      });
      const pc = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(2)} %`;
      console.log(`[oracle] ${name}: ${images} images, ${cols} columns (${corner} within 0.02 cells of a corner, ${doors} door columns): face ${pc(faceOk, faceN)}, height ±max(1, h/64) ${pc(h1, faceOk)}, ±max(2, h/32) ${pc(h2, faceOk)}, u ±1 ${pc(uOk, faceOk)}, light ${pc(lvlOk, cols)}; masked planes ${mN} (${mCorner} at an edge): face ${pc(mOk, mN)}, height ${pc(mh, mOk)}, u ${pc(mu, mOk)}, light ${pc(mLvl, mOk)}`);
      expect(faceOk / faceN).toBeGreaterThanOrEqual(0.995);
      expect(h1 / faceOk).toBeGreaterThanOrEqual(0.99);
      expect(h2, bad.join('\n')).toBe(faceOk);
      expect(uOk / faceOk).toBeGreaterThanOrEqual(0.99);
      expect(lvlOk, bad.join('\n')).toBe(cols);
      if (mN) {
        expect(mOk / mN, bad.join('\n')).toBeGreaterThanOrEqual(0.995);
        expect(mh / mOk).toBeGreaterThanOrEqual(0.99);
        expect(mu / mOk).toBeGreaterThanOrEqual(0.99);
        expect(mLvl).toBe(mOk);
      }
      if (name === 'm26-fly' || name === 'm27-masks') expect(mN).toBeGreaterThan(1000);
      if (name === 'm27-doors') expect(doors).toBeGreaterThan(1000);
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
      if (f % 10 !== 9 || a.read16(n.S('pace')) !== 0) continue;
      checked++;
      // the background tile under each differing pixel must be transparent there
      const zone = a.read16(n.S('cam_zone'));
      const bob = a.read16(n.S('rbob')) << 16 >> 16;
      const base = n.S('bgram') + zone * n.S('BG_ZONE_BYTES');
      for (let i = 0; i < 128 * 128; i++) {
        if (a.fb[i] === b.fb[i]) continue;
        const x = i & 127;
        const y = i >> 7;
        const ty = y - bob + 8;
        const row = Math.min(ty >> 3, n.S('BG_ROWS') - 1); // the map's last row repeats the last tile
        const byte = a.read8(base + row * 32 + (ty & 7) * 4 + (x >> 1 & 3));
        const px = x & 1 ? byte & 15 : byte >> 4;
        if (px !== 0) problems++;
      }
    }
    console.log(`[coverage] ${checked} frames checked, ${problems} pixels left unwritten outside the transparent band`);
    expect(problems).toBe(0);
  });

  it('masked walls are see-through: where a masked texel is transparent the image equals a run with the masked walls removed (m27-masks)', async () => {
    const n = await buildNadir();
    const rf = loadReplay('m27-masks');
    const inputs = expandInputs(rf.inputs, rf.frames);
    const a = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
    const b = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
    // both draw every image in its own frame and cast every column (no pacing, no interpolation), so that the
    // walls behind are computed the same way; B's map has no masked cells
    const flags = n.S('FL_NOPACE') | n.S('FL_NOINTERP');
    a.step(inputs[0]!);
    b.step(inputs[0]!);
    a.write16(n.S('dbg_flags'), flags);
    b.write16(n.S('dbg_flags'), flags);
    let removed = 0;
    for (let i = 0; i < W * W; i++)
      if (b.read8(n.S('map') + i) >= 0x80) {
        b.write8(n.S('map') + i, 0);
        removed++;
      }
    const chars = [...MASKED_CHARS];
    const tr = new Map(chars.map((ch) => [ch, transparency(ch)]));
    const matChar = (id: number) => MATERIAL_CHARS[id - 1]!;
    let checked = 0;
    let diff = 0;
    let maskedCols = 0;
    for (let f = 1; f < rf.frames; f++) {
      a.step(inputs[f]!);
      b.step(inputs[f]!);
      expect(a.read16(n.S('cam_x')), `frame ${f + 1}: the runs diverged`).toBe(b.read16(n.S('cam_x')));
      expect(a.read16(n.S('cam_y'))).toBe(b.read16(n.S('cam_y')));
      expect(a.overruns + b.overruns).toBe(0);
      const hor = 64 + ((a.read16(n.S('rbob')) << 16) >> 16);
      for (let c = 0; c < 64; c++) {
        if (a.read16(n.S('col_mface') + 2 * c) === 0xffff) continue;
        maskedCols++;
        const h = a.read16(n.S('col_mh') + 2 * c);
        const u = a.read8(n.S('col_mu') + c);
        const t = tr.get(matChar(a.read8(n.S('col_mmat') + c)))!;
        const blk = h >= K.LOD1_H! ? 1 : h >= K.LOD2_H! ? 2 : 4;
        const u0 = Math.floor(u / blk) * blk;
        const top = hor - (h >> 1);
        for (let y = Math.max(0, top); y < Math.min(128, top + h); y++) {
          // every texel row the pixel covers, one more on each side, widened to the LOD's blocks
          const v0 = Math.max(0, Math.floor((Math.floor(((y - top) * 32) / h) - 1) / blk) * blk);
          const v1 = Math.min(31, Math.floor((Math.floor(((y - top + 1) * 32) / h) + 1) / blk) * blk + blk - 1);
          let clear = true;
          for (let vv = v0; vv <= v1 && clear; vv++) for (let uu = u0; uu < u0 + blk && clear; uu++) clear = t[vv]![uu]!;
          if (!clear) continue;
          for (const x of [2 * c, 2 * c + 1]) {
            checked++;
            if (a.fb[y * 128 + x] !== b.fb[y * 128 + x]) diff++;
          }
        }
      }
    }
    console.log(`[masked] ${removed} masked cells removed in B; ${maskedCols} masked columns, ${checked} transparent pixels compared, ${diff} differ`);
    expect(maskedCols).toBeGreaterThan(1000);
    expect(checked).toBeGreaterThan(10_000);
    expect(diff).toBe(0);
  });
});
