// Development aid: where the cycles go. Runs frames with the VM's read-only tracer and attributes every
// instruction (1 cycle, SYS 8) to the routine (global label) and the source file it belongs to.
// Run: npx tsx games/nadir/tools/profile.ts [pose ...] [--flags N]     (poses from levels/*.map; default all)
//      npx tsx games/nadir/tools/profile.ts --replay <name> [--flags N]  (every frame of replays/<name>.json)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPCODES, SYSCALLS } from '@qrc/vm';
import { expandInputs } from '@qrc/vm';
import { atPose, loadGame, type Game } from './game';
import { readMap } from './maps';
import { GAME_DIR, isMain } from './util';

export interface Profile {
  frames: number;
  total: number[];
  byRoutine: Map<string, number[]>;
  byFile: Map<string, number[]>;
}

/** Attribution tables from the assembler: address -> routine (last global label at or before it) and file. */
function attribution(g: Game) {
  const labels = [...g.asm.symbols].filter(([n]) => g.asm.symbolKinds.get(n) === 'label' && !n.includes('@')).map(([n, a]) => [a, n] as const).sort((a, b) => a[0] - b[0]);
  const routine = new Array<string>(0x10000).fill('(code in RAM)');
  for (let i = 0; i < labels.length; i++) {
    const [a, n] = labels[i]!;
    const end = i + 1 < labels.length ? labels[i + 1]![0] : 0x8000;
    for (let p = a; p < end && p < 0x8000; p++) routine[p] = n;
  }
  const file = new Array<string>(0x10000).fill('(code in RAM)');
  for (const l of g.asm.listing) if (l.bytes.length && l.address < 0x8000) for (let p = l.address; p < l.address + l.bytes.length; p++) file[p] = l.file;
  return { routine, file };
}

export function profileFrames(g: Game, frames: (() => void)[]): Profile {
  const { routine, file } = attribution(g);
  const prof: Profile = { frames: frames.length, total: [], byRoutine: new Map(), byFile: new Map() };
  const add = (m: Map<string, number[]>, k: string, f: number, c: number) => {
    let a = m.get(k);
    if (!a) m.set(k, (a = new Array<number>(frames.length).fill(0)));
    a[f]! += c;
  };
  frames.forEach((run, f) => {
    let total = 0;
    g.vm.tracer = (pc) => {
      const m = g.vm.mem;
      let c = 1;
      if (m[pc] === OPCODES.SYS) {
        const n = m[pc + 2]!;
        // ISA 2 block syscalls add a per-byte cost (VM.md): COPY ceil(r3 / 8), FILL ceil(r2 / 8)
        c = 8 + (n === SYSCALLS.COPY ? Math.ceil(g.vm.regs[3]! / 8) : n === SYSCALLS.FILL ? Math.ceil(g.vm.regs[2]! / 8) : 0);
      }
      total += c;
      add(prof.byRoutine, routine[pc]!, f, c);
      add(prof.byFile, file[pc]!, f, c);
    };
    run();
    g.vm.tracer = null;
    prof.total.push(g.vm.cyclesLastFrame);
    // frames are profiled after init, so the count must agree with the VM's exactly
    if (total !== g.vm.cyclesLastFrame) throw new Error(`profile: counted ${total} cycles, VM reports ${g.vm.cyclesLastFrame}`);
  });
  return prof;
}

export function report(p: Profile, top = 25): string {
  const stat = (a: number[]) => ({ max: Math.max(...a), mean: a.reduce((s, x) => s + x, 0) / a.length });
  const lines = [`${p.frames} frame(s): total max ${Math.max(...p.total)}, mean ${(p.total.reduce((s, x) => s + x, 0) / p.frames).toFixed(0)}`, '--- by file (max / mean cycles per frame)'];
  for (const [k, a] of [...p.byFile].sort((x, y) => stat(y[1]).mean - stat(x[1]).mean)) lines.push(`${k.padEnd(22)} ${String(stat(a).max).padStart(6)} ${stat(a).mean.toFixed(0).padStart(7)}`);
  lines.push('--- by routine');
  for (const [k, a] of [...p.byRoutine].sort((x, y) => stat(y[1]).mean - stat(x[1]).mean).slice(0, top)) lines.push(`${k.padEnd(22)} ${String(stat(a).max).padStart(6)} ${stat(a).mean.toFixed(0).padStart(7)}`);
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const flags = Number(opt('--flags') ?? 0);
  const replay = opt('--replay');
  const g = await loadGame(1);
  if (replay) {
    const rf = JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${replay}.json`), 'utf8'));
    const inputs = expandInputs(rf.inputs, rf.frames);
    g.vm.step(inputs[0]!);
    g.vm.write16(g.S('dbg_flags'), flags);
    console.log(report(profileFrames(g, Array.from({ length: rf.frames - 1 }, (_, f) => () => g.vm.step(inputs[f + 1]!)))));
  } else {
    const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--flags');
    const poses = readMap('nadir').poses.map((p, i) => ({ ...p, n: i + 1 })).filter((p) => !names.length || names.includes(p.name));
    g.vm.step(0);
    console.log(report(profileFrames(g, poses.map((p) => () => atPose(g, p.n, flags)))));
  }
}
