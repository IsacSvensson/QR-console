// Bot routes for Bo's replays: what to do, read from RAM, not which frames (DESIGN.md §14.5).
// Record them with `npm run bo:record [name…]`, then `npm run refs:games` for the committed hashes.
import { B, type Bot } from './bot';

export interface Route {
  seed: number;
  run: (b: Bot) => void;
}

const px = (col: number) => col * 8;

/** From standstill next to something low: ollie straight up, steering right for k frames, until `ok`. */
const hopOnto = (b: Bot, ok: (x: Bot) => boolean, note: string) =>
  b.search(
    (k) => {
      b.step(B.A);
      for (let i = 0; !b.grounded; i++) {
        if (i > 200) throw new Error('long');
        b.step(B.A | (i < k ? B.R : 0));
      }
    },
    ok,
    60,
    note,
  );

const ollieOnto = (b: Bot, ok: (x: Bot) => boolean, note: string, btn = B.R) =>
  b.search(
    (k) => {
      b.hold(btn, k);
      b.step(btn | B.A);
      b.until(btn | B.A, (x) => x.grounded || x.state === 2, 300);
    },
    ok,
    120,
    note,
  );

export const ROUTES: Record<string, Route> = {
  // M20, T3: idle signature, the seven kicker launches (with tricks in some flights), grind, sand, trampoline,
  // ice, a weak block, a box, the water (a life), the goal.
  'm20-t3': {
    seed: 1,
    run: (b) => {
      b.startLevel('T3');
      b.hold(0, 600); // standing still: the little trick at 3 s, balancing at 8 s
      b.step(B.R); // any button ends it at once
      b.launch(24, false); // L1: 45° kicker, no ollie
      b.land(B.R);
      b.launch(24, true, (f) => (f >= 4 && f < 30 ? B.D | B.B : 0)); // L2: 22.5° with ollie, a grab
      b.launch(56, false); // L3: 45° at the bottom of the hill
      b.until(B.R, (x) => x.x >= px(84), 900, 'over the hill');
      b.launch(56, true, (f) => (f === 2 ? B.B : f === 22 ? B.U | B.B : 0)); // L4: kickflip + shove-it
      b.until(B.R, (x) => x.x >= px(138), 900, 'over the hill');
      b.launch(40, false); // L5
      b.until(B.R, (x) => x.x >= px(178), 900, 'over the hill');
      b.launch(40, true, (f) => (f === 3 ? B.R | B.B : 0)); // L6: a 360
      b.until(B.R, (x) => x.x >= px(224), 900, 'over the hill');
      b.launch(40, true); // L7: 22.5° with ollie
      b.land();
      b.brakeToStop();
      // a flat ollie with a kickflip that starts too late: OJ!
      b.until(B.R, (x) => x.vx >= 24, 100);
      b.step(B.R | B.A);
      b.hold(B.R | B.A, 24);
      b.step(B.R | B.A | B.B);
      b.land(B.R);
      b.rideTo(px(255));
      b.brakeToStop();
      // the rail and the handrail down the slope
      ollieOnto(b, (x) => x.state === 2, 'onto the rail');
      b.hold(0, 4);
      b.step(B.A); // ollie off the rail with a kickflip, back onto the rail
      b.step(B.A | B.B);
      b.until(B.A, (x) => x.state !== 1, 100, 'back on the rail');
      b.until(0, (x) => x.grounded, 400, 'grind to the end');
      b.land();
      b.rideTo(px(276) + 2);
      b.brakeToStop();
      let bounced = false;
      b.search(
        (k) => {
          bounced = false;
          b.step(B.A);
          for (let i = 0; !b.grounded; i++) {
            if (i > 300) throw new Error('long');
            b.step(B.A | (i < k ? B.R : 0));
            if (b.vy === -72) bounced = true;
          }
        },
        () => bounced,
        60,
        'the trampoline',
      );
      b.land();
      b.brakeToStop();
      b.rideTo(px(283), -1); // back to the start of the sand
      b.brakeToStop();
      // sand: push on it, then coast out
      b.until(B.R, (x) => x.cls === 11 && x.vx >= 24, 300, 'onto the sand');
      b.hold(B.R, 4);
      b.until(0, (x) => x.vx === 0, 100, 'coast out on sand');
      // the hill down to the ice: arrive on the ice at exactly 2.5 px per frame
      b.search(
        (k) => {
          b.until((x) => (x.x < px(292) + k ? B.R : x.vx > 40 ? B.L : 0), (x) => x.cls === 12, 400);
        },
        (x) => x.vx === 40,
        120,
        'onto the ice at 2.5',
      );
      b.hold(0, 10);
      b.brakeToStop(); // braking on ice from 2.5
      b.until(B.R, (x) => x.x >= px(338), 600, 'over the ice');
      b.brakeToStop();
      b.rideTo(px(339));
      b.brakeToStop();
      hopOnto(b, (x) => x.cell(341, 22) === 0, 'onto the weak block'); // it breaks, Bo bounces
      b.land();
      b.brakeToStop();
      b.rideTo(px(343) + 2);
      b.brakeToStop();
      hopOnto(b, (x) => x.u('helmet') === 1, 'onto the box: the apple helmet');
      b.brakeToStop();
      b.until(B.R, (x) => x.state === 3, 300, 'into the water'); // a life
      b.until(0, (x) => x.state === 0, 200, 'respawn');
      b.hold(0, 20);
      b.jumpPast(px(349) + 4);
      b.jumpPast(px(358) + 4);
      b.until(B.R, (x) => x.u('goal_t') > 0, 300, 'to the goal');
      b.until(0, (x) => x.mode === x.S('M_MENU'), 400, 'the level ends');
      b.hold(0, 10);
    },
  },
  // M20: losing every life in T1's water: the level starts again with 5 lives
  'm20-gameover': {
    seed: 2,
    run: (b) => {
      ROUTES['m19-t1']!.run(b); // through T1 to its last flag
      for (let i = 0; i < 5; i++) {
        b.until(B.R, (x) => x.state === 3, 2000, 'into the water');
        b.until(0, (x) => x.state === 0 || x.mode !== x.S('M_PLAY'), 400, 'respawn');
        b.until(0, (x) => x.playing && x.state === 0, 400);
      }
      b.hold(0, 30);
    },
  },
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
