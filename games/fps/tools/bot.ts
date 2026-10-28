// A bot that plays the FPS spike by reading its RAM and choosing buttons, for recording replays (routes.ts).
import type { VM } from '@qrc/vm';
import type { FpsBuild } from './game';

export const BTN = { LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, A: 16, B: 32 } as const;
const s16 = (v: number) => (v << 16) >> 16;

export class Bot {
  inputs: number[] = [];
  constructor(
    readonly vm: VM,
    readonly b: FpsBuild,
  ) {}

  r(name: string) {
    return s16(this.vm.read16(this.b.sym(name)));
  }
  get x() {
    return this.r('px') / 256;
  }
  get y() {
    return this.r('py') / 256;
  }
  get ang() {
    return this.r('ang');
  }

  step(btn = 0, n = 1) {
    for (let i = 0; i < n; i++) {
      this.vm.step(btn);
      this.inputs.push(btn);
      if (this.vm.fault) throw new Error(`fault: ${this.vm.fault}`);
    }
  }

  /** turn (by the shorter way) to the angle nearest `target` (0..1023) that turning can reach */
  turnTo(target: number, extra = 0) {
    for (let guard = 0; guard < 200; guard++) {
      const d = ((target - this.ang + 1536) % 1024) - 512;
      if (Math.abs(d) < 8) return;
      this.step((d > 0 ? BTN.RIGHT : BTN.LEFT) | extra);
    }
    throw new Error(`turnTo ${target}: stuck at ${this.ang}`);
  }

  /** face the point (x, y) in cells */
  face(x: number, y: number, extra = 0) {
    this.turnTo(Math.round(((Math.atan2(y - this.y, x - this.x) / (2 * Math.PI)) * 1024 + 1024) % 1024), extra);
  }

  /** walk to the point (x, y) in cells, turning towards it on the way */
  walkTo(x: number, y: number, near = 0.12) {
    for (let guard = 0; guard < 2000; guard++) {
      const dx = x - this.x;
      const dy = y - this.y;
      if (Math.hypot(dx, dy) < near) return;
      const want = ((Math.atan2(dy, dx) / (2 * Math.PI)) * 1024 + 1024) % 1024;
      const d = ((want - this.ang + 1536) % 1024) - 512;
      let btn = Math.abs(d) < 48 ? BTN.UP : 0;
      if (d >= 8) btn |= BTN.RIGHT;
      else if (d <= -8) btn |= BTN.LEFT;
      this.step(btn);
    }
    throw new Error(`walkTo ${x},${y}: stuck at ${this.x.toFixed(2)},${this.y.toFixed(2)}`);
  }

  /** press B (open the door ahead) and wait until the door cell is open enough to walk through */
  openDoor(cellX: number, cellY: number) {
    const dopen = this.b.sym('dopen') + cellY * 16 + cellX;
    if (this.vm.read8(dopen) >= 240) return;
    this.step(BTN.B);
    for (let guard = 0; guard < 120; guard++) {
      if (this.vm.read8(dopen) >= 240) return;
      this.step(0);
    }
    throw new Error(`door ${cellX},${cellY} did not open`);
  }

  /** hold A until the enemy is dead */
  fireUntilDead() {
    for (let guard = 0; guard < 600; guard++) {
      if (this.r('estate') === 2) return;
      this.step(BTN.A);
    }
    throw new Error('the enemy did not die');
  }

  replayFile(seed: number) {
    const rle: [number, number][] = [];
    for (const b of this.inputs) {
      const last = rle[rle.length - 1];
      if (last && last[1] === b) last[0]++;
      else rle.push([1, b]);
    }
    return { seed, frames: this.inputs.length, inputs: rle };
  }
}
