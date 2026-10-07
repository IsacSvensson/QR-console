// The test oracle for Sixten (PLAN.md Part 4): it reads DESIGN.md (§4.1 cell table) and the .map sources with its
// own parsers — never the generator's — and runs the cartridge and the recorded replays in the VM.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildCartridge } from '@qrc/asm';
import { parseCartridge } from '@qrc/cartridge';
import { includeFrom } from '@qrc/tools';
import { VM, expandInputs, type ReplayFile } from '@qrc/vm';

export const GAME_DIR = join(__dirname, '../../games/sixten');
export const s16 = (v: number) => (v << 16) >> 16;

// ---- DESIGN.md §4.1 --------------------------------------------------------------------------------
export interface DesignCell { type: number; ch: string; name: string; fill: number; symbol: string; speed16: number }
const COLOUR: Record<string, number> = { vit: 15, gul: 14, grön: 11, blå: 8 };
export const DESIGN_CELLS: DesignCell[] = (() => {
  const text = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');
  const start = text.indexOf('| Typ | Tecken | Namn |');
  if (start < 0) throw new Error('DESIGN.md: no cell table');
  const out: DesignCell[] = [];
  for (const line of text.slice(start).split('\n').slice(2)) {
    if (!line.startsWith('|')) break;
    const cols = line.split('\\|').join('\u00a6').split('|').slice(1, -1).map((c) => c.trim().split('\u00a6').join('|'));
    if (!/^\d+$/.test(cols[0]!)) continue; // the reserved row
    const ch = /^`(.)`$/.exec(cols[1]!)?.[1];
    if (!ch) throw new Error(`DESIGN.md: bad character column '${cols[1]}'`);
    const fill = COLOUR[cols[4]!.split(/\s/)[0]!];
    if (fill === undefined) throw new Error(`DESIGN.md: unknown map colour '${cols[4]}'`);
    const sp = cols[6]!;
    const speed16 = sp === '–' ? 0 : Math.round(Number(sp.replace(',', '.')) * 16);
    out.push({ type: Number(cols[0]), ch, name: cols[2]!, fill, symbol: cols[5]!, speed16 });
  }
  out.forEach((c, i) => {
    if (c.type !== i) throw new Error(`DESIGN.md: cell types must be numbered 0, 1, … (row ${i})`);
  });
  return out;
})();
export const typeOf = (ch: string) => {
  const t = DESIGN_CELLS.find((c) => c.ch === ch);
  if (!t) throw new Error(`no cell type '${ch}' in DESIGN.md`);
  return t;
};
/** the variant rule of DESIGN §4.1: open land and forest, ((column * 7 + row * 3) >> 1) & 1 */
const VARIES = new Set(['.', 'T']);

// ---- the .map sources ------------------------------------------------------------------------------------
export interface RefWhirl { trigger: number; wps: { c: number; r: number; s: number; v: number; wait: number }[]; changes: { wp: number; c: number; r: number; ch?: string; reveal?: boolean }[] }
export interface RefObj { kind: 'item' | 'entry' | 'build'; name: string; c: number; r: number; tc?: number; tr?: number; ch?: string }
export interface RefEvent { trigger: number; kind: string; at: number; warn: number; cells: { c: number; r: number; ch: string }[] }
export interface RefLevel { id: string; name: string; world: number; rows: string[]; w: number; h: number; controls: { kind: string; c: number; r: number }[]; leaves: Set<string>; whirls: RefWhirl[]; objects: RefObj[]; sides: string[][]; events: RefEvent[] }
export function levelIds(): string[] {
  const ids = readdirSync(join(GAME_DIR, 'levels')).filter((f) => f.endsWith('.map')).map((f) => f.slice(0, -4));
  return [...ids.filter((i) => !i.startsWith('T')).sort(), ...ids.filter((i) => i.startsWith('T')).sort()];
}
export function readLevel(id: string): RefLevel {
  const L: RefLevel = { id, name: '', world: 0, rows: [], w: 0, h: 0, controls: [], leaves: new Set(), whirls: [], objects: [], sides: [], events: [] };
  let section = '';
  for (const raw of readFileSync(join(GAME_DIR, 'levels', `${id}.map`), 'utf8').split(/\r?\n/)) {
    const line = (section === 'cells' ? raw : raw.split('#')[0]!).trimEnd();
    if (!line) continue;
    const m = /^(name|world|cells|controls|leaves|whirl|item|entry|build|side|event):\s*(.*)$/.exec(line);
    if (m) {
      if (m[1] === 'name') L.name = m[2]!;
      if (m[1] === 'world') L.world = Number(m[2]);
      if (m[1] === 'leaves') {
        const n = m[2]!.split(/\s+/).map(Number);
        for (let i = 0; i < n.length; i += 2) L.leaves.add(`${n[i]},${n[i + 1]}`);
      }
      if (m[1] === 'whirl') L.whirls.push({ trigger: Number(m[2]), wps: [], changes: [] });
      const t = m[2]!.trim().split(/\s+/);
      if (m[1] === 'item' || m[1] === 'entry') L.objects.push({ kind: m[1], name: t[0]!, c: Number(t[1]), r: Number(t[2]) });
      if (m[1] === 'build') L.objects.push({ kind: 'build', name: '', c: Number(t[0]), r: Number(t[1]), tc: Number(t[2]), tr: Number(t[3]), ch: t[4] });
      if (m[1] === 'side') L.sides.push(t);
      if (m[1] === 'event') L.events.push({ trigger: Number(t[0]), kind: t[1]!, at: Number(t[2]), warn: Number(t[3]), cells: [] });
      section = m[1]!;
      continue;
    }
    if (section === 'event') {
      const [, c, r, ch] = line.trim().split(/\s+/);
      L.events[L.events.length - 1]!.cells.push({ c: Number(c), r: Number(r), ch: ch! });
      continue;
    }
    if (section === 'whirl') {
      const [k, ...n] = line.trim().split(/\s+/);
      const w = L.whirls[L.whirls.length - 1]!;
      if (k === 'wp') w.wps.push({ c: Number(n[0]), r: Number(n[1]), s: Number(n[2]), v: Number(n[3]), wait: Number(n[4]) });
      if (k === 'change') w.changes.push({ wp: Number(n[0]), c: Number(n[1]), r: Number(n[2]), ch: n[3] });
      if (k === 'reveal') w.changes.push({ wp: Number(n[0]), c: Number(n[1]), r: Number(n[2]), reveal: true });
      continue;
    }
    if (section === 'cells') L.rows.push(line);
    if (section === 'controls') {
      const [, kind, c, r] = line.trim().split(/\s+/);
      L.controls.push({ kind: kind!, c: Number(c), r: Number(r) });
    }
  }
  L.h = L.rows.length;
  L.w = L.rows[0]!.length;
  return L;
}
export const LEVEL_IDS = levelIds();
/** the cell bytes the level must have in RAM (DESIGN §4.1) */
export function refCells(L: RefLevel): number[] {
  const out: number[] = [];
  L.rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      let b = typeOf(ch).type;
      if (VARIES.has(ch) && ((c * 7 + r * 3) >> 1) & 1) b |= 0x20;
      if (L.leaves.has(`${c},${r}`)) b |= 0x40;
      if (L.controls.some((k) => k.c === c && k.r === r)) b |= 0x80;
      out.push(b);
    }),
  );
  return out;
}
export const blockingCell = (L: RefLevel, c: number, r: number) => c < 0 || r < 0 || c >= L.w || r >= L.h || typeOf(L.rows[r]![c]!).speed16 === 0;

// ---- the cartridge ---------------------------------------------------------------------------------
export async function buildSixten() {
  const { bytes, asm } = await buildCartridge(readFileSync(join(GAME_DIR, 'sixten.asm'), 'utf8'), { file: 'sixten.asm', resolveInclude: includeFrom(GAME_DIR) });
  const cart = await parseCartridge(bytes);
  const rom = new Uint8Array(0x8000);
  rom.set(cart.sections.code, 0);
  rom.set(cart.sections.rodata, cart.sections.code.length);
  return { bytes, asm, cart, sym: asm.symbols, rom };
}
export type Sixten = Awaited<ReturnType<typeof buildSixten>>;
export function symbol(sym: Map<string, number>, name: string): number {
  const v = sym.get(name);
  if (v === undefined) throw new Error(`no symbol ${name}`);
  return v;
}
/** a VM in play in level `id` (via the dbg_level test hook) */
export function vmInLevel(sx: Sixten, id: string, seed = 1): VM {
  const vm = VM.fromCartridge(sx.cart, { seed });
  vm.step(0);
  vm.write16(symbol(sx.sym, 'dbg_level'), LEVEL_IDS.indexOf(id) + 1);
  vm.step(0);
  if (vm.fault) throw new Error(vm.fault);
  return vm;
}

// ---- replays -------------------------------------------------------------------------------------
export function replayNames(): string[] {
  const dir = join(GAME_DIR, 'replays');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
}
export interface FrameView { f: number; vm: VM; S: (n: string) => number; u: (n: string) => number; input: number }
export function runReplay(sx: Sixten, name: string, onFrame: (v: FrameView) => void) {
  const rf = JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.json`), 'utf8')) as ReplayFile & { frames: number };
  const inputs = expandInputs(rf.inputs, rf.frames);
  const expected = readFileSync(join(GAME_DIR, 'replays', `${name}.hashes.txt`), 'utf8').trim().split('\n');
  const vm = VM.fromCartridge(sx.cart, { seed: rf.seed ?? 1 });
  const S = (n: string) => symbol(sx.sym, n);
  const u = (n: string) => vm.read16(S(n));
  let hashMismatch = -1;
  let maxCycles = 0;
  for (let f = 0; f < rf.frames; f++) {
    vm.step(inputs[f]!);
    maxCycles = Math.max(maxCycles, vm.cyclesLastFrame);
    if (hashMismatch < 0 && vm.stateHash() !== expected[f]) hashMismatch = f + 1;
    onFrame({ f, vm, S, u, input: inputs[f]! });
  }
  return { vm, rf, hashMismatch, expectedFrames: expected.length, maxCycles };
}
