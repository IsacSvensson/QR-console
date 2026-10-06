// Replays a Bo run with the per-frame reference checks (frames.ts) against a *live* reference grid, and samples
// what the tests need from RAM every frame. The only changes the engine may make to a level in RAM are taken
// collectibles, flags turning green, breakables vanishing whole (with a box's content) and apples from jokes.
import type { AudioCommand } from '@qrc/vm';
import { CLASS } from '../../games/bo/tools/tiles';
import { boView, frameProblems, gridOf } from './frames';
import { type Bo, ROWS, type RefGrid, runReplay, s16, symbol } from './oracle';

export interface Actor {
  slot: number;
  type: number;
  x: number;
  y: number;
  st: number;
  sub: number;
}

export interface F {
  input: number;
  level: string;
  playing: boolean;
  x16: number;
  y16: number;
  cx: number;
  foot: number;
  vx: number;
  vy: number;
  state: number;
  grounded: boolean;
  crouch: boolean;
  sattr: number;
  pose: number;
  trick: number;
  comboPts: number;
  comboN: number;
  score: number;
  lives: number;
  bub: number;
  bubT: number;
  mode: number;
  clicks: number;
  evN: number;
  evKind: number;
  evType: number;
  helmet: number;
  inv: number;
  pw: number;
  pwT: number;
  apples: number;
  actors: Actor[];
  audio: AudioCommand[];
  /** new apple cells this frame that were empty (jokes) */
  newApples: [number, number][];
}

const cache = new Map<string, { frames: F[]; problems: string[]; run: ReturnType<typeof runReplay> }>();

export function play(bo: Bo, name: string) {
  const hit = cache.get(name);
  if (hit) return hit;
  const S = (n: string) => symbol(bo.sym, n);
  const out: F[] = [];
  const probs: string[] = [];
  let live: RefGrid | null = null;
  let liveLevel = '';
  let prev: Uint8Array | null = null;
  const lvl = S('lvl');
  const tab = S('attr_tab');
  const actBase = S('actors');
  const ACT = S('ACT_SIZE');
  const run = runReplay(bo, name, (v) => {
    const b = boView(bo, v);
    const mode = v.vm.read16(S('mode'));
    const newApples: [number, number][] = [];
    if (!b.playing) {
      prev = null;
    } else {
      if (b.level !== liveLevel || !prev) {
        const g = gridOf(b.level);
        live = { ...g, attr: g.attr.slice(), used: g.used.slice() };
        liveLevel = b.level;
      }
      const W = live!.level.width;
      const now = v.vm.mem.slice(lvl, lvl + W * ROWS);
      if (prev) {
        for (let i = 0; i < now.length; i++) {
          if (now[i] === prev[i]) continue;
          const was = v.vm.read8(tab + prev[i]!) & 15;
          const c = Math.floor(i / ROWS);
          const r = i % ROWS;
          if ((was === CLASS.APPLE || was === CLASS.STAR || was === CLASS.PICKUP) && now[i] === 0) {
            live!.attr[i] = 0;
            continue;
          }
          if (was === CLASS.WEAK || was === CLASS.BOX) {
            const br = live!.breakables.find((k) => c >= k.col && c < k.col + k.w && r <= k.row && r > k.row - k.h);
            if (!br) {
              probs.push(`frame ${v.f + 1}: ${b.level} breakable cell ${c},${r} changed but no breakable there`);
              continue;
            }
            for (let cc = br.col; cc < br.col + br.w; cc++)
              for (let rr = br.row; rr > br.row - br.h; rr--) {
                const ii = cc * ROWS + rr;
                const cls = v.vm.read8(tab + now[ii]!) & 15;
                if (br.kind === 'weak' && now[ii] !== 0) probs.push(`frame ${v.f + 1}: weak ${cc},${rr} not cleared`);
                if (br.kind === 'box' && now[ii] !== 0 && cls !== CLASS.PICKUP && cls !== CLASS.APPLE) probs.push(`frame ${v.f + 1}: box ${cc},${rr} left ${now[ii]}`);
                live!.attr[ii] = v.vm.read8(tab + now[ii]!);
              }
            continue;
          }
          const nowCls = v.vm.read8(tab + now[i]!) & 15;
          if (was === CLASS.EMPTY && nowCls === CLASS.EMPTY) continue; // decor (a flag turning green)
          if (was === CLASS.EMPTY && (nowCls === CLASS.APPLE || nowCls === CLASS.PICKUP)) {
            live!.attr[i] = v.vm.read8(tab + now[i]!); // a box's content, or a joke's apple
            if (nowCls === CLASS.APPLE) newApples.push([c, r]);
            continue;
          }
          probs.push(`frame ${v.f + 1}: ${b.level} cell ${c},${r} changed from class ${was} to ${nowCls}`);
        }
      }
      prev = now;
      probs.push(...frameProblems(b, v.f, live!));
    }
    const actors: Actor[] = [];
    for (let i = 0; i < 12; i++) {
      const a = actBase + i * ACT;
      const type = v.vm.read16(a);
      if (type) actors.push({ slot: i, type, x: v.vm.read16(a + 2) >> 4, y: s16(v.vm.read16(a + 4)) >> 4, st: v.vm.read16(a + 10), sub: v.vm.read16(a + 20) });
    }
    out.push({
      input: v.input, level: b.level, playing: b.playing, x16: b.x16, y16: b.y16, cx: b.cx, foot: b.foot, vx: b.vx, vy: b.vy,
      state: b.state, grounded: b.grounded, crouch: b.crouch, sattr: b.sattr, pose: v.w('bo_pose'), trick: v.w('trick'),
      comboPts: v.w('combo_pts'), comboN: v.w('combo_n'), score: v.vm.read16(S('score_hi')) * 10000 + v.vm.read16(S('score_lo')),
      lives: v.w('lives'), bub: v.vm.read16(S('bub_id')), bubT: v.w('bub_t'), mode,
      clicks: v.audio.filter((a) => a.channel === 2 && a.freq === 2400 && a.duration === 2).length,
      evN: v.vm.read16(S('ev_n')), evKind: v.vm.read16(S('ev_kind')), evType: v.vm.read16(S('ev_type')),
      helmet: v.vm.read16(S('helmet')), inv: v.vm.read16(S('inv_t')), pw: v.vm.read16(S('pw_kind')), pwT: v.vm.read16(S('pw_t')),
      apples: v.vm.read16(S('apples')), actors, audio: [...v.audio], newApples,
    });
  });
  const res = { frames: out, problems: probs, run };
  cache.set(name, res);
  return res;
}
