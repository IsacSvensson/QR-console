// Routes for the bot (bot.ts): what Sixten does in each replay. Recorded by record.ts into ../replays/<name>.json.
import { B, type Bot } from './bot';

export interface Route {
  seed: number;
  run: (bot: Bot) => void;
}

/** hold a direction until the feet are on column c (moving horizontally), then centre in the cell */
function runTo(bot: Bot, c: number) {
  bot.walkToPoint(c * 32 + 16, bot.y);
}

export const ROUTES: Record<string, Route> = {
  // T1: every walkable type crossed on a straight run (speed), walls of every blocking type, a corner slide, the map
  // where Sixten does not know where he is, the map at a control, a course to the next control and the steps to it.
  'm26-t1': {
    seed: 1,
    run(bot) {
      bot.startLevel('T1');
      bot.wait(10);
      // the long runs: start of each run, then straight along it
      for (const [c0, c1, r] of [
        [1, 6, 1], [8, 13, 1], [15, 22, 1],
        [1, 6, 3], [8, 13, 3], [15, 22, 3],
        [1, 6, 5], [8, 13, 5], [15, 22, 5],
        [1, 6, 7], [8, 13, 7], [15, 22, 7],
        [1, 6, 9],
      ] as const) {
        bot.walkTo(c0, r);
        runTo(bot, c1);
      }
      // walls: water, hill, house, cave, windfall — stand below and push up
      for (const c of [2, 8, 12, 17, 21]) {
        bot.walkTo(c, 12);
        bot.hold(B.U, 40);
      }
      // the left edge of the level
      bot.walkTo(0, 12);
      bot.hold(B.L, 30);
      // a corner: the gap at (5, 11) between water and hill, entered off-centre (slides into the gap)
      bot.walkTo(5, 12);
      bot.walkToPoint(5 * 32 + 30, bot.y);
      bot.hold(B.U, 50);
      bot.hold(B.D, 50);
      // the map where he does not know where he is (open land)
      bot.walkTo(3, 13);
      bot.openMap();
      bot.wait(40);
      bot.closeMap();
      // control 1 at the crossing (4, 9): the map shows him; choose control 2 and set the course
      bot.walkTo(4, 9);
      bot.wait(5);
      bot.openMap();
      bot.wait(30);
      bot.tap(B.R);
      bot.wait(8);
      bot.tap(B.A);
      bot.settle();
      bot.wait(10);
      bot.walkTo(10, 5);
      bot.wait(20);
    },
  },
  // T2: a walk through all 30 screens of the maze (every slide direction), stamping the controls on the way
  'm26-t2': {
    seed: 1,
    run(bot) {
      bot.startLevel('T2');
      const order: [number, number][] = [];
      for (let sr = 0; sr < 5; sr++)
        for (let k = 0; k < 6; k++) order.push([sr % 2 ? 5 - k : k, sr]); // a snake through the screens
      for (const [sc, sr] of order) {
        // the walkable cell of that screen nearest its centre
        let best: [number, number] | null = null;
        for (let r = sr * 3; r < sr * 3 + 3; r++)
          for (let c = sc * 4; c < sc * 4 + 4; c++)
            if (bot.walkable(c, r) && (!best || Math.abs(c - sc * 4 - 1.5) + Math.abs(r - sr * 3 - 1) < Math.abs(best[0] - sc * 4 - 1.5) + Math.abs(best[1] - sr * 3 - 1))) best = [c, r];
        bot.walkTo(...best!);
      }
      for (const [c, r] of [[4, 3], [22, 5], [16, 9], [19, 12]] as const) bot.walkTo(c, r);
      bot.walkTo(23, 14);
      bot.wait(10);
    },
  },
  // 1-1: the start of DESIGN §13.2 — control 1 at the crossing, the map, a course to 2, the field, 2, 4 and 3
  'm26-11': {
    seed: 1,
    run(bot) {
      bot.startLevel('1-1');
      bot.wait(20);
      bot.walkTo(6, 13);
      bot.openMap();
      bot.wait(20);
      bot.tap(B.A);
      bot.settle();
      bot.walkTo(14, 6);
      bot.walkTo(10, 7);
      bot.walkTo(19, 3);
      bot.openMap();
      bot.wait(30);
      bot.closeMap();
      bot.wait(10);
    },
  },
};
