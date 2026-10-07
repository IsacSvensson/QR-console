// A bot that records Sixten's replays. It plays the real cartridge frame by frame, reads Sixten's state from RAM
// (via the symbol table) and presses buttons to carry out a route: "walk to cell", "open the map", "set the course".
// Routes (routes.ts) say what to do, not which frames, so they can be recorded again when the engine changes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCartridge } from '@qrc/asm';
import { parseCartridge } from '@qrc/cartridge';
import { includeFrom } from '@qrc/tools';
import { BUTTONS, VM } from '@qrc/vm';
import { CELLS } from './art';
import { type Level, levelIds, parseLevel } from './levels';
import { GAME_DIR } from './util';

export const B = { L: BUTTONS.LEFT, R: BUTTONS.RIGHT, U: BUTTONS.UP, D: BUTTONS.DOWN, A: BUTTONS.A, B: BUTTONS.B } as const;

export async function loadGame(seed = 1) {
  const { bytes, asm } = await buildCartridge(readFileSync(join(GAME_DIR, 'sixten.asm'), 'utf8'), { file: 'sixten.asm', resolveInclude: includeFrom(GAME_DIR) });
  const vm = VM.fromCartridge(await parseCartridge(bytes), { seed });
  return { vm, sym: asm.symbols, bytes };
}

export class Bot {
  readonly inputs: number[] = [];
  readonly ids = levelIds();
  level!: Level;
  constructor(
    readonly vm: VM,
    readonly sym: Map<string, number>,
    readonly maxFrames = 60 * 60 * 20,
  ) {}

  S(name: string) {
    const a = this.sym.get(name);
    if (a === undefined) throw new Error(`no symbol ${name}`);
    return a;
  }
  u(name: string) {
    return this.vm.read16(this.S(name));
  }
  get mode() {
    return this.u('mode');
  }
  /** feet in px */
  get x() {
    return this.u('px') >> 4;
  }
  get y() {
    return this.u('py') >> 4;
  }
  get cell(): [number, number] {
    return [this.x >> 5, this.y >> 5];
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
  /** wait until the game is in play (slides and the map closed) */
  settle() {
    for (let i = 0; this.mode !== this.S('M_PLAY'); i++) {
      if (i > 60) throw new Error('never back in play');
      this.step(0);
    }
  }
  /** start a level from the level card, with buttons: → until it shows the level, then A */
  startLevel(id: string) {
    if (!this.inputs.length) this.step(0);
    if (this.mode !== this.S('M_CARD')) throw new Error('startLevel: not on the level card');
    const want = this.ids.indexOf(id);
    for (let guard = 0; this.u('card_sel') !== want; guard++) {
      if (guard > this.ids.length) throw new Error(`no level ${id} on the card`);
      this.tap(B.R);
    }
    this.tap(B.A);
    this.level = parseLevel(id);
    this.settle();
  }

  walkable(c: number, r: number) {
    const L = this.level;
    return c >= 0 && r >= 0 && c < L.w && r < L.h && CELLS.find((t) => t.ch === L.rows[r]![c])!.speed > 0;
  }
  /** shortest 4-neighbour path over walkable cells (the level source, as the bot knows the map) */
  path(to: [number, number]): [number, number][] {
    const L = this.level;
    const from = this.cell;
    const key = (c: number, r: number) => r * L.w + c;
    const prev = new Map<number, number>([[key(...from), -1]]);
    const q: [number, number][] = [from];
    while (q.length) {
      const [c, r] = q.shift()!;
      if (c === to[0] && r === to[1]) break;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n: [number, number] = [c + dc, r + dr];
        if (!this.walkable(...n) || prev.has(key(...n))) continue;
        // never through another control: stamping it could start a whirlwind the route did not ask for
        if (L.controls.some((k) => k.c === n[0] && k.r === n[1]) && (n[0] !== to[0] || n[1] !== to[1])) continue;
        prev.set(key(...n), key(c, r));
        q.push(n);
      }
    }
    if (!prev.has(key(...to))) throw new Error(`no path from ${from} to ${to}`);
    const out: [number, number][] = [];
    for (let k = key(...to); k !== -1 && k !== key(...from); k = prev.get(k)!) out.unshift([k % L.w, Math.floor(k / L.w)]);
    return out;
  }
  /** walk to a point (px): horizontal first while the line is free, then vertical */
  walkToPoint(tx: number, ty: number) {
    for (let guard = 0; this.x !== tx || this.y !== ty; guard++) {
      if (guard > 3000) throw new Error(`stuck at ${this.x},${this.y} going to ${tx},${ty}`);
      this.settle();
      const b = this.x < tx ? B.R : this.x > tx ? B.L : this.y < ty ? B.D : B.U;
      // do not overshoot by more than the remaining distance: on the last pixels tap instead of hold
      this.step(b);
      if ((b === B.R && this.x > tx) || (b === B.L && this.x < tx) || (b === B.D && this.y > ty) || (b === B.U && this.y < ty)) {
        // overshot a sub-pixel speed: accept, the cell centre is what matters
        if (b === B.R || b === B.L) tx = this.x;
        else ty = this.y;
      }
    }
  }
  /** walk to a cell along the shortest path, through cell centres (feet FEET_DY into the cell) */
  walkTo(c: number, r: number) {
    for (const [pc, pr] of this.path([c, r])) {
      const [cc, cr] = this.cell;
      if (pc !== cc) this.walkToPoint(pc * 32 + 16, this.y);
      else if (pr !== cr) this.walkToPoint(this.x, pr * 32 + 20);
      this.walkToPoint(pc * 32 + 16, pr * 32 + 20);
    }
  }
  /** hold a direction for n frames */
  hold(b: number, n: number) {
    for (let i = 0; i < n; i++) this.step(b);
  }
  tap(b: number) {
    this.step(b);
    this.step(0);
  }
  openMap() {
    this.settle();
    this.tap(B.B);
    this.wait(6);
  }
  closeMap() {
    this.tap(B.B);
    this.settle();
  }

  replayFile(seed = 1) {
    const runs: [number, number][] = [];
    for (const b of this.inputs) {
      const last = runs[runs.length - 1];
      if (last && last[1] === b) last[0]++;
      else runs.push([1, b]);
    }
    return { seed, frames: this.inputs.length, inputs: runs };
  }
}
