// Parser for games/blackbox/LAYOUT.md, used by the data generator (gen.ts) and the bots.
// test/blackbox-layout.test.ts deliberately has its own parser: it is the independent oracle.
import { readFileSync } from 'node:fs';

export const W = 16;
export const H = 15;

export interface LayoutRoom {
  id: string;
  name: string;
  exits: { side: 'N' | 'S' | 'E' | 'W'; to: string }[];
  warp: { to: string; flag?: string } | null;
  locks: Map<string, string>;
  gives: { flag: string; needs?: string; optional: boolean }[];
  events: string[];
  grid: string[];
}

export function parseLayout(path = new URL('../LAYOUT.md', import.meta.url)): LayoutRoom[] {
  const doc = readFileSync(path, 'utf8');
  return [...doc.matchAll(/```room\n([\s\S]*?)```/g)].map((m) => {
    const header = new Map<string, string>();
    const grid: string[] = [];
    for (const line of m[1]!.replace(/\n$/, '').split('\n')) {
      const kv = /^([a-z]+):\s*(.*)$/.exec(line);
      if (kv && grid.length === 0) header.set(kv[1]!, kv[2]!.trim());
      else grid.push(line);
    }
    const list = (k: string) => (header.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const warp = (header.get('warp') ?? '').split(/\s+/).filter(Boolean);
    return {
      id: header.get('id')!,
      name: header.get('name')!,
      exits: list('exits').map((e) => {
        const [side, to] = e.split(/\s+/);
        return { side: side as 'N', to: to! };
      }),
      warp: warp.length ? { to: warp[0]!, flag: warp[1] } : null,
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
}
