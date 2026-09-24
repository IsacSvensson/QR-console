// A route-following bot that records BLACKBOX replays. It plays the real cartridge frame by frame, reads the
// player position and the room buffer from RAM (via the .sym file), and presses buttons to follow a route.
// Output: replay files (run-length button masks) that tests replay against committed per-frame hashes.
import { readFileSync } from 'node:fs';
import { buildCartridge } from '@qrc/asm';
import { parseCartridge } from '@qrc/cartridge';
import { includeFrom } from '@qrc/tools';
import { BUTTONS, VM } from '@qrc/vm';

export type Side = 'N' | 'S' | 'E' | 'W';
export type Step =
  | { press: 'A' | 'B' | Side; frames?: number }
  | { wait: number }
  | { to: [number, number] }
  | { exit: Side }
  | { use: [number, number] }
  | { room: string }
  | { until: string; frames?: number };

const DIR_BTN: Record<Side, number> = { N: BUTTONS.UP, S: BUTTONS.DOWN, E: BUTTONS.RIGHT, W: BUTTONS.LEFT };
const DELTA: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

export async function loadGame(seed = 1) {
  const dir = new URL('..', import.meta.url).pathname;
  const { bytes, asm } = await buildCartridge(readFileSync(`${dir}/blackbox.asm`, 'utf8'), { file: 'blackbox.asm', resolveInclude: includeFrom(dir) });
  const vm = VM.fromCartridge(await parseCartridge(bytes), { seed });
  return { vm, sym: asm.symbols, bytes };
}

export class Bot {
  readonly inputs: number[] = [];
  private readonly roomIds: string[];

  constructor(
    readonly vm: VM,
    readonly sym: Map<string, number>,
    readonly maxFrames = 60 * 60 * 30,
  ) {
    this.roomIds = [...sym.entries()].filter(([k]) => /^R_\d+_\d+$/.test(k)).sort((a, b) => a[1] - b[1]).map(([k]) => k.slice(2).replace('_', '.'));
  }

  ram(name: string) {
    const a = this.sym.get(name);
    if (a === undefined) throw new Error(`no symbol ${name}`);
    return (this.vm.read16(a) << 16) >> 16;
  }
  get room() {
    return this.roomIds[this.ram('room')]!;
  }
  get cell(): [number, number] {
    return [(this.ram('px') + 4) >> 3, (this.ram('py') + 4) >> 3];
  }
  tile(x: number, y: number) {
    if (x < 0 || y < 0 || x > 15 || y > 14) return 0;
    return this.vm.read8(this.sym.get('room_buf')! + y * 16 + x);
  }
  solid(x: number, y: number) {
    return (this.vm.read8(this.sym.get('tile_attr')! + this.tile(x, y)) & 1) !== 0;
  }

  frame(buttons: number) {
    if (this.inputs.length >= this.maxFrames) throw new Error('bot: frame limit reached');
    this.inputs.push(buttons);
    this.vm.step(buttons);
    if (this.vm.fault) throw new Error(`VM fault: ${this.vm.fault}`);
  }

  /** BFS over passable cells of the current room from the player's cell to any goal cell. */
  path(goal: (x: number, y: number) => boolean): [number, number][] {
    const [sx, sy] = this.cell;
    const prev = new Map<string, string | null>([[`${sx},${sy}`, null]]);
    const queue: [number, number][] = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      if (goal(x, y)) {
        const out: [number, number][] = [];
        let k: string | null = `${x},${y}`;
        while (k) {
          const [a, b] = k.split(',').map(Number) as [number, number];
          out.unshift([a, b]);
          k = prev.get(k)!;
        }
        return out;
      }
      for (const [dx, dy] of Object.values(DELTA)) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 15 || ny > 14 || this.solid(nx, ny) || prev.has(`${nx},${ny}`)) continue;
        prev.set(`${nx},${ny}`, `${x},${y}`);
        queue.push([nx, ny]);
      }
    }
    throw new Error(`bot: no path in room ${this.room} from ${sx},${sy}`);
  }

  /** One frame of movement towards cell (tx, ty): align the perpendicular axis first, then step. */
  private stepTowards(tx: number, ty: number) {
    const px = this.ram('px');
    const py = this.ram('py');
    const [cx, cy] = this.cell;
    const horizontal = tx !== cx;
    let b = 0;
    if (horizontal) {
      if (py !== ty * 8) b = py < ty * 8 ? BUTTONS.DOWN : BUTTONS.UP;
      else b = tx > cx ? BUTTONS.RIGHT : BUTTONS.LEFT;
    } else if (ty !== cy) {
      if (px !== tx * 8) b = px < tx * 8 ? BUTTONS.RIGHT : BUTTONS.LEFT;
      else b = ty > cy ? BUTTONS.DOWN : BUTTONS.UP;
    } else {
      if (px !== tx * 8) b = px < tx * 8 ? BUTTONS.RIGHT : BUTTONS.LEFT;
      else if (py !== ty * 8) b = py < ty * 8 ? BUTTONS.DOWN : BUTTONS.UP;
    }
    this.frame(b);
  }

  goTo(tx: number, ty: number) {
    for (let guard = 0; guard < 2000; guard++) {
      if (this.ram('px') === tx * 8 && this.ram('py') === ty * 8) return;
      const p = this.path((x, y) => x === tx && y === ty);
      const next = p.length > 1 ? p[1]! : p[0]!;
      this.stepTowards(next[0], next[1]);
    }
    throw new Error(`bot: could not reach ${tx},${ty} in ${this.room}`);
  }

  exit(side: Side) {
    const from = this.room;
    const door = this.path((x, y) => (side === 'N' ? y === 0 : side === 'S' ? y === 14 : side === 'E' ? x === 15 : x === 0));
    const [dx, dy] = door[door.length - 1]!;
    this.goTo(dx, dy);
    for (let i = 0; i < 200 && this.room === from; i++) this.frame(DIR_BTN[side]);
    if (this.room === from) throw new Error(`bot: could not leave ${from} through ${side}`);
  }

  use(tx: number, ty: number) {
    const p = this.path((x, y) => Math.abs(x - tx) + Math.abs(y - ty) === 1);
    const [ax, ay] = p[p.length - 1]!;
    this.goTo(ax, ay);
    const side = (Object.entries(DELTA) as [Side, [number, number]][]).find(([, [dx, dy]]) => ax + dx === tx && ay + dy === ty)![0];
    this.frame(DIR_BTN[side]); // turn to face it (blocked, so it only turns)
    this.frame(0);
    this.frame(BUTTONS.A);
    this.frame(0);
  }

  run(route: Step[]) {
    for (const s of route) {
      if ('press' in s) {
        const b = s.press === 'A' ? BUTTONS.A : s.press === 'B' ? BUTTONS.B : DIR_BTN[s.press];
        for (let i = 0; i < (s.frames ?? 1); i++) this.frame(b);
        this.frame(0);
      } else if ('wait' in s) for (let i = 0; i < s.wait; i++) this.frame(0);
      else if ('to' in s) this.goTo(...s.to);
      else if ('exit' in s) this.exit(s.exit);
      else if ('use' in s) this.use(...s.use);
      else if ('room' in s) {
        if (this.room !== s.room) throw new Error(`bot: expected room ${s.room}, in ${this.room} (frame ${this.inputs.length})`);
      } else if ('until' in s) {
        for (let i = 0; i < (s.frames ?? 600) && this.ram(s.until) === 0; i++) this.frame(0);
      }
    }
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
