import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFramePng } from '@qrc/tools';
import { VM, expandInputs } from '@qrc/vm';
import { ORDER } from '../../games/bo/tools/text';
import { type Bo, CONSTS, GAME_DIR, buildBo, loadReplay, symbol } from './oracle';
import { type F, play } from './play';

// M21 acceptance: enemies, power-ups, items, HUD, Bo's voice (PLAN.md Part 3).
let bo: Bo;
const S = (n: string) => symbol(bo.sym, n);
const ZOO = ['m21-zoo1', 'm21-zoo2'];
const design = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');

/** §9: the enemy table, name -> its row (landing on it, touching it) */
const ENEMY_ROWS = (() => {
  const sec = design.slice(design.indexOf('## 9. Fiender'), design.indexOf('## 10.'));
  const rows = [...sec.matchAll(/^\| ([^|]+?)(?: \*\(förslag\)\*)? \| ([0-9, ]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)];
  return rows.map((m) => ({ name: m[1]!.trim(), land: m[4]!.trim(), touch: m[5]!.trim() }));
})();
/** the engine's enemy types in the order of the §9 table */
const TYPE_OF: Record<string, number> = {
  Snigel: 1, 'Mås': 2, Igelkott: 3, Geting: 4, Bollmonster: 5, Nalle: 6, Ekorre: 7, Duva: 8, 'Snögubbe': 9, Pulka: 10, 'Gelégubbe': 11, Godisblobb: 12, Popcornkanon: 13,
};
/** the projectile a thrower's touch means (§9: "kotten = träff", "snöbollen = träff", "popcorn = träff") */
const PROJ: Record<number, number> = { 7: 14, 9: 15, 13: 16 };

let all: { name: string; frames: F[] }[] = [];
beforeAll(async () => {
  bo = await buildBo();
  all = ZOO.map((name) => ({ name, frames: play(bo, name).frames }));
});

for (const name of ZOO) {
  describe(`replay ${name} (M21)`, () => {
    it('matches the committed per-frame hashes; budgets; reference grid checks', () => {
      const { run, problems } = play(bo, name);
      expect(run.hashMismatch, 'first frame whose state hash differs').toBe(-1);
      expect(run.expectedFrames).toBe(run.rf.frames);
      expect(problems.slice(0, 10)).toEqual([]);
      expect(run.vm.fault).toBeNull();
      expect(run.vm.overruns).toBe(0);
      console.log(`[budget] ${name}: ${run.rf.frames} frames, max ${run.maxCycles} cycles per frame`);
      expect(run.maxCycles).toBeLessThanOrEqual(25_000);
    });
  });
}

/** Does Bo's box overlap the actor's box this frame (RAM positions, box sizes from the ROM enemy table)? */
function overlaps(x: F, a: { type: number; x: number; y: number }) {
  const row = S('en_table') + a.type * 8;
  const w = bo.rom[row + 1]!;
  const h = bo.rom[row + 2]!;
  const ax = a.x - (w >> 1);
  const ay = a.y - h;
  const bx = x.cx - 3;
  const by = x.foot - 16;
  return bx < ax + w && ax < bx + 6 && by < ay + h && ay < by + 16;
}

describe('enemies (M21, DESIGN §9)', () => {
  it('every hit happens on a frame where the boxes in RAM overlap, and no overlap goes unhandled', () => {
    const bad: string[] = [];
    let events = 0;
    for (const { name, frames: s } of all) {
      for (let f = 1; f < s.length; f++) {
        const x = s[f]!;
        const p = s[f - 1]!;
        if (!x.playing || !p.playing) continue;
        const live = p.actors.filter((a) => a.st === 0); // positions after this frame's moves are in x.actors
        const now = x.actors.filter((a) => live.some((l) => l.slot === a.slot && l.type === a.type));
        if (x.evN !== p.evN) {
          events++;
          if (!now.some((a) => a.type === x.evType && overlaps(x, a)) && !x.actors.some((a) => a.type === x.evType && overlaps(x, a)))
            bad.push(`${name} frame ${f + 1}: event ${x.evKind} with type ${x.evType} without an overlap`);
          continue;
        }
        // an overlap with a live enemy that hurts (or one Bo lands on) must have been handled this frame
        if (p.inv > 0 || x.inv > 0 || p.state >= 3 || x.state >= 3) continue;
        for (const a of now) {
          const flags = bo.rom[S('en_table') + a.type * 8 + 5]!;
          const harmful = (flags & 1) !== 0 && !(a.type === 8 && a.sub === 2);
          if (harmful && overlaps(x, a)) bad.push(`${name} frame ${f + 1}: overlap with type ${a.type} at ${a.x},${a.y} unhandled`);
        }
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
    expect(events).toBeGreaterThan(20);
  });

  it('the replays show every outcome of every row of the enemy table: landing on it (and its joke) and touching it', () => {
    expect(ENEMY_ROWS.length).toBe(13);
    const EV = { STOMP: 1, HIT: 2, HELMET: 3, BOUNCE: 4, SPIKY: 7 };
    for (const row of ENEMY_ROWS) {
      const type = TYPE_OF[row.name]!;
      expect(type, row.name).toBeDefined();
      const hitType = PROJ[type] ?? type;
      let landed = false;
      let touched = false;
      for (const { frames: s } of all) {
        for (let f = 1; f < s.length; f++) {
          const x = s[f]!;
          const p = s[f - 1]!;
          if (x.evN === p.evN) continue;
          if (x.evType === hitType && (x.evKind === EV.HIT || x.evKind === EV.HELMET)) touched = true;
          if (x.evType !== type) continue;
          // landing on it: the row says what happens
          const land = row.land.replace(/\*\*/g, '');
          if (/^träff/.test(land) || land.startsWith('– (hoppa')) {
            if (x.evKind === EV.SPIKY) landed = true; // landing on it hurts (hedgehog, sled)
          } else if (row.land === '–') {
            if (x.evKind === EV.BOUNCE) landed = true; // nothing happens (the popcorn cannon): Bo just bounces off
          } else if (/studsar extra högt/.test(row.land)) {
            if (x.evKind === EV.BOUNCE && x.vy === -CONSTS.BOUNCE_V! + 0) landed = true; // jelly: BOUNCE_V
          } else if (x.evKind === EV.STOMP) {
            // the joke: the enemy is done (drifting away or asleep), plus what the row says
            let joke = x.actors.some((a) => a.type === type && (a.st === 1 || a.st === 2));
            if (/blir ett äpple|godisbit/.test(row.land)) joke &&= x.newApples.length > 0;
            if (/somnar/.test(row.land)) joke &&= x.actors.some((a) => a.type === type && a.st === 2);
            if (/Bo studsar högt/.test(row.land)) joke &&= x.vy === -CONSTS.BOUNCE_V!;
            landed ||= joke;
          }
        }
      }
      expect(landed, `${row.name}: ${row.land}`).toBe(true);
      expect(touched, `${row.name}: ${row.touch}`).toBe(true);
    }
  });
});

describe('power-ups and items (M21, DESIGN §5–7)', () => {
  it('the apple helmet absorbs exactly one hit and gives 120 frames of invulnerability', () => {
    let n = 0;
    for (const { name, frames: s } of all) {
      for (let f = 1; f < s.length; f++) {
        const x = s[f]!;
        const p = s[f - 1]!;
        if (x.evN === p.evN || x.evKind !== 3) continue;
        n++;
        expect(p.helmet, `${name} frame ${f + 1}`).toBe(1);
        expect(x.helmet).toBe(0);
        expect(x.lives).toBe(p.lives);
        expect(x.inv).toBe(120);
        // 120 frames: no contact event while blinking
        let k = f + 1;
        while (k < s.length && s[k]!.inv > 0) {
          expect(s[k]!.evN, `${name} frame ${k + 1}: a contact while blinking`).toBe(x.evN);
          k++;
        }
        expect(k - f).toBe(120);
      }
    }
    expect(n).toBeGreaterThanOrEqual(13);
  });

  it('pommes lasts 600 frames, its top speed is 2.5 px per frame and the music plays at 2/3 note lengths; a seagull takes it without damage; it changes nothing else', () => {
    const s = all[1]!.frames;
    // a pommes run that is neither stolen nor lost: exactly 600 frames
    const starts = s.map((x, f) => (f > 0 && x.pw === 1 && s[f - 1]!.pw !== 1 ? f : -1)).filter((f) => f >= 0);
    let full = 0;
    for (const f0 of starts) {
      let e = f0;
      while (e < s.length && s[e]!.pw === 1 && s[e]!.state < 3 && !(s[e]!.evN !== s[e - 1]!.evN && s[e]!.evKind === 5)) e++;
      if (e < s.length && s[e]!.pw === 0 && s[e - 1]!.pwT === 1) {
        full++;
        expect(e - f0, 'pommes frames').toBe(600);
      }
    }
    expect(full).toBeGreaterThan(0);
    // top speed while pushing with pommes
    const top = Math.max(...s.filter((x) => x.pw === 1 && x.grounded && (x.sattr & 15) === 1).map((x) => Math.abs(x.vx)));
    expect(top).toBe(CONSTS.POMMES_MAX);
    // the music: melody notes last 2/3 of their frames with pommes
    const melody = (want: number) => new Set(s.filter((x) => x.pw === want && x.playing).flatMap((x) => x.audio.filter((a) => a.channel === 0 && a.volume === 4).map((a) => a.duration)));
    const normal = melody(0);
    const fast = melody(1);
    console.log(`[measured] melody note lengths: normal ${[...normal].sort((a, b) => a - b)}, pommes ${[...fast].sort((a, b) => a - b)}`);
    expect(fast.size).toBeGreaterThan(0);
    for (const d of fast) expect([...normal].some((n) => Math.floor((n * 2) / 3) === d), `pommes note length ${d}`).toBe(true);
    // the seagull takes the pommes: no damage
    const steal = s.findIndex((x, f) => f > 0 && x.evN !== s[f - 1]!.evN && x.evKind === 5);
    expect(steal).toBeGreaterThan(0);
    expect(s[steal - 1]!.pw).toBe(1);
    expect(s[steal]!.pw).toBe(0);
    expect(s[steal]!.lives).toBe(s[steal - 1]!.lives);
    expect(s[steal]!.helmet).toBe(s[steal - 1]!.helmet);
    expect(s[steal]!.bub).toBe(S('TX_NEJ_MINA_POMMES'));
    // nothing else: touching another enemy with pommes is still a hit
    const withPommes = s.filter((x, f) => f > 0 && x.evN !== s[f - 1]!.evN && s[f - 1]!.pw === 1 && x.evType !== 2);
    expect(withPommes.length).toBeGreaterThan(0);
    for (const x of withPommes) expect([2, 3], 'a hit, with pommes too').toContain(x.evKind);
  });

  it('godis gives exactly one extra jump per airtime', () => {
    const s = all[1]!.frames;
    let jumps = 0;
    for (let f = 1; f < s.length; f++) {
      const x = s[f]!;
      if (x.pw !== 2 || x.grounded || x.state !== 1 || !(x.input & 32) || s[f - 1]!.input & 32 || x.input & 15) continue;
      // B alone in the air with godis
      let k = f - 1;
      let before = 0;
      while (k > 0 && !s[k]!.grounded) {
        if (s[k]!.trick === 5) before++;
        k--;
      }
      if (before === 0) {
        jumps++;
        expect(x.vy, 'the godissnurr is a new ollie').toBe(-CONSTS.JUMP_V! + CONSTS.G!);
        expect(x.trick).toBe(5);
      } else {
        expect(x.trick, 'a second B in the same airtime is a kickflip').toBe(1);
        expect(x.vy).not.toBe(-CONSTS.JUMP_V! + CONSTS.G!);
      }
    }
    expect(jumps).toBeGreaterThan(0);
  });

  it('100 apples give one life', () => {
    const s = all[0]!.frames;
    const f = s.findIndex((x) => x.apples >= 100);
    expect(f).toBeGreaterThan(0);
    expect(s[f]!.lives).toBe(s[f - 1]!.lives + 1);
    expect(s[f]!.bub).toBe(S('TX_ETT_LIV_TILL'));
  });
});

describe("Bo's voice (M21, DESIGN §11–12)", () => {
  it('a TypeScript decoder of the ROM text reproduces every line of DESIGN §11–12 byte for byte', () => {
    const sec = design.slice(design.indexOf('## 11.'), design.indexOf('## 13.'));
    const lines = [...new Set([...sec.matchAll(/`([^`]+)`/g)].map((m) => m[1]!).filter((t) => [...t].every((c) => ORDER.includes(c))))];
    expect(lines.length).toBeGreaterThan(30);
    const rd16 = (a: number) => bo.rom[a]! | (bo.rom[a + 1]! << 8);
    const table = S('text_table');
    const texts: string[] = [];
    for (let i = 0; i < S('NUM_TEXTS'); i++) {
      let p = rd16(table + i * 2);
      let t = '';
      for (let b = bo.rom[p]!; b !== 255; b = bo.rom[++p]!) t += b === 254 ? ' ' : ORDER[b];
      texts.push(t);
    }
    for (const l of lines) expect(texts, l).toContain(l);
  });

  it('rendered bubble frames match the committed reference frames (from the VM)', () => {
    let n = 0;
    for (const name of ZOO) {
      const framesFile = join(GAME_DIR, 'replays', `${name}.frames.json`);
      expect(existsSync(framesFile)).toBe(true);
      const want = new Set(JSON.parse(readFileSync(framesFile, 'utf8')) as number[]);
      const rf = loadReplay(name);
      const vm = VM.fromCartridge(bo.cart, { seed: rf.seed ?? 1 });
      const inputs = expandInputs(rf.inputs, rf.frames);
      for (let f = 0; f < rf.frames; f++) {
        vm.step(inputs[f]!);
        if (!want.has(f + 1)) continue;
        expect(vm.read16(S('bub_t')), `${name} frame ${f + 1} shows a bubble`).toBeGreaterThan(0);
        const ref = readFramePng(join(GAME_DIR, 'replays', `${name}.f${f + 1}.png`));
        expect(Buffer.from(vm.fb).equals(Buffer.from(ref)), `${name} frame ${f + 1}`).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(8);
  });
});
