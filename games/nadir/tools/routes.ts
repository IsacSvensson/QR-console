// Replay routes for the bot (bot.ts). Each says what the camera does; `npm run nadir:record` turns them into
// replays/<name>.json, then `npm run refs:games` writes their per-frame hashes.
import type { Bot } from './bot';

export interface Route {
  seed: number;
  run(b: Bot): void;
}

export const ROUTES: Record<string, Route> = {
  /**
   * M26: the renderer fly-through (PLAN M26): a slow and a fast full turn in the tunnel, the bend, the pillar
   * room with its lamps and flickering lamp, a wall a quarter cell away, grazing angles along the west wall, the
   * dark corridor with its conduits, the lab and its material wall, a fast turn there.
   */
  'm26-fly': {
    seed: 1,
    run(b) {
      b.wait(30);
      b.spin(1, true);
      b.walkTo(7.5, 3.5);
      b.spin(-1);
      b.walkTo(9.5, 4.0);
      b.turnTo(90);
      b.walkTo(9.5, 8.5);
      b.walkTo(9.6, 12.5);
      b.turnTo(180);
      b.walkTo(6.3, 12.5, 0.1);
      b.wait(20);
      b.turnTo(100, true);
      b.walkTo(6.3, 14.6, 0.1);
      b.turnTo(-30);
      b.walkTo(13.5, 12.5);
      b.turnTo(0);
      b.walkTo(25.5, 12.5);
      b.turnTo(270);
      b.walkTo(25.5, 6.0);
      b.walkTo(25.0, 3.5);
      b.turnTo(270);
      b.wait(30);
      b.strafe(-1, 40);
      b.spin(1);
      b.turnTo(200);
      b.walkTo(21.5, 2.5);
      b.wait(30);
    },
  },
};
