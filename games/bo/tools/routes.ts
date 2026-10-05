// Bot routes for Bo's replays: what to do, read from RAM, not which frames (DESIGN.md §14.5).
// Record them with `npm run bo:record [name…]`, then `npm run refs:games` for the committed hashes.
import { B, type Bot } from './bot';

export interface Route {
  seed: number;
  run: (b: Bot) => void;
}

const px = (col: number) => col * 8;

export const ROUTES: Record<string, Route> = {
  // M19, T1: push, full ollie, tap, coast out, brake; then blocks, steps, a wall, a ceiling, crouching.
  'm19-t1': {
    seed: 1,
    run: (b) => {
      b.startLevel('T1');
      b.hold(0, 20);
      b.until(B.R, (x) => x.vx >= 24, 100, 'push to top speed');
      b.hold(B.R, 8);
      b.step(B.R | B.A); // full ollie: A held until landing
      b.land(B.R | B.A);
      b.hold(B.R, 6);
      b.step(B.R | B.A); // tap
      b.land(B.R);
      b.hold(B.R, 6);
      b.until(0, (x) => x.vx === 0, 200, 'coast out');
      b.hold(0, 10);
      b.until(B.R, (x) => x.vx >= 24, 100);
      b.hold(B.R, 4);
      b.brakeToStop();
      b.hold(0, 10);
      b.jumpPast(px(37) + 6); // 1-tile block
      b.jumpPast(px(45) + 6); // the bin (2 tiles)
      // the 2x2 block: land on top, roll off
      b.search(
        (k) => {
          b.hold(B.R, k);
          b.step(B.R | B.A);
          b.land(B.R | B.A);
        },
        (x) => x.foot === px(32 - 4 - 2),
        80,
        'onto the 2x2 block',
      );
      b.rideTo(px(53));
      b.land(B.R);
      b.jumpPast(px(56) + 6); // a step up of one tile
      b.rideTo(px(74)); // and down again
      b.land(B.R);
      // a wall: ride into the 3-tile block without jumping, back off, then jump onto it and onto the 5-tile one
      b.until(B.R, (x) => x.vx === 0 && x.x > px(70), 300, 'bump into the wall');
      b.hold(B.R, 10);
      b.hold(B.D, 20); // crouch against the wall
      b.rideTo(px(74), -1);
      b.brakeToStop();
      b.search(
        (k) => {
          b.hold(B.R, k);
          b.step(B.R | B.A);
          b.land(B.R | B.A);
        },
        (x) => x.foot === px(28 - 3),
        80,
        'onto the 3-tile block',
      );
      b.brakeToStop();
      b.step(B.R | B.A);
      b.land(B.R | B.A);
      if (b.foot !== px(28 - 5)) throw new Error('not on the 5-tile block');
      b.rideTo(px(85));
      b.land(B.R);
      b.hold(B.R | B.D, 30); // crouching while rolling
      b.hold(B.R, 10);
      b.jumpPast(px(102) + 6); // a step up of two tiles
      b.rideTo(px(116));
      b.land(B.R);
      b.rideTo(px(129));
      b.step(B.R | B.A); // under the ceiling: the head bumps
      b.land(B.R | B.A);
      b.jumpPast(px(151) + 6);
      b.brakeToStop();
      b.hold(0, 20);
    },
  },
  // M19, T2: standstill on a 22.5° and a 45° slope, rolling down to the speed cap; climbing out; jumps at
  // 3.5 and 2.5 px per frame; braking from 2.5; one-way platforms; a last hill down.
  'm19-t2': {
    seed: 1,
    run: (b) => {
      b.startLevel('T2');
      b.rideTo(px(9));
      b.brakeToStop();
      b.rideTo(px(10) + 2);
      b.brakeToStop();
      b.hold(B.L, 10); // the brake holds Bo still on the slope
      b.until(0, (x) => x.vx >= 56, 200, 'roll down 22.5° from standstill');
      b.until(B.R, (x) => x.x >= px(47), 1500, 'out of the 22.5° valley');
      b.rideTo(px(53));
      b.brakeToStop(); // on the plateau, then just over the edge
      b.rideTo(px(54) + 2);
      b.brakeToStop();
      b.hold(B.L, 10);
      b.until(0, (x) => x.vx >= 56, 200, 'roll down 45° from standstill');
      b.until(B.R, (x) => x.x >= px(80), 1500, 'out of the 45° valley');
      b.until(B.R, (x) => x.x >= px(92) && x.grounded, 400, 'down the long hill');
      b.until(0, (x) => x.vx === 56 || x.vx < 56, 5);
      if (b.vx !== 56) throw new Error(`not at the speed cap on the floor: ${b.vx}`);
      b.step(B.A); // ollie at 3.5 px per frame
      b.land(B.A);
      b.until(0, (x) => x.vx === 40, 400, 'coast to 2.5');
      b.step(B.A); // ollie at 2.5
      b.land(B.A);
      b.brakeToStop(); // from 2.5
      b.rideTo(px(156));
      b.search(
        (k) => {
          b.hold(B.R, k);
          b.step(B.R | B.A);
          b.land(B.R | B.A);
        },
        (x) => x.foot === px(32 - 14 - 3),
        80,
        'onto platform 1',
      );
      b.search(
        (k) => {
          b.hold(B.R, k);
          b.step(B.R | B.A);
          b.land(B.R | B.A);
        },
        (x) => x.foot === px(32 - 14 - 5),
        80,
        'onto platform 2',
      );
      b.search(
        (k) => {
          b.hold(B.R, k);
          b.step(B.R | B.A);
          b.land(B.R | B.A);
        },
        (x) => x.foot === px(32 - 14 - 3) && x.x > px(178),
        80,
        'onto platform 3',
      );
      b.rideTo(px(183));
      b.land(B.R);
      b.jumpPast(px(188) + 6);
      b.rideTo(px(200));
      b.until(0, (x) => x.vx === 0, 600);
      b.hold(0, 20);
    },
  },
};
