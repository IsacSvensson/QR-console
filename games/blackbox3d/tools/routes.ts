// BLACKBOX 3D's recorded runs (M28): sections 0 and 1, in BLACKBOX's route language (games/blackbox/tools/bot.ts).
// record.ts plays each with the 3D bot (bot.ts) and writes ../replays/<name>.json.
import type { Step } from '../../blackbox/tools/bot';

/** turn round once on the spot (128 frames of 8 angle steps) */
const SPIN: Step = { press: 'E', frames: 128 };

/** title -> D1 -> the front door -> 1.1 -> the badge at reception -> 1.3 -> 1.4: BLACKBOX's TO_CORRIDOR */
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
  slice: {
    seed: 1,
    note: 'sections 0 and 1 played through, unseen, to the access code at the door of 2.1',
    route: [...TO_CORRIDOR, { exit: 'N' }, { room: '2.1' }, { wait: 60 }],
  },
  tour: {
    seed: 2,
    note: 'a full turn on the spot in every room of the slice (all walls, desks, terminals, portals and guards)',
    route: [
      { wait: 10 },
      { press: 'A' },
      { run: (b) => b.settle() },
      SPIN,
      { use: [14, 13] },
      { room: '1.1' },
      SPIN,
      { to: [8, 11] },
      SPIN,
      { exit: 'E' },
      { room: '1.2' },
      SPIN,
      { use: [4, 3] },
      { to: [7, 5] },
      SPIN,
      { exit: 'E' },
      { room: '1.3' },
      SPIN,
      { exit: 'E' },
      { room: '1.4' },
      SPIN,
      { to: [7, 3] },
      SPIN,
    ],
  },
  caught: {
    seed: 3,
    note: "walks into the 1.1 guard's line of sight on purpose: the meter fills, the room restarts at its entrance",
    route: [
      { wait: 10 },
      { press: 'A' },
      { use: [14, 13] },
      { room: '1.1' },
      { allowCaught: true },
      { to: [1, 6], unsafe: true },
      { when: (b) => b.ram('det_count') > 0, max: 600, note: 'detected' },
      { wait: 60 },
      { allowCaught: false },
      { exit: 'E' },
      { room: '1.2' },
      { wait: 30 },
    ],
  },
};

