import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../../games/blackbox/tools/gen';
import { generateTiles } from '../../games/blackbox/tools/tiles';
import { BLOCKS_WALK, GAME_DIR, H, W, buildBlackbox, expectedHashes, loadReplay, newVm, replayInputs, roomById, rooms, s16, symbol, tileClass } from './oracle';

// M13 acceptance: rooms, movement, HUD. PLAN.md Part 2.
const CODE_CLASS: Record<number, string> = { 0: '.', 1: '#', 2: '#', 3: 'S', 4: 'C', 5: '=', 6: '+', 7: 'D', 8: 'V', 9: 'T', 10: 'E', 11: 'L', 12: 'K' };
const SIDES = ['N', 'S', 'E', 'W'];
let bb: Awaited<ReturnType<typeof buildBlackbox>>;

beforeAll(async () => {
  bb = await buildBlackbox();
});

describe('BLACKBOX build', () => {
  it('generated data files are up to date with LAYOUT.md and the tile art', () => {
    expect(readFileSync(join(GAME_DIR, 'rooms.gen.asm'), 'utf8')).toBe(generate());
    expect(readFileSync(join(GAME_DIR, 'tiles.gen.asm'), 'utf8')).toBe(generateTiles());
  });

  it('reports the cartridge and ROM size', () => {
    const rom = bb.cart.sections.code.length + bb.cart.sections.rodata.length + bb.cart.sections.sound.length;
    console.log(`[size] blackbox: cartridge ${bb.bytes.length} B, ROM ${rom} B of 32768 (code ${bb.cart.sections.code.length}, data ${bb.cart.sections.rodata.length})`);
    expect(rom).toBeLessThanOrEqual(32768);
  });
});

describe('rooms (M13)', () => {
  it('the ROM room table, decoded independently, matches LAYOUT.md: tiles, exits, locks, warps', () => {
    const rom = new Uint8Array(0x10000);
    rom.set(bb.cart.sections.code, 0);
    rom.set(bb.cart.sections.rodata, bb.cart.sections.code.length);
    const rd16 = (a: number) => rom[a]! | (rom[a + 1]! << 8);
    const table = symbol(bb.sym, 'room_table');
    const rec = symbol(bb.sym, 'ROOM_REC');
    const index = new Map(rooms.map((r, i) => [r.id, i]));
    const flagIndex = (f: string) => symbol(bb.sym, `F_${f}`);
    rooms.forEach((r, i) => {
      const base = table + i * rec;
      // tiles: RLE, high nibble = run length - 1, low nibble = code
      let p = rd16(base);
      const codes: number[] = [];
      while (codes.length < W * H) {
        const b = rom[p++]!;
        for (let k = 0; k <= b >> 4; k++) codes.push(b & 15);
      }
      expect(codes.length, r.id).toBe(W * H);
      const decoded = Array.from({ length: H }, (_, y) => codes.slice(y * W, y * W + W).map((c) => CODE_CLASS[c] ?? '?').join(''));
      expect(decoded, r.id).toEqual(r.grid.map((row) => [...row].map(tileClass).join('')));
      SIDES.forEach((side, s) => {
        const to = r.exits.get(side);
        expect(rom[base + 2 + s], `${r.id} exit ${side}`).toBe(to === undefined ? 255 : to === 'END' ? 254 : index.get(to));
        const lock = r.locks.get(side);
        expect(rom[base + 6 + s], `${r.id} lock ${side}`).toBe(lock ? flagIndex(lock) : 255);
      });
      expect(rom[base + 10], `${r.id} warp`).toBe(r.warp ? (r.warp.to === 'END' ? 254 : index.get(r.warp.to)) : 255);
      expect(rom[base + 11], `${r.id} warp flag`).toBe(r.warp?.flag ? flagIndex(r.warp.flag) : 255);
    });
  });

  it('every room, loaded by the engine into RAM, holds exactly the LAYOUT.md grid (tile class by tile class)', () => {
    const buf = symbol(bb.sym, 'room_buf');
    rooms.forEach((r, i) => {
      const vm = newVm(bb.cart);
      vm.step(0);
      vm.write16(symbol(bb.sym, 'dbg_room'), i + 1);
      vm.step(0);
      expect(vm.fault).toBeNull();
      expect(vm.read16(symbol(bb.sym, 'room')), r.id).toBe(i);
      const got = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => CODE_CLASS[vm.read8(buf + y * W + x)] ?? '?').join(''));
      expect(got, r.id).toEqual(r.grid.map((row) => [...row].map(tileClass).join('')));
    });
  });
});

describe('replay m13-walk (M13)', () => {
  it('matches the committed per-frame hashes; the player never overlaps a blocking tile; a locked door holds until its flag', () => {
    const rf = loadReplay('m13-walk');
    const inputs = replayInputs(rf);
    const expected = expectedHashes('m13-walk');
    const vm = newVm(bb.cart, rf.seed);
    const S = (n: string) => symbol(bb.sym, n);
    const ids = rooms.map((r) => r.id);
    const visited: string[] = [];
    let maxCycles = 0;
    const flagSet = (f: string) => (vm.read8(S('flags') + (S(`F_${f}`) >> 3)) >> (S(`F_${f}`) & 7)) & 1;
    const problems: string[] = [];
    for (let f = 0; f < rf.frames; f++) {
      vm.step(inputs[f]!);
      maxCycles = Math.max(maxCycles, vm.cyclesLastFrame);
      if (vm.stateHash() !== expected[f]) problems.push(`frame ${f + 1}: hash differs`);
      if (vm.read16(S('mode')) !== S('M_PLAY')) continue;
      const room = roomById.get(ids[vm.read16(S('room'))]!)!;
      if (visited[visited.length - 1] !== room.id) visited.push(room.id);
      // collision box against the LAYOUT grid (doors on a side count as open once that side's flag is set)
      const px = s16(vm.read16(S('px')));
      const py = s16(vm.read16(S('py')));
      const x0 = px + S('PBOX_X');
      const y0 = py + S('PBOX_Y');
      for (let y = y0 >> 3; y <= (y0 + S('PBOX_H') - 1) >> 3; y++) {
        for (let x = x0 >> 3; x <= (x0 + S('PBOX_W') - 1) >> 3; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const c = tileClass(room.grid[y]![x]!);
          if (!BLOCKS_WALK.has(c)) continue;
          if (c === 'D') {
            const side = y === 0 ? 'N' : y === H - 1 ? 'S' : x === W - 1 ? 'E' : 'W';
            const lock = room.locks.get(side);
            if (lock && flagSet(lock)) continue;
          }
          problems.push(`frame ${f + 1}: player box (${x0},${y0}) overlaps '${c}' at ${room.id} (${x},${y})`);
        }
      }
      if (room.id === '1.4' && !flagSet('BADGE')) problems.push(`frame ${f + 1}: reached 1.4 without the BADGE`);
    }
    expect(problems.slice(0, 10)).toEqual([]);
    expect(expected.length).toBe(rf.frames);
    // title -> apartment -> gate -> lobby -> checkpoint (door locked) -> lobby (badge) -> checkpoint -> corridor -> office -> corridor
    expect(visited).toEqual(['0.1', '1.1', '1.2', '1.3', '1.2', '1.3', '1.4', '2.1', '1.4']);
    expect(vm.fault).toBeNull();
    expect(vm.overruns).toBe(0);
    console.log(`[budget] m13-walk: ${rf.frames} frames, max ${maxCycles} cycles per frame`);
    expect(maxCycles).toBeLessThanOrEqual(25_000);
  });
});
