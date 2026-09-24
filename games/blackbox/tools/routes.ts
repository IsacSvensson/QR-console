// Replay routes for BLACKBOX. `npx tsx games/blackbox/tools/record.ts` records them into ../replays/.
import type { Bot, Step } from './bot';

const EMP_R = 40;
/** true when some unstunned machine (drone, hunter, prototype, agent) is within EMP reach */
const machineNear = (b: Bot) =>
  b.actors().some((a) => [2, 4, 5, 6].includes(a.type) && a.stun === 0 && Math.abs(a.x - b.ram('px')) <= EMP_R && Math.abs(a.y - b.ram('py')) <= EMP_R);

/** title -> the director's office -> 3.1, optionally visiting Dr. Reyes */
const SECTIONS_0_2 = (reyes: boolean): Step[] => [
  ...TO_CORRIDOR,
  { exit: 'N' },
  { room: '2.1' },
  ...(reyes
    ? ([{ exit: 'E' }, { room: '2.3' }, { exit: 'N' }, { room: '2.4' }, { use: [5, 3] }, { use: [11, 2] }, { exit: 'S' }, { room: '2.3' }, { exit: 'W' }, { room: '2.1' }] as Step[])
    : []),
  { exit: 'W' },
  { room: '2.2' },
  { use: [4, 5] },
  { exit: 'N' },
  { room: '2.5' },
  { to: [3, 11] },
  { exit: 'E' },
  { room: '2.6' },
  { use: [5, 3] },
  { use: [10, 3] },
  { exit: 'N' },
  { room: '3.1' },
  { use: [2, 2] },
];

/** 3.1 -> the crossroads (P1) -> armory -> lift down to 4.1 */
const SECTION_3 = (first: 'left' | 'right'): Step[] => [
  { exit: 'N' },
  { room: '3.3' },
  { to: [7, 7] },
  ...(first === 'right' ? ([{ exit: 'E' }, { room: '3.4' }, { use: [3, 3] }, { exit: 'W' }, { room: '3.3' }] as Step[]) : []),
  { exit: 'W' },
  { room: '3.2' },
  { to: [3, 3] },
  { use: [10, 5] },
  { exit: 'E' },
  { room: '3.3' },
  { exit: 'N' },
  { room: '3.5' },
  { use: [7, 1] },
  { room: '4.1' },
  { wait: 20 },
];

// ---- sections 4-7 -----------------------------------------------------------------------------

/** Boss 1: stand next to a panel, hack it while its back is turned; cross its lines only then. */
function bossDirector(b: Bot) {
  const all: [number, number, number, number, number][] = [[1, 1, 1, 2, 0], [14, 1, 14, 2, 1], [4, 13, 4, 12, 2]];
  const [cx, cy] = b.cell;
  const panels = all.sort((p, q) => Math.abs(p[2] - cx) + Math.abs(p[3] - cy) - (Math.abs(q[2] - cx) + Math.abs(q[3] - cy)));
  panels.forEach(([tx, ty, sx, sy, bit]) => {
    for (let tries = 0; tries < 12 && (b.actorWord(0, 22) & (1 << bit)) === 0 && !b.flag('LABCARD'); tries++) {
      b.goTo(sx, sy);
      if (!b.wait(() => b.actorWord(0, 18) === 1 && b.actorWord(0, 14) < 60, 1000)) continue;
      b.poke(tx, ty);
      b.settle();
    }
  });
  if (!b.flag('LABCARD')) throw new Error('bot: the Security Director is still standing');
}

/** Boss 2, decided frame by frame: EMP the unit whenever it comes within reach; while it is stunned, hack
 * the next panel; otherwise keep walking towards that panel. */
function bossUnit(b: Bot) {
  const panels: [number, number, number, number][] = [[2, 2, 2, 3], [13, 2, 13, 3], [2, 10, 2, 9], [13, 10, 13, 9]];
  const order = [2, 0, 1, 3];
  const near = () => Math.abs(b.actorWord(0, 2) - b.ram('px')) <= EMP_R - 8 && Math.abs(b.actorWord(0, 4) - b.ram('py')) <= EMP_R - 8;
  for (let guard = 0; guard < 6000 && !b.flag('BOSS2'); guard++) {
    b.settle();
    const next = order.find((k) => (b.actorWord(0, 22) & (1 << k)) === 0)!;
    const [tx, ty, sx, sy] = panels[next]!;
    const stunned = b.actorWord(0, 16) > 0;
    if (!stunned && near()) {
      if (b.ram('charges') === 0) throw new Error('bot: no EMP charge left for the measuring unit');
      b.frame(BUTTONS_B);
      b.frame(0);
    } else if (b.stepTo(sx, sy, !stunned)) {
      if (stunned) b.poke(tx, ty);
      else b.frame(0);
    }
  }
  if (!b.flag('BOSS2')) throw new Error('bot: the measuring unit is still active');
}
const BUTTONS_B = 32;

/**
 * 4.1 without the EMP: cross each drone's row right behind it. A drone moves 1 px/frame between x = 8 and 112
 * and sees 5 cells ahead. Heading east at x, it next sees column 7 after (112 - x) + (112 - 96) = 128 - x frames;
 * crossing a row from the waiting spot takes < 32 frames, so the window is x in [80, 96] heading east. Heading
 * west there is never a window (the wall is too close to column 7). Wait between the rows at (7,5).
 */
function sneak41(b: Bot) {
  const behind = (i: number) => {
    const x = b.actorWord(i, 2);
    return b.actorWord(i, 6) === 1 && x >= 80 && x <= 96;
  };
  const dash = (x: number, y: number) => b.goTo(x, y, false);
  b.goTo(7, 9);
  if (!b.wait(() => behind(1), 1200)) throw new Error('bot: no window at the row-7 drone');
  dash(7, 5);
  if (!b.wait(() => behind(0), 1200)) throw new Error('bot: no window at the row-3 drone');
  dash(7, 1);
}

/** 4.1 (arrived by lift) -> the labs -> the Security Director -> freight lift down */
const SECTION_4 = (o: { emp: boolean; mira: 'A' | 'B'; brief?: boolean }): Step[] => [
  { room: '4.1' },
  ...(o.emp
    ? ([{ to: [7, 10] }, { when: machineNear, note: 'a drone within EMP reach' }, { press: 'B' }, { use: [14, 11] }] as Step[])
    : ([{ run: sneak41, note: 'past the drones without the EMP' }] as Step[])),
  { exit: 'N' },
  { room: '4.2' },
  { use: [3, 3] },
  { exit: 'E' },
  { room: '4.4' },
  { use: [6, 2] },
  { answer: o.mira },
  ...(o.mira === 'A'
    ? ([{ exit: 'E' }, { room: '4.5' }] as Step[])
    : ([{ exit: 'S' }, { room: '4.3' }, ...(o.brief ? [{ use: [4, 11] }] : []), { exit: 'E' }, { room: '4.6' }, { exit: 'N' }, { room: '4.5' }] as Step[])),
  { run: bossDirector, note: 'boss 1' },
  { exit: 'S' },
  { room: '4.6' },
  { use: [7, 12] },
  { room: '5.1' },
];

/** underground: archive, Test 17, the cooling room (P5), silence, the prototype at the blast door */
const SECTION_5 = (o: { incident?: boolean }): Step[] => [
  { exit: 'W' },
  { room: '5.2' },
  { use: [8, 7] },
  { exit: 'W' },
  { room: '5.3' },
  { use: [7, 3] },
  { exit: 'S' },
  { room: '5.4' },
  { to: [9, 4] },
  ...(o.incident ? ([{ when: (b: Bot) => b.actorWord(0, 6) === 2, note: 'guard turned' }, { use: [4, 11] }] as Step[]) : []),
  { exit: 'E' },
  { room: '5.5' },
  { use: [7, 6] },
  { exit: 'E' },
  { room: '5.6' },
  { to: [5, 7] },
  { when: machineNear, note: 'prototype in reach' },
  { press: 'B' },
  { to: [12, 7] },
  { use: [13, 7] },
  { room: '6.1' },
];

/** servers: P6, the agent, Director Hale, the last charging station, the core airlock */
const SECTION_6 = (o: { read: boolean; model?: boolean; printout?: boolean }): Step[] => [
  { to: [12, 4] },
  ...(o.read ? ([{ use: [11, 7] }] as Step[]) : []),
  { exit: 'W' },
  { room: '6.2' },
  { to: [14, 8] },
  { when: machineNear, note: 'agent in reach' },
  { press: 'B' },
  { exit: 'N' },
  { room: '6.3' },
  ...(o.model ? ([{ use: [10, 5] }] as Step[]) : []),
  { exit: 'E' },
  { room: '6.4' },
  { use: [7, 3] },
  ...(o.printout ? ([{ use: [3, 5] }] as Step[]) : []),
  { exit: 'E' },
  { room: '6.5' },
  { use: [14, 4] },
  { use: [13, 7] },
  { room: '7.1' },
];

/** the core: the measuring unit, the fork (P7) and, going right, the truth and the last choice (P8) */
const SECTION_7 = (o: { fork: 'W' | 'E'; final?: 'forecast' | 'other' | 'cable' }): Step[] => [
  { run: bossUnit, note: 'boss 2' },
  { exit: 'N' },
  { room: '7.2' },
  ...(o.fork === 'W'
    ? ([{ exitEnd: 'W' }] as Step[])
    : ([
        { exit: 'E' },
        { room: '7.3' },
        { use: [7, 4] },
        { exit: 'N' },
        { room: '7.4' },
        ...(o.final === 'cable'
          ? [{ use: [1, 1] }]
          : [{ use: [7, 6] }, { menu: (b: Bot) => (o.final === 'forecast' ? b.ram('final_guess') : (b.ram('final_guess') + 1) % 3) }]),
      ] as Step[])),
  { untilMode: 'M_ENDING' },
  { wait: 30 },
];

/** from the title screen to the corridor (1.4), with the badge */
const TO_CORRIDOR: Step[] = [
  { wait: 10 },
  { press: 'A' },
  { use: [14, 13] },
  { room: '1.1' },
  { exit: 'E' },
  { room: '1.2' },
  { use: [4, 3] },
  { exit: 'E' },
  { room: '1.3' },
  { exit: 'E' },
  { room: '1.4' },
];

export const ROUTES: Record<string, { seed: number; route: Step[]; note: string }> = {
  // M13: title -> apartment -> gate -> lobby -> checkpoint (locked east door) -> back for the badge ->
  // checkpoint -> corridor -> open office -> and back to the corridor.
  'm13-walk': {
    seed: 1,
    note: 'rooms, doorways, a lift, a locked door without and with its flag',
    route: [
      { wait: 10 },
      { press: 'A' },
      { room: '0.1' },
      { use: [14, 13] },
      { room: '1.1' },
      { exit: 'E' },
      { room: '1.2' },
      { exit: 'E' },
      { room: '1.3' },
      { to: [14, 7] },
      { press: 'E', frames: 30 },
      { room: '1.3' },
      { exit: 'W' },
      { room: '1.2' },
      { use: [4, 3] },
      { exit: 'E' },
      { room: '1.3' },
      { exit: 'E' },
      { room: '1.4' },
      { exit: 'N' },
      { room: '2.1' },
      { to: [5, 12] },
      { exit: 'S' },
      { room: '1.4' },
      { wait: 30 },
    ],
  },

  // M14: walk into a guard's line of sight in 1.3, get caught, restart at the entrance, then sneak through.
  'm14-caught': {
    seed: 2,
    note: 'detection restarts the room',
    route: [
      { wait: 10 },
      { press: 'A' },
      { use: [14, 13] },
      { exit: 'E' },
      { room: '1.2' },
      { use: [4, 3] },
      { exit: 'E' },
      { room: '1.3' },
      { allowCaught: true },
      { when: (b) => b.ram('grace_t') === 0, note: 'the entry grace period is over' },
      { when: (b) => b.actors()[0]!.dir === 2, note: 'guard 0 facing south' },
      { to: [3, 7], unsafe: true },
      { allowCaught: false },
      { room: '1.3' },
      { exit: 'E' },
      { room: '1.4' },
      { wait: 20 },
    ],
  },

  // M16: sections 0-3, obeying Mira at P1 (left), reading Dr. Reyes' notes; ends on the lift down.
  'm16-left': {
    seed: 4,
    note: 'P1 hit, D1-D4 + D6, L1-L3, access codes 2 and 3',
    route: [...SECTIONS_0_2(true), ...SECTION_3('left')],
  },
  // M16: right first at P1 (alarm centre, D5), then back to the armory.
  'm16-right': {
    seed: 5,
    note: 'P1 miss, D5',
    route: [...SECTIONS_0_2(false), ...SECTION_3('right')],
  },

  // M17 R1: obedient all the way: follows Mira, EMP in 4.1, trusts Mira at P3, reads the message, takes LEFT.
  'm17-obedient': {
    seed: 6,
    note: 'ending E1, accuracy 97.4 %',
    route: [...SECTIONS_0_2(true), ...SECTION_3('left'), ...SECTION_4({ emp: true, mira: 'A' }), ...SECTION_5({}), ...SECTION_6({ read: true }), ...SECTION_7({ fork: 'W' })],
  },
  // M17 R2: refuses Mira (P3, prototype hall), right at P1, reads every optional log, takes RIGHT, pulls the cable.
  'm17-cable': {
    seed: 7,
    note: 'ending E4, PREDICTION ERROR',
    route: [
      ...SECTIONS_0_2(false),
      ...SECTION_3('right'),
      ...SECTION_4({ emp: false, mira: 'B', brief: true }),
      ...SECTION_5({ incident: true }),
      ...SECTION_6({ read: false, model: true, printout: true }),
      ...SECTION_7({ fork: 'E', final: 'cable' }),
    ],
  },
  // M17 R3/R4: right at the fork, then the menu: what ORACLE forecast (E2) or something else (E3).
  'm17-forecast': {
    seed: 8,
    note: 'ending E2, PREDICTION CONFIRMED',
    route: [...SECTIONS_0_2(true), ...SECTION_3('left'), ...SECTION_4({ emp: true, mira: 'A' }), ...SECTION_5({}), ...SECTION_6({ read: true }), ...SECTION_7({ fork: 'E', final: 'forecast' })],
  },
  'm17-other': {
    seed: 9,
    note: 'ending E3, RECALIBRATING',
    route: [...SECTIONS_0_2(true), ...SECTION_3('left'), ...SECTION_4({ emp: true, mira: 'A' }), ...SECTION_5({}), ...SECTION_6({ read: true }), ...SECTION_7({ fork: 'E', final: 'other' })],
  },

  // M14: to the labs — copier, janitor's closet (spare charge), vent, the director's safe, the camera index,
  // the EMP and the shutter, the lift; EMP two drones in 4.1, recharge, on to 4.2.
  'm14-labs': {
    seed: 3,
    note: 'EMP, charges, recharge; zones 1-4',
    route: [
      ...TO_CORRIDOR,
      { exit: 'N' },
      { room: '2.1' },
      { exit: 'W' },
      { room: '2.2' },
      { use: [4, 5] },
      { exit: 'N' },
      { room: '2.5' },
      { to: [3, 11] },
      { exit: 'E' },
      { room: '2.6' },
      { use: [5, 3] },
      { use: [10, 3] },
      { exit: 'N' },
      { room: '3.1' },
      { use: [2, 2] },
      { exit: 'N' },
      { room: '3.3' },
      { exit: 'W' },
      { room: '3.2' },
      { to: [3, 3] },
      { use: [10, 5] },
      { exit: 'E' },
      { room: '3.3' },
      { exit: 'N' },
      { room: '3.5' },
      { use: [7, 1] },
      { room: '4.1' },
      { to: [7, 10] },
      { when: machineNear, note: 'a drone within EMP reach' },
      { press: 'B' },
      { to: [7, 5] },
      { when: machineNear, note: 'the second drone within reach' },
      { press: 'B' },
      { use: [14, 11] },
      { exit: 'N' },
      { room: '4.2' },
      { wait: 20 },
    ],
  },
};
