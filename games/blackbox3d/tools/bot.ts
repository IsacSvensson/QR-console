// The BLACKBOX 3D bot: BLACKBOX's own bot (games/blackbox/tools/bot.ts: danger from the lines of sight, paths,
// dialogues, the route language) with the movement of the 3D game. Facing a direction is a turn (LEFT/RIGHT, 8
// angle steps per frame) and walking is UP; when the player faces exactly east, south, west or north a step moves
// one pixel along that axis, as in BLACKBOX, so the 2D bot's cell-by-cell plans work unchanged.
import { BUTTONS, type VM } from '@qrc/vm';
import { Bot, type Side } from '../../blackbox/tools/bot';

const ANGLE: Record<Side, number> = { E: 0, S: 256, W: 512, N: 768 };
const DELTA: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

// @ts-expect-error stepTowards is private in BLACKBOX's bot; this class replaces it with the 3D movement
export class Bot3D extends Bot {
  constructor(vm: VM, sym: Map<string, number>, maxFrames?: number) {
    super(vm, sym, maxFrames);
  }

  get ang() {
    return this.ram('ang') & 1023;
  }

  /** one frame: turn towards `side` if not facing it exactly, else walk forward */
  private towards(side: Side) {
    const d = ((ANGLE[side] - this.ang + 1536) % 1024) - 512;
    if (d === 0) this.frame(BUTTONS.UP);
    else this.frame(d > 0 ? BUTTONS.RIGHT : BUTTONS.LEFT);
  }

  /** turn (frame by frame) until facing `side` exactly */
  face(side: Side) {
    for (let i = 0; i < 200 && this.ang !== ANGLE[side]; i++) {
      const d = ((ANGLE[side] - this.ang + 1536) % 1024) - 512;
      this.frame(d > 0 ? BUTTONS.RIGHT : BUTTONS.LEFT);
    }
    if (this.ang !== ANGLE[side]) throw new Error(`bot: cannot face ${side} (angle ${this.ang})`);
  }

  /** BLACKBOX's plan, one frame: align the perpendicular axis first, then step (as stepTowards in 2D) */
  stepTowards(tx: number, ty: number) {
    const px = this.ram('px');
    const py = this.ram('py');
    const [cx, cy] = this.cell;
    let side: Side | null = null;
    if (tx !== cx) {
      if (py !== ty * 8) side = py < ty * 8 ? 'S' : 'N';
      else side = tx > cx ? 'E' : 'W';
    } else if (ty !== cy) {
      if (px !== tx * 8) side = px < tx * 8 ? 'E' : 'W';
      else side = ty > cy ? 'S' : 'N';
    } else if (px !== tx * 8) side = px < tx * 8 ? 'E' : 'W';
    else if (py !== ty * 8) side = py < ty * 8 ? 'S' : 'N';
    if (side) this.towards(side);
    else this.frame(0);
  }

  /** In 3D the room is left when the player's centre reaches the border cell: walk to the cell inside the
   * doorway, face out and walk on */
  exit(side: Side) {
    const from = this.room;
    const door = this.route((x, y) => (side === 'N' ? y === 0 : side === 'S' ? y === 14 : side === 'E' ? x === 15 : x === 0));
    const [dx, dy] = door[door.length - 2] ?? door[0]!;
    this.goTo(dx, dy);
    this.face(side);
    for (let i = 0; i < 200 && this.room === from; i++) this.frame(BUTTONS.UP);
    this.settle();
    if (this.room === from) throw new Error(`bot: could not leave ${from} through ${side}`);
  }

  use(tx: number, ty: number) {
    const p = this.route((x, y) => Math.abs(x - tx) + Math.abs(y - ty) === 1);
    const [ax, ay] = p[p.length - 1]!;
    this.goTo(ax, ay);
    this.poke(tx, ty);
    this.settle();
  }

  poke(tx: number, ty: number) {
    const [cx, cy] = this.cell;
    const side = (Object.entries(DELTA) as [Side, [number, number]][]).find(([, [dx, dy]]) => cx + dx === tx && cy + dy === ty)?.[0];
    if (!side) throw new Error(`bot: ${tx},${ty} is not next to ${cx},${cy}`);
    this.face(side);
    this.frame(0);
    this.frame(BUTTONS.A);
    this.frame(0);
  }
}
