// Routes for the bot (bot.ts): what Sixten does in each replay. Recorded by record.ts into ../replays/<name>.json.
import { B, type Bot, saveCode } from './bot';

export interface Route {
  seed: number;
  run: (bot: Bot) => void;
}

/** wait (standing still) until the whirlwind is gone */
function waitOut(bot: Bot) {
  for (let guard = 0; bot.u('wh_state') !== 0 || bot.u('wh_pending') !== 0; guard++) {
    if (guard > 6000) throw new Error('the whirlwind never ended');
    bot.step(0);
  }
}

/** T3: stamp control k (it starts whirlwind k), go and stand on (c, r), stay until it is gone */
function weather(bot: Bot, k: number, c: number, r: number) {
  const ctrl = [[2, 12], [5, 12], [8, 12], [11, 12], [14, 12]][k - 1]!;
  bot.walkTo(ctrl[0]!, ctrl[1]!);
  bot.walkTo(c, r);
  waitOut(bot);
}

// ---- the side view (DESIGN §3.2) ----
const sx = (bot: Bot) => bot.u('sd_x') >> 4;
const sy = (bot: Bot) => bot.u('sd_y') >> 4;
/** in a side view: walk until the feet's x is (about) tx */
function sideWalk(bot: Bot, tx: number) {
  for (let guard = 0; Math.abs(sx(bot) - tx) > 1; guard++) {
    if (guard > 1500 || bot.mode !== bot.S('M_SIDE')) throw new Error(`side: stuck at ${sx(bot)},${sy(bot)} going to x ${tx}`);
    bot.step(sx(bot) < tx ? B.R : B.L);
  }
}
/** in a side view: hold buttons until a condition holds */
function holdUntil(bot: Bot, b: number, done: () => boolean, what: string) {
  for (let guard = 0; !done(); guard++) {
    if (guard > 1500) throw new Error(`side: ${what} never happened (at ${sx(bot)},${sy(bot)})`);
    bot.step(b);
  }
}
/** top-down: face a direction (towards a blocked cell) and press A */
function enterSide(bot: Bot, b: number) {
  bot.settle();
  bot.tap(b);
  bot.tap(B.A);
  if (bot.mode !== bot.S('M_SIDE')) throw new Error('no side view');
  bot.wait(2);
}
/** walk out of a side view at an edge */
function leaveSide(bot: Bot, b: number) {
  holdUntil(bot, b, () => bot.mode === bot.S('M_PLAY'), 'leaving the side view');
  bot.wait(2);
}
/** T4's cave: to the roots, up them onto the ledge, back down and out to the left */
function cave(bot: Bot) {
  enterSide(bot, B.U);
  sideWalk(bot, 155);
  holdUntil(bot, B.U, () => sy(bot) <= 41, 'climbing the roots');
  bot.hold(B.U | B.R, 12);
  bot.hold(B.R, 20);
  bot.wait(10);
  leaveSide(bot, B.L);
}

// ---- World 1 (M29) ----
/** the safe route never steps on a power-up */
function avoidItems(bot: Bot) {
  for (const o of bot.level.objects) if (o.kind === 'item') bot.avoid.add(`${o.c},${o.r}`);
}
/** wait standing still on the current cell until the whirlwind is gone */
function shelterUntilGone(bot: Bot) {
  waitOut(bot);
  bot.wait(10);
}
/** 1-3's cave: in at the south foot, two climbs, out at the north end */
function cave13(bot: Bot) {
  bot.walkTo(12, 9);
  enterSide(bot, B.U);
  sideWalk(bot, 54);
  bot.hold(B.R | B.A, 30); // over the stone
  sideWalk(bot, 124);
  holdUntil(bot, B.U, () => sy(bot) <= 57, 'climbing to the middle shelf');
  bot.hold(B.U | B.R, 10);
  sideWalk(bot, 252);
  holdUntil(bot, B.U, () => sy(bot) <= 33, 'climbing to the top shelf');
  bot.hold(B.U | B.R, 10);
  leaveSide(bot, B.R);
}
/** World 1 on its safe routes (DESIGN §13.2): only the obligatory controls, in order; no wood, no power-up, no
 * compass course; shelter when the whirlwind comes */
function world1Safe(bot: Bot) {
  bot.toWorldMap();
  // 1-1: control 3 starts the whirlwind: into the ditch at once, out when it is gone; the long way over the spång
  bot.playChosen('1-1');
  avoidItems(bot);
  for (const [c, r] of [[6, 13], [14, 6], [19, 3]] as const) bot.walkTo(c, r);
  bot.walkTo(18, 8);
  shelterUntilGone(bot);
  bot.walkTo(10, 7);
  bot.finish();
  // 1-2: round the west side, over the footbridge to the islet
  bot.playChosen('1-2');
  avoidItems(bot);
  for (const [c, r] of [[11, 1], [2, 7], [11, 7]] as const) bot.walkTo(c, r);
  bot.finish();
  // 1-3: through the cave
  bot.playChosen('1-3');
  avoidItems(bot);
  for (const [c, r] of [[5, 11], [19, 10]] as const) bot.walkTo(c, r);
  cave13(bot);
  bot.walkTo(11, 2);
  bot.finish();
  // 1-4: control 2 starts the whirlwind: into the cabin until it is gone; the long way round the brook
  bot.playChosen('1-4');
  avoidItems(bot);
  for (const [c, r] of [[4, 2], [5, 8]] as const) bot.walkTo(c, r);
  bot.walkTo(12, 9);
  shelterUntilGone(bot);
  bot.setCell(8, 6, 'L');
  bot.setCell(9, 6, 'L');
  bot.walkTo(20, 9);
  bot.finish();
}
/** World 1 collecting everything: every control (optional and hidden ones too), every entry, the power-ups, wood
 * from the fallen spruces and the building site's shortcut */
function world1All(bot: Bot) {
  bot.toWorldMap();
  bot.playChosen('1-1');
  bot.walkTo(6, 13);
  bot.read(6, 9); // RÄV
  bot.walkTo(14, 6);
  bot.read(12, 6); // GRAN
  bot.walkTo(15, 5); // gurka
  bot.walkTo(19, 3);
  bot.walkTo(18, 8);
  shelterUntilGone(bot);
  bot.setCell(20, 7, 'L');
  bot.walkTo(10, 7);
  bot.walkTo(21, 8); // 5, its leaves blown off
  bot.finish();
  bot.playChosen('1-2');
  bot.walkTo(11, 1);
  bot.read(13, 3); // BLÅBÄR
  bot.read(3, 4); // IGELKOTT
  bot.walkTo(3, 10); // chips
  bot.walkTo(2, 7);
  bot.walkTo(11, 7);
  bot.walkTo(21, 6);
  bot.finish();
  bot.playChosen('1-3');
  bot.walkTo(5, 11);
  bot.walkTo(19, 10);
  cave13(bot);
  bot.walkTo(13, 3); // gurka
  bot.walkTo(11, 2);
  bot.read(16, 2); // VIND
  bot.read(3, 2); // FLYTTBLOCK
  bot.walkTo(21, 2);
  bot.finish();
  bot.playChosen('1-4');
  bot.walkTo(4, 2);
  bot.read(12, 4); // TROMB
  bot.walkTo(5, 8);
  bot.walkTo(5, 10);
  shelterUntilGone(bot);
  bot.setCell(8, 6, 'L');
  bot.setCell(9, 6, 'L');
  bot.walkTo(8, 6);
  bot.tap(B.A); // wood from the fallen spruce
  bot.walkTo(10, 7); // 4, its leaves blown off
  bot.walkTo(14, 8);
  bot.tap(B.R); // face the brook
  bot.tap(B.A); // build the bridge
  bot.setCell(17, 8, 'b');
  bot.walkTo(20, 9);
  bot.read(20, 3); // ROTVÄLTA
  bot.finish();
}

// ---- Worlds 2 and 3 (M30) ----
/** the safe route keeps off every cell an event will change, off flowing water, and off power-ups */
function avoidHazards(bot: Bot) {
  avoidItems(bot);
  for (const e of bot.level.events) for (const c of e.cells) bot.avoid.add(`${c.c},${c.r}`);
  bot.level.rows.forEach((row, r) => [...row].forEach((ch, c) => ch === 'Q' && bot.avoid.add(`${c},${r}`)));
}
/** wait until every event of the level that has started has happened, then the bot's map follows */
function waitEvents(bot: Bot) {
  const n = bot.level.events.length;
  for (let guard = 0; ; guard++) {
    const done = bot.u('ev_done');
    const t = [...Array(n)].map((_, k) => bot.vm.read16(bot.S('ev_t') + 2 * k));
    if (t.every((x, k) => x === 0xffff || (done >> k) & 1)) break;
    if (guard > 3000) throw new Error('the events never happened');
    bot.step(0);
  }
  bot.level.events.forEach((e, k) => {
    if ((bot.u('ev_done') >> k) & 1) for (const c of e.cells) bot.setCell(c.c, c.r, c.ch);
  });
}
function world23Safe(bot: Bot) {
  // 2-1: the storm: the open land along the west edge, never the forest
  bot.playChosen('2-1');
  avoidHazards(bot);
  bot.level.rows.forEach((row, r) => [...row].forEach((ch, c) => ch === 'T' && bot.avoid.add(`${c},${r}`)));
  bot.walkTo(3, 1);
  bot.walkTo(2, 7);
  bot.walkTo(2, 10);
  bot.finish();
  // 2-2: round the slope through the south
  bot.playChosen('2-2');
  avoidHazards(bot);
  for (const [c, r] of [[2, 3], [7, 9], [12, 6]] as const) bot.walkTo(c, r);
  bot.finish();
  // 2-3: in the hollow while the whirlwind passes
  bot.playChosen('2-3');
  avoidHazards(bot);
  bot.walkTo(3, 3);
  shelterUntilGone(bot);
  bot.setCell(7, 4, '.');
  bot.setCell(7, 5, 'G');
  bot.walkTo(12, 7);
  bot.walkTo(2, 9);
  bot.finish();
  // 2-4: the long way over the footbridge
  bot.playChosen('2-4');
  avoidHazards(bot);
  for (const [c, r] of [[3, 5], [9, 10], [14, 4]] as const) bot.walkTo(c, r);
  bot.finish();
  // World 3: off every flooded cell and the rapids
  bot.playChosen('3-1');
  avoidHazards(bot);
  for (const [c, r] of [[3, 3], [9, 6], [12, 2]] as const) bot.walkTo(c, r);
  bot.finish();
  bot.playChosen('3-2');
  avoidHazards(bot);
  for (const [c, r] of [[3, 2], [11, 5]] as const) bot.walkTo(c, r);
  bot.finish();
  bot.playChosen('3-3');
  avoidHazards(bot);
  for (const [c, r] of [[2, 3], [7, 6], [13, 2]] as const) bot.walkTo(c, r);
  bot.finish();
  bot.playChosen('3-4');
  avoidHazards(bot);
  for (const [c, r] of [[5, 2], [12, 2], [2, 8]] as const) bot.walkTo(c, r);
  bot.finish();
}
function world23All(bot: Bot) {
  bot.playChosen('2-1');
  avoidItems(bot);
  bot.walkTo(3, 1);
  bot.read(2, 4); // STORM
  bot.walkTo(2, 7);
  waitEvents(bot); // the spruces have fallen
  bot.avoid.clear();
  bot.walkTo(1, 9); // choklad
  bot.walkTo(9, 4); // 3, through the forest after the storm
  bot.read(7, 9); // KORP
  bot.finish();
  bot.playChosen('2-2');
  avoidHazards(bot);
  bot.walkTo(2, 3);
  bot.read(3, 10); // RULLSTENSÅS
  bot.walkTo(7, 9);
  bot.walkTo(12, 6);
  bot.walkTo(14, 9); // 4
  bot.read(13, 10); // GRANIT
  bot.finish();
  bot.playChosen('2-3');
  bot.walkTo(3, 3);
  shelterUntilGone(bot);
  bot.setCell(7, 4, '.');
  bot.setCell(7, 5, 'G');
  bot.read(4, 9); // HACKSPETT
  bot.walkTo(7, 4);
  enterSide(bot, B.D); // the cave the whirlwind opened
  sideWalk(bot, 92);
  holdUntil(bot, B.U, () => sy(bot) <= 65, 'climbing the roots');
  bot.hold(B.U | B.R, 10);
  leaveSide(bot, B.R);
  bot.walkTo(12, 7);
  bot.read(12, 9); // EKORRE
  bot.walkTo(2, 9);
  bot.finish();
  bot.playChosen('2-4');
  bot.walkTo(3, 5);
  bot.read(6, 5); // TALL
  bot.walkTo(3, 1);
  bot.tap(B.A); // wood
  bot.walkTo(3, 3);
  bot.tap(B.A); // wood
  bot.read(4, 7); // LINGON
  bot.walkTo(2, 9); // 4
  bot.walkTo(9, 10);
  bot.walkTo(11, 5);
  bot.tap(B.R);
  bot.tap(B.A); // the bridge
  bot.setCell(12, 5, 'b');
  bot.walkTo(14, 4);
  bot.finish();
  bot.playChosen('3-1');
  avoidHazards(bot);
  bot.walkTo(3, 3);
  bot.read(5, 8); // GRODA
  bot.walkTo(9, 6);
  bot.read(11, 8); // REGN
  bot.walkTo(12, 2);
  bot.finish();
  bot.playChosen('3-2');
  avoidHazards(bot);
  bot.walkTo(3, 2);
  bot.read(10, 1); // BÄCK
  bot.walkTo(11, 5);
  bot.walkTo(3, 9); // 3, the long way round on the dry paths
  bot.read(6, 10); // BÄVER
  bot.finish();
  bot.playChosen('3-3');
  bot.walkTo(2, 3);
  bot.walkTo(2, 7); // gurka
  bot.walkTo(7, 6);
  bot.read(10, 8); // VITMOSSA
  bot.read(5, 9); // MYR
  bot.walkTo(13, 2);
  bot.finish();
  bot.playChosen('3-4');
  avoidHazards(bot);
  bot.avoid.delete('9,9');
  bot.walkTo(5, 2);
  bot.walkTo(12, 2);
  bot.read(13, 5); // LERA
  bot.read(9, 7); // KÄLLA
  bot.walkTo(9, 9); // chips
  bot.walkTo(2, 8);
  bot.finish();
}

// ---- Worlds 4 and 5 and the ending (M31) ----
/** the safe route also keeps off lone trees and the cells next to them (thunder, S4) */
function avoidLightning(bot: Bot) {
  bot.level.rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch !== 'i') return;
      for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) bot.avoid.add(`${c + dc!},${r + dr!}`);
    }),
  );
}
/** stand still in shelter until the weather (the whirlwind and every started event) is over */
function waitWeather(bot: Bot) {
  shelterUntilGone(bot);
  waitEvents(bot);
  bot.wait(10);
}
function world45Safe(bot: Bot) {
  bot.playChosen('4-1');
  avoidHazards(bot);
  avoidLightning(bot);
  bot.walkTo(2, 2);
  bot.walkTo(3, 5);
  waitWeather(bot);
  bot.walkTo(12, 4);
  bot.walkTo(6, 9);
  bot.finish();
  bot.playChosen('4-2');
  for (const [c, r] of [[2, 1], [11, 3], [12, 7]] as const) bot.walkTo(c, r);
  bot.finish();
  bot.playChosen('4-3');
  avoidLightning(bot);
  bot.walkTo(2, 5);
  bot.walkTo(2, 3);
  waitWeather(bot);
  bot.walkTo(8, 9);
  bot.walkTo(8, 2);
  bot.finish();
  bot.playChosen('4-4');
  bot.walkTo(1, 4);
  bot.walkTo(7, 4);
  bot.walkTo(7, 5);
  waitWeather(bot);
  bot.walkTo(12, 8);
  bot.finish();
  bot.playChosen('5-1');
  avoidHazards(bot);
  bot.walkTo(2, 3);
  bot.walkTo(3, 4);
  waitWeather(bot);
  bot.walkTo(11, 7);
  bot.walkTo(3, 9);
  bot.finish();
  bot.playChosen('5-2');
  for (const [c, r] of [[2, 1], [13, 3], [6, 9]] as const) bot.walkTo(c, r);
  bot.finish();
  bot.playChosen('5-3');
  avoidHazards(bot);
  for (const [c, r] of [[2, 1], [13, 4], [2, 8]] as const) bot.walkTo(c, r);
  bot.finish();
  bot.playChosen('5-4');
  bot.walkTo(8, 2);
  bot.walkTo(5, 10);
  bot.walkTo(11, 7);
  waitWeather(bot);
  bot.walkTo(20, 7);
  bot.finish();
}
function world45All(bot: Bot) {
  bot.playChosen('4-1');
  avoidLightning(bot);
  bot.walkTo(2, 2);
  bot.walkTo(3, 5);
  waitWeather(bot);
  bot.read(6, 3); // ÅSKA
  bot.read(12, 8); // BLIXT
  bot.walkTo(12, 4);
  bot.walkTo(6, 9);
  bot.finish();
  bot.playChosen('4-2');
  bot.walkTo(2, 1); // a crossing and control 1: he knows where he is
  bot.openMap();
  bot.wait(20);
  bot.tap(B.A); // the course to control 2, through the fog
  bot.settle();
  bot.walkTo(11, 3);
  bot.walkTo(12, 7);
  bot.walkTo(7, 9); // 4
  bot.read(7, 8); // BJÖRK
  bot.read(5, 5); // DIMMA
  bot.finish();
  bot.playChosen('4-3');
  avoidLightning(bot);
  bot.walkTo(2, 5);
  bot.walkTo(2, 3);
  waitWeather(bot);
  bot.avoid.clear();
  bot.walkTo(8, 9);
  bot.read(4, 7); // ÖRNBRÄKEN
  bot.read(13, 9); // JÄTTEGRYTA
  bot.walkTo(13, 3); // 4
  bot.walkTo(8, 2);
  bot.finish();
  bot.playChosen('4-4');
  bot.walkTo(1, 4);
  bot.walkTo(7, 4);
  bot.walkTo(7, 5);
  waitWeather(bot);
  bot.read(12, 1); // BYMOLN
  bot.read(4, 8); // KANTARELL
  bot.walkTo(12, 8);
  bot.finish();
  bot.playChosen('5-1');
  avoidHazards(bot);
  bot.walkTo(2, 3);
  bot.walkTo(3, 4);
  waitWeather(bot);
  bot.read(13, 2); // ÄLG
  bot.read(8, 9); // MYRA
  bot.walkTo(11, 7);
  bot.walkTo(3, 9);
  bot.finish();
  bot.playChosen('5-2');
  bot.walkTo(2, 1);
  bot.read(8, 2); // HUGGORM
  bot.walkTo(13, 3);
  bot.walkTo(10, 7); // 4
  bot.read(3, 8); // FLUGSVAMP
  bot.walkTo(6, 9);
  bot.finish();
  bot.playChosen('5-3');
  avoidHazards(bot);
  bot.walkTo(2, 1);
  bot.walkTo(13, 4);
  bot.read(11, 9); // SAND
  bot.read(4, 9); // KALKSTEN
  bot.walkTo(2, 8);
  bot.finish();
  bot.playChosen('5-4');
  bot.walkTo(8, 2);
  bot.read(9, 2); // SÄNKA
  bot.read(8, 5); // DIKE
  bot.walkTo(5, 10);
  bot.walkTo(11, 7);
  waitWeather(bot);
  bot.walkTo(20, 7);
  bot.walkTo(19, 12); // 4
  bot.finish();
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
  // T3: all five whirlwinds, watched from the safe row 12 (the strengths, the turn of whirlwind 2, the diagonal)
  'm27-strengths': {
    seed: 1,
    run(bot) {
      bot.startLevel('T3');
      for (let k = 1; k <= 5; k++) weather(bot, k, [2, 5, 8, 11, 14][k - 1]!, 13);
      bot.wait(20);
    },
  },
  // T3: whirlwind 3 (strength 3) passes while Sixten stands still in a shelter: the ditch, the hollow, the cabin
  'm27-ditch': { seed: 1, run: (bot) => (bot.startLevel('T3'), weather(bot, 3, 10, 7), bot.wait(20)) },
  'm27-hollow': { seed: 1, run: (bot) => (bot.startLevel('T3'), weather(bot, 3, 13, 7), bot.wait(20)) },
  'm27-cabin': { seed: 1, run: (bot) => (bot.startLevel('T3'), weather(bot, 3, 15, 7), bot.wait(20)) },
  // T3: the same whirlwind, Sixten in the forest or on open land inside its radius: AJ! and back to control 3
  'm27-forest': { seed: 1, run: (bot) => (bot.startLevel('T3'), weather(bot, 3, 6, 7), bot.wait(20)) },
  'm27-open': { seed: 1, run: (bot) => (bot.startLevel('T3'), weather(bot, 3, 20, 7), bot.wait(20)) },
  // T4: the cave twice (the same inputs both times), the ravine in the wind (crouching behind the stone, pushed when
  // standing, the root plate's lee, a jump over it, out on the south side), back north through it, and the cliff
  'm28-t4': {
    seed: 1,
    run(bot) {
      bot.startLevel('T4');
      bot.walkTo(4, 2);
      cave(bot);
      cave(bot);
      bot.walkTo(1, 3);
      enterSide(bot, B.D);
      sideWalk(bot, 76);
      bot.hold(B.D, 60); // crouched behind the stone: the lee
      bot.wait(40); // standing: the wind pushes him west
      sideWalk(bot, 70);
      bot.hold(B.R | B.A, 30); // over the stone
      sideWalk(bot, 268);
      bot.wait(60); // standing by the root plate: the lee
      bot.hold(B.R | B.A, 40); // over it
      leaveSide(bot, B.R);
      enterSide(bot, B.U); // from the south side the same side view starts at its north edge
      leaveSide(bot, B.L);
      bot.walkTo(6, 3);
      enterSide(bot, B.U);
      sideWalk(bot, 116);
      holdUntil(bot, B.U, () => sy(bot) <= 25, 'climbing the holds');
      bot.hold(B.U | B.R, 12);
      leaveSide(bot, B.R);
      bot.wait(10);
    },
  },
  // World 1 from the title to the World 2 map on the safe routes, and once more collecting everything
  'm29-safe': { seed: 1, run: (bot) => (world1Safe(bot), bot.wait(30)) },
  'm29-all': { seed: 1, run: (bot) => (world1All(bot), bot.wait(30)) },
  // Worlds 2 and 3 after World 1, from the World 2 map to the World 4 map
  'm30-safe': { seed: 1, run: (bot) => (world1Safe(bot), world23Safe(bot), bot.wait(30)) },
  'm30-all': { seed: 1, run: (bot) => (world1All(bot), world23All(bot), bot.wait(30)) },
  // the whole game, title to ending: on the safe routes, and collecting everything
  'm31-safe': { seed: 1, run: (bot) => (world1Safe(bot), world23Safe(bot), world45Safe(bot), bot.wait(60)) },
  'm31-all': { seed: 1, run: (bot) => (world1All(bot), world23All(bot), world45All(bot), bot.wait(60)) },
  // M32: a code for World 3 with the entries of Worlds 1 and 2 typed in on the title's code screen, then 3-1 played
  'm32-code': {
    seed: 1,
    run(bot) {
      bot.enterCode(saveCode(3, [...Array(16)].map((_, i) => i + 1)));
      bot.playChosen('3-1');
      avoidHazards(bot);
      for (const [c, r] of [[3, 3], [9, 6], [12, 2]] as const) bot.walkTo(c, r);
      bot.finish();
      bot.wait(30);
    },
  },
  // 1-1: control 3 starts the whirlwind; Sixten waits by the lake until it has passed and the spruce lies over the
  // brook, then walks over it to the revealed control 5
  'm27-11': {
    seed: 1,
    run(bot) {
      bot.startLevel('1-1');
      bot.walkTo(6, 13);
      bot.walkTo(14, 6);
      bot.walkTo(19, 3);
      waitOut(bot);
      bot.level.rows[7] = bot.level.rows[7]!.slice(0, 20) + 'L' + bot.level.rows[7]!.slice(21); // the bridge
      bot.walkTo(10, 7);
      bot.walkTo(21, 8);
      bot.wait(20);
    },
  },
};
