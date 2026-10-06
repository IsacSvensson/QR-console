// A bot that records Bo's replays. It plays the real cartridge frame by frame, reads Bo's state from RAM (via the
// symbol table) and presses buttons to carry out a route. Routes (routes.ts) say what to do, not which frames, so
// they can be recorded again when the physics is tuned (DESIGN.md §14.5). Output: run-length replay files.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCartridge } from '@qrc/asm';
import { parseCartridge } from '@qrc/cartridge';
import { includeFrom } from '@qrc/tools';
import { BUTTONS, VM } from '@qrc/vm';
import { levelIds } from './lvl';
import { GAME_DIR } from './util';

export const B = { L: BUTTONS.LEFT, R: BUTTONS.RIGHT, U: BUTTONS.UP, D: BUTTONS.DOWN, A: BUTTONS.A, B: BUTTONS.B } as const;

export async function loadGame(seed = 1) {
  const { bytes, asm } = await buildCartridge(readFileSync(join(GAME_DIR, 'bo.asm'), 'utf8'), { file: 'bo.asm', resolveInclude: includeFrom(GAME_DIR) });
  const vm = VM.fromCartridge(await parseCartridge(bytes), { seed });
  return { vm, sym: asm.symbols, bytes };
}

interface Snapshot {
  state: Record<string, unknown>;
  n: number;
}

export class Bot {
  readonly inputs: number[] = [];
  readonly levels = levelIds();
  /** frames of the route so far in which Bo bumped into a wall (vx set to 0 by a wall) */
  constructor(
    readonly vm: VM,
    readonly sym: Map<string, number>,
    readonly maxFrames = 60 * 60 * 40,
  ) {}

  S(name: string) {
    const a = this.sym.get(name);
    if (a === undefined) throw new Error(`no symbol ${name}`);
    return a;
  }
  /** signed RAM word */
  w(name: string) {
    return (this.vm.read16(this.S(name)) << 16) >> 16;
  }
  /** unsigned RAM word */
  u(name: string) {
    return this.vm.read16(this.S(name));
  }
  get mode() {
    return this.u('mode');
  }
  get playing() {
    return this.mode === this.S('M_PLAY');
  }
  /** Bo's centre x in px */
  get x() {
    return this.u('bo_x') >> 4;
  }
  get foot() {
    return this.w('bo_y') >> 4;
  }
  get vx() {
    return this.w('bo_vx');
  }
  get vy() {
    return this.w('bo_vy');
  }
  get grounded() {
    return this.w('bo_state') === this.S('ST_GROUND');
  }
  get level() {
    return this.levels[this.u('level')]!;
  }

  step(buttons = 0) {
    this.vm.step(buttons);
    this.inputs.push(buttons);
    if (this.vm.fault) throw new Error(`VM fault at frame ${this.inputs.length}: ${this.vm.fault}`);
    if (this.inputs.length > this.maxFrames) throw new Error('route too long');
  }
  hold(buttons: number, frames: number) {
    for (let i = 0; i < frames; i++) this.step(buttons);
  }
  /** Hold `buttons` (a mask or a function of the bot) until `done` is true; throws after `max` frames. */
  until(buttons: number | ((b: Bot) => number), done: (b: Bot) => boolean, max = 3000, note = '') {
    for (let i = 0; !done(this); i++) {
      if (i >= max) throw new Error(`until: gave up after ${max} frames ${note} (x ${this.x}, foot ${this.foot}, vx ${this.vx}, level ${this.level})`);
      this.step(typeof buttons === 'number' ? buttons : buttons(this));
    }
  }

  snapshot(): Snapshot {
    const v = this.vm as unknown as Record<string, unknown>;
    const state: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      const val = v[k];
      state[k] = val instanceof Uint8Array || val instanceof Uint16Array ? val.slice() : val;
    }
    return { state, n: this.inputs.length };
  }
  restore(s: Snapshot) {
    const v = this.vm as unknown as Record<string, unknown>;
    for (const [k, val] of Object.entries(s.state)) {
      if (val instanceof Uint8Array || val instanceof Uint16Array) (v[k] as Uint8Array).set(val);
      else v[k] = val;
    }
    this.inputs.length = s.n;
  }
  /** Tries `plan(k)` for k = 0, 1, … and keeps the first one for which `ok` holds afterwards. */
  search(plan: (k: number) => void, ok: (b: Bot) => boolean, maxK = 80, note = '') {
    const s = this.snapshot();
    for (let k = 0; k < maxK; k++) {
      try {
        plan(k);
        if (ok(this)) return k;
      } catch {
        // this k did not work out
      }
      this.restore(s);
    }
    throw new Error(`search failed ${note} (x ${this.x}, level ${this.level})`);
  }

  // ---- menus ----
  /** From the test menu: select level `id` and start it; returns when Bo can play. */
  startLevel(id: string) {
    const idx = this.levels.indexOf(id);
    if (idx < 0) throw new Error(`no level ${id}`);
    this.until(0, (b) => b.mode === b.S('M_MENU'), 600, 'waiting for the menu');
    this.step(0);
    while (this.u('menu_sel') !== idx) {
      this.step(B.R);
      this.step(0);
    }
    this.step(B.A);
    this.until(0, (b) => b.playing, 120, 'loading');
  }

  // ---- riding ----
  /** Push in direction `dir` until Bo's x passes `x` (or `max` frames). */
  rideTo(x: number, dir: 1 | -1 = 1, extra = 0) {
    const btn = dir > 0 ? B.R : B.L;
    this.until(btn | extra, (b) => (dir > 0 ? b.x >= x : b.x <= x), 3000, `ride to ${x}`);
  }
  /** Brake (opposite arrow) until Bo stands still. */
  brakeToStop() {
    this.until((b) => (b.vx > 0 ? B.L : b.vx < 0 ? B.R : 0), (b) => b.vx === 0, 600, 'brake');
  }
  /** Wait until Bo is on the ground. */
  land(buttons = 0) {
    this.until(buttons, (b) => b.grounded, 600, 'landing');
  }
  /**
   * Jump so that Bo gets past `goalX` without bumping into anything: tries taking off k frames from now,
   * holding A for `holdA` frames (pushing in `dir` the whole time), and keeps the first k that works.
   */
  jumpPast(goalX: number, opts: { holdA?: number; dir?: 1 | -1; settle?: number } = {}) {
    const dir = opts.dir ?? 1;
    const btn = dir > 0 ? B.R : B.L;
    const holdA = opts.holdA ?? 40;
    return this.search(
      (k) => {
        this.hold(btn, k);
        this.step(btn | B.A);
        let bumped = false;
        for (let i = 1; i < 400 && (dir > 0 ? this.x < goalX : this.x > goalX); i++) {
          this.step(btn | (i < holdA ? B.A : 0));
          if (this.vx === 0) bumped = true;
        }
        if (bumped) throw new Error('bumped');
        this.land(btn);
        this.hold(btn, opts.settle ?? 0);
      },
      () => (dir > 0 ? this.x >= goalX : this.x <= goalX),
      120,
      `jump past ${goalX}`,
    );
  }

  /** tile code of a level cell in RAM */
  cell(col: number, row: number) {
    return this.vm.read8(this.S('lvl') + col * 32 + row);
  }
  get state() {
    return this.w('bo_state');
  }
  get cls() {
    return this.w('bo_sattr') & 15;
  }
  get onRamp() {
    return this.grounded && this.cls === 3;
  }

  /**
   * Ride on to the next kicker and leave its lip at exactly `target` (1/16 px per frame), with an ollie on the
   * ramp if `ollie`; optional `air(frame)` gives the buttons in the air until landing. Speed is regulated by
   * braking and coasting; the search shifts when the regulation starts until the launch speed is exact.
   */
  launch(target: number, ollie: boolean, air: (f: number) => number = () => 0) {
    let launchV = 0;
    this.search(
      (k) => {
        for (let i = 0; this.grounded; i++) {
          if (i > 3000) throw new Error('no ramp');
          let b = 0;
          if (this.onRamp) b = ollie ? B.A : 0;
          else if (i < k) b = this.vx <= 24 ? B.R : 0;
          else if (this.vx > target) b = B.L;
          else if (this.vx <= 24 && this.vx <= target) b = B.R; // pushing holds 24 exactly
          this.step(b);
        }
        launchV = this.vx;
        if (this.w('bo_vy') >= 0) throw new Error('not a launch');
        for (let f = 1; !this.grounded && this.state !== 2; f++) {
          if (f > 400) throw new Error('long flight');
          this.step(air(f) | (ollie ? B.A : 0));
        }
      },
      () => launchV === target,
      200,
      `launch at ${target}`,
    );
  }

  replayFile(seed: number) {
    const out: [number, number][] = [];
    for (const b of this.inputs) {
      const last = out[out.length - 1];
      if (last && last[1] === b) last[0]++;
      else out.push([1, b]);
    }
    return { seed, frames: this.inputs.length, inputs: out };
  }
}
