// A bot that records NADIR's replays. It plays the real cartridge frame by frame, reads the camera from RAM and
// presses buttons to carry out a route (routes.ts says what to do, not which frames), so replays can be recorded
// again when the controls are tuned. Output: run-length replay files.
import { BUTTONS, type VM } from '@qrc/vm';

export const B = { L: BUTTONS.LEFT, R: BUTTONS.RIGHT, U: BUTTONS.UP, D: BUTTONS.DOWN, A: BUTTONS.A, B: BUTTONS.B } as const;
const ANG = 4096;

export class Bot {
  readonly inputs: number[] = [];
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

  step(buttons = 0) {
    this.vm.step(buttons);
    this.inputs.push(buttons);
    if (this.vm.fault) throw new Error(`VM fault at frame ${this.inputs.length}: ${this.vm.fault}`);
    if (this.inputs.length > this.maxFrames) throw new Error('route too long');
  }
  wait(n: number) {
    for (let i = 0; i < n; i++) this.step(0);
  }
  /** signed angle difference target - current, in units (-2048..2047) */
  private diff(target: number) {
    return ((((target - this.a) % ANG) + ANG + ANG / 2) % ANG) - ANG / 2;
  }
  /** Turns to `deg` (0 = east, 90 = south). `slow` taps the button so every press is the slowest turn step. */
  turnTo(deg: number, slow = false) {
    const target = Math.round((deg * ANG) / 360) & (ANG - 1);
    for (let n = 0; n < 2000; n++) {
      const d = this.diff(target);
      if (Math.abs(d) <= 8) return;
      const btn = d < 0 ? B.L : B.R;
      // close to the target: single taps (the first frame of a turn is the smallest step)
      if (slow || Math.abs(d) < 60) {
        this.step(btn);
        this.step(0);
      } else this.step(btn);
    }
    throw new Error(`turnTo ${deg}: did not converge`);
  }
  /** Turns a full circle: `dir` 1 right, -1 left. */
  spin(dir: 1 | -1, slow = false) {
    const start = this.a;
    let turned = 0;
    let last = start;
    while (turned < ANG) {
      if (slow) {
        this.step(dir > 0 ? B.R : B.L);
        this.step(0);
      } else this.step(dir > 0 ? B.R : B.L);
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
  /** Strafes right (dir 1) or left (-1) for n frames. */
  strafe(dir: 1 | -1, n: number) {
    for (let i = 0; i < n; i++) this.step(B.B | (dir > 0 ? B.R : B.L));
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
