import type { VM } from '@qrc/vm';

/** Per-game assertions, provided by games/<name>/checks.ts (game knowledge stays in the game's folder). */
export interface GameChecks {
  /** Called after every replay frame; returns values to record (usually read from RAM via symbols). */
  sample(ram: (symbol: string) => number, vm: VM, frame: number): Record<string, number>;
  /** Throws (via expect) if the recorded run does not demonstrate what the game must show. */
  verify(samples: Record<string, number>[]): void;
}
