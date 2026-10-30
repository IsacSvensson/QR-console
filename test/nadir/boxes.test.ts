// PLAN.md M28 (D-044): crates and consoles are 3D boxes (DESIGN §3.12). Every column of every drawn image of every
// replay against a floating-point ray / box test (test/nadir/ref.ts): the nearest box side seen there, its height, the
// y of its top edge and its light level (DESIGN §3.5, W and E sides one level darker).
import { describe, expect, it } from 'vitest';
import { VM } from '@qrc/vm';
import { K, boxRay, readRefMap, readRefSprites, refBoxK, refLevel, refLight, solid } from './ref';
import { REPLAYS, buildNadir, runReplay, type Nadir } from './play';

const map = readRefMap('nadir');
const light = refLight(map);
const sprites = readRefSprites();
const W = map.grid[0]!.length;
const s16 = (v: number) => (v << 16) >> 16;
const F = K.F256! / 256;

/** the boxes among the drawn sprite records (spr_ord from spr_o0) */
function drawnBoxes(n: Nadir, vm: VM): number[] {
  const cn = vm.read16(n.S('spr_cn'));
  const out: number[] = [];
  for (let i = vm.read16(n.S('spr_o0')) / 2; i < cn; i++) {
    const a = vm.read16(n.S('spr_ord') + 2 * i);
    const t = (vm.read16(a + 20) - n.S('spr_type')) / 16;
    if (sprites[t]!.box) out.push((vm.read16(a) - n.S('props')) / 8);
  }
  return out;
}

describe('M28 3D boxes', () => {
  for (const name of REPLAYS)
    it(`${name}: every column of every image: the nearest box side, its h, top and light against a ray / box oracle`, async () => {
      const n = await buildNadir();
      let cols = 0;
      let amb = 0;
      let faceOk = 0;
      let matched = 0;
      let hOk = 0;
      let hOk2 = 0;
      let topOk = 0;
      let lvlOk = 0;
      let images = 0;
      const bad: string[] = [];
      const note = (s: string) => bad.length < 40 && bad.push(s);
      const rd = (vm: VM, s: string, c: number) => vm.read16(n.S(s) + 2 * c);
      runReplay(n, name, (f, vm) => {
        if (vm.read16(n.S('pace')) !== 0) return; // rays cast, nothing drawn yet
        const boxes = drawnBoxes(n, vm);
        const any = boxes.length > 0;
        const cx = vm.read16(n.S('rcam_x')) / 256;
        const cy = vm.read16(n.S('rcam_y')) / 256;
        const th = ((vm.read16(n.S('rcam_a')) + 0.5) * 2 * Math.PI) / 4096;
        const hor = 64 + s16(vm.read16(n.S('rbob')));
        const tick = vm.read16(n.S('rtick'));
        const flash = vm.read16(n.S('rflash'));
        if (any) images++;
        for (let c = 0; c < 64; c++) {
          const face = rd(vm, 'col_bface', c);
          if (!any) {
            expect(face, `frame ${f + 1} col ${c}: a box side without a box`).toBe(0xffff);
            continue;
          }
          const colH = rd(vm, 'col_h', c);
          const r = (2 * c + 1 - 64) / F;
          const dx = Math.cos(th) - r * Math.sin(th);
          const dy = Math.sin(th) + r * Math.cos(th);
          let best: { prop: number; t: number; side: number; edge: number } | null = null;
          let ambiguous = false;
          for (const p of boxes) {
            const pr = map.props[p]!;
            const sp = sprites.find((s) => s.char === pr.s)!;
            const a = sp.block / 256;
            const hit = boxRay(cx, cy, dx, dy, Math.round(pr.x * 256) / 256, Math.round(pr.y * 256) / 256, a);
            // a ray that grazes the box (misses or enters within 0.02 cell of a vertical edge) is ambiguous
            const graze = [-0.02, 0.02].some((e) => (boxRay(cx, cy, dx, dy, Math.round(pr.x * 256) / 256, Math.round(pr.y * 256) / 256, a + e) !== null) !== (hit !== null));
            if (!hit) {
              if (graze) ambiguous = true;
              continue;
            }
            const h = K.F256! / (256 * hit.t);
            if (hit.edge < 0.02 || graze || Math.abs(h - colH) <= 1.5 || hit.t < K.SPR_NEAR! / 256 + 0.02) ambiguous = true;
            if (h <= colH) continue; // behind the wall
            if (!best || hit.t < best.t) best = { prop: p, ...hit };
          }
          if (face === 0xffff && !best) continue;
          cols++;
          if (ambiguous) {
            amb++;
            continue;
          }
          const want = best ? best.prop * 4 + best.side : 0xffff;
          if (face === want) faceOk++;
          else note(`frame ${f + 1} col ${c}: face ${face === 0xffff ? '-' : `${face >> 2}/${face & 3}`}, oracle ${best ? `${best.prop}/${best.side}` : '-'}`);
          if (!best || face !== want) continue;
          matched++;
          const h = rd(vm, 'col_bh', c);
          const hf = K.F256! / (256 * best.t);
          if (Math.abs(h - hf) <= Math.max(1, hf / 64)) hOk++;
          else note(`frame ${f + 1} col ${c}: h ${h}, oracle ${hf.toFixed(2)}`);
          if (Math.abs(h - hf) <= Math.max(2, hf / 32)) hOk2++;
          const sp = sprites.find((s) => s.char === map.props[best.prop]!.s)!;
          const top = s16(rd(vm, 'col_btop', c));
          const topf = hor + hf / 2 - (hf * refBoxK(sp)) / 256;
          if (Math.abs(top - topf) <= 1) topOk++;
          else note(`frame ${f + 1} col ${c}: top ${top}, oracle ${topf.toFixed(2)}`);
          const pr = map.props[best.prop]!;
          const lvl = rd(vm, 'col_blvl', c);
          const wantL = refLevel(map, light, Math.floor(pr.y) * W + Math.floor(pr.x), h, c, tick, (best.side < 2 ? 1 : 0) - flash);
          if (lvl === wantL) lvlOk++;
          else note(`frame ${f + 1} col ${c}: level ${lvl}, rule ${wantL}`);
        }
      });
      const pc = (a: number, b: number) => ((100 * a) / Math.max(1, b)).toFixed(2);
      const clear = cols - amb;
      console.log(`[boxes] ${name}: ${images} images with boxes, ${cols} box columns (${amb} at an edge or the wall's depth, not compared); side ${pc(faceOk, clear)} %; of ${matched}: h ±max(1, h/64) ${pc(hOk, matched)} %, ±max(2, h/32) ${pc(hOk2, matched)} %, top ±1 px ${pc(topOk, matched)} %, light ${pc(lvlOk, matched)} %`);
      expect(faceOk, bad.filter((s) => s.includes("face")).join('\n')).toBeGreaterThanOrEqual(0.995 * clear);
      expect(hOk, bad.join('\n')).toBeGreaterThanOrEqual(0.99 * matched);
      expect(hOk2, bad.join('\n')).toBe(matched);
      expect(topOk, bad.join('\n')).toBeGreaterThanOrEqual(0.99 * matched);
      expect(lvlOk, bad.join('\n')).toBe(matched);
      if (name === 'm28-props') expect(matched).toBeGreaterThan(1000);
    });

  it('touching every box (the player against each side, 17 places per side, 64 angles): every column the oracle sees is drawn, with its side and h', async () => {
    // the human saw a box turn transparent up close: its side was nearer than the sprites' near plane (D-044)
    const n = await buildNadir();
    const vm = VM.fromCartridge(n.cart, { seed: 1 });
    vm.step(0);
    vm.write16(n.S('dbg_flags'), n.S('FL_NOPACE'));
    let cols = 0;
    let ok = 0;
    let hOk = 0;
    const bad: string[] = [];
    map.props.forEach((pr, i) => {
      const sp = sprites.find((s) => s.char === pr.s)!;
      if (!sp.box) return;
      const bx = Math.round(pr.x * 256) / 256;
      const by = Math.round(pr.y * 256) / 256;
      const a = sp.block / 256;
      const d = a + K.P_RAD! / 256 + 1 / 256;
      const pos: number[][] = [];
      for (let k = -8; k <= 8; k++) pos.push([bx - d, by + k * 0.06], [bx + d, by + k * 0.06], [bx + k * 0.06, by - d], [bx + k * 0.06, by + d]);
      for (const [px, py] of pos) {
        if ([-1, 1].some((u) => [-1, 1].some((v) => solid(map, Math.floor(px! + (u * K.P_RAD!) / 256), Math.floor(py! + (v * K.P_RAD!) / 256))))) continue;
        for (let ang = 0; ang < 4096; ang += 64) {
          vm.write16(n.S('cam_x'), Math.round(px! * 256));
          vm.write16(n.S('cam_y'), Math.round(py! * 256));
          vm.write16(n.S('cam_a'), ang);
          vm.step(0);
          const cx = vm.read16(n.S('rcam_x')) / 256;
          const cy = vm.read16(n.S('rcam_y')) / 256;
          const th = ((vm.read16(n.S('rcam_a')) + 0.5) * 2 * Math.PI) / 4096;
          for (let c = 0; c < 64; c++) {
            const r = (2 * c + 1 - 64) / F;
            const hit = boxRay(cx, cy, Math.cos(th) - r * Math.sin(th), Math.sin(th) + r * Math.cos(th), bx, by, a);
            if (!hit || hit.edge < 0.02) continue;
            const hf = K.F256! / (256 * hit.t);
            if (hf <= vm.read16(n.S('col_h') + 2 * c) + 1.5) continue;
            const face = vm.read16(n.S('col_bface') + 2 * c);
            if (face >> 2 !== i && face !== 0xffff) continue; // another box in front
            cols++;
            if (face === i * 4 + hit.side) ok++;
            else if (bad.length < 10) bad.push(`box ${i} cam ${cx.toFixed(3)},${cy.toFixed(3)} a ${ang} col ${c}: ${face === 0xffff ? 'nothing drawn' : `side ${face & 3}`}, oracle side ${hit.side}`);
            const h = vm.read16(n.S('col_bh') + 2 * c);
            if (face === i * 4 + hit.side && Math.abs(h - hf) <= Math.max(2, hf / 32)) hOk++;
          }
        }
      }
    });
    console.log(`[boxes] touching: ${cols} columns, side ${((100 * ok) / cols).toFixed(2)} %, h ±max(2, h/32) ${((100 * hOk) / cols).toFixed(2)} %`);
    expect(ok, bad.join('\n')).toBeGreaterThanOrEqual(0.995 * cols);
    expect(hOk).toBeGreaterThanOrEqual(0.99 * cols);
    expect(cols).toBeGreaterThan(10_000);
  });
});
