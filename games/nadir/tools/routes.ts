// Replay routes for the bot (bot.ts) in levels/nadir.map. Each says what the player does; `npm run nadir:record`
// turns them into replays/<name>.json, then `npm run refs:games` writes their per-frame hashes.
import { B, type Bot } from './bot';

export interface Route {
  seed: number;
  run(b: Bot): void;
}

/** The loop through the level: elevator, shaft, workshop, dark corridor, control room (key), core, south corridor. */
function tour(b: Bot) {
  b.walkTo(3.5, 4.4);
  b.walkTo(3.5, 7.0); // through the elevator door
  b.walkTo(3.6, 13.5);
  b.walkTo(6.5, 14.5);
  b.walkTo(11.0, 14.6);
  tourFromWorkshop(b);
}

/** The loop from the workshop's south side (11, 14.6) on. */
function tourFromWorkshop(b: Bot) {
  b.walkTo(14.2, 13.5);
  b.walkTo(16.5, 13.5); // the workshop's east door
  b.walkTo(16.5, 11.5);
  b.walkTo(19.4, 11.6);
  b.walkTo(19.5, 12.5);
  b.walkTo(21.5, 12.5);
  b.walkTo(21.5, 10.5);
  b.walkTo(21.5, 7.5); // the control room door
  b.walkTo(26.5, 4.0);
  b.walkTo(27.5, 3.5); // the red key
  b.walkTo(21.5, 7.5);
  b.walkTo(21.5, 10.5);
  b.walkTo(21.5, 12.5);
  b.walkTo(24.5, 12.5); // the security door, now unlocked
  b.walkTo(24.5, 14.0);
  b.walkTo(24.5, 18.5);
  b.walkTo(24.0, 19.5);
  b.walkTo(22.5, 19.6);
  b.walkTo(22.4, 20.4);
  b.walkTo(19.0, 20.4);
  b.walkTo(18.5, 19.0);
  b.walkTo(18.4, 17.7);
  b.walkTo(10.5, 17.5);
  b.walkTo(10.5, 15.0); // the workshop's south door
  b.walkTo(7.0, 14.5);
}

export const ROUTES: Record<string, Route> = {
  /**
   * The renderer fly-through (PLAN M26, re-recorded in the whole level in M27): a slow and a fast full turn, the
   * shaft corridor, the workshop with its pillars, lamps and flickering lamp, a wall a quarter cell away, grazing
   * angles, the dark corridor, the control room, the core, every material, then the rest of the loop.
   */
  'm26-fly': {
    seed: 1,
    run(b) {
      b.wait(30);
      b.spin(1, true);
      b.walkTo(3.5, 4.4);
      b.walkTo(3.5, 8.0);
      b.spin(-1);
      b.walkTo(3.4, 10.5);
      b.turnTo(0); // through the grate into the workshop
      b.wait(20);
      b.turnTo(268);
      b.forward(40); // grazing along the west wall
      b.walkTo(3.6, 13.5);
      b.walkTo(6.5, 14.5);
      b.turnTo(180);
      b.pushWall(); // a quarter cell from the wall
      b.wait(20);
      b.turnTo(20, true);
      b.walkTo(11.0, 14.6);
      b.turnTo(270);
      b.wait(30); // the low wall
      b.spin(1);
      tourFromWorkshop(b);
    },
  },
  /**
   * M27 collision: pushing into walls head-on and at an angle, into corners, along walls (sliding), into pillars
   * and the low wall, walking backwards into a wall, side steps into walls.
   */
  'm27-walk': {
    seed: 2,
    run(b) {
      b.wait(10);
      b.turnTo(225);
      b.pushWall(); // the elevator's corner
      b.turnTo(200);
      b.pushWall();
      b.turnTo(90);
      b.walkTo(3.5, 8.0);
      b.turnTo(0);
      b.pushWall(); // the grate
      b.dash(1);
      b.dash(1);
      b.turnTo(180);
      b.pushWall();
      b.dash(-1);
      b.turnTo(100);
      b.forward(60);
      b.walkTo(4.3, 13.6);
      b.walkTo(7.0, 14.5);
      b.walkTo(7.0, 12.0);
      b.turnTo(330);
      b.pushWall(); // the pillar
      b.walkTo(9.5, 10.5);
      b.walkTo(9.5, 12.4);
      b.walkTo(10.5, 12.5);
      b.turnTo(90);
      b.pushWall(); // the low wall
      b.dash(-1);
      b.dash(1);
      b.dash(1);
      b.turnTo(270);
      for (let i = 0; i < 60; i++) b.step(8); // backwards into the low wall
      b.wait(10);
      b.turnTo(45);
      b.pushWall(); // into the corner of pillar and low wall
      b.walkTo(11.5, 12.5);
      b.walkTo(7.0, 12.5);
      b.walkTo(6.6, 14.5);
      b.walkTo(13.5, 14.5);
      b.turnTo(10);
      b.pushWall(); // the crate
      b.turnTo(-20);
      for (let i = 0; i < 40; i++) b.step(32 | 2); // B + RIGHT: sideways (S1, the default since M29)
      for (let i = 0; i < 40; i++) b.step(32 | 1); // B + LEFT
      for (let i = 0; i < 20; i++) b.step(32); // B alone: nothing
      b.wait(10);
    },
  },
  /**
   * M27 doors: the security door stays shut without the red key; a door opens, waits, closes; standing in a door
   * keeps it open; the key unlocks the security door.
   */
  'm27-doors': {
    seed: 3,
    run(b) {
      b.wait(10);
      b.walkTo(3.5, 4.3);
      b.wait(60); // the elevator door opens in front of the player
      b.walkTo(3.5, 5.5);
      b.wait(150); // standing in the doorway: it stays open
      b.walkTo(3.5, 8.5);
      b.wait(160); // walked away: it waits and closes
      b.walkTo(3.5, 4.0); // back through it
      b.walkTo(3.5, 8.0);
      b.walkTo(3.6, 13.5);
      b.walkTo(6.5, 14.5);
      b.walkTo(14.2, 13.5);
      b.walkTo(16.5, 13.5);
      b.walkTo(16.5, 11.5);
      b.walkTo(19.4, 11.6);
      b.walkTo(19.5, 12.5);
      b.walkTo(22.2, 12.5);
      b.turnTo(0);
      b.pushWall(); // the locked security door
      b.wait(60);
      b.walkTo(21.5, 12.5);
      b.walkTo(21.5, 10.5);
      b.walkTo(21.5, 7.5);
      b.walkTo(27.5, 3.5); // the red key
      b.walkTo(21.5, 7.5);
      b.walkTo(21.5, 10.5);
      b.walkTo(21.5, 12.5);
      b.walkTo(22.2, 12.5);
      b.turnTo(0);
      b.wait(50); // now it opens
      b.walkTo(25.5, 12.5);
      b.turnTo(180);
      b.wait(150); // watching it close behind
    },
  },
  /**
   * M27 masked walls, looked at and through without touching them (the two-VM test removes them): the grate from
   * the shaft and from the workshop, the low wall from both sides.
   */
  'm27-masks': {
    seed: 4,
    run(b) {
      b.walkTo(3.5, 4.4);
      b.walkTo(3.5, 9.0);
      b.turnTo(10);
      b.wait(10);
      b.spin(1, true);
      b.walkTo(4.0, 13.5);
      b.walkTo(7.0, 14.5);
      b.walkTo(7.5, 10.5);
      b.turnTo(180); // the grate from the workshop
      b.wait(30);
      b.turnTo(60);
      b.walkTo(10.5, 12.5);
      b.turnTo(90); // the low wall from above
      b.wait(20);
      b.walkTo(7.0, 12.5);
      b.walkTo(6.6, 14.5);
      b.walkTo(11.0, 14.6);
      b.turnTo(250);
      b.wait(20);
    },
  },
  /**
   * M28 sprites: the workshop's props from the south and from its west side (nine in view, the nearest eight
   * drawn: crates, barrels, a lamp, a pipe, pickups), sweeps across them, picks up the medkit, then close to the
   * barrels where they are drawn large.
   */
  'm28-props': {
    seed: 6,
    run(b) {
      b.walkTo(3.5, 4.4);
      b.walkTo(3.5, 7.0);
      b.walkTo(3.6, 13.5);
      b.walkTo(6.5, 14.5);
      b.walkTo(10.5, 14.6);
      b.turnTo(270);
      b.wait(30);
      b.turnTo(245, true);
      b.turnTo(295, true);
      b.turnTo(270);
      b.walkTo(6.5, 14.5);
      b.walkTo(6.5, 9.5);
      b.turnTo(337); // nine props in view: the nearest eight are drawn
      b.wait(30);
      b.turnTo(305, true);
      b.turnTo(10, true);
      b.walkTo(9.5, 10.5);
      b.walkTo(11.3, 10.4); // the medkit
      b.walkTo(12.2, 11.0); // M28b: a crate (a 3D box) from two sides and from close by
      b.turnTo(320);
      b.wait(15);
      b.walkTo(13.0, 10.7);
      b.turnTo(290);
      b.wait(10);
      b.turnTo(250);
      b.wait(10);
      b.turnTo(345);
      b.wait(10);
      b.walkTo(11.3, 10.4);
      b.walkTo(12.5, 8.4);
      b.turnTo(0);
      b.wait(20);
      b.spin(-1, true);
      b.turnTo(200);
      b.wait(20);
    },
  },
  /** M27: the whole loop of the level at walking speed. */
  /** M29: hit by a Kryp's leap (the bot holds its fire until then), the fight, a medkit, ammunition, reloads. */
  'm29-combat': {
    seed: 7,
    run(b) {
      b.fightOn = false;
      b.walkTo(3.5, 4.4);
      b.walkTo(3.5, 7.0);
      b.walkTo(3.6, 13.5);
      b.walkTo(6.5, 14.5);
      b.walkTo(8.5, 12.0);
      b.waitUntil(() => b.read('hits_taken') >= 1, 900); // stands still until a leap lands
      b.fightOn = true;
      b.wait(30);
      b.walkTo(11.3, 10.4); // the medkit (health below 100 now)
      b.walkTo(12.6, 11.6); // the ammunition
      b.walkTo(14.5, 11.6);
      tourFromWorkshop(b);
    },
  },
  /** M29: the bot does not fight: the Kryp kill it, the restart (DESIGN §6.5), then it walks a little again. */
  'm29-death': {
    seed: 8,
    run(b) {
      b.fightOn = false;
      b.allowDeath = true;
      b.walkTo(3.5, 4.4);
      b.walkTo(3.5, 7.0);
      b.walkTo(3.6, 13.5);
      b.walkTo(6.5, 14.5);
      b.walkTo(8.5, 12.0);
      b.waitUntil(() => b.read('restarts') >= 1, 3000);
      b.wait(30);
      b.allowDeath = false;
      b.walkTo(3.5, 4.4);
      b.walkTo(3.5, 6.0);
    },
  },
  /**
   * M30 stress (PLAN M30): into the control room without firing (two Kryp, two Spottare at its east end), stands at its west end
   * until two acid balls fly, then shoots the barrel pair: a chain explosion (24 particles) with four enemies in view.
   */
  'm30-stress': {
    seed: 9,
    run(b) {
      b.walkTo(3.5, 4.4);
      b.walkTo(3.5, 8.0);
      b.walkTo(3.6, 13.5);
      b.walkTo(6.5, 14.5);
      b.walkTo(14.2, 13.5);
      b.walkTo(16.5, 13.5);
      b.walkTo(16.5, 11.5);
      b.walkTo(19.4, 11.6);
      b.walkTo(19.5, 12.5);
      b.fightOn = false;
      b.walkTo(21.5, 12.5);
      b.walkTo(21.5, 10.5);
      b.walkTo(21.5, 8.4);
      b.walkTo(19.8, 7.5);
      b.turnTo((Math.atan2(7.6 - b.y, 23.3 - b.x) * 180) / Math.PI);
      const acids = () => [0, 1, 2, 3].filter((k) => b.vm.read8(b.S('acids') + 10 * k + 8)).length;
      b.waitUntil(() => acids() >= 2, 900);
      for (let i = 0; i < 90 && b.read('booms') < 2; i++) b.step(B.A);
      b.wait(40);
      b.fightOn = true;
      b.wait(200);
    },
  },
  'm27-tour': {
    seed: 5,
    run(b) {
      tour(b);
    },
  },
};
