import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLASS } from '../../games/bo/tools/tiles';
import { boView, frameProblems, gridOf } from './frames';
import { type Bo, CONSTS, GAME_DIR, HMAP, LEVEL_IDS, ROWS, type RefGrid, buildBo, derivedNumbers, readRefLevel, runReplay, s16, symbol } from './oracle';

// M20 acceptance: skate mechanics and the feel prototype (PLAN.md Part 3).
let bo: Bo;
const A_BTN = 16;

interface F {
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
}
const runs = new Map<string, F[]>();
const problems = new Map<string, string[]>();
const S = (n: string) => symbol(bo.sym, n);

/** §4: trick name -> { frames, points } */
const TRICKS: Record<string, { frames: number; points: number }> = (() => {
  const d = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');
  const sec = d.slice(d.indexOf('## 4. Tricks'), d.indexOf('## 5.'));
  const out: Record<string, { frames: number; points: number }> = {};
  for (const m of sec.matchAll(/^\| \**([A-Z0-9-]+)\** \| [^|]+ \| ([^|]+) \| ([^|]+) \|/gm)) {
    out[m[1]!] = { frames: parseInt(m[2]!, 10), points: parseInt(m[3]!, 10) };
  }
  return out;
})();

/** Replays a run, with the per-frame reference checks against a live reference grid: the only changes the
 * engine may make to a level in RAM are taken collectibles, flags turning green and breakables vanishing whole. */
function play(name: string) {
  const out: F[] = [];
  const probs: string[] = [];
  let live: RefGrid | null = null;
  let liveLevel = '';
  let prev: Uint8Array | null = null;
  const lvl = S('lvl');
  const tab = S('attr_tab');
  const run = runReplay(bo, name, (v) => {
    const b = boView(bo, v);
    const mode = v.vm.read16(S('mode'));
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
            // exactly its cells, in this frame
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
            live!.attr[i] = v.vm.read8(tab + now[i]!); // a box's content
            continue;
          }
          probs.push(`frame ${v.f + 1}: ${b.level} cell ${c},${r} changed from class ${was} to ${nowCls}`);
        }
      }
      prev = now;
      probs.push(...frameProblems(b, v.f, live!));
    }
    const clicks = v.audio.filter((a) => a.channel === 2 && a.freq === 2400 && a.duration === 2).length;
    out.push({
      input: v.input, level: b.level, playing: b.playing, x16: b.x16, y16: b.y16, cx: b.cx, foot: b.foot, vx: b.vx, vy: b.vy,
      state: b.state, grounded: b.grounded, crouch: b.crouch, sattr: b.sattr, pose: v.w('bo_pose'), trick: v.w('trick'),
      comboPts: v.w('combo_pts'), comboN: v.w('combo_n'), score: v.vm.read16(S('score_hi')) * 10000 + v.vm.read16(S('score_lo')),
      lives: v.w('lives'), bub: v.vm.read16(S('bub_id')), bubT: v.w('bub_t'), mode, clicks,
    });
  });
  runs.set(name, out);
  problems.set(name, probs);
  return run;
}

beforeAll(async () => {
  bo = await buildBo();
});

for (const name of ['m20-t3', 'm20-gameover']) {
  describe(`replay ${name} (M20)`, () => {
    it('matches the committed per-frame hashes; budgets; reference grid checks (live: breakables vanish whole)', () => {
      const run = play(name);
      expect(run.hashMismatch, 'first frame whose state hash differs').toBe(-1);
      expect(run.expectedFrames).toBe(run.rf.frames);
      expect(problems.get(name)!.slice(0, 10)).toEqual([]);
      expect(run.vm.fault).toBeNull();
      expect(run.vm.overruns).toBe(0);
      console.log(`[budget] ${name}: ${run.rf.frames} frames, max ${run.maxCycles} cycles per frame`);
      expect(run.maxCycles).toBeLessThanOrEqual(25_000);
    });
  });
}

describe('kickers (M20)', () => {
  it('ramp launches on 22.5° and 45° at 1.5 / 2.5 / 3.5 px per frame, with and without ollie, match DESIGN §3.3', () => {
    const s = runs.get('m20-t3')!;
    const got: { steep: number; ollie: boolean; v: number; height: number; air: number; length: number }[] = [];
    for (let f = 1; f < s.length; f++) {
      const p = s[f - 1]!;
      if (!p.grounded || (p.sattr & 15) !== CLASS.RAMP || s[f]!.grounded || s[f]!.vy >= 0) continue;
      const shape = p.sattr >> 4;
      const steep = shape === 1 || shape === 2 ? 45 : 22;
      const ollie = !!(s[f]!.input & A_BTN) && !(p.input & A_BTN);
      const y0 = p.y16;
      let e = f;
      while (e < s.length && s[e]!.y16 < y0) e++;
      const minY = Math.min(...s.slice(f, e + 1).map((x) => x.y16));
      got.push({ steep, ollie, v: Math.abs(s[f]!.vx), height: (y0 - minY) / 16, air: e - f + 1, length: Math.abs(s[e]!.x16 - p.x16) / 16 });
    }
    console.log(`[measured] launches: ${got.map((g) => `${g.steep}° ${g.ollie ? 'A' : '-'} v${g.v}: ${g.height.toFixed(2)} px ${g.air} f ${(g.length / 8).toFixed(2)} tiles`).join('; ')}`);
    const [h1, h2, h3, l1, l2, l3] = derivedNumbers('Ramp 45° utan');
    const [hA, airA, lA2, lA3] = derivedNumbers('Ramp 45° **med');
    const [h22a, h22b, l22a, l22b] = derivedNumbers('Ramp 22,5° med');
    const want = [
      { steep: 45, ollie: false, v: 24, h: h1!, l: l1! },
      { steep: 45, ollie: false, v: 40, h: h2!, l: l2! },
      { steep: 45, ollie: false, v: 56, h: h3!, l: l3! },
      { steep: 45, ollie: true, v: 40, h: hA!, l: lA2!, air: airA! },
      { steep: 45, ollie: true, v: 56, h: hA!, l: lA3!, air: airA! },
      { steep: 22, ollie: true, v: 24, h: h22a!, l: l22a! },
      { steep: 22, ollie: true, v: 40, h: h22b!, l: l22b! },
    ];
    for (const w of want) {
      const m = got.filter((g) => g.steep === w.steep && g.ollie === w.ollie && g.v === w.v);
      const what = `${w.steep}° ${w.ollie ? 'with' : 'without'} ollie at ${w.v / 16}`;
      expect(m.length, what).toBeGreaterThan(0);
      for (const g of m) {
        expect(Math.abs(g.height - w.h), `${what}: height`).toBeLessThanOrEqual(1);
        if (w.air) expect(Math.abs(g.air - w.air), `${what}: airtime`).toBeLessThanOrEqual(1);
        // the table rounds to 0.1 tile; one frame more or less moves the crossing by v/16 px
        expect(Math.abs(g.length - w.l * 8), `${what}: length`).toBeLessThanOrEqual(1 + w.v / 16 + 0.4);
      }
    }
  });
});

describe('grind (M20)', () => {
  it('feet on a rail cell of the reference grid => GRIND; constant speed on flat rails, faster on diagonal ones; A jumps off', () => {
    const s = runs.get('m20-t3')!;
    const g = gridOf('T3');
    const GRIND = S('ST_GRIND');
    const bad: string[] = [];
    let flat = 0;
    let diag = 0;
    const railShapeAt = (x: F) => {
      const c = x.cx >> 3;
      for (const r of [(x.foot >> 3) - 1, x.foot >> 3]) {
        const a = c >= 0 && c < g.level.width && r >= 0 && r < ROWS ? g.attr[c * ROWS + r]! : 0;
        if ((a & 15) === CLASS.RAIL && r * 8 + 8 - HMAP[a >> 4]![x.cx & 7]! === x.foot) return a >> 4;
      }
      return -1;
    };
    for (let f = 1; f < s.length; f++) {
      const x = s[f]!;
      if (!x.playing || x.level !== 'T3') continue;
      // the reference: is a rail surface exactly under the feet?
      const c = x.cx >> 3;
      let onRail = false;
      let railShape = -1;
      for (const r of [(x.foot >> 3) - 1, x.foot >> 3]) {
        const a = c >= 0 && c < g.level.width && r >= 0 && r < ROWS ? g.attr[c * ROWS + r]! : 0;
        if ((a & 15) !== CLASS.RAIL) continue;
        if (r * 8 + 8 - HMAP[a >> 4]![x.cx & 7]! === x.foot) {
          onRail = true;
          railShape = a >> 4;
        }
      }
      if (onRail && x.vy >= 0 && x.state !== GRIND) bad.push(`frame ${f + 1}: feet on a rail but state ${x.state}`);
      const p = s[f - 1]!;
      const pShape = railShapeAt(p);
      if (x.state === GRIND && p.state === GRIND && onRail && pShape === railShape) {
        if (railShape === 0) {
          flat++;
          if (x.vx !== p.vx) bad.push(`frame ${f + 1}: speed changed on a flat rail (${p.vx} -> ${x.vx})`);
        } else {
          diag++;
          if (Math.abs(x.vx) <= Math.abs(p.vx) && Math.abs(x.vx) < CONSTS.SPEED_CAP!) bad.push(`frame ${f + 1}: no acceleration on a diagonal rail`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(flat, 'frames grinding a flat rail').toBeGreaterThan(10);
    expect(diag, 'frames grinding a diagonal rail').toBeGreaterThan(3);
  });

  it('A on a rail is an ollie off it', () => {
    const t = runs.get('m20-gameover')!.concat(runs.get('m20-t3')!);
    const GRIND = S('ST_GRIND');
    let n = 0;
    for (let f = 1; f < t.length; f++) {
      if (t[f - 1]!.state === GRIND && t[f]!.input & A_BTN && !(t[f - 1]!.input & A_BTN)) {
        n++;
        expect(t[f]!.state).toBe(S('ST_AIR'));
        expect(t[f]!.vy).toBe(-CONSTS.JUMP_V! + CONSTS.G!);
      }
    }
    expect(n, 'ollies off a rail').toBeGreaterThan(0);
  });
});

describe('tricks and combos (M20)', () => {
  it('every trick scores its points (DESIGN §4), combos multiply, clean landings boost, sloppy landings halve the speed', () => {
    const s = runs.get('m20-t3')!;
    const names = ['', 'KICKFLIP', 'SHOVE-IT', 'GRAB', '360', 'GODISSNURR', 'GRIND', 'SUPERBOSSE'];
    const seen = new Set<string>();
    let combos2 = 0;
    let sloppy = 0;
    let clean = 0;
    for (let f = 1; f < s.length; f++) {
      const p = s[f - 1]!;
      const x = s[f]!;
      // a trick completes: trick goes back to none and the combo points grow by its points
      if (p.trick && !x.trick && !x.grounded && x.comboN === p.comboN + 1) {
        const name = names[p.trick]!;
        let pts = TRICKS[name]!.points;
        if (name === 'GRAB') {
          let held = 0;
          for (let k = f - 1; k >= 0 && s[k]!.trick === p.trick; k--) held++;
          pts += 10 * Math.floor((held + 1 - 12) / 8);
        }
        expect(x.comboPts - p.comboPts, `${name} points`).toBe(pts);
        seen.add(name);
      }
      if (!p.grounded && p.state !== S('ST_GRIND') && x.grounded && x.state === S('ST_GROUND')) {
        if (p.trick && !(p.trick === 3)) {
          sloppy++;
          expect(Math.abs(x.vx), 'sloppy: half speed').toBeLessThanOrEqual(Math.ceil(Math.abs(p.vx) / 2) + 1);
          expect(x.score, 'sloppy: no points').toBe(p.score);
          expect(x.bub).toBe(S('TX_OJ'));
        } else if (p.comboN > 0) {
          clean++;
          expect(x.score - p.score, 'combo formula').toBe(p.comboPts * p.comboN);
          if (p.comboN === 2) combos2++;
          if ((x.sattr & 15) === CLASS.SOLID) {
            const boosted = Math.min(Math.abs(p.vx) + CONSTS.TRICK_BOOST! * p.comboN, CONSTS.SPEED_CAP!);
            expect(Math.abs(Math.abs(x.vx) - boosted), 'TRICK_BOOST per trick').toBeLessThanOrEqual(1);
          }
        }
      }
    }
    console.log(`[measured] tricks seen: ${[...seen].join(', ')}; clean landings ${clean}, two-trick combos ${combos2}, sloppy ${sloppy}`);
    for (const t of ['KICKFLIP', 'SHOVE-IT', 'GRAB', '360']) expect(seen.has(t), t).toBe(true);
    expect(combos2).toBeGreaterThan(0);
    expect(sloppy).toBeGreaterThan(0);
    // grinding: 10 points per 8 frames into the combo
    let grindFrames = 0;
    for (let f = 1; f < s.length; f++) {
      if (s[f]!.state === S('ST_GRIND') && s[f - 1]!.state === S('ST_GRIND')) {
        grindFrames++;
        const d = s[f]!.comboPts - s[f - 1]!.comboPts;
        expect([0, TRICKS.GRIND!.points]).toContain(d);
      }
    }
    expect(grindFrames).toBeGreaterThan(8);
  });
});

describe('surfaces, breakables, lives (M20)', () => {
  function brakeRun(s: F[], cls: number, from: number, input: (i: number, vx: number) => boolean) {
    const out: { frames: number; dist: number }[] = [];
    for (let f = 2; f < s.length; f++) {
      const p = s[f - 1]!;
      if (!p.grounded || (p.sattr & 15) !== cls || Math.abs(p.vx) !== from || !input(s[f]!.input, p.vx)) continue;
      if (Math.abs(s[f - 2]!.vx) === from && input(s[f - 1]!.input, s[f - 2]!.vx)) continue;
      let e = f;
      while (e < s.length && s[e]!.grounded && (s[e]!.sattr & 15) === cls && s[e]!.vx !== 0) e++;
      if (e < s.length && s[e]!.vx === 0) out.push({ frames: e - f + 1, dist: Math.abs(s[e]!.x16 - p.x16) / 16 });
    }
    return out;
  }
  it('braking on ice from 2.5 and coasting out on sand from 1.5 match DESIGN §3.3', () => {
    const s = runs.get('m20-t3')!;
    const [fi, di] = derivedNumbers('Broms på **is**');
    const [fs, ds] = derivedNumbers('Rulla ut på **sand**');
    const ice = brakeRun(s, CLASS.ICE, 40, (i, vx) => (vx > 0 ? i === 1 : i === 2));
    const sand = brakeRun(s, CLASS.SAND, 24, (i) => i === 0);
    console.log(`[measured] ice brake: ${JSON.stringify(ice)} (DESIGN ${fi} f, ${di} px); sand: ${JSON.stringify(sand)} (DESIGN ${fs} f, ${ds} px)`);
    for (const [got, f, d] of [[ice, fi, di], [sand, fs, ds]] as const) {
      expect(got.length).toBeGreaterThan(0);
      for (const g of got) {
        expect(Math.abs(g.frames - f!)).toBeLessThanOrEqual(1);
        expect(Math.abs(g.dist - d!)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a trampoline throws Bo up with BOUNCE_V; landing on a weak block and a box breaks them (live grid check above)', () => {
    const s = runs.get('m20-t3')!;
    const bounce = s.some((x, f) => f > 0 && x.vy === -CONSTS.BOUNCE_V! && (s[f - 1]!.vy > 0));
    expect(bounce).toBe(true);
    const g = gridOf('T3');
    expect(g.breakables.length).toBeGreaterThanOrEqual(2);
    expect(problems.get('m20-t3')).toEqual([]);
  });

  it('water costs a life and Bo respawns at the last checkpoint; at 0 lives the level restarts with 5 lives', () => {
    const lv = (id: string) => readRefLevel(id);
    for (const name of ['m20-t3', 'm20-gameover']) {
      const s = runs.get(name)!;
      let lastFlag = -1;
      let deaths = 0;
      for (let f = 1; f < s.length; f++) {
        const x = s[f]!;
        const p = s[f - 1]!;
        if (!x.playing) {
          lastFlag = -1;
          continue;
        }
        const flags = lv(x.level).objects.filter((o) => o.kind === 'flag').map((o) => o.col);
        for (const c of flags) if (x.cx >= c * 8 + 4 && c > lastFlag && p.state <= 2) lastFlag = c;
        if (p.state === S('ST_DEAD') && x.state === S('ST_GROUND')) {
          deaths++;
          expect(x.lives, `${name} frame ${f + 1}`).toBe(p.lives - 1);
          const col = lastFlag >= 0 ? lastFlag : lv(x.level).start;
          expect(x.cx, `${name} frame ${f + 1}: respawn column`).toBe(col * 8 + 4);
        }
      }
      expect(deaths, name).toBeGreaterThan(0);
    }
    const s = runs.get('m20-gameover')!;
    const over = s.findIndex((x) => x.state === S('ST_OVER'));
    expect(over).toBeGreaterThan(0);
    const back = s.findIndex((x, f) => f > over && x.playing && x.state === S('ST_GROUND'));
    expect(s[back]!.lives).toBe(5);
    expect(s[back]!.cx).toBe(readRefLevel('T1').start * 8 + 4);
    expect(s.slice(over, back).some((x) => x.mode === S('M_LOAD')), 'the level is loaded again').toBe(true);
  });
});

describe("Bo's signature (M20, DESIGN §0.2)", () => {
  it('every signature behaviour appears at its trigger; idle tricks never move Bo; any button cancels them at once', () => {
    const s = [...runs.values()].flat();
    const P = (n: string) => S(`P_${n}`);
    const seen = new Set<number>();
    let idle = 0;
    const bad: string[] = [];
    for (let f = 1; f < s.length; f++) {
      const x = s[f]!;
      const p = s[f - 1]!;
      if (!x.playing) {
        idle = 0;
        continue;
      }
      seen.add(x.pose);
      idle = p.playing && x.grounded && x.vx === 0 && x.input === 0 && x.state === 0 ? idle + 1 : 0;
      if (idle === S('IDLE_POP') && x.pose !== P('POP')) bad.push(`frame ${f + 1}: idle 3 s but pose ${x.pose}`);
      if (idle >= S('IDLE_BAL') && x.pose !== P('BALANCE')) bad.push(`frame ${f + 1}: idle 8 s but pose ${x.pose}`);
      if ((x.pose === P('POP') || x.pose === P('BALANCE')) && (x.x16 !== p.x16 || x.y16 !== p.y16 || x.crouch !== p.crouch)) bad.push(`frame ${f + 1}: an idle trick moved Bo`);
      if (x.input !== 0 && (x.pose === P('POP') || x.pose === P('BALANCE'))) bad.push(`frame ${f + 1}: a button did not cancel the idle trick`);
      if (x.pose === P('PUSH') && !(x.grounded && x.input & 3)) bad.push(`frame ${f + 1}: push pose without pushing`);
      if (x.pose === P('FAST') && Math.abs(x.vx) <= 32) bad.push(`frame ${f + 1}: leaning forward at ${x.vx}`);
      if (x.pose === P('BRAKE') && !(x.input & 3)) bad.push(`frame ${f + 1}: brake pose without braking`);
      // a landing after 0.8 s in the air: looking back
      if (p.state === S('ST_AIR') && x.state === S('ST_GROUND') && x.bub !== S('TX_OJ')) {
        let air = 0;
        for (let k = f; k >= 0 && !s[k - 1]!.grounded && s[k - 1]!.state === S('ST_AIR'); k--) air++;
        if (air >= S('LOOK_AIR') && x.pose !== P('LOOK') && x.pose !== P('OJ')) bad.push(`frame ${f + 1}: a big landing (${air} f) without looking back (pose ${x.pose})`);
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
    for (const n of ['PUSH', 'FAST', 'BRAKE', 'POP', 'BALANCE', 'LOOK', 'OJ', 'GRIND', 'GOAL', 'HURT']) expect(seen.has(P(n)), n).toBe(true);
    // the lines: WIII! after a grind, OJ! on a sloppy landing or a bump, AJ! when falling in, JAG GJORDE DET! at the goal
    const lines = new Set(s.filter((x) => x.bubT === S('BUB_T') - 1).map((x) => x.bub));
    for (const t of ['TX_WIII', 'TX_OJ', 'TX_AJ', 'TX_JAG_GJORDE_DET']) expect(lines.has(S(t)), t).toBe(true);
  });

  it('the wheels click once per 16 px rolled on the ground (not on ice), DESIGN §15', () => {
    for (const [name, s] of runs) {
      let dist = 0;
      let clicks = 0;
      let expected = 0;
      for (let f = 1; f < s.length; f++) {
        const x = s[f]!;
        const p = s[f - 1]!;
        if (x.mode === S('M_LOAD')) {
          expected += Math.floor(dist / 256);
          dist = 0;
        }
        clicks += x.clicks;
        if (x.playing && p.playing && p.state === S('ST_GROUND') && (x.state === S('ST_GROUND') || x.state === S('ST_GRIND')) && (x.sattr & 15) !== CLASS.ICE) dist += Math.abs(s16(x.x16 - p.x16));
      }
      expected += Math.floor(dist / 256);
      console.log(`[measured] ${name}: ${clicks} wheel clicks for ${expected} x 16 px`);
      expect(clicks, name).toBe(expected);
    }
  });
});

it('the level ids include the M20 test level', () => {
  expect(LEVEL_IDS).toContain('T3');
});
