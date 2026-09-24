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
