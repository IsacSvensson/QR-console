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
/** Stand still just left of the thing in column `col`. */
const standBefore = (b: Bot, col: number) =>
  b.until((x) => (x.x < px(col) - 10 ? B.R : x.x > px(col) - 6 ? B.L : x.vx > 0 ? B.L : x.vx < 0 ? B.R : 0), (x) => Math.abs(x.x - (px(col) - 8)) <= 2 && x.vx === 0, 600, `to column ${col}`);

const getHelmet = (b: Bot, col: number) => {
  standBefore(b, col);
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
    if (PROJECTILE[e]) standBefore(b, c + 9); // throwers: close enough to jump on before the first throw
    if (e === 'pigeon') {
      // it flies up from a rolling Bo: stand still and let it walk up
      b.brakeToStop();
      b.until(0, (x) => (x.actorX(type) ?? 9999) - x.x <= 28, 900, 'the pigeon walks up');
    }
    stompEnemy(b, type, kinds, `${e}: landing on it`);
    if (e === 'hedgehog' || e === 'sled') {
      // blinking after the spiky landing: past the other one to the second box
      b.until(B.R, (x) => x.x >= px(c + 22) - 12, 200, 'past it while blinking');
      getHelmet(b, c + 22);
    }
    // the other one, from the side (waiting near a seagull or a thrower, running into the others)
    const stand = e === 'gull' || !!PROJECTILE[e];
    const home = e === 'pigeon' ? px(c + 23) + 4 : px(c + 19);
    if (e === 'pigeon') {
      // a pigeon flies up when Bo rolls near it: reach it through the air, a full ollie from d px away
      const n0 = b.u('ev_n');
      b.search(
        (k) => {
          // stand 110 px away, run up, take off d px from it (outside the 48 px that scare it)
          const d = 50 + 2 * k;
          const dist = (x: Bot) => (x.actorX(type) ?? home) - x.x;
          b.until((x) => (dist(x) < 110 ? B.L : x.vx < 0 ? B.R : 0), (x) => dist(x) >= 110 && x.vx === 0, 600);
          b.until(B.R, (x) => dist(x) <= d, 300);
          b.step(B.A | B.R);
          b.until(B.A | B.R, (x) => x.u('ev_n') !== n0 || x.grounded, 120);
        },
        (x) => x.u('ev_n') === n0 + 1 && x.u('ev_kind') === EV.HELMET && x.u('ev_type') === type,
        30,
        'pigeon: side, through the air',
      );
    } else waitEvent(
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

// ---- World 1 (M22) ----
/** Ride at push speed and take off with A held exactly where an apple arc starts (col * 8 + 4). */
const followArc = (b: Bot, col: number, v = 24, brake = false) => {
  const x0 = px(col) + 4;
  b.until((x) => (brake && x.vx > v + 1 ? B.L : x.vx < v ? B.R : 0), (x) => x.x + Math.max(1, x.vx >> 4) > x0 - 1 && x.vx >= v - 1, 1500, `to the arc at ${col}`);
  b.until(B.R, (x) => x.x >= x0, 4);
  if (b.inputs[b.inputs.length - 1]! & B.A) b.step(B.R); // A must be pressed afresh
  // the arcs keep the takeoff speed: steering in the air would speed up a slow jump (AIR_ACC), so only at push speed
  const air = v >= 24 ? B.R | B.A : B.A;
  b.step(air);
  b.land(air);
};
/** From the title: A (the intro the first time), skip it with A; returns when Bo can ride. */
const fromTitle = (b: Bot) => {
  b.until(0, (x) => x.mode === x.S('M_TITLE') && x.inputs.length > 30, 600, 'title');
  b.step(B.A);
  b.step(0);
  if (b.mode === b.S('M_INTRO')) {
    b.hold(0, 30);
    b.step(B.A);
  }
  b.until(0, (x) => x.playing, 120, 'into the level');
};
/** At the goal: brake in, the tally, A to the map. */
const finish = (b: Bot) => {
  b.until(B.R, (x) => x.u('goal_t') > 0, 3000, 'to the goal');
  b.until(0, (x) => x.mode === x.S('M_TALLY'), 600, 'the tally');
  b.hold(0, 40);
  b.step(B.A);
  b.step(0);
};

/** The boss of 1-5: keep away from the dive, land on it while it is dizzy, three times. */
const BS = { FLY: 0, WARN: 1, DIVE: 2, DIZZY: 3, RISE: 4 };
const bossSub = (b: Bot) => {
  const base = b.S('actors');
  for (let i = 0; i < 12; i++) if (b.vm.read16(base + i * 22) === 17 && b.vm.read16(base + i * 22 + 10) === 0) return b.vm.read16(base + i * 22 + 20);
  return -1;
};
const fightBoss1 = (b: Bot, hits = 3) => {
  for (let h = 0; h < hits; h++) {
    // wait for the warning, then roll away from where Bo stands (the dive goes there)
    b.until((x) => (x.vx > 0 ? B.L : x.vx < 0 ? B.R : 0), (x) => bossSub(x) === BS.WARN, 900, 'the warning');
    // along the dive, past where it aims; with no room for that (by a ramp), right under it to the other side
    const left = (b.actorX(17) ?? 0) > b.x;
    const room = left ? b.x - 40 : b.u('lv_wpx') - 40 - b.x;
    const away = room >= 32 ? (left ? B.L : B.R) : left ? B.R : B.L;
    b.until(away, (x) => bossSub(x) === BS.DIVE || (room >= 32 && Math.abs(x.vx) >= 24), 90);
    // while it dives: to a spot 24 px beside where it will land, and wait there
    b.until(
      (x) => {
        if (bossSub(x) !== BS.DIVE) return x.vx > 0 ? B.L : x.vx < 0 ? B.R : 0;
        const tx = x.u('boss_tx');
        const spot = x.x < tx ? tx - 24 : tx + 24;
        return x.x < spot - 3 ? (x.vx < 0 ? B.R : B.R) : x.x > spot + 3 ? B.L : x.vx > 0 ? B.L : x.vx < 0 ? B.R : 0;
      },
      (x) => bossSub(x) === BS.DIZZY,
      200,
      'it lands',
    );
    // dizzy: get to a spot d px beside it and jump onto it, steering s frames towards it
    const n0 = b.u('ev_n');
    b.search(
      (k) => {
        const d = 10 + 4 * (k % 8);
        const left = Math.floor(k / 8) % 2 === 0;
        const steer = 4 * Math.floor(k / 16);
        const bx = b.actorX(17)!;
        const goal = left ? bx - d : bx + d;
        b.until((x) => (x.x < goal - 2 ? B.R : x.x > goal + 2 ? B.L : x.vx > 0 ? B.L : x.vx < 0 ? B.R : 0), (x) => Math.abs(x.x - goal) <= 2 && x.vx === 0, 120);
        const toward = left ? B.R : B.L;
        b.step(B.A);
        for (let i = 0; i < 60 && b.u('ev_n') === n0; i++) b.step(B.A | (i < steer ? toward : 0));
        b.land();
      },
      (x) => x.u('ev_n') === n0 + 1 && x.u('ev_kind') === 1 && x.u('ev_type') === 17,
      160,
      `boss hit ${h + 1}`,
    );
  }
};

/** The levels of World 1, ridden from their start; each collects all three stars and the part. */
/** A kicker with A: ride onto it, and press A in the first frame after its lip (the arcs are computed so). */
const kickA = (b: Bot, note: string, air: (f: number) => number = () => 0, v?: number) => {
  b.until((x) => (v === undefined || x.vx < v ? B.R : x.vx > v + 1 ? B.L : 0), (x) => x.onRamp, 1200, note);
  b.until(B.R, (x) => !x.grounded, 60, `${note}: off the lip`);
  if (process.env.BO_DEBUG) console.log(note, 'lip vx', b.vx, 'x', b.x);
  b.step(B.A);
  for (let f = 1; !b.grounded && b.state !== 2; f++) {
    if (f > 400) throw new Error('long flight');
    b.step(B.A | air(f));
  }
};
/** On a platform from colL to colR: to its left end, then along to its right end (its apples). */
const sweep = (b: Bot, colL: number, colR: number) => {
  b.brakeToStop();
  b.until((x) => (x.x > px(colL) + 4 ? B.L : 0), (x) => x.x <= px(colL) + 4, 200, `left end of ${colL}`);
  b.brakeToStop();
  b.until((x) => (x.x < px(colR) + 3 ? B.R : 0), (x) => x.x >= px(colR) + 3, 200, `right end of ${colR}`);
  b.brakeToStop();
};

/** 2-3 after the giant jump: up the staircase of planks to the part in the bush at the top. */
const climbCrowns = (b: Bot) => {
  const g = 32 - 4;
  b.until(B.R, (x) => x.x >= px(101) && x.grounded, 600, 'the apples after the landing');
  b.brakeToStop();
  for (const [col, h] of [[104, 3], [110, 6], [116, 9], [122, 12]] as const) {
    ollieOnto(b, (x) => x.grounded && x.foot === px(g - h), `onto the plank at ${col}`);
    b.until((x) => (x.x < px(col + 3) ? B.R : 0), (x) => x.x >= px(col + 3) || !x.grounded, 200, `along the plank at ${col}`);
    b.brakeToStop();
  }
  b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'the part at the top');
  b.land(B.R);
  stompEnemy(b, 1, [EV.STOMP], 'the snail');
};

/** x px of every live actor of `type` */
const actorsOf = (b: Bot, type: number) => {
  const base = b.S('actors');
  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    const a = base + i * 22;
    if (b.vm.read16(a) === type && b.vm.read16(a + 10) === 0) out.push(b.vm.read16(a + 2) >> 4);
  }
  return out;
};
/** A river from column `river`, 13 columns wide, with a log (3 wide, drifting 10 columns): wait on the bank for the
 *  log, roll onto it, stand still while it carries Bo across, roll off onto the far bank. */
const rideLog = (b: Bot, river: number) => {
  const home = px(river + 1) + 4;
  const log = (x: Bot) => actorsOf(x, 18).find((lx) => lx >= home - 4 && lx <= home + 84);
  standBefore(b, river);
  b.until((x) => (x.vx > 0 ? B.L : x.vx < 0 ? B.R : 0), (x) => Math.abs((log(x) ?? -99) - home) <= 2 && x.actorVX(18) >= 0, 900, `the log at ${river} comes home`);
  b.until(B.R, (x) => x.x >= px(river) + 6 && x.grounded, 60, 'onto the log');
  b.until((x) => (x.vx > 0 ? B.L : x.vx < 0 ? B.R : 0), (x) => (log(x) ?? 0) >= home + 78, 400, 'carried across');
  b.until(B.R, (x) => x.x >= px(river + 13) + 4 && x.grounded, 120, 'off onto the far bank');
};

/** On a stump at `col` (2 high) without stopping: the hop that lands on its top. */
const hopStump = (b: Bot, col: number) =>
  b.search(
    (k) => {
      b.until(B.R, (x) => x.x >= px(col) - 40 + k, 300);
      b.step(B.R | B.A);
      b.until(B.R | B.A, (x) => x.grounded, 200);
    },
    (x) => x.foot === px(32 - 4 - 2) && x.x >= px(col) - 3 && x.x < px(col + 1) + 3,
    40,
    `onto the stump at ${col}`,
  );
/** 2-5: keep pushing; over the pit and the brook, onto the stumps, A at the last kicker (if `toEnd`). */
const chaseRun = (b: Bot, stumps: number[], toEnd = true) => {
  if (b.x < px(40)) {
    b.until(B.R, (x) => x.x >= px(33), 600, 'to the pit');
    b.jumpPast(px(43) + 4, { holdA: 20 }); // the pit
  }
  for (const col of stumps) hopStump(b, col);
  if (!toEnd) return;
  b.until(B.R, (x) => x.x >= px(134), 900, 'to the little brook');
  b.jumpPast(px(144) + 4, { holdA: 20 });
  kickA(b, 'the last kicker over the brook');
};

const LEVEL_RUNS: Record<string, (b: Bot) => void> = {
  '1-1': (b) => {
    followArc(b, 42); // over the first bin
    followArc(b, 50); // the second
    followArc(b, 57); // two bins and star 1
    followArc(b, 66); // onto the box: the apple helmet
    b.land();
    b.until(B.R, (x) => x.x >= px(78), 300);
    b.brakeToStop();
    hopOnto(b, (x) => x.cell(80, 27) === 0 && x.grounded, 'the box with apples');
    followArc(b, 91); // over the first snail
    stompEnemy(b, 1, [EV.STOMP], 'the second snail');
    kickA(b, 'up the hill, down, A at the kicker: star 2');
    b.until(B.R, (x) => x.x >= px(143), 600); // the secret: bin, garage roof, into the hedge
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(28 - 2), 'onto the bin');
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(28 - 3), 'onto the garage roof');
    b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'the wheel');
    b.land(B.R);
    b.until(B.R, (x) => x.x >= px(184), 600, 'the apples of the run-in');
    b.until(B.R, (x) => !x.grounded, 300, 'the last kicker');
    b.land(B.R);
  },
  '1-2': (b) => {
    b.rideTo(px(2), -1); // the apples behind the start
    b.brakeToStop();
    b.rideTo(px(21));
    b.brakeToStop();
    // the trampoline: bounce up the apple column to star 1, then off to the right
    let up = false;
    b.search(
      (k) => {
        b.hold(B.R, k);
        b.step(B.R | B.A);
        for (let i = 0; i < 400 && !(b.grounded && b.x > px(27)); i++) {
          b.step((i < 20 ? B.A : 0) | (b.u('lv_stars') & 1 ? B.R : b.x < px(24) + 6 ? B.R : b.x > px(25) + 2 ? B.L : 0));
          if (b.u('lv_stars') & 1) up = true;
        }
      },
      (x) => up && x.grounded,
      40,
      'the trampoline and star 1',
    );
    kickA(b, 'the kicker after the B sign', (f) => (f === 3 ? B.B : 0)); // the first trick: a kickflip
    b.until(B.R, (x) => x.x >= px(76), 600, 'under the apple tree');
    followArc(b, 82); // over the hedgehog's dip
    // the first kicker: kickflip + shove-it + grab: SÅG DU?!
    kickA(b, 'the first kicker', (f) => (f === 2 ? B.B : f === 21 ? B.U | B.B : f >= 36 && f < 52 ? B.D | B.B : 0));
    kickA(b, 'the second kicker: star 2', () => 0, 24);
    b.until(B.R, (x) => x.x >= px(158), 600);
    b.brakeToStop();
    hopOnto(b, (x) => x.cell(160, 27) === 0 && x.grounded, 'the box with apples');
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(25), 'onto the platform behind the bush');
    b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'the trucks');
    b.land(B.R);
    b.brakeToStop();
    b.rideTo(px(180), -1); // back for the whole row of apples
    b.brakeToStop();
    b.until(B.R, (x) => x.x >= px(194), 600, 'the row');
    b.brakeToStop();
    stompEnemy(b, 1, [EV.STOMP], 'the snail');
    followArc(b, 208);
  },
  '1-3': (b) => {
    const onto = (foot: number, note: string) => {
      b.brakeToStop();
      ollieOnto(b, (x) => x.grounded && x.foot === foot, note);
    };
    b.rideTo(px(14));
    onto(px(25), 'climbing frame 1');
    sweep(b, 18, 21);
    onto(px(23), 'climbing frame 2');
    sweep(b, 22, 25);
    onto(px(21), 'climbing frame 3: star 1');
    b.until(B.R, (x) => (x.u('lv_stars') & 1) === 1 || !x.grounded, 60, 'along the top to star 1');
    if (!(b.u('lv_stars') & 1)) throw new Error('no star 1');
    b.until(B.R, (x) => x.x >= px(31) && x.grounded && x.foot === px(28), 300, 'down again');
    b.brakeToStop();
    b.rideTo(px(30), -1);
    onto(px(25), 'the tower: platform 1');
    onto(px(23), 'the tower: platform 2');
    b.until(B.R, (x) => x.x >= px(48) && x.grounded, 300, 'down the slide');
    b.until(B.R, (x) => x.x >= px(64), 300, 'into the sandbox');
    b.brakeToStop();
    hopOnto(b, (x) => x.cell(66, 27) === 0 && x.grounded, 'the box in the sandbox');
    b.until(B.R, (x) => x.x >= px(75) + 4, 300, 'the apples in the sand');
    b.brakeToStop();
    stompEnemy(b, 5, [EV.STOMP], 'ball 1');
    stompEnemy(b, 6, [EV.STOMP], 'teddy 1');
    b.until(B.R, (x) => x.x >= px(103), 600);
    b.brakeToStop();
    b.until(B.R, (x) => x.x >= px(109) + 4, 300, 'the row after the flag');
    b.brakeToStop();
    stompEnemy(b, 5, [EV.STOMP], 'ball 2');
    kickA(b, 'the kicker: star 2');
    stompEnemy(b, 6, [EV.STOMP], 'teddy 2');
    b.until(B.R, (x) => x.x >= px(152), 600);
    onto(px(25), 'the high frame 1');
    sweep(b, 156, 159);
    onto(px(23), 'the high frame 2');
    sweep(b, 160, 163);
    onto(px(21), 'the high frame 3');
    b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'the part behind the leaves');
    b.land(B.R);
    b.until(B.R, (x) => x.x >= px(202), 600, 'the row of the run-in');
    followArc(b, 212);
  },
  '1-4': (b) => {
    b.until(B.R, (x) => x.u('pw_kind') === 1, 300, 'pommes from the kiosk');
    kickA(b, 'the first pommes kicker', () => 0, 40);
    kickA(b, 'the second: star 1', () => 0, 40);
    b.until((x) => (x.vx > 41 ? B.L : x.vx < 40 ? B.R : 0), (x) => x.onRamp && x.x >= px(86), 900, 'the third, without A');
    b.until((x) => (x.vx > 41 ? B.L : x.vx < 40 ? B.R : 0), (x) => !x.grounded, 60, 'off its lip');
    b.land(B.R);
    kickA(b, 'the 22.5 degree kicker', () => 0, 40);
    followArc(b, 126, 40, true); // over the first pit, still with pommes
    for (const c of [141, 148]) if (b.x < px(c)) b.jumpPast(px(c) + 4); // the cardboard boxes, unless the arc flew over them
    followArc(b, 160, 24, true); // over the second pit
    standBefore(b, 180);
    hopOnto(b, (x) => x.cell(180, 27) === 0 && x.grounded, 'the box with pommes');
    standBefore(b, 196);
    hopOnto(b, (x) => (x.u('lv_stars') & 2) === 2 && x.grounded, 'the tall cardboard box: star 2');
    b.until(B.R, (x) => x.x >= px(204), 600);
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(25), 'onto the garage roof');
    b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'the part in the hedge');
    b.land(B.R);
    b.until(B.R, (x) => x.x >= px(242), 600, 'the run-in');
    b.brakeToStop();
    followArc(b, 246);
  },
  // ---- World 2 (M23) ----
  '2-1': (b) => {
    b.rideTo(px(2), -1); // the apples behind the start
    b.brakeToStop();
    standBefore(b, 48);
    hopOnto(b, (x) => x.grounded && x.foot === px(32 - 4 - 2), 'onto the low stump');
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(32 - 4 - 3), 'onto the high stump');
    b.brakeToStop();
    hopOnto(b, (x) => (x.u('lv_stars') & 1) === 1 && x.grounded && x.foot === px(32 - 4 - 3), 'straight up: star 1');
    b.until(B.R, (x) => x.x >= px(62) && x.grounded, 300, 'the apples after the stumps');
    stompEnemy(b, 7, [EV.STOMP], 'the squirrel');
    b.until(B.R, (x) => x.u('pw_kind') === 2, 900, 'godis from the basket');
    standBefore(b, 110);
    b.search(
      (k) => {
        b.hold(B.R, k % 12);
        b.step(B.R | B.A);
        b.hold(B.R | B.A, 14 + Math.floor(k / 12) * 2);
        b.step(B.B); // the godissnurr (B alone; B with an arrow is a trick): a new ollie in mid-air
        b.until(B.R, (x) => x.grounded || x.state > 1, 200);
      },
      (x) => x.grounded && x.foot === px(32 - 4 - 6),
      120,
      'up onto the high crown with the godissnurr',
    );
    b.until(B.R, (x) => (x.u('lv_stars') & 4) === 4, 200, 'star 3');
    b.until(B.R, (x) => x.x >= px(124) && x.grounded && x.foot === px(28), 300, 'down again');
    kickA(b, 'the kicker: star 2', () => 0, 24);
    standBefore(b, 196); // under the second wasp
    hopOnto(b, (x) => x.cell(196, 27) === 0 && x.grounded, 'the box with apples');
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(25), 'onto the plank in the bush');
    b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'the part');
    b.land(B.R);
  },
  '2-2': (b) => {
    b.rideTo(px(2), -1);
    b.brakeToStop();
    followArc(b, 36); // over the hedgehog's dip
    followArc(b, 50, 12, true); // onto the first stepping stone
    b.brakeToStop();
    followArc(b, 55, 12, true); // onto the second
    b.brakeToStop();
    hopOnto(b, (x) => (x.u('lv_stars') & 1) === 1 && x.grounded && x.foot === px(32 - 5), 'straight up from the stone: star 1');
    b.jumpPast(px(62) + 4, { holdA: 20 });
    kickA(b, 'the kicker over the wide brook: star 2', () => 0, 24);
    standBefore(b, 110);
    hopOnto(b, (x) => x.cell(110, 27) === 0 && x.grounded, 'the box with apples');
    b.until(B.R, (x) => x.x >= px(131), 600, 'up the hill');
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(32 - 6 - 3), 'onto the plank in the bush');
    b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'star 3 and the part');
    b.land(B.R);
    stompEnemy(b, 1, [EV.STOMP], 'the snail after the last bridge');
  },
  '2-3': (b) => {
    const top = 32 - 22;
    b.rideTo(px(2), -1);
    b.brakeToStop();
    standBefore(b, 14);
    hopOnto(b, (x) => x.grounded && x.foot === px(top - 2), 'onto the low stump');
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(top - 3), 'onto the high stump');
    b.brakeToStop();
    hopOnto(b, (x) => (x.u('lv_stars') & 1) === 1 && x.grounded && x.foot === px(top - 3), 'straight up: star 1');
    kickA(b, 'down the big hill, A at the big kicker: the giant jump, star 2', () => B.R);
    climbCrowns(b);
  },
  '2-4': (b) => {
    b.rideTo(px(2), -1);
    b.brakeToStop();
    rideLog(b, 22);
    b.until(B.R, (x) => x.x >= px(44), 600, 'the apples after river 1'); // under the wasp
    rideLog(b, 53);
    standBefore(b, 70);
    hopOnto(b, (x) => x.grounded && x.foot === px(32 - 4 - 2), 'onto the low stump');
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(32 - 4 - 3), 'onto the high stump');
    b.brakeToStop();
    hopOnto(b, (x) => (x.u('lv_stars') & 1) === 1 && x.grounded && x.foot === px(32 - 4 - 3), 'straight up: star 1');
    rideLog(b, 82);
    kickA(b, 'the kicker: star 2', () => 0, 24);
    standBefore(b, 126);
    hopOnto(b, (x) => x.cell(126, 27) === 0 && x.grounded, 'the box with apples');
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(25), 'onto the plank in the bush');
    b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'star 3 and the part');
    b.land(B.R);
  },
  // ---- World 3 (M23) ----
  '3-1': (b) => {
    b.rideTo(px(2), -1);
    b.brakeToStop();
    b.until(B.R, (x) => x.x >= px(29) + 6, 300, 'the apples before the rail');
    ollieOnto(b, (x) => x.state === 2, 'onto the low rail: grind');
    b.until(B.R, (x) => x.grounded, 300, 'off the rail onto the curb');
    b.brakeToStop();
    ollieOnto(b, (x) => x.state === 2, 'onto the first bench');
    b.until(B.R, (x) => x.grounded, 300, 'off the first bench');
    b.brakeToStop(); // the grind combo made Bo fast (TRICK_BOOST)
    ollieOnto(b, (x) => x.state === 2, 'onto the second bench');
    b.until(B.R, (x) => x.grounded && x.x >= px(64), 300);
    standBefore(b, 74);
    hopOnto(b, (x) => x.grounded && x.foot === px(32 - 4 - 2), 'onto the first car');
    b.brakeToStop();
    b.until((x) => (x.x < px(75) + 4 ? B.R : 0), (x) => x.x >= px(75) + 4, 100, 'along the roof (its apple)');
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(32 - 4 - 2) && x.x >= px(80), 'onto the second car');
    b.brakeToStop();
    hopOnto(b, (x) => (x.u('lv_stars') & 1) === 1 && x.grounded && x.foot === px(32 - 4 - 2), 'straight up from the roof: star 1');
    b.until(B.R, (x) => x.x >= px(104), 600, 'the apples, flag 2');
    b.jumpPast(px(111) + 4, { holdA: 12 }); // up the curb
    b.brakeToStop();
    ollieOnto(b, (x) => x.state === 2, 'onto the long rail');
    b.until(B.R, (x) => x.grounded, 300, 'off the long rail');
    followArc(b, 131, 24, true); // star 2
    b.until(B.R, (x) => x.x >= px(166), 900, 'to the shop');
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(32 - 4 - 2), 'onto the awning');
    b.until((x) => (x.x < px(174) + 3 ? B.R : 0), (x) => x.x >= px(174) + 3 || !x.grounded, 200, 'along the awning');
    b.land(B.R);
    standBefore(b, 190);
    hopOnto(b, (x) => x.cell(190, 27) === 0 && x.grounded, 'the box with apples');
    b.jumpPast(px(199) + 4, { holdA: 30 }); // over the parked car
    b.until(B.R, (x) => x.x >= px(201), 300);
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(25), 'onto the plank in the hedge');
    b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'star 3 and the part');
    b.land(B.R);
  },
  '3-2': (b) => {
    const handrail = (note: string) => {
      b.brakeToStop();
      ollieOnto(b, (x) => x.state === 2, note);
      b.until(B.R, (x) => x.grounded, 300, `${note}: off the end`);
      b.brakeToStop(); // fast after the handrail (45 degrees, then TRICK_BOOST)
    };
    b.rideTo(px(2), -1);
    b.brakeToStop();
    b.until(B.R, (x) => x.x >= px(11), 300);
    handrail('the first handrail');
    b.until(B.R, (x) => x.x >= px(27), 300, 'the apples of the landing');
    handrail('the second handrail');
    kickA(b, 'the kicker in the street: star 2', () => 0, 24);
    b.brakeToStop();
    for (const h of [5, 6, 7]) {
      if (b.foot === px(32 - h)) continue; // the arc may already have landed on a step
      ollieOnto(b, (x) => x.grounded && x.foot === px(32 - h), `up the step to h${h}`);
      b.brakeToStop();
    }
    b.until(B.R, (x) => x.x >= px(83) + 4, 300, 'along the upper floor');
    b.brakeToStop();
    hopOnto(b, (x) => (x.u('lv_stars') & 1) === 1 && x.grounded && x.foot === px(32 - 7), 'straight up: star 1');
    handrail('the third handrail');
    standBefore(b, 118); // past the seagull
    hopOnto(b, (x) => x.cell(118, 27) === 0 && x.grounded, 'the box with apples');
    b.until(B.R, (x) => x.x >= px(127), 300);
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(25), 'onto the plank in the hedge');
    b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'star 3 and the part');
    b.land(B.R);
  },
  '3-3': (b) => {
    b.rideTo(px(2), -1);
    b.brakeToStop();
    standBefore(b, 21);
    hopOnto(b, (x) => x.grounded && x.foot === px(32 - 4 - 2) && x.u('bo_plat') !== 0, 'onto the roof of the bus');
    // the ride: near the front of the roof, crouch under the low signs, straight up under the stars
    const bars = [60, 100, 120, 140].map((c) => px(c) + 4);
    const stars = [84, 124].map((c) => px(c) + 4);
    const end = px(24) + 4 + 160 * 8;
    b.until(
      (x) => {
        if (!x.grounded) return B.A;
        const nearBar = bars.some((bx) => bx - x.x > -8 && bx - x.x < 28);
        if (nearBar) return B.D;
        if (stars.some((sx) => sx - x.x >= 0 && sx - x.x <= 1) && x.vx === 0) return B.A;
        const bus = x.actorX(19) ?? x.x;
        if (x.x < bus + 8) return x.vx > 4 ? 0 : B.R;
        return x.vx > 0 ? B.L : 0;
      },
      (x) => (x.actorX(19) ?? 0) >= end - 1 && x.grounded,
      3000,
      'the bus ride',
    );
    b.until(B.R, (x) => x.grounded && x.foot === px(28), 300, 'off the bus at the end');
    standBefore(b, 200);
    hopOnto(b, (x) => x.cell(200, 27) === 0 && x.grounded, 'the box with apples');
    b.jumpPast(px(209) + 4, { holdA: 30 }); // over the parked car
    b.until(B.R, (x) => x.x >= px(209) + 4, 300);
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(25), 'onto the plank in the hedge');
    b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'star 3 and the part');
    b.land(B.R);
  },
  '3-4': (b) => {
    const grind = (note: string, stop = true) => {
      if (stop) b.brakeToStop();
      ollieOnto(b, (x) => x.state === 2, note);
      b.until(B.R, (x) => x.grounded, 300, `${note}: off the end onto the slope (boost)`);
      b.brakeToStop();
    };
    b.rideTo(px(2), -1);
    b.brakeToStop();
    b.until(B.R, (x) => x.x >= px(12), 300);
    grind('the first rail');
    b.until(B.R, (x) => x.x >= px(39), 300, 'the apples after the slope');
    stompEnemy(b, 5, [EV.STOMP], 'the first ball');
    kickA(b, 'the kicker: star 2', () => 0, 24);
    b.until(B.R, (x) => x.x >= px(62), 300);
    grind('the second rail');
    b.until(B.R, (x) => x.x >= px(85), 300, 'past flag 2');
    b.brakeToStop();
    ollieOnto(b, (x) => x.state === 2, 'onto the bench');
    b.until(B.R, (x) => x.x >= px(91), 200, 'along the bench');
    b.step(B.R | B.A); // off the end of the bench with an ollie: star 1
    b.land(B.R | B.A);
    if (!(b.u('lv_stars') & 1)) throw new Error('no star 1');
    stompEnemy(b, 5, [EV.STOMP], 'the second ball');
    b.until(B.R, (x) => x.x >= px(115), 400, 'towards the high part');
    grind('the third rail', false); // up the slope with speed (a standstill on it cannot push up)
    standBefore(b, 156);
    hopOnto(b, (x) => x.cell(156, 27) === 0 && x.grounded, 'the box with apples');
    b.until(B.R, (x) => x.x >= px(159), 300);
    b.brakeToStop();
    ollieOnto(b, (x) => x.grounded && x.foot === px(25), 'onto the plank in the hedge');
    b.until(B.R, (x) => x.u('lv_part') === 1, 300, 'star 3 and the part');
    b.land(B.R);
  },
  // the chase: keep pushing, every hop where the apples show it, A at the last kicker
  '2-5': (b) => chaseRun(b, [52, 68, 112]),

};

const levelRoute = (id: string): Route => ({
  seed: 1,
  run: (b) => {
    b.startLevel(id);
    LEVEL_RUNS[id]!(b);
    b.until(B.R, (x) => x.u('goal_t') > 0, 3000, 'to the goal');
    b.hold(0, 60);
  },
});

/** On the world map: wait a moment, A starts the selected level. */
const fromMap = (b: Bot) => {
  b.until(0, (x) => x.mode === x.S('M_MAP'), 600, 'the map');
  b.hold(0, 30);
  b.step(B.A);
  b.until(0, (x) => x.playing, 120, 'into the level');
};

export const ROUTES: Record<string, Route> = {
  // M22, FIRST10 §8 rules 5-8: the first time from the title; 10 s without a button (idle trick, arrow, balance),
  // one press of → (Bo moves in that frame) and rolling out, then into the first bin without jumping (A blinks)
  'm22-first10': {
    seed: 1,
    run: (b) => {
      fromTitle(b);
      b.hold(0, 600);
      b.step(B.R); // the very first press of right: Bo moves in this frame
      b.hold(0, 30);
      b.hold(B.R, 20); // one push (a third of a second), then rolling out down the driveway
      b.until(0, (x) => x.vx === 0, 600, 'rolling out after one push');
      b.hold(0, 10);
      b.until(B.R, (x) => x.vx === 0 && x.x > px(40), 600, 'into the first bin');
      b.hold(0, 160);
      b.hold(B.R, 20);
      b.hold(0, 20);
    },
  },
  // M22: from the title through all of World 1 (every star and part) to the World 2 map
  'm22-world1': {
    seed: 1,
    run: (b) => {
      fromTitle(b);
      LEVEL_RUNS['1-1']!(b);
      finish(b);
      for (const id of ['1-2', '1-3', '1-4']) {
        fromMap(b);
        LEVEL_RUNS[id]!(b);
        finish(b);
      }
      fromMap(b);
      b.hold(0, 20);
      fightBoss1(b);
      finish(b);
      b.until(0, (x) => x.mode === x.S('M_MAP'), 900, 'the scene, then the World 2 map');
      b.hold(0, 60);
    },
  },
  // M22: the boss's dive costs a life; the fight starts again and is won
  'm22-boss-retry': {
    seed: 3,
    run: (b) => {
      b.startLevel('1-5');
      b.until(0, (x) => x.state === 3, 900, 'standing still: the dive hits');
      b.until(0, (x) => x.state === 0, 200, 'back');
      fightBoss1(b);
      b.until(0, (x) => x.mode !== x.S('M_PLAY'), 600, 'the end of the level');
      b.hold(0, 10);
    },
  },
  // M22: the patterns that are alternatives to the main path (apples never lie: each one can be followed)
  'm22-alts': {
    seed: 1,
    run: (b) => {
      b.startLevel('1-1');
      for (const c of [42, 50, 57]) followArc(b, c);
      b.jumpPast(px(73) + 4);
      b.jumpPast(px(81) + 4);
      followArc(b, 91);
      stompEnemy(b, 1, [EV.STOMP], 'the second snail');
      b.until(B.R, (x) => x.onRamp, 600, '1-1: the kicker without A');
      b.until(B.R, (x) => !x.grounded, 60);
      b.land(B.R);
      b.hold(0, 30);
    },
  },
  'm22-1-3': levelRoute('1-3'),
  'm22-1-4': levelRoute('1-4'),
  'm23-2-1': levelRoute('2-1'),
  'm23-2-2': levelRoute('2-2'),
  'm23-2-3': levelRoute('2-3'),
  'm23-2-4': levelRoute('2-4'),
  'm23-3-1': levelRoute('3-1'),
  'm23-3-2': levelRoute('3-2'),
  'm23-3-3': levelRoute('3-3'),
  'm23-3-4': levelRoute('3-4'),
  'm23-chase': levelRoute('2-5'),
  // M23: the rabbit catches Bo standing still after flag 1; the chase starts again from the flag and is won
  'm23-chase-caught': {
    seed: 1,
    run: (b) => {
      b.startLevel('2-5');
      chaseRun(b, [52, 68], false);
      b.until(B.R, (x) => x.x >= px(86), 600, 'past flag 1');
      b.brakeToStop();
      b.until(0, (x) => x.state === 3, 900, 'the rabbit catches Bo');
      b.until(0, (x) => x.state === 0 && x.playing, 300, 'back at the flag');
      chaseRun(b, [112]);
      b.until(B.R, (x) => x.u('goal_t') > 0, 3000, 'to the goal');
      b.hold(0, 60);
    },
  },
  'm22-1-2': {
    seed: 1,
    run: (b) => {
      b.startLevel('1-2');
      LEVEL_RUNS['1-2']!(b);
      b.until(B.R, (x) => x.u('goal_t') > 0, 3000, 'to the goal');
      b.hold(0, 60);
    },
  },
  // M22: Stora Måsen won with exactly three hits in its pattern
  'm22-boss': {
    seed: 1,
    run: (b) => {
      b.startLevel('1-5');
      b.hold(0, 20);
      fightBoss1(b);
      b.until(0, (x) => x.mode !== x.S('M_PLAY'), 600, 'the end of the level');
      b.hold(0, 10);
    },
  },
  // M22: the reference route through 1-1 from the title: all three stars and the wheel (FIRST10 §8 rule 9)
  'm22-1-1': {
    seed: 1,
    run: (b) => {
      fromTitle(b);
      LEVEL_RUNS['1-1']!(b);
      finish(b);
    },
  },

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
