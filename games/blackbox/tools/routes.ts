// Replay routes for BLACKBOX. `npx tsx games/blackbox/tools/record.ts` records them into ../replays/.
import type { Step } from './bot';

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
      { to: [7, 9] },
      { exit: 'S' },
      { room: '1.4' },
      { wait: 30 },
    ],
  },
};
