// PLAN.md M27: the level in RAM against its source, the collision oracle, the player's curves and the doors,
// every frame of every replay, against DESIGN §3.10 and §5 as read by test/nadir/ref.ts.
import { describe, expect, it } from 'vitest';
import { VM, expandInputs, type ReplayFile } from '@qrc/vm';
import { K, mapByte, readRefMap, refLight, solid, stepDoor, stepPlayer, type PlayerState } from './ref';
import { REPLAYS, buildNadir, loadReplay, type Nadir } from './play';

const map = readRefMap('nadir');
const W = map.grid[0]!.length;
const H = map.grid.length;


const s16 = (v: number) => (v << 16) >> 16;

function readPlayer(n: Nadir, vm: VM): PlayerState {
  const r = (name: string) => vm.read16(n.S(name));
  return { x: r('cam_x'), y: r('cam_y'), a: r('cam_a'), v: s16(r('walk_v')), turnK: r('turn_k'), turnDir: s16(r('turn_dir')), tapDir: s16(r('tap_dir')), tapTick: r('tap_tick'), dashN: r('dash_n'), dashDir: s16(r('dash_dir')), bobPh: r('bob_ph'), bob: s16(r('bob')) };
}
const doorAt = (n: Nadir, vm: VM, i: number) => {
  const b = n.S('doors') + 16 * i;
  return { cell: vm.read16(b), open: vm.read16(b + 2), state: vm.read8(b + 4), timer: vm.read8(b + 5), orient: vm.read8(b + 6), key: vm.read8(b + 7), mat: vm.read8(b + 8) };
};

/** Runs a replay frame by frame; `each` gets the state before and after each frame. */
function walk(n: Nadir, name: string, each: (f: number, vm: VM, held: number, pressed: number, before: { p: PlayerState; doors: ReturnType<typeof doorAt>[]; keys: number }) => void) {
  const rf: ReplayFile & { frames: number } = loadReplay(name);
  const inputs = expandInputs(rf.inputs, rf.frames);
  const vm = VM.fromCartridge(n.cart, { seed: rf.seed ?? 1 });
  vm.step(inputs[0]!); // init and the first frame (the start pose)
  for (let f = 1; f < rf.frames; f++) {
    const before = { p: readPlayer(n, vm), doors: map.doors.map((_, i) => doorAt(n, vm, i)), keys: vm.read16(n.S('keys')) };
    const held = inputs[f]!;
    const pressed = held & ~inputs[f - 1]!;
    vm.step(held);
    each(f, vm, held, pressed, before);
  }
  return vm;
}

describe('M27 world', () => {
  it('every cell, door, key trigger, zone and lamp in RAM equals levels/nadir.map (independent reader)', async () => {
    const n = await buildNadir();
    const vm = VM.fromCartridge(n.cart, { seed: 1 });
    vm.step(0);
    const light = refLight(map);
    let cells = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        expect(vm.read8(n.S('map') + i), `map byte at ${x},${y}`).toBe(mapByte(map, x, y));
        expect(vm.read8(n.S('zmap') + i), `zone at ${x},${y}`).toBe(map.zones[y]![x]!);
        const L = light[y]![x]!;
        expect(vm.read8(n.S('lmap') + i), `light at ${x},${y}`).toBe(Math.min(7, L.s) | (Math.min(7, L.f) << 3) | (L.g << 6));
        cells++;
      }
    expect(n.S('NUM_DOORS')).toBe(map.doors.length);
    map.doors.forEach((d, i) => {
      const r = doorAt(n, vm, i);
      expect(r.cell).toBe(d.y * W + d.x);
      expect(r.orient).toBe(solid(map, d.x, d.y - 1) && solid(map, d.x, d.y + 1) ? 1 : 0);
      expect(r.key).toBe(d.key);
    });
    expect(n.S('NUM_KEYS')).toBe(map.keys.length);
    map.keys.forEach((k, i) => {
      expect(vm.read16(n.S('key_tab') + 4 * i)).toBe(k.y * W + k.x);
      expect(vm.read16(n.S('key_tab') + 4 * i + 2)).toBe(k.bit);
    });
    expect(n.S('NUM_LAMPS')).toBe(map.lamps.length);
    map.lamps.forEach((l, i) => expect([0, 1, 2, 3].map((k) => vm.read8(n.S('lamps') + 4 * i + k))).toEqual([l.x, l.y, l.i, l.g]));
    console.log(`[world] ${cells} cells, ${map.doors.length} doors, ${map.keys.length} key, ${map.lamps.length} lamps match the source`);
  });

  for (const name of REPLAYS)
    it(`${name}: collision oracle, the player's curves (DESIGN §5) and the doors (DESIGN §3.10) in every frame`, async () => {
      const n = await buildNadir();
      const R = K.P_RAD! / 256;
      let maxMove = 0;
      let frames = 0;
      let blockedX = 0;
      let dashes = 0;
      let opened = 0;
      const lockedRefused = new Set<number>();
      walk(n, name, (f, vm, held, pressed, before) => {
        frames++;
        const tick = vm.read16(n.S('tick'));
        // the player follows DESIGN §5 exactly (passable from the door state before the frame)
        const passable = (cx: number, cy: number) => {
          const c = map.grid[cy]?.[cx];
          if (c === '.') return true;
          if (c !== '+') return false;
          return before.doors[map.doors.findIndex((d) => d.x === cx && d.y === cy)]!.open === 256;
        };
        const want = stepPlayer(before.p, held, pressed, tick, passable);
        const got = readPlayer(n, vm);
        expect(got, `frame ${f + 1}`).toEqual(want);
        if (got.dashN === K.DASH_FRAMES! - 1) dashes++;
        // collision: the circle never overlaps a solid cell or a door that is not fully open, never leaves the map
        const x = got.x / 256;
        const y = got.y / 256;
        expect(x - R >= 1 && y - R >= 1 && x + R <= W - 1 && y + R <= H - 1, `frame ${f + 1}: outside the map`).toBe(true);
        for (let cy = Math.floor(y - R); cy <= Math.floor(y + R); cy++)
          for (let cx = Math.floor(x - R); cx <= Math.floor(x + R); cx++) {
            if (!solid(map, cx, cy)) continue;
            const qx = Math.max(cx, Math.min(cx + 1, x));
            const qy = Math.max(cy, Math.min(cy + 1, y));
            if (Math.hypot(x - qx, y - qy) >= R) continue;
            const di = map.doors.findIndex((d) => d.x === cx && d.y === cy);
            expect(di >= 0 && doorAt(n, vm, di).open === 256 && before.doors[di]!.open === 256, `frame ${f + 1}: the player circle overlaps ${cx},${cy}`).toBe(true);
          }
        const move = Math.hypot(got.x - before.p.x, got.y - before.p.y);
        maxMove = Math.max(maxMove, move);
        expect(move, `frame ${f + 1}: moved ${move}`).toBeLessThanOrEqual(K.P_RAD!);
        if (got.x === before.p.x && want.x === before.p.x && held & 12) blockedX++;
        // keys, then the doors' state machine after the player moved
        let keys = before.keys;
        for (const k of map.keys) if (Math.floor(x) === k.x && Math.floor(y) === k.y) keys |= k.bit;
        expect(vm.read16(n.S('keys')), `frame ${f + 1}: keys`).toBe(keys);
        map.doors.forEach((d, i) => {
          const r = doorAt(n, vm, i);
          const bd = before.doors[i]!;
          const w = stepDoor({ open: bd.open, state: bd.state, timer: bd.timer }, d.x, d.y, d.key, keys, got.x, got.y);
          expect({ open: r.open, state: r.state, timer: r.timer }, `frame ${f + 1}: door ${i}`).toEqual(w);
          expect(r.mat).toBe(d.key === 0 || keys & d.key ? n.S('MAT_DOOR') : n.S('MAT_LOCKEDDOOR'));
          if (before.doors[i]!.state === 1 && r.state === 2) opened++;
          // a locked door never leaves CLOSED without its key
          if (d.key && !(keys & d.key)) {
            expect(r.state).toBe(0);
            if (Math.abs(got.x - (d.x * 256 + 128)) < K.DOOR_REACH! && Math.abs(got.y - (d.y * 256 + 128)) < K.DOOR_REACH!) lockedRefused.add(i);
          }
        });
      });
      console.log(`[world] ${name}: ${frames} frames, largest step ${maxMove.toFixed(1)} units, ${blockedX} blocked frames, ${dashes} side steps, ${opened} doors fully opened, locked door refused: ${lockedRefused.size > 0}`);
      if (name === 'm27-doors') {
        expect(opened).toBeGreaterThanOrEqual(3);
        expect(lockedRefused.size).toBe(1);
      }
      if (name === 'm27-walk') expect(dashes).toBeGreaterThanOrEqual(4);
    });

  it('door timing: a door takes 256 / DOOR_SPEED frames to open and closes DOOR_WAIT frames after the player left (m27-doors)', async () => {
    const n = await buildNadir();
    const opening: number[] = [];
    const waits: number[] = [];
    const startOpen = new Map<number, number>();
    const startWait = new Map<number, number>();
    walk(n, 'm27-doors', (f, vm, _h, _p, before) => {
      map.doors.forEach((_, i) => {
        const r = doorAt(n, vm, i);
        const b = before.doors[i]!;
        if (b.state === 0 && r.state === 1) startOpen.set(i, f);
        if (b.state === 1 && r.state === 2 && startOpen.has(i)) opening.push(f - startOpen.get(i)!);
        if (r.state === 2 && r.timer === K.DOOR_WAIT! - 1) startWait.set(i, f);
        if (b.state === 2 && r.state === 3 && startWait.has(i)) waits.push(f - startWait.get(i)! + 1);
      });
    });
    console.log(`[doors] opening ${opening.join(', ')} frames; waits ${waits.join(', ')} frames`);
    expect(opening.length).toBeGreaterThan(0);
    expect(opening.every((d) => d === 256 / K.DOOR_SPEED!)).toBe(true);
    expect(waits.length).toBeGreaterThan(0);
    expect(waits.every((d) => d === K.DOOR_WAIT!)).toBe(true);
  });
});
