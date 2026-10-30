// PLAN.md M31: the game around the level, against LEVEL.md (read here on its own) and the map: the objectives in
// LEVEL.md's order in the full-game replay, the victory only after the last one, the statistics read off the screen
// (with the VM's font) equal to what the replay did, the checkpoint's restart restores its snapshot, every secret,
// pickup and enemy is reached or killed in some replay, the attract fly-through loops, and the full game's budget.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CELL_W, FONT, type VM } from '@qrc/vm';
import { GAME_DIR, K, readRefMap, readRefSprites } from './ref';
import { REPLAYS, buildNadir, runReplay, type Nadir } from './play';

const map = readRefMap('nadir');
const W = map.grid[0]!.length;
const sprites = readRefSprites();
const GS = { TITLE: 0, PLAY: 1, LIFT: 2, STATS: 3 };

// ---- LEVEL.md
const level = readFileSync(join(GAME_DIR, 'LEVEL.md'), 'utf8');
function table(head: string): string[][] {
  const part = level.slice(level.indexOf(head)).split('\n## ')[0]!;
  return part
    .split('\n')
    .filter((l) => /^\| \d/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}
const nums = (s: string) => s.split(/\s+/).map(Number);
const OBJECTIVES = table('## Målen').map((r) => nums(r[2]!)).map(([x, y]) => y! * W + x!);
const [CHECK_AFTER, CHECK_POSE] = (() => {
  const r = table('## Kontrollpunkten')[0]!;
  return [Number(r[0]), nums(r[1]!)] as const;
})();
const SECRETS = table('## Hemligheterna').map((r) => nums(r[3]!)).map(([x, y]) => y! * W + x!);
const pickups = map.props.map((p, i) => ({ ...p, i })).filter((p) => sprites.find((s) => s.char === p.s)!.pick);

const cellOf = (n: Nadir, vm: VM) => (vm.read16(n.S('cam_y')) >> 8) * W + (vm.read16(n.S('cam_x')) >> 8);
const enemyStates = (n: Nadir, vm: VM) => Array.from({ length: n.S('NUM_ENEMIES') }, (_, i) => vm.read8(n.S('enemies') + 24 * i + 4));

/** reads a line of text at y from x on (the VM's 3 x 5 font in 4 x 6 cells, background colour 0) */
function readLine(vm: VM, x0: number, y: number): string {
  let out = '';
  let blanks = 0;
  for (let x = x0; x + 3 <= 128; x += CELL_W) {
    let bits = 0;
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) bits = (bits << 1) | (vm.fb[(y + gy) * 128 + x + gx] ? 1 : 0);
    const c = FONT.indexOf(bits);
    if (bits === 0) {
      if (++blanks > 1) break;
      out += ' ';
      continue;
    }
    blanks = 0;
    out += c < 0 ? '?' : String.fromCharCode(32 + c);
  }
  return out.trim();
}

describe('M31 the game (LEVEL.md)', () => {
  it('m31-game: title -> the objectives in LEVEL.md order -> the lift -> statistics equal to the replay -> title; mean <= 18 000', async () => {
    const n = await buildNadir();
    let gPrev = GS.TITLE;
    let obj = 0;
    const objFrames: number[] = [];
    let playFrames = 0;
    let kills = 0;
    let shots = 0;
    let hitShots = 0;
    let deaths = 0;
    const found = new Set<number>();
    let statsSeen = false;
    let titleAgain = false;
    let prevStates: number[] = [];
    let prevShots = 0;
    let prevDead = 0;
    let liftAt = -1;
    const run = runReplay(n, 'm31-game', (f, vm) => {
      const g = vm.read16(n.S('gstate'));
      const where = `frame ${f + 1}`;
      if (gPrev === GS.PLAY) {
        // the game's logic ran this frame: count what happened
        playFrames++;
        const st = enemyStates(n, vm);
        kills += st.filter((s, i) => s === 7 && prevStates[i] !== 7).length;
        prevStates = st;
        const sh = vm.read16(n.S('shots'));
        if (sh !== prevShots) {
          shots++;
          const pel = Array.from({ length: K.PELLETS! }, (_, k) => vm.read8(n.S('pel_hit') + k));
          if (pel.some((p) => p < 128)) hitShots++;
        }
        prevShots = sh;
        const dead = vm.read16(n.S('dead'));
        if (dead && !prevDead) deaths++;
        prevDead = dead;
        const cell = cellOf(n, vm);
        if (SECRETS.includes(cell)) found.add(cell);
        const o = vm.read16(n.S('obj'));
        if (o !== obj) {
          expect(o, `${where}: objectives one at a time`).toBe(obj + 1);
          expect(cell, `${where}: objective ${o} in its LEVEL.md cell`).toBe(OBJECTIVES[o - 1]);
          objFrames.push(f);
          obj = o;
        }
        if (g === GS.LIFT) {
          expect(obj, `${where}: the lift only after every objective`).toBe(OBJECTIVES.length);
          liftAt = f;
        }
      } else if (g === GS.PLAY && gPrev === GS.TITLE) prevStates = enemyStates(n, vm);
      if (g === GS.STATS && vm.read16(n.S('st_t')) > 60 && !statsSeen) {
        statsSeen = true;
        const s = Math.floor(playFrames / 60);
        const lines = [40, 52, 64, 76, 88].map((y) => [readLine(vm, 24, y), readLine(vm, 80, y)]);
        console.log(`[game] statistics on screen: ${lines.map((l) => l.join(' ')).join(', ')}`);
        expect(readLine(vm, 32, 16)).toBe('MISSION COMPLETE');
        expect(lines).toEqual([
          ['TIME', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`],
          ['KILLS', `${kills}/${map.enemies.length}`],
          ['SECRETS', `${found.size}/${SECRETS.length}`],
          ['ACCURACY', `${shots ? Math.floor((hitShots * 100) / shots) : 0}%`],
          ['DEATHS', `${deaths}`],
        ]);
        // and they are the RAM counters
        expect(vm.read16(n.S('kills'))).toBe(kills);
        expect(vm.read16(n.S('shots'))).toBe(shots);
        expect(vm.read16(n.S('shots_hit'))).toBe(hitShots);
        expect(vm.read16(n.S('restarts'))).toBe(deaths);
      }
      if (statsSeen && g === GS.TITLE) titleAgain = true;
      gPrev = g;
    });
    console.log(`[game] m31-game: objectives at frames ${objFrames.map((f) => f + 1).join(', ')}, lift at ${liftAt + 1}, ${kills} kills, ${found.size} secrets, ${shots} shots (${hitShots} hit), ${run.rf.frames} frames, max ${run.max}, mean ${run.mean.toFixed(0)}`);
    expect(objFrames.length).toBe(OBJECTIVES.length);
    expect(liftAt).toBeGreaterThan(0);
    expect(statsSeen).toBe(true);
    expect(titleAgain).toBe(true);
    expect(run.vm.fault).toBeNull();
    expect(run.vm.overruns).toBe(0);
    expect(run.max).toBeLessThanOrEqual(25_000);
    expect(run.mean).toBeLessThanOrEqual(18_000);
  });

  it('m31-checkpoint: a death past the checkpoint restarts there with the state of its snapshot', async () => {
    const n = await buildNadir();
    // DESIGN §6.5's snapshot: the regions and counters the restart must restore
    const regions: [string, number][] = [
      ['enemies', n.S('NUM_ENEMIES') * 24],
      ['props', (n.S('NUM_PROPS') + n.S('NUM_ENEMIES')) * 8],
      ['bar_hp', n.S('NUM_PROPS')],
      ['bar_boom', n.S('NUM_PROPS')],
      ['doors', n.S('NUM_DOORS') * 16],
      ...['hp', 'w_mag', 'w_res', 'keys', 'picked_med', 'picked_ammo', 'obj', 'kills', 'sec_bits', 'shots', 'shots_hit'].map((v) => [v, 2] as [string, number]),
    ];
    const dump = (vm: VM) => regions.map(([v, len]) => Array.from(vm.mem.slice(n.S(v), n.S(v) + len)));
    let snap: number[][] | null = null;
    let restartAt = -1;
    let checked = 0;
    let prevRestarts = 0;
    runReplay(n, 'm31-checkpoint', (f, vm) => {
      if (!snap && vm.read16(n.S('obj')) === CHECK_AFTER) snap = dump(vm);
      const r = vm.read16(n.S('restarts'));
      if (r !== prevRestarts) {
        expect(snap, 'a death after the checkpoint').not.toBeNull();
        const now = dump(vm);
        regions.forEach(([v], i) => expect(now[i], `frame ${f + 1}: ${v} after the restart`).toEqual(snap![i]));
        expect(vm.read16(n.S('dead'))).toBe(0);
        restartAt = f;
        checked++;
      }
      if (restartAt >= 0 && f === restartAt + 1) {
        // the next frame puts the player at the checkpoint's pose (DESIGN §5's pose hook)
        expect([vm.read16(n.S('cam_x')), vm.read16(n.S('cam_y')), vm.read16(n.S('cam_a'))]).toEqual([
          Math.round(CHECK_POSE[0]! * 256),
          Math.round(CHECK_POSE[1]! * 256),
          Math.round((CHECK_POSE[2]! * 4096) / 360) & 4095,
        ]);
      }
      prevRestarts = r;
    });
    expect(checked).toBe(1);
  });

  it('every secret and pickup of LEVEL.md is reached and every enemy is killed in some replay', async () => {
    const n = await buildNadir();
    const secrets = new Set<number>();
    const reached = new Set<number>();
    const killed = new Set<number>();
    for (const name of REPLAYS)
      runReplay(n, name, (_f, vm) => {
        if (vm.read16(n.S('gstate')) !== GS.PLAY) return;
        const cell = cellOf(n, vm);
        if (SECRETS.includes(cell)) secrets.add(cell);
        const x = vm.read16(n.S('cam_x'));
        const y = vm.read16(n.S('cam_y'));
        for (const p of pickups) if (Math.abs(x - Math.round(p.x * 256)) < K.P_RAD! + K.PICK_HALF! && Math.abs(y - Math.round(p.y * 256)) < K.P_RAD! + K.PICK_HALF!) reached.add(p.i);
        enemyStates(n, vm).forEach((s, i) => s === 7 && killed.add(i));
      });
    expect([...secrets].sort(), 'secrets found').toEqual([...SECRETS].sort());
    expect(pickups.filter((p) => !reached.has(p.i)).map((p) => `${p.s} ${p.x} ${p.y}`), 'pickups never reached').toEqual([]);
    expect(map.enemies.map((_, i) => i).filter((i) => !killed.has(i)), 'enemies never killed').toEqual([]);
  });

  it('m31-attract: the title fly-through loops (the framebuffer at f equals the one at f + P)', async () => {
    const n = await buildNadir();
    const P = n.S('AT_SEGS') * n.S('AT_FRAMES');
    const hashes: string[] = [];
    let title = true;
    runReplay(n, 'm31-attract', (_f, vm) => {
      title &&= vm.read16(n.S('gstate')) === GS.TITLE;
      hashes.push(Buffer.from(vm.fb).toString('base64'));
    });
    expect(title).toBe(true);
    let equal = 0;
    for (let f = 200; f + P < hashes.length; f += 7) {
      expect(hashes[f + P], `frame ${f + 1} and ${f + 1 + P}`).toBe(hashes[f]);
      equal++;
    }
    console.log(`[game] attract: period ${P} frames, ${equal} frames equal one period later`);
    expect(equal).toBeGreaterThan(100);
    expect(new Set(hashes.slice(200, 200 + P)).size, 'it moves').toBeGreaterThan(P / 4);
  });
});
