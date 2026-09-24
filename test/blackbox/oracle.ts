// The test oracle for BLACKBOX: its own reading of the design documents, independent of the game's
// generator (games/blackbox/tools). Engine state in RAM/ROM is compared against this, never against itself.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCartridge } from '@qrc/asm';
import { parseCartridge } from '@qrc/cartridge';
import { includeFrom } from '@qrc/tools';
import { VM, expandInputs, type ReplayFile } from '@qrc/vm';

export const GAME_DIR = join(__dirname, '../../games/blackbox');
export const W = 16;
export const H = 15;

export interface OracleRoom {
  id: string;
  exits: Map<string, string>;
  locks: Map<string, string>;
  warp: { to: string; flag?: string } | null;
  events: string[];
  grid: string[];
}

export const rooms: OracleRoom[] = [...readFileSync(join(GAME_DIR, 'LAYOUT.md'), 'utf8').matchAll(/```room\n([\s\S]*?)```/g)].map((m) => {
  const head = new Map<string, string>();
  const grid: string[] = [];
  for (const line of m[1]!.replace(/\n$/, '').split('\n')) {
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (kv && !grid.length) head.set(kv[1]!, kv[2]!.trim());
    else grid.push(line);
  }
  const pairs = (k: string) => new Map((head.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+/) as [string, string]));
  const w = (head.get('warp') ?? '').split(/\s+/).filter(Boolean);
  return {
    id: head.get('id')!,
    exits: pairs('exits'),
    locks: pairs('locks'),
    warp: w.length ? { to: w[0]!, flag: w[1] } : null,
    events: (head.get('events') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    grid,
  };
});
export const roomById = new Map(rooms.map((r) => [r.id, r]));

/** LAYOUT character -> tile class as the engine must hold it (objects, arrival and pick-ups stand on floor). */
export function tileClass(ch: string): string {
  return 'gdhupanbi@'.includes(ch) ? '.' : ch;
}
/** Classes that block walking (LAYOUT.md legend). 'D' only while locked. */
export const BLOCKS_WALK = new Set(['#', 'S', 'C', '=', 'T', 'E', 'L', 'K', 'D']);

export async function buildBlackbox() {
  const { bytes, asm } = await buildCartridge(readFileSync(join(GAME_DIR, 'blackbox.asm'), 'utf8'), { file: 'blackbox.asm', resolveInclude: includeFrom(GAME_DIR) });
  const cart = await parseCartridge(bytes);
  return { bytes, asm, cart, sym: asm.symbols };
}

export function symbol(sym: Map<string, number>, name: string): number {
  const v = sym.get(name);
  if (v === undefined) throw new Error(`no symbol ${name}`);
  return v;
}

export function loadReplay(name: string): ReplayFile & { frames: number } {
  return JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8'));
}

export function replayInputs(rf: ReplayFile & { frames: number }) {
  return expandInputs(rf.inputs, rf.frames);
}

export function expectedHashes(name: string): string[] {
  return readFileSync(join(GAME_DIR, 'replays', `${name}.hashes.txt`), 'utf8').trim().split('\n');
}

export function newVm(cart: Awaited<ReturnType<typeof buildBlackbox>>['cart'], seed = 1) {
  return VM.fromCartridge(cart, { seed });
}

export const s16 = (v: number) => (v << 16) >> 16;

// ---- replay runner with per-frame oracle checks -------------------------------------------------
export interface FrameView {
  f: number;
  vm: VM;
  S: (name: string) => number;
  room: OracleRoom;
  mode: number;
  px: number;
  py: number;
  flag: (name: string) => boolean;
  actors: { type: number; x: number; y: number; dir: number; stun: number; state: number; mode: number }[];
}

const OPAQUE = new Set(['#', 'S', 'C', 'V', 'L']);

/** Is (x, y) opaque in the LAYOUT grid? Locked doors are opaque until their side's flag is set. */
export function opaqueAt(room: OracleRoom, x: number, y: number, flag: (n: string) => boolean): boolean {
  const c = tileClass(room.grid[y]![x]!);
  if (OPAQUE.has(c)) return true;
  if (c === 'D') {
    const side = y === 0 ? 'N' : y === H - 1 ? 'S' : x === W - 1 ? 'E' : 'W';
    const lock = room.locks.get(side);
    return !(lock && flag(lock));
  }
  return false;
}

/** Reference line of sight (DESIGN.md / LAYOUT.md legend), independent of the engine's code. */
export function sees(room: OracleRoom, a: { x: number; y: number; dir: number }, range: number, target: [number, number], flag: (n: string) => boolean): boolean {
  const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][a.dir]!;
  let x = (a.x + 4) >> 3;
  let y = (a.y + 4) >> 3;
  for (let k = 0; k < range; k++) {
    x += dx!;
    y += dy!;
    if (x < 0 || y < 0 || x >= W || y >= H || opaqueAt(room, x, y, flag)) return false;
    if (x === target[0] && y === target[1]) return true;
  }
  return false;
}

export function runReplay(bb: Awaited<ReturnType<typeof buildBlackbox>>, name: string, onFrame: (v: FrameView) => void) {
  const rf = loadReplay(name);
  const inputs = replayInputs(rf);
  const expected = expectedHashes(name);
  const vm = newVm(bb.cart, rf.seed);
  const S = (n: string) => symbol(bb.sym, n);
  const ids = rooms.map((r) => r.id);
  let hashMismatch = -1;
  let maxCycles = 0;
  const flag = (n: string) => ((vm.read8(S('flags') + (S(`F_${n}`) >> 3)) >> (S(`F_${n}`) & 7)) & 1) === 1;
  for (let f = 0; f < rf.frames; f++) {
    vm.step(inputs[f]!);
    maxCycles = Math.max(maxCycles, vm.cyclesLastFrame);
    if (hashMismatch < 0 && vm.stateHash() !== expected[f]) hashMismatch = f + 1;
    const base = S('actors');
    const actors = Array.from({ length: vm.read16(S('n_actors')) }, (_, i) => {
      const w = (o: number) => s16(vm.read16(base + i * S('ACT_SIZE') + o));
      return { type: w(S('AC_TYPE')), x: w(S('AC_X')), y: w(S('AC_Y')), dir: w(S('AC_DIR')), stun: w(S('AC_STUN')), state: w(S('AC_ST')), mode: w(S('AC_MODE')) };
    });
    onFrame({ f, vm, S, room: roomById.get(ids[vm.read16(S('room'))]!)!, mode: vm.read16(S('mode')), px: s16(vm.read16(S('px'))), py: s16(vm.read16(S('py'))), flag, actors });
  }
  return { vm, rf, hashMismatch, expectedFrames: expected.length, maxCycles };
}
