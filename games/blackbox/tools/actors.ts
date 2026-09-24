// Behaviour parameters for every object drawn in LAYOUT.md (the grid gives type and position; the
// "objects:" prose gives behaviour — this table is that prose in machine form). Key: "room x,y".
// Directions: 0 N, 1 E, 2 S, 3 W. Periods are in frames.

export type ActorKind = 'guard' | 'drone' | 'heavy' | 'hunter' | 'proto' | 'agent' | 'npc' | 'boss' | 'pickup' | 'camera';

export interface ActorSpec {
  dir?: number;
  /** guard/heavy/drone: 'h' patrol along the row, 'v' along the column, 't' turn between dir and dir2, 'sq' square */
  mode?: 'h' | 'v' | 't' | 'sq';
  min?: number;
  max?: number;
  dir2?: number;
  period?: number;
  size?: number;
  /** hunter: wake distance in tiles; proto: 1 = guards the door (0 = decoration) */
  range?: number;
  active?: number;
  /** npc/boss/pickup id */
  id?: number;
}

export const ACTORS: Record<string, ActorSpec> = {
  '1.1 7,6': { mode: 'h', min: 2, max: 13, dir: 1 },
  '1.3 3,2': { mode: 't', dir: 2, dir2: 0, period: 180 },
  '1.3 12,2': { mode: 't', dir: 2, dir2: 0, period: 180 },
  '1.4 15,7': { dir: 3 },
  '2.1 7,5': { mode: 'v', min: 1, max: 13, dir: 0 }, // starts walking away from the entrance (S door)
  '2.4 5,3': { id: 0 },
  '2.5 3,11': { id: 1 },
  '2.6 2,6': { dir: 1 },
  '3.1 10,6': { mode: 't', dir: 2, dir2: 3, period: 240 },
  '3.2 3,3': { id: 0 },
  '3.4 7,1': { dir: 2 },
  '3.4 10,6': { mode: 'sq', size: 3, dir: 1 },
  '3.5 3,4': { mode: 'h', min: 1, max: 7, dir: 1 },
  '4.1 7,3': { mode: 'h', min: 1, max: 14, dir: 1 },
  '4.1 8,7': { mode: 'h', min: 1, max: 14, dir: 3 },
  '4.3 2,2': { active: 0 },
  '4.3 5,2': { active: 0 },
  '4.3 8,2': { active: 0 },
  '4.3 11,2': { active: 0 },
  '4.3 8,6': { mode: 'h', min: 1, max: 14, dir: 1 },
  '4.4 3,5': { mode: 't', dir: 0, dir2: 1, period: 180 },
  '4.5 7,5': { id: 0, dir: 2 },
  '5.1 6,6': { range: 4, dir: 2 },
  '5.2 7,13': { range: 4, dir: 0 },
  '5.4 7,6': { mode: 't', dir: 0, dir2: 1, period: 360 },
  '5.6 10,7': { active: 1, dir: 3 },
  '6.2 7,5': { dir: 2 },
  '6.4 7,3': { id: 1 },
  '7.1 7,6': { id: 1, dir: 2 },
};
