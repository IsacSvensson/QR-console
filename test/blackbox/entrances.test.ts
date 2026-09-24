import { beforeAll, describe, expect, it } from 'vitest';
import { Bot } from '../../games/blackbox/tools/bot';
import { BLOCKS_WALK, H, W, buildBlackbox, newVm, rooms, symbol, tileClass, type OracleRoom } from './oracle';

// Every way into every room must be survivable: a player who has just come in (or been sent back to the door
// by a restart) gets GRACE_FRAMES to step out of any line of sight. Without it, a watcher facing a doorway
// catches the player on arrival, the room restarts at the same doorway, and the game loops forever
// (found on a phone: 2.1 entered from 2.6, the office guard looking up the centre aisle at the N door).
let bb: Awaited<ReturnType<typeof buildBlackbox>>;
beforeAll(async () => {
  bb = await buildBlackbox();
});

type Side = 'N' | 'S' | 'E' | 'W';
const HOLD = 120; // frames after the grace period the player must stay undetected

/** Border cells of `side` the player can stand in (doorways, open or locked). */
function doorCells(room: OracleRoom, side: Side): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < (side === 'N' || side === 'S' ? W : H); i++) {
    const [x, y] = side === 'N' ? [i, 0] : side === 'S' ? [i, H - 1] : side === 'E' ? [W - 1, i] : [0, i];
    const c = tileClass(room.grid[y]![x]!);
    if (c === 'D' || !BLOCKS_WALK.has(c)) out.push([x, y]);
  }
  return out;
}

const entrances = rooms.flatMap((from, fi) =>
  (['N', 'S', 'E', 'W'] as Side[]).flatMap((side) => {
    const to = from.exits.get(side);
    if (!to || to === 'END') return [];
    return doorCells(from, side).map((cell) => ({ from, fi, side, to, cell }));
  }),
);

describe('entrances', () => {
  it('LAYOUT.md has doorways to walk through', () => {
    expect(entrances.length).toBeGreaterThan(60);
  });

  it('coming in through any doorway of any room, the player can get out of sight before the grace period ends and stay unseen', () => {
    const S = (n: string) => symbol(bb.sym, n);
    const problems: string[] = [];
    for (const e of entrances) {
      const label = `${e.from.id} -${e.side}-> ${e.to} at ${e.cell}`;
      const vm = newVm(bb.cart);
      vm.step(0);
      // the doors on both sides are open (the player is walking through them)
      for (const r of [e.from, rooms.find((x) => x.id === e.to)!]) for (const f of r.locks.values()) vm.write8(S('flags') + (S(`F_${f}`) >> 3), vm.read8(S('flags') + (S(`F_${f}`) >> 3)) | (1 << (S(`F_${f}`) & 7)));
      vm.write16(S('dbg_room'), e.fi + 1);
      vm.step(0);
      const bot = new Bot(vm, bb.sym);
      bot.settle();
      vm.write16(S('px'), e.cell[0] * 8);
      vm.write16(S('py'), e.cell[1] * 8);
      const btn = { N: 'N', S: 'S', E: 'E', W: 'W' } as const;
      bot.allowCaught = true;
      for (let i = 0; i < 20 && bot.room === e.from.id; i++) bot.run([{ press: btn[e.side] }]);
      bot.allowCaught = false;
      if (bot.room !== e.to) {
        problems.push(`${label}: did not arrive (in ${bot.room})`);
        continue;
      }
      const grace = vm.read16(S('grace_t'));
      if (grace < S('GRACE_FRAMES') - 2) problems.push(`${label}: grace ${grace} on arrival`);
      try {
        bot.settle();
        for (let f = 0; f < S('GRACE_FRAMES') + HOLD; f++) {
          if (bot.mode !== S('M_PLAY')) {
            bot.frame(f % 2 ? 0 : 0x10);
            continue;
          }
          // stand still unless (about to be) watched; then take the shortest way to an unwatched cell
          const danger = bot.danger();
          const [cx, cy] = bot.cell;
          if (!danger.has(`${cx},${cy}`) && cx > 0 && cy > 0 && cx < W - 1 && cy < H - 1) {
            bot.frame(0);
            continue;
          }
          const p = bot.path((x, y) => !danger.has(`${x},${y}`) && x > 0 && y > 0 && x < W - 1 && y < H - 1, false);
          if (!p) bot.frame(0);
          else bot.stepTo(...p[p.length > 1 ? 1 : 0]!, false);
        }
      } catch (err) {
        problems.push(`${label}: ${(err as Error).message}`);
      }
    }
    console.log(`[entrances] ${entrances.length} doorway cells tried, ${problems.length} problem(s)`);
    expect(problems).toEqual([]);
  });
});
