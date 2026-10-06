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

// ---- enemies (M21) ----
const EV = { STOMP: 1, HIT: 2, HELMET: 3, BOUNCE: 4, POMMES: 5, KNOCK: 6, SPIKY: 7 };
const ENEMIES = ['snail', 'gull', 'hedgehog', 'wasp', 'ball', 'teddy', 'squirrel', 'pigeon', 'snowman', 'sled', 'jelly', 'blob', 'cannon'];
const PROJECTILE: Record<string, number> = { squirrel: 14, snowman: 15, cannon: 16 };

/** Holds `buttons` until a contact event of one of `kinds` with enemy `type` happens. */
const waitEvent = (b: Bot, buttons: number | ((x: Bot) => number), kinds: number[], type: number, max: number, note: string) => {
  const n0 = b.u('ev_n');
  const lives = b.u('lives');
  b.until(
    buttons,
    (x) => {
      if (x.u('lives') < lives) throw new Error(`${note}: lost a life`);
      return x.u('ev_n') !== n0 && kinds.includes(x.u('ev_kind')) && x.u('ev_type') === type;
    },
    max,
    note,
  );
};

/** Gets the apple helmet from the box at `col` (rides there, stops, hops onto it). */
const getHelmet = (b: Bot, col: number) => {
  b.until((x) => (x.x < px(col) - 10 ? B.R : x.x > px(col) - 6 ? B.L : 0), (x) => Math.abs(x.x - (px(col) - 8)) <= 2 && x.vx === 0, 400, 'to the box');
  hopOnto(b, (x) => x.u('helmet') === 1 && x.cell(col, 27) === 0, `helmet from the box at ${col}`);
};

/** Lands on an enemy of `type`: tries jumping k frames from now (pushing right) until the event comes. */
const stompEnemy = (b: Bot, type: number, kinds: number[], note: string) => {
  const n0 = b.u('ev_n');
  const lives = b.u('lives');
  // try: wait w frames (0..39), jump, steer right for s frames in the air (0, 4, 8, 16, 24, 32); or run up first
  const STEER = [0, 4, 8, 16, 24, 32];
  const attempt = () =>
    b.search(
    (k) => {
      const run = k >= 240;
      const w = run ? k - 240 : Math.floor(k / STEER.length);
      const steer = run ? 20 : STEER[k % STEER.length]!;
      b.hold(run ? B.R : 0, w);
      b.step(B.A | (run ? B.R : 0));
      for (let i = 0; i < 80 && !(b.u('ev_n') !== n0 && b.u('ev_type') === type); i++) {
        b.step(B.A | (i < steer ? B.R : 0));
        if (process.env.BO_DEBUG2 && process.env.BO_DEBUG2 === `${note}:${k}`) {
          const base = b.S('actors');
          const acts = Array.from({ length: 12 }, (_, j) => base + j * 22).filter((a) => b.vm.read16(a) === type).map((a) => `${b.vm.read16(a + 2) >> 4},${(b.vm.read16(a + 4) << 16 >> 16) >> 4} st${b.vm.read16(a + 10)}`);
          console.log(i, 'bo', b.x, b.foot, b.vy, acts.join(' '));
        }
      }
      if (b.u('ev_n') !== n0 && !kinds.includes(EV.SPIKY)) b.until(B.L, (x) => x.grounded || x.state > 1, 120); // steer back
      if (process.env.BO_DEBUG) console.log(note, k, 'x', b.x, 'ev', b.u('ev_n') - n0, b.u('ev_kind'), b.u('ev_type'), 'state', b.state, 'helmet', b.u('helmet'), 'foot', b.foot, 'vy', b.vy, 'pfoot', b.w('bo_pfoot'), 'atop', b.w('t_atop'), 'ax', b.actorX(type));
      b.land();
    },
    (x) => x.u('ev_n') === n0 + 1 && kinds.includes(x.u('ev_kind')) && x.u('ev_type') === type && x.state < 3 && x.u('lives') === lives,
    300,
    note,
  );
  try {
    attempt();
  } catch {
    // from further away: stand 40..72 px left of it while it comes closer (or stands)
    b.until(
      (x) => {
        const ax = x.actorX(type);
        if (ax === undefined) return B.R;
        const dx = ax - x.x;
        if (dx > 72) return B.R;
        if (dx < 40) return B.L;
        return x.vx > 0 ? B.L : x.vx < 0 ? B.R : 0;
      },
      (x) => {
        const ax = x.actorX(type);
        return ax !== undefined && x.vx === 0 && ax - x.x >= 40 && ax - x.x <= 72;
      },
      1200,
      `${note}: into position`,
    );
    attempt();
  }
};

/** One station per enemy (T4/T5): helmet from the box, land on the first one, touch the second one from the side. */
const stations = (b: Bot, list: string[], c0: number) => {
  let c = c0;
  for (const e of list) {
    const type = ENEMIES.indexOf(e) + 1;
    getHelmet(b, c + 2);
    const harmType = PROJECTILE[e] ?? type;
    const kinds = e === 'hedgehog' || e === 'sled' ? [EV.SPIKY] : e === 'jelly' || e === 'cannon' ? [EV.BOUNCE] : [EV.STOMP];
    stompEnemy(b, type, kinds, `${e}: landing on it`);
    if (e === 'hedgehog' || e === 'sled') {
      // blinking after the spiky landing: past the other one to the second box
      b.until(B.R, (x) => x.x >= px(c + 22) - 12, 200, 'past it while blinking');
      getHelmet(b, c + 22);
    }
    // the other one, from the side (waiting near a seagull or a thrower, running into the others)
    const stand = e === 'gull' || !!PROJECTILE[e];
    const home = px(c + 19);
    waitEvent(
      b,
      (x) => {
        const ax = x.actorX(type) ?? home;
        const dx = ax - x.x;
        if (stand && Math.abs(dx) < 32) return x.vx > 0 ? B.L : x.vx < 0 ? B.R : 0;
        return dx > 0 ? B.R : B.L;
      },
      [EV.HELMET],
      harmType,
      900,
      `${e}: side`,
    );
    b.until(B.R, (x) => x.u('inv_t') === 0, 200);
    b.until(B.R, (x) => x.x >= px(c + 26) - 4, 600, 'to the next station');
    b.brakeToStop();
    c += 26;
  }
  return c;
};

export const ROUTES: Record<string, Route> = {
  // M21, T4: 100 apples (a life), then snail, seagull, hedgehog, wasp, ball, teddy: each landed on and touched
  // from the side (the helmet takes the hit)
  'm21-zoo1': {
    seed: 1,
    run: (b) => {
      b.startLevel('T4');
      b.until(B.R, (x) => x.x >= px(62), 1200, 'through the apples');
      b.brakeToStop();
      stations(b, ['snail', 'gull', 'hedgehog', 'wasp', 'ball', 'teddy'], 62);
      b.until(B.R, (x) => x.u('goal_t') > 0, 600, 'to the goal');
      b.until(0, (x) => x.mode === x.S('M_MENU'), 400);
      b.hold(0, 10);
    },
  },
  // M21, T5: squirrel, pigeon, snowman, sled, jelly man, candy blob, popcorn cannon; pommes and the seagull that
  // takes them; godis and its one extra jump per airtime
  'm21-zoo2': {
    seed: 1,
    run: (b) => {
      b.startLevel('T5');
      const c = stations(b, ['squirrel', 'pigeon', 'snowman', 'sled', 'jelly', 'blob', 'cannon'], 10);
      b.until(B.R, (x) => x.u('pw_kind') === 1, 300, 'pommes');
      b.until(B.R, (x) => x.vx === 40, 100, 'pommes speed');
      b.hold(B.R, 10);
      b.brakeToStop();
      waitEvent(
        b,
        (x) => {
          const d = (x.actorX(2) ?? px(c + 14)) - 24 - x.x; // stand a little left of the seagull
          return d > 4 ? B.R : d < -4 ? B.L : x.vx > 0 ? B.L : x.vx < 0 ? B.R : 0;
        },
        [EV.POMMES],
        2,
        500,
        'the seagull takes the pommes',
      );
      // pommes again, and a snail touched from the side with pommes: still a hit (pommes changes nothing else)
      b.until(B.R, (x) => x.u('pw_kind') === 1, 300, 'pommes again');
      const n0 = b.u('ev_n');
      b.until(B.R, (x) => x.u('ev_n') !== n0, 600, 'into the snail with pommes');
      if (b.u('ev_kind') !== EV.HIT || b.u('ev_type') !== 1) throw new Error('expected a hit by the snail');
      b.until(0, (x) => x.state === 0 && x.playing, 300, 'respawn');
      b.rideTo(px(222));
      b.brakeToStop();
      b.jumpPast(px(233) + 6);
      // pommes a third time: it runs out after 10 s
      b.until(B.R, (x) => x.u('pw_kind') === 1, 400, 'pommes, third');
      b.brakeToStop();
      b.until(0, (x) => x.u('pw_kind') === 0, 700, 'pommes runs out');
      b.until(B.R, (x) => x.u('pw_kind') === 2, 600, 'godis');
      b.brakeToStop();
      b.search(
        (k) => {
          b.hold(B.R, k);
          b.step(B.R | B.A);
          b.hold(B.R | B.A, 16);
          b.step(B.B); // godissnurr (B alone)
          b.hold(B.R, 26);
          b.step(B.B); // a second B in the same airtime: a kickflip, not another jump
          b.land(B.R);
        },
        (x) => x.foot === px(32 - 4 - 6),
        80,
        'up onto the platform with the godissnurr',
      );
      b.until(B.R, (x) => x.u('goal_t') > 0, 600, 'to the goal');
      b.until(0, (x) => x.mode === x.S('M_MENU'), 400);
      b.hold(0, 10);
    },
  },
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
