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
  | { to: [number, number]; unsafe?: boolean }
  | { exit: Side }
  | { use: [number, number] }
  | { room: string }
  | { until: string; frames?: number }
  | { when: (bot: Bot) => boolean; max?: number; note?: string }
  | { allowCaught: boolean };

const DIR_BTN: Record<Side, number> = { N: BUTTONS.UP, S: BUTTONS.DOWN, E: BUTTONS.RIGHT, W: BUTTONS.LEFT };
const DELTA: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

export async function loadGame(seed = 1) {
  const dir = new URL('..', import.meta.url).pathname;
  const { bytes, asm } = await buildCartridge(readFileSync(`${dir}/blackbox.asm`, 'utf8'), { file: 'blackbox.asm', resolveInclude: includeFrom(dir) });
  const vm = VM.fromCartridge(await parseCartridge(bytes), { seed });
  return { vm, sym: asm.symbols, bytes };
}

/** Actor sight as the engine defines it (actors.asm): type -> range in cells (0 = does not watch). */
const SIGHT: Record<number, number> = { 1: 7, 2: 5, 3: 9, 10: 8 };
const ACT_SIZE = 24;

export interface ActorView {
  type: number;
  x: number;
  y: number;
  dir: number;
  stun: number;
  state: number;
}

export class Bot {
  readonly inputs: number[] = [];
  private readonly roomIds: string[];
  /** When false (default), a detection aborts recording: routes must sneak unless they say otherwise. */
  allowCaught = false;

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

  actors(): ActorView[] {
    const base = this.sym.get('actors')!;
    const n = this.ram('n_actors');
    return Array.from({ length: n }, (_, i) => {
      const a = base + i * ACT_SIZE;
      const w = (o: number) => (this.vm.read16(a + o) << 16) >> 16;
      return { type: w(0), x: w(2), y: w(4), dir: w(6), stun: w(16), state: w(18) };
    });
  }
  opaque(x: number, y: number) {
    return (this.vm.read8(this.sym.get('tile_attr')! + this.tile(x, y)) & 2) !== 0;
  }
  /**
   * Cells watched now by any guard, drone, heavy guard or camera — plus, for a watcher about to turn (a turner
   * near the end of its period, a patrol near its end point), the cells it will watch after turning.
   */
  danger(): Set<string> {
    const out = new Set<string>();
    const base = this.sym.get('actors')!;
    const ray = (cx: number, cy: number, dir: number, range: number) => {
      const [ddx, ddy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir]!;
      let x = cx;
      let y = cy;
      for (let k = 0; k < range + 1; k++) {
        x += ddx!;
        y += ddy!;
        if (x < 0 || y < 0 || x > 15 || y > 14 || this.opaque(x, y)) break;
        out.add(`${x},${y}`);
      }
    };
    this.actors().forEach((a, i) => {
      if (a.stun > 0 || a.type === 0) return;
      const cx = (a.x + 4) >> 3;
      const cy = (a.y + 4) >> 3;
      if ([1, 2, 3, 4, 5, 6].includes(a.type)) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.add(`${cx + dx},${cy + dy}`);
      const range = SIGHT[a.type];
      if (!range) return;
      ray(cx, cy, a.dir, range);
      const w = (o: number) => (this.vm.read16(base + i * ACT_SIZE + o) << 16) >> 16;
      const mode = w(8);
      if (a.type !== 10 && mode === 2) {
        // turner: about to switch between its initial direction and P1
        if (w(12) * 15 - w(14) < 45) ray(cx, cy, a.dir === w(20) ? w(10) : w(20), range);
      } else if (a.type !== 10 && (mode === 0 || mode === 1)) {
        const pos = mode === 0 ? a.x : a.y;
        if (Math.abs(pos - w(10) * 8) < 20 || Math.abs(pos - w(12) * 8) < 20) ray(cx, cy, (a.dir + 2) & 3, range);
      } else if (mode === 3) ray(cx, cy, (a.dir + 1) & 3, range);
    });
    return out;
  }

  frame(buttons: number) {
    if (this.inputs.length >= this.maxFrames) throw new Error('bot: frame limit reached');
    const before = this.ram('det_count');
    this.inputs.push(buttons);
    this.vm.step(buttons);
    if (this.vm.fault) throw new Error(`VM fault: ${this.vm.fault}`);
    if (!this.allowCaught && this.ram('det_count') !== before) throw new Error(`bot: detected in ${this.room} at frame ${this.inputs.length}`);
    // after a detection, wait out the restart
    while (this.ram('caught_t') > 0) {
      this.inputs.push(0);
      this.vm.step(0);
    }
  }

  /** BFS over passable, unwatched cells of the current room from the player's cell to any goal cell. */
  path(goal: (x: number, y: number) => boolean, safe = true): [number, number][] | null {
    const [sx, sy] = this.cell;
    const danger = safe ? this.danger() : new Set<string>();
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
        if (danger.has(`${nx},${ny}`)) continue;
        prev.set(`${nx},${ny}`, `${x},${y}`);
        queue.push([nx, ny]);
      }
    }
    return null;
  }

  /** A path that ignores danger (to know the geometry), or an error if the room makes it impossible. */
  route(goal: (x: number, y: number) => boolean): [number, number][] {
    const p = this.path(goal, false);
    if (!p) throw new Error(`bot: no path in room ${this.room} from ${this.cell}`);
    return p;
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

  goTo(tx: number, ty: number, safe = true) {
    const start = this.room;
    const det = this.ram('det_count');
    for (let guard = 0; guard < 4000; guard++) {
      if (this.ram('det_count') !== det) return; // caught (allowed): the room has restarted
      if (this.room !== start) throw new Error(`bot: left ${start} while walking to ${tx},${ty}`);
      if (this.ram('px') === tx * 8 && this.ram('py') === ty * 8) return;
      const p = this.path((x, y) => x === tx && y === ty, safe);
      if (!p) {
        this.frame(0); // everything is watched: wait for the guards to turn
        continue;
      }
      const next = p.length > 1 ? p[1]! : p[0]!;
      this.stepTowards(next[0], next[1]);
    }
    throw new Error(`bot: could not reach ${tx},${ty} in ${this.room}`);
  }

  exit(side: Side) {
    const from = this.room;
    const door = this.route((x, y) => (side === 'N' ? y === 0 : side === 'S' ? y === 14 : side === 'E' ? x === 15 : x === 0));
    const [dx, dy] = door[door.length - 1]!;
    this.goTo(dx, dy);
    for (let i = 0; i < 200 && this.room === from; i++) this.frame(DIR_BTN[side]);
    if (this.room === from) throw new Error(`bot: could not leave ${from} through ${side}`);
  }

  use(tx: number, ty: number) {
    const p = this.route((x, y) => Math.abs(x - tx) + Math.abs(y - ty) === 1);
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
      else if ('to' in s) this.goTo(s.to[0], s.to[1], !s.unsafe);
      else if ('exit' in s) this.exit(s.exit);
      else if ('use' in s) this.use(...s.use);
      else if ('room' in s) {
        if (this.room !== s.room) throw new Error(`bot: expected room ${s.room}, in ${this.room} (frame ${this.inputs.length})`);
      } else if ('until' in s) {
        for (let i = 0; i < (s.frames ?? 600) && this.ram(s.until) === 0; i++) this.frame(0);
      } else if ('when' in s) {
        let i = 0;
        for (; i < (s.max ?? 3000) && !s.when(this); i++) this.frame(0);
        if (!s.when(this)) throw new Error(`bot: condition never met (${s.note ?? 'when'}) in ${this.room}`);
      } else if ('allowCaught' in s) this.allowCaught = s.allowCaught;
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
