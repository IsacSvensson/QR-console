// A bot that records NADIR's replays. It plays the real cartridge frame by frame, reads the player from RAM and
// presses buttons to carry out a route (routes.ts says what to do, not which frames), so replays can be recorded
// again when the controls are tuned. Output: run-length replay files. It never double taps LEFT or RIGHT by
// accident (DESIGN §5): a new press of a direction within DTAP_FRAMES of the last one is held back.
import { BUTTONS, type VM } from '@qrc/vm';
import { k } from './design';

export const B = { L: BUTTONS.LEFT, R: BUTTONS.RIGHT, U: BUTTONS.UP, D: BUTTONS.DOWN, A: BUTTONS.A, B: BUTTONS.B } as const;
const ANG = 4096;

export class Bot {
  readonly inputs: number[] = [];
  /** frame of the last press of LEFT and RIGHT */
  private lastPress: Record<number, number> = { [BUTTONS.LEFT]: -100, [BUTTONS.RIGHT]: -100 };
  constructor(
    readonly vm: VM,
    readonly S: (name: string) => number,
    readonly maxFrames = 60 * 60 * 10,
  ) {}

  get x() {
    return this.vm.read16(this.S('cam_x')) / 256;
  }
  get y() {
    return this.vm.read16(this.S('cam_y')) / 256;
  }
  get a() {
    return this.vm.read16(this.S('cam_a'));
  }

  /** M29: before every step the bot fights an alerted enemy in sight (fight()); off for routes that must not */
  fightOn = true;
  /** M29: a route that may die (the death replay); otherwise a death throws */
  allowDeath = false;
  private fighting = false;
  step(buttons = 0, dash = false) {
    if (this.fightOn && !this.fighting && !dash) this.fight();
    this.raw(buttons, dash);
  }
  private raw(buttons: number, dash = false) {
    const prev = this.inputs[this.inputs.length - 1] ?? 0;
    const f = this.inputs.length;
    for (const d of [B.L, B.R]) {
      if (!(buttons & d) || prev & d) continue;
      if (!dash && f - this.lastPress[d]! <= k('DTAP_FRAMES') + 1) buttons &= ~d;
      else this.lastPress[d] = f;
    }
    this.vm.step(buttons);
    this.inputs.push(buttons);
    if (this.vm.fault) throw new Error(`VM fault at frame ${this.inputs.length}: ${this.vm.fault}`);
    if (this.inputs.length > this.maxFrames) throw new Error('route too long');
    if (!this.allowDeath && this.vm.read16(this.S('dead')) !== 0) throw new Error(`the bot died at frame ${this.inputs.length} at ${this.x.toFixed(2)}, ${this.y.toFixed(2)}`);
  }
  /** The nearest living enemy that is alerted (DESIGN §6.3 states 1-6), sees the player and is within 7 cells. */
  target(): { x: number; y: number; i: number } | null {
    let best: { x: number; y: number; i: number } | null = null;
    let bd = 7;
    for (let i = 0; i < k('MAX_ENEMIES'); i++) {
      const a = this.S('enemies') + this.eSize * i;
      if (i >= this.S('NUM_ENEMIES')) break;
      const st = this.vm.read8(a + 4);
      if (st < 1 || st > 6 || this.vm.read8(a + 12) === 0) continue;
      const x = this.vm.read16(a) / 256;
      const y = this.vm.read16(a + 2) / 256;
      const d = Math.hypot(x - this.x, y - this.y);
      if (d < bd) {
        bd = d;
        best = { x, y, i };
      }
    }
    return best;
  }
  private readonly eSize = 24;
  /** Turns to the target and holds A (the weapon fires whenever it is ready) until no enemy is a target. */
  fight() {
    this.fighting = true;
    try {
      for (let n = 0; n < 3000; n++) {
        const t = this.target();
        if (!t) return;
        const deg = (Math.atan2(t.y - this.y, t.x - this.x) * 180) / Math.PI;
        const d = this.diff(Math.round((deg * ANG) / 360) & (ANG - 1));
        let btn = 0;
        if (Math.abs(d) > 6) {
          const b = d < 0 ? B.L : B.R;
          const held = this.inputs[this.inputs.length - 1]! & b;
          const kk = held ? this.vm.read16(this.S('turn_k')) : 0;
          const next = Math.min(k('TURN_MAX'), k('TURN_MIN') + k('TURN_ACC') * kk);
          if (next <= Math.abs(d) + 6) btn |= b;
        }
        if (Math.abs(d) <= 20) btn |= B.A;
        this.raw(btn);
      }
      throw new Error(`fight: no end at ${this.x.toFixed(2)}, ${this.y.toFixed(2)}`);
    } finally {
      this.fighting = false;
    }
  }
  /** a word of RAM, signed */
  read(name: string) {
    return (this.vm.read16(this.S(name)) << 16) >> 16;
  }
  /** Steps without input until `cond` holds (at most `max` frames). */
  waitUntil(cond: () => boolean, max: number) {
    for (let i = 0; i < max; i++) {
      if (cond()) return;
      this.step(0);
    }
    throw new Error(`waitUntil: not after ${max} frames (at ${this.x.toFixed(2)}, ${this.y.toFixed(2)})`);
  }
  wait(n: number) {
    for (let i = 0; i < n; i++) this.step(0);
  }
  /** signed angle difference target - current, in units (-2048..2047) */
  private diff(target: number) {
    return ((((target - this.a) % ANG) + ANG + ANG / 2) % ANG) - ANG / 2;
  }
  /** Turns to `deg` (0 = east, 90 = south) by holding LEFT or RIGHT while the next frame's turn does not overshoot. */
  turnTo(deg: number, slow = false) {
    const target = Math.round((deg * ANG) / 360) & (ANG - 1);
    for (let n = 0; n < 4000; n++) {
      const d = this.diff(target);
      if (Math.abs(d) <= 8) {
        this.wait(1);
        return;
      }
      const btn = d < 0 ? B.L : B.R;
      const held = this.inputs[this.inputs.length - 1] === btn;
      const kk = held ? this.vm.read16(this.S('turn_k')) : 0;
      const next = Math.min(k('TURN_MAX'), k('TURN_MIN') + k('TURN_ACC') * kk);
      if (next > Math.abs(d) + 8 || (slow && held)) this.step(0);
      else this.step(btn);
    }
    throw new Error(`turnTo ${deg}: did not converge`);
  }
  /** Turns a full circle: `dir` 1 right, -1 left; `slow` holds 5 frames of every 12 (the turn never accelerates). */
  spin(dir: 1 | -1, slow = false) {
    const start = this.a;
    let turned = 0;
    let last = start;
    let i = 0;
    while (turned < ANG) {
      this.step(!slow || i++ % 12 < 5 ? (dir > 0 ? B.R : B.L) : 0);
      const d = (((this.a - last) * dir) % ANG + ANG) % ANG;
      turned += d;
      last = this.a;
    }
    this.wait(2);
  }
  /** Walks to (x, y) in cells: turns towards it, then walks forward, correcting the heading. */
  walkTo(x: number, y: number, within = 0.15) {
    for (let n = 0; n < 4000; n++) {
      const dx = x - this.x;
      const dy = y - this.y;
      if (Math.hypot(dx, dy) < within) return;
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const target = Math.round((deg * ANG) / 360) & (ANG - 1);
      const d = this.diff(target);
      if (Math.abs(d) > 120) this.turnTo(deg);
      else this.step(B.U | (d < -24 ? B.L : d > 24 ? B.R : 0));
    }
    throw new Error(`walkTo ${x},${y}: stuck at ${this.x.toFixed(2)},${this.y.toFixed(2)}`);
  }
  /** A side step (DESIGN §5): a double tap right (dir 1) or left (-1), then waits until it is over. */
  dash(dir: 1 | -1) {
    const b = dir > 0 ? B.R : B.L;
    this.wait(k('DTAP_FRAMES') + 2);
    this.step(b, true);
    this.step(0);
    this.step(b, true);
    this.wait(k('DASH_FRAMES') + 2);
  }
  /** Walks straight ahead (UP, or B with `withB`) for n frames, then stops. */
  forward(n: number, withB = false) {
    for (let i = 0; i < n; i++) this.step(withB ? B.B : B.U);
    this.wait(6);
  }
  /** Walks forward until blocked (no movement for a few frames): pushes against a wall. */
  pushWall(max = 200) {
    let still = 0;
    for (let i = 0; i < max && still < 4; i++) {
      const x = this.x;
      const y = this.y;
      this.step(B.U);
      still = x === this.x && y === this.y ? still + 1 : 0;
    }
    this.wait(6);
  }
  replayFile(seed: number) {
    const runs: [number, number][] = [];
    for (const b of this.inputs) {
      const last = runs[runs.length - 1];
      if (last && last[1] === b) last[0]++;
      else runs.push([1, b]);
    }
    return { seed, frames: this.inputs.length, inputs: runs };
  }
}
