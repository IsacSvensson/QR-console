// Replay routes for BLACKBOX. `npx tsx games/blackbox/tools/record.ts` records them into ../replays/.
import type { Bot, Step } from './bot';

const EMP_R = 40;
/** true when some unstunned machine (drone, hunter, prototype, agent) is within EMP reach */
const machineNear = (b: Bot) =>
  b.actors().some((a) => [2, 4, 5, 6].includes(a.type) && a.stun === 0 && Math.abs(a.x - b.ram('px')) <= EMP_R && Math.abs(a.y - b.ram('py')) <= EMP_R);

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
      { when: (b) => b.actors()[0]!.dir === 2, note: 'guard 0 facing south' },
      { to: [3, 7], unsafe: true },
      { allowCaught: false },
      { room: '1.3' },
      { exit: 'E' },
      { room: '1.4' },
      { wait: 20 },
    ],
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
