import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Design-time check for games/blackbox/LAYOUT.md (room format: DESIGN.md §3.1).
const W = 16;
const H = 15;
const LEGEND = '# S C . = + D V T E L K i @ g d h u p a n b'.split(' ');
const BORDER_OK = new Set(['#', 'S', 'C', '+', 'D', 'V']);
const EXIT_TILES = new Set(['+', 'D', 'V']);
const BLOCKING = new Set(['#', 'S', 'C', '=', 'T', 'E', 'L', 'K']);
const INTERACTIVE = new Set(['T', 'E', 'L', 'K', 'i', 'n']);
const OPPOSITE: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' };

interface Room {
  id: string;
  name: string;
  exits: { side: string; to: string }[];
  warp: { to: string; flag?: string } | null;
  locks: Map<string, string>;
  gives: { flag: string; needs?: string; optional: boolean }[];
  events: string[];
  grid: string[];
}

const doc = readFileSync(join(__dirname, '../games/blackbox/LAYOUT.md'), 'utf8');
const rooms: Room[] = [...doc.matchAll(/```room\n([\s\S]*?)```/g)].map((m) => {
  const lines = m[1]!.replace(/\n$/, '').split('\n');
  const header = new Map<string, string>();
  const grid: string[] = [];
  for (const line of lines) {
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (kv && grid.length === 0) header.set(kv[1]!, kv[2]!.trim());
    else grid.push(line);
  }
  const list = (k: string) => (header.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const warpParts = (header.get('warp') ?? '').split(/\s+/).filter(Boolean);
  return {
    id: header.get('id') ?? '?',
    name: header.get('name') ?? '?',
    exits: list('exits').map((e) => {
      const [side, to] = e.split(/\s+/);
      return { side: side!, to: to! };
    }),
    warp: warpParts.length ? { to: warpParts[0]!, flag: warpParts[1] } : null,
    locks: new Map(list('locks').map((l) => l.split(/\s+/) as [string, string])),
    gives: list('gives').map((g) => {
      const optional = g.endsWith('?');
      const [flag, needs] = g.replace(/\?$/, '').split('<');
      return { flag: flag!, needs, optional };
    }),
    events: list('events'),
    grid,
  };
});
const byId = new Map(rooms.map((r) => [r.id, r]));

function exitCells(r: Room, side: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < (side === 'N' || side === 'S' ? W : H); i++) {
    const ch = side === 'N' ? r.grid[0]![i] : side === 'S' ? r.grid[H - 1]![i] : side === 'W' ? r.grid[i]![0] : r.grid[i]![W - 1];
    if (EXIT_TILES.has(ch!)) out.push(i);
  }
  return out;
}

describe('BLACKBOX layout', () => {
  it('has the 37 rooms of DESIGN.md, each once', () => {
    expect(rooms.length).toBe(37);
    expect(byId.size).toBe(37);
  });

  it('every grid is 16 x 15 legend characters with a closed border except for exits', () => {
    const problems: string[] = [];
    for (const r of rooms) {
      if (r.grid.length !== H) problems.push(`${r.id}: ${r.grid.length} rows`);
      r.grid.forEach((row, y) => {
        if (row.length !== W) problems.push(`${r.id} row ${y}: ${row.length} columns`);
        [...row].forEach((ch, x) => {
          if (!LEGEND.includes(ch)) problems.push(`${r.id} (${x},${y}): unknown tile '${ch}'`);
          const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
          if (border && !BORDER_OK.has(ch)) problems.push(`${r.id} (${x},${y}): '${ch}' on the border`);
        });
      });
    }
    expect(problems).toEqual([]);
  });

  it('declared exits match the doorways, and every door exists on both sides at the same position', () => {
    const problems: string[] = [];
    for (const r of rooms) {
      for (const side of ['N', 'S', 'E', 'W']) {
        const cells = exitCells(r, side);
        const declared = r.exits.filter((e) => e.side === side);
        if (declared.length === 0 && cells.length) problems.push(`${r.id}: doorway on ${side} but no exit declared`);
        if (declared.length && cells.length !== 1) problems.push(`${r.id}: exit ${side} needs exactly one doorway, found ${cells.length}`);
        for (const e of declared) {
          if (e.to === 'END') continue;
          const other = byId.get(e.to);
          if (!other) {
            problems.push(`${r.id}: exit ${side} to unknown room ${e.to}`);
            continue;
          }
          const back = other.exits.find((x) => x.side === OPPOSITE[side] && x.to === r.id);
          if (!back) problems.push(`${r.id} -> ${e.to}: no exit ${OPPOSITE[side]} back`);
          else if (exitCells(other, OPPOSITE[side]!)[0] !== cells[0]) problems.push(`${r.id} ${side} -> ${e.to}: doorways not aligned (${cells[0]} vs ${exitCells(other, OPPOSITE[side]!)[0]})`);
        }
      }
      for (const [side] of r.locks) if (!r.exits.some((e) => e.side === side)) problems.push(`${r.id}: lock on ${side} without an exit`);
      if (r.warp && r.warp.to !== 'END' && !byId.has(r.warp.to)) problems.push(`${r.id}: warp to unknown ${r.warp.to}`);
      if (r.warp && r.warp.to !== 'END' && !r.grid.some((row) => row.includes('L'))) problems.push(`${r.id}: warp without an L tile`);
      if (r.warp?.to === 'END' && !r.grid.some((row) => /[TK]/.test(row))) problems.push(`${r.id}: ending without a terminal or cable to trigger it`);
    }
    expect(problems).toEqual([]);
  });

  it('inside every room, all exits, pick-ups, NPCs and usable tiles are reachable on foot', () => {
    const problems: string[] = [];
    for (const r of rooms) {
      const passable = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !BLOCKING.has(r.grid[y]![x]!);
      const starts: [number, number][] = [];
      r.grid.forEach((row, y) => [...row].forEach((ch, x) => {
        if ((EXIT_TILES.has(ch) || ch === '@') && passable(x, y)) starts.push([x, y]);
      }));
      if (starts.length === 0) {
        // rooms entered only by warp: start next to the L tile
        r.grid.forEach((row, y) => [...row].forEach((ch, x) => {
          if (ch === 'L') for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (passable(x + dx, y + dy)) starts.push([x + dx, y + dy]);
        }));
      }
      const seen = new Set<string>();
      const queue = starts.slice(0, 1);
      if (queue[0]) seen.add(queue[0].join());
      while (queue.length) {
        const [x, y] = queue.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const k = `${x + dx},${y + dy}`;
          if (passable(x + dx, y + dy) && !seen.has(k)) {
            seen.add(k);
            queue.push([x + dx, y + dy]);
          }
        }
      }
      r.grid.forEach((row, y) => [...row].forEach((ch, x) => {
        if (EXIT_TILES.has(ch) || ch === '@' || ch === 'i' || ch === 'n') {
          if (!seen.has(`${x},${y}`)) problems.push(`${r.id} (${x},${y}) '${ch}' unreachable`);
        } else if (INTERACTIVE.has(ch)) {
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${x + dx!},${y + dy!}`));
          if (!near) problems.push(`${r.id} (${x},${y}) '${ch}' cannot be used (no reachable neighbour)`);
        }
      }));
    }
    expect(problems).toEqual([]);
  });

  it('every dialogue D1-D20, log L1-L10 and prediction P1-P8 is placed', () => {
    const placed = new Set(rooms.flatMap((r) => r.events));
    const expected = [
      ...Array.from({ length: 20 }, (_, i) => `D${i + 1}`),
      ...Array.from({ length: 10 }, (_, i) => `L${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `P${i + 1}`),
    ];
    expect(expected.filter((e) => !placed.has(e))).toEqual([]);
    expect([...placed].filter((e) => !expected.includes(e))).toEqual([]);
  });

  it('the game can be completed from 0.1 to 7.4 without optional choices (Mira refused)', () => {
    const flags = new Set<string>();
    const reached = new Set<string>(['0.1']);
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...reached]) {
        const r = byId.get(id)!;
        for (const g of r.gives) {
          if (!g.optional && (!g.needs || flags.has(g.needs)) && !flags.has(g.flag)) {
            flags.add(g.flag);
            changed = true;
          }
        }
        const targets: string[] = [];
        for (const e of r.exits) {
          const lock = r.locks.get(e.side);
          if (e.to !== 'END' && (!lock || flags.has(lock))) targets.push(e.to);
        }
        if (r.warp && r.warp.to !== 'END' && (!r.warp.flag || flags.has(r.warp.flag))) targets.push(r.warp.to);
        for (const t of targets) {
          if (!reached.has(t)) {
            reached.add(t);
            changed = true;
          }
        }
      }
    }
    const missing = rooms.map((r) => r.id).filter((id) => !reached.has(id));
    expect(missing).toEqual([]);
    expect(byId.get('7.4')!.warp?.to).toBe('END');
    // every lock and warp flag is obtainable somewhere
    const givable = new Set(rooms.flatMap((r) => r.gives.map((g) => g.flag)));
    const needed = rooms.flatMap((r) => [...r.locks.values(), ...(r.warp?.flag ? [r.warp.flag] : [])]);
    expect(needed.filter((f) => !givable.has(f))).toEqual([]);
  });
});
