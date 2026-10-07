// Level generator: levels/*.map -> ../levels.gen.asm (the ROM level table, each cell map packed in xdata) and
// levels/<id>.png (the level top-down, with the screens marked, and its map colours beside it).
// Format of a .map file (DESIGN.md §4.2):
//   # comment                       (not inside the cell map, where # is dense forest)
//   name: 1-1 SKOGSSTARTEN          the level card / map title (the game's font)
//   world: 1
//   cells:                          the cell map, one character per cell (DESIGN §4.1), up to 24 x 15,
//   ^^^^^^TTTT…                     width a multiple of 4 and height a multiple of 3 (whole screens);
//                                   exactly one S (start) and one M (goal)
//   controls:                       number, kind (O obligatory, F optional, H hidden), column, row
//   1 O 6 13
//   leaves: 21 8                    cells covered by leaves (bit 6)
//   whirl: 3                        a whirlwind, started when control 3 is stamped (DESIGN §6); then:
//   wp 7 7 3 8 0                    waypoints: column, row, strength 1-5, speed (1/16 px per frame), wait (frames)
//   change 1 20 7 L                 at waypoint 1 the cell (20, 7) becomes L (within the whirlwind's radius)
//   reveal 1 21 8                   at waypoint 1 the leaves blow off (21, 8)
//   side: 4 1 T4-cave 4 2 4 2       a side view (levels/T4-cave.side) starts with A facing cell (4, 1); leaving it at
//                                   its left edge puts Sixten on (4, 2), at its right edge on (4, 2) (DESIGN §3.3);
//                                   an 8th field (a cell character) makes it open only while the cell is of that type
//   item: GURKA 15 5                a power-up on a cell (GURKA, CHIPS, CHOKLAD), taken by walking onto it (§8.1)
//   entry: RÄV 6 9                  a nature-book entry (NATURBOK.md) on a cell: A next to it opens its page (§8.2)
//   build: 14 8 17 8 b              a building site (a B cell) at (14, 8): with 2 wood, A makes (17, 8) a b (§8.4)
//   event: 1 FALL 420 240           a timed change (DESIGN §6.6): started by control 1 (0 = the level's start), FALL
//   cell 6 1 X                      (trees fall), SLIDE (a landslide) or FLOOD (water rises); it happens 420 frames
//                                   after the start, with a warning shown for the last 240 (FALL/SLIDE: >= 120);
//                                   then the listed cells change
// A .side file (DESIGN §3.2): name, wind (1/16 px per frame, + = to the right), right (the compass letter of the
// right edge: N Ö S V), sky (CLS colour), start (the feet's cell when entering), then 14 rows of tiles (art.ts
// SIDE_TILES, ' ' = sky), 32-96 columns (2-6 screens).
// Run: npx tsx games/sixten/tools/levels.ts (or npm run sixten:gen)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { PALETTE } from '@qrc/vm';
import { CELLS, CELL_BY_CH, SIDE_INDEX, encode, patternBytes, tilePixels } from './art';
import { readBook } from './naturbok';
import { GAME_DIR, isMain } from './util';

export const MAX_W = 24;
export const MAX_H = 15;
export const CONTROL_KINDS = { O: 0, F: 1, H: 2 } as const;

export interface Control { n: number; kind: keyof typeof CONTROL_KINDS; c: number; r: number }
export interface Waypoint { c: number; r: number; s: number; v: number; wait: number }
export interface Change { wp: number; c: number; r: number; ch?: string; reveal?: boolean }
export interface Whirl { trigger: number; wps: Waypoint[]; changes: Change[] }
export const POWERUPS = { GURKA: 1, CHIPS: 2, CHOKLAD: 3 } as const;
export const EVENT_KINDS = { FALL: 1, SLIDE: 2, FLOOD: 3 } as const;
export const EVENT_WARN_MIN = 120;
export interface LevelEvent { trigger: number; kind: keyof typeof EVENT_KINDS; at: number; warn: number; cells: { c: number; r: number; ch: string }[] }
export const WOOD_PER_TREE = 2;
export const WOOD_PER_BUILD = 2;
export interface Obj { kind: 'item' | 'entry' | 'build'; c: number; r: number; name?: string; tc?: number; tr?: number; ch?: string }
export interface SideLink { c: number; r: number; side: string; exitL: [number, number]; exitR: [number, number]; needs?: string }
export interface Side { id: string; name: string; wind: number; right: string; sky: number; start: [number, number]; rows: string[]; w: number }
export const SIDE_ROWS = 14;
export const RIGHT_DIR: Record<string, number> = { 'Ö': 0, N: 4, V: 8, S: 12 };

/** DESIGN §6: the warning before the whirlwind grows, one strength step per STEP_FRAMES, the wind turns TURN_FRAMES
 * before every change of direction, the radius in px for a strength */
export const WARN_FRAMES = 150;
export const STEP_FRAMES = 60;
export const TURN_FRAMES = 120;
export const radius = (s: number) => 24 + 8 * s;
export interface Level {
  id: string;
  name: string;
  world: number;
  w: number;
  h: number;
  rows: string[];
  controls: Control[];
  leaves: [number, number][];
  start: [number, number];
  goal: [number, number];
  whirls: Whirl[];
  sides: SideLink[];
  objects: Obj[];
  events: LevelEvent[];
}

const LEVEL_DIR = join(GAME_DIR, 'levels');

/** level ids in table order: the real levels by id, then the test levels */
export function levelIds(): string[] {
  const ids = readdirSync(LEVEL_DIR).filter((f) => f.endsWith('.map')).map((f) => f.slice(0, -4));
  const real = ids.filter((i) => !i.startsWith('T')).sort();
  const test = ids.filter((i) => i.startsWith('T')).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return [...real, ...test];
}

export function parseLevel(id: string, text = readFileSync(join(LEVEL_DIR, `${id}.map`), 'utf8')): Level {
  const L: Level = { id, name: '', world: 0, w: 0, h: 0, rows: [], controls: [], leaves: [], start: [-1, -1], goal: [-1, -1], whirls: [], sides: [], objects: [], events: [] };
  let section = '';
  const fail = (m: string): never => {
    throw new Error(`${id}.map: ${m}`);
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line || (line.startsWith('#') && section !== 'cells')) continue; // '#' is dense forest inside the cell map
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) {
      const [, k, v] = kv;
      if (k === 'name') L.name = v!;
      else if (k === 'world') L.world = Number(v);
      else if (k === 'leaves') {
        const n = v!.trim().split(/\s+/).map(Number);
        for (let i = 0; i + 1 < n.length; i += 2) L.leaves.push([n[i]!, n[i + 1]!]);
      } else if (k === 'cells' || k === 'controls') section = k;
      else if (k === 'event') {
        const t = v!.split('#')[0]!.trim().split(/\s+/);
        if (t.length !== 4 || !(t[1]! in EVENT_KINDS)) fail(`bad event line '${line}'`);
        L.events.push({ trigger: Number(t[0]), kind: t[1] as LevelEvent['kind'], at: Number(t[2]), warn: Number(t[3]), cells: [] });
        section = 'event';
      } else if (k === 'item' || k === 'entry' || k === 'build') {
        const t = v!.split('#')[0]!.trim().split(/\s+/);
        if (k === 'build') {
          if (t.length !== 5) fail(`bad build line '${line}'`);
          L.objects.push({ kind: 'build', c: Number(t[0]), r: Number(t[1]), tc: Number(t[2]), tr: Number(t[3]), ch: t[4] });
        } else {
          if (t.length !== 3) fail(`bad ${k} line '${line}'`);
          L.objects.push({ kind: k, name: t[0], c: Number(t[1]), r: Number(t[2]) });
        }
      } else if (k === 'side') {
        const t = v!.split('#')[0]!.trim().split(/\s+/);
        if (t.length !== 7 && t.length !== 8) fail(`bad side line '${line}'`);
        L.sides.push({ c: Number(t[0]), r: Number(t[1]), side: t[2]!, exitL: [Number(t[3]), Number(t[4])], exitR: [Number(t[5]), Number(t[6])], needs: t[7] });
      } else if (k === 'whirl') {
        section = 'whirl';
        L.whirls.push({ trigger: Number(v!.split('#')[0]!.trim()), wps: [], changes: [] });
      } else fail(`unknown key ${k}`);
      continue;
    }
    if (section === 'cells') L.rows.push(line);
    else if (section === 'controls') {
      const m = /^(\d+)\s+([OFH])\s+(\d+)\s+(\d+)$/.exec(line.trim());
      if (!m) fail(`bad control line '${line}'`);
      L.controls.push({ n: Number(m![1]), kind: m![2] as Control['kind'], c: Number(m![3]), r: Number(m![4]) });
    } else if (section === 'event') {
      const t = line.split('#')[0]!.trim().split(/\s+/);
      if (t[0] !== 'cell' || t.length !== 4) fail(`bad event line '${line}'`);
      L.events[L.events.length - 1]!.cells.push({ c: Number(t[1]), r: Number(t[2]), ch: t[3]! });
    } else if (section === 'whirl') {
      const w = L.whirls[L.whirls.length - 1]!;
      const t = line.split('#')[0]!.trim().split(/\s+/);
      if (t[0] === 'wp' && t.length === 6) w.wps.push({ c: Number(t[1]), r: Number(t[2]), s: Number(t[3]), v: Number(t[4]), wait: Number(t[5]) });
      else if (t[0] === 'change' && t.length === 5) w.changes.push({ wp: Number(t[1]), c: Number(t[2]), r: Number(t[3]), ch: t[4] });
      else if (t[0] === 'reveal' && t.length === 4) w.changes.push({ wp: Number(t[1]), c: Number(t[2]), r: Number(t[3]), reveal: true });
      else fail(`bad whirl line '${line}'`);
    } else fail(`unexpected line '${line}'`);
  }
  L.h = L.rows.length;
  L.w = L.rows[0]?.length ?? 0;
  if (!L.name) fail('no name');
  encode(L.name);
  if (L.w % 4 || L.h % 3 || L.w > MAX_W || L.h > MAX_H || !L.w) fail(`size ${L.w} x ${L.h}: must be whole screens (4 x 3 cells), at most ${MAX_W} x ${MAX_H}`);
  L.rows.forEach((r, y) => {
    if ([...r].length !== L.w) fail(`row ${y} has ${[...r].length} cells, expected ${L.w}`);
    [...r].forEach((ch, x) => {
      if (!CELL_BY_CH.has(ch)) fail(`unknown cell '${ch}' at ${x},${y}`);
      if (ch === 'S') {
        if (L.start[0] >= 0) fail('more than one S');
        L.start = [x, y];
      }
      if (ch === 'M') {
        if (L.goal[0] >= 0) fail('more than one M');
        L.goal = [x, y];
      }
    });
  });
  if (L.start[0] < 0 || L.goal[0] < 0) fail('needs one S and one M');
  if (!L.controls.length || L.controls.length > 8) fail('1-8 controls');
  L.controls.forEach((c, i) => {
    if (c.n !== i + 1) fail(`controls must be numbered 1, 2, … in order (found ${c.n})`);
    if (c.c >= L.w || c.r >= L.h) fail(`control ${c.n} outside the level`);
    if (CELLS[CELL_BY_CH.get(L.rows[c.r]![c.c]!)!]!.speed === 0) fail(`control ${c.n} on a blocking cell`);
  });
  for (const [c, r] of L.leaves) if (c >= L.w || r >= L.h) fail(`leaves outside the level at ${c},${r}`);
  if (L.objects.length > 16) fail('at most 16 objects');
  if (L.events.length > 8) fail('at most 8 events');
  L.events.forEach((e, k) => {
    if (e.trigger > L.controls.length) fail(`event ${k + 1}: no control ${e.trigger}`);
    if (e.kind !== 'FLOOD' && e.warn < EVENT_WARN_MIN) fail(`event ${k + 1}: a ${e.kind} warns at least ${EVENT_WARN_MIN} frames`);
    if (e.warn > e.at || !e.cells.length || e.cells.length > 16) fail(`event ${k + 1}: warning <= time, 1-16 cells`);
    for (const c of e.cells) if (c.c >= L.w || c.r >= L.h || !CELL_BY_CH.has(c.ch)) fail(`event ${k + 1}: bad cell ${c.c},${c.r} ${c.ch}`);
  });
  const book = readBook().map((e) => e.name);
  for (const o of L.objects) {
    if (o.c >= L.w || o.r >= L.h) fail(`${o.kind} outside the level`);
    const ch = L.rows[o.r]![o.c]!;
    if (CELLS[CELL_BY_CH.get(ch)!]!.speed === 0) fail(`${o.kind} at ${o.c},${o.r} on a blocking cell`);
    if (o.kind === 'item' && !(o.name! in POWERUPS)) fail(`item: one of ${Object.keys(POWERUPS).join(' ')}`);
    if (o.kind === 'entry' && !book.includes(o.name!)) fail(`entry: ${o.name} is not in NATURBOK.md`);
    if (o.kind === 'build') {
      if (ch !== 'B') fail(`build at ${o.c},${o.r}: the site must be a B cell`);
      if (!CELL_BY_CH.has(o.ch!) || o.tc! >= L.w || o.tr! >= L.h) fail('build: bad target');
    }
  }
  for (const s of L.sides) {
    const ids = sideIds();
    if (!ids.includes(s.side)) fail(`side: no levels/${s.side}.side`);
    for (const [c, r] of [s.exitL, s.exitR, [s.c, s.r]] as const) if (c >= L.w || r >= L.h) fail(`side ${s.side}: cell ${c},${r} outside the level`);
    for (const [c, r] of [s.exitL, s.exitR]) if (CELLS[CELL_BY_CH.get(L.rows[r]![c]!)!]!.speed === 0) fail(`side ${s.side}: exit ${c},${r} is a blocking cell`);
  }
  L.whirls.forEach((w, k) => {
    const where = `whirl ${k + 1}`;
    if (!L.controls[w.trigger - 1]) fail(`${where}: no control ${w.trigger}`);
    if (w.wps.length < 2) fail(`${where}: needs two waypoints`);
    for (const p of w.wps) {
      if (p.c >= L.w || p.r >= L.h) fail(`${where}: waypoint outside the level`);
      if (p.s < 1 || p.s > 5 || p.v < 4 || p.v > 32 || p.wait < 0) fail(`${where}: strength 1-5, speed 4-32, wait >= 0`);
    }
    const legs = whirlLegs(w);
    legs.forEach((g, i) => {
      if (i + 1 < legs.length && legs[i + 1]!.dir !== g.dir && g.n + w.wps[i + 1]!.wait < TURN_FRAMES)
        fail(`${where}: leg ${i + 1} and the wait after it last ${g.n + w.wps[i + 1]!.wait} frames: the wind needs ${TURN_FRAMES} to turn before the whirlwind does`);
    });
    for (const ch of w.changes) {
      const p = w.wps[ch.wp];
      if (!p) fail(`${where}: change at waypoint ${ch.wp}, which does not exist`);
      const d = Math.hypot((ch.c - p!.c) * 32, (ch.r - p!.r) * 32);
      if (d > radius(p!.s)) fail(`${where}: the change at ${ch.c},${ch.r} is ${d.toFixed(0)} px from waypoint ${ch.wp}, outside its radius ${radius(p!.s)}`);
      if (ch.ch && !CELL_BY_CH.has(ch.ch)) fail(`${where}: unknown cell '${ch.ch}'`);
    }
  });
  return L;
}

export interface Leg { n: number; dir: number; q: [number, number]; rem: [number, number]; sign: [number, number] }
/** the legs between waypoints, as the engine steps them: n frames; per frame q (1/16 px) plus one more 1/16 px
 * whenever the remainder adds up (exact at the end), so no frame moves more than the speed */
export function whirlLegs(w: Whirl): Leg[] {
  const legs: Leg[] = [];
  for (let i = 0; i + 1 < w.wps.length; i++) {
    const a = w.wps[i]!;
    const b = w.wps[i + 1]!;
    const D = [(b.c - a.c) * 32 * 16, (b.r - a.r) * 32 * 16];
    const sign: [number, number] = [D[0]! < 0 ? -1 : 1, D[1]! < 0 ? -1 : 1];
    const dir = (Math.round((Math.atan2(-D[1]!, D[0]!) * 8) / Math.PI) + 16) % 16;
    for (let n = Math.max(1, Math.ceil(Math.hypot(D[0]!, D[1]!) / a.v)); ; n++) {
      const q: [number, number] = [Math.floor(Math.abs(D[0]!) / n), Math.floor(Math.abs(D[1]!) / n)];
      const rem: [number, number] = [Math.abs(D[0]!) % n, Math.abs(D[1]!) % n];
      let ok = true;
      const e = [0, 0];
      for (let f = 0; f < n && ok; f++) {
        const st = [0, 1].map((k) => {
          e[k]! += rem[k]!;
          if (e[k]! >= n) {
            e[k]! -= n;
            return q[k]! + 1;
          }
          return q[k]!;
        });
        ok = Math.hypot(st[0]!, st[1]!) <= a.v + 1e-9; // a leg goes at the speed of the waypoint it leaves
      }
      if (ok) {
        legs.push({ n, dir, q, rem, sign });
        break;
      }
    }
  }
  return legs;
}

/** side-view level ids, in table order */
export function sideIds(): string[] {
  return readdirSync(LEVEL_DIR).filter((f) => f.endsWith('.side')).map((f) => f.slice(0, -5)).sort();
}

export function parseSide(id: string, text = readFileSync(join(LEVEL_DIR, `${id}.side`), 'utf8')): Side {
  const S: Side = { id, name: '', wind: 0, right: 'Ö', sky: 13, start: [1, 1], rows: [], w: 0 };
  const fail = (m: string): never => {
    throw new Error(`${id}.side: ${m}`);
  };
  let cells = false;
  for (const raw of text.split(/\r?\n/)) {
    if (cells) {
      if (raw.trim() === '' && S.rows.length >= SIDE_ROWS) continue;
      S.rows.push(raw.replace(/\r$/, ''));
      continue;
    }
    const line = raw.split('#')[0]!.trim();
    if (!line) continue;
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (!kv) fail(`unexpected line '${line}'`);
    const [, k, v] = kv!;
    if (k === 'name') S.name = v!;
    else if (k === 'wind') S.wind = Number(v);
    else if (k === 'right') S.right = v!;
    else if (k === 'sky') S.sky = Number(v);
    else if (k === 'start') S.start = v!.split(/\s+/).map(Number) as [number, number];
    else if (k === 'cells') cells = true;
    else fail(`unknown key ${k}`);
  }
  while (S.rows.length > SIDE_ROWS && S.rows[S.rows.length - 1]!.trim() === '') S.rows.pop();
  S.w = Math.max(...S.rows.map((r) => r.length));
  S.rows = S.rows.map((r) => r.padEnd(S.w, ' '));
  if (S.rows.length !== SIDE_ROWS) fail(`${S.rows.length} rows, expected ${SIDE_ROWS}`);
  if (S.w % 16 || S.w < 32 || S.w > 96) fail(`width ${S.w}: 32-96 columns, whole screens of 16`);
  if (!(S.right in RIGHT_DIR)) fail(`right: one of ${Object.keys(RIGHT_DIR).join(' ')}`);
  if (Math.abs(S.wind) > 16) fail('wind -16..16');
  S.rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== ' ' && !SIDE_INDEX.has(ch) && fail(`unknown tile '${ch}' at ${x},${y}`)));
  return S;
}

/** the whirlwinds of a level (DESIGN §6): records of 8 bytes (trigger control index, waypoints, changes, the two
 * lists), waypoints of 20 bytes (x, y in 1/16 px; strength, direction of the leg leaving it (255 = last); wait;
 * the leg's frames, q x/y, remainder x/y, sign x/y), changes of 4 bytes (waypoint, new cell byte, cell index) */
function whirlAsm(L: Level, n: string): string[] {
  const out = [`whirls_${n}:`];
  const bytes = cellBytes(L);
  L.whirls.forEach((w, k) => out.push(`    .byte ${w.trigger - 1}, ${w.wps.length}, ${w.changes.length}, 0`, `    .word wps_${n}_${k}, chg_${n}_${k}`));
  L.whirls.forEach((w, k) => {
    const legs = whirlLegs(w);
    out.push(`wps_${n}_${k}:`);
    w.wps.forEach((p, i) => {
      const g = legs[i];
      out.push(
        `    .word ${(p.c * 32 + 16) * 16}, ${(p.r * 32 + 16) * 16}`,
        `    .byte ${p.s}, ${g ? g.dir : 255}`,
        `    .word ${p.wait}, ${g ? g.n : 0}, ${g ? g.q[0] * g.sign[0] : 0}, ${g ? g.q[1] * g.sign[1] : 0}, ${g ? g.rem[0] : 0}, ${g ? g.rem[1] : 0}`,
        `    .byte ${g ? g.sign[0] : 1}, ${g ? g.sign[1] : 1}`,
      );
    });
    out.push(`chg_${n}_${k}:`);
    for (const ch of w.changes) {
      const i = ch.r * L.w + ch.c;
      bytes[i] = ch.reveal ? bytes[i]! & ~0x40 : CELL_BY_CH.get(ch.ch!)! | (bytes[i]! & 0xc0);
      out.push(`    .byte ${ch.wp}, ${bytes[i]}`, `    .word ${i}`);
    }
  });
  return out;
}

/** the cell bytes of a level, row-major (DESIGN §4.1) */
export function cellBytes(L: Level): number[] {
  const out: number[] = [];
  L.rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const k = CELL_BY_CH.get(ch)!;
      const variant = CELLS[k]!.varies && ((c * 7 + r * 3) >> 1) & 1 ? 0x20 : 0;
      const leaves = L.leaves.some(([lc, lr]) => lc === c && lr === r) ? 0x40 : 0;
      const ctrl = L.controls.some((x) => x.c === c && x.r === r) ? 0x80 : 0;
      out.push(k | variant | leaves | ctrl);
    }),
  );
  return out;
}

export function generateLevels(): { asm: string; levels: Level[] } {
  const levels = levelIds().map((id) => parseLevel(id));
  const lab = (id: string) => id.replace(/-/g, '_');
  const out = [
    '; GENERATED by games/sixten/tools/levels.ts from levels/*.map — do not edit.',
    `LEVEL_COUNT = ${levels.length}`,
    'LV_REC = 32',
    'EV_REC = 10',
    `EVENT_WARN_MIN = ${EVENT_WARN_MIN}`,
    'OBJ_REC = 6',
    `WOOD_PER_TREE = ${WOOD_PER_TREE}`,
    `WOOD_PER_BUILD = ${WOOD_PER_BUILD}`,
    `SIDE_COUNT = ${sideIds().length}`,
    `SIDE_ROWS = ${SIDE_ROWS}`,
    'WP_REC = 20',
    `WARN_FRAMES = ${WARN_FRAMES}`,
    `STEP_FRAMES = ${STEP_FRAMES}`,
    `TURN_FRAMES = ${TURN_FRAMES}`,
    ...levels.map((L, i) => `LEVEL_${lab(L.id).toUpperCase()} = ${i}`),
    '',
    '.data',
    '; per level: far address of the packed cell map (hi, lo), width, height, start column/row, goal column/row,',
    '; control count, world, name, controls (column, row, kind: 0 obligatory, 1 optional, 2 hidden), whirlwinds, count',
    'level_table:',
  ];
  for (const L of levels) {
    const n = lab(L.id);
    out.push(
      `    .word cells_${n} >> 16, cells_${n} & 0xFFFF`,
      `    .byte ${L.w}, ${L.h}, ${L.start[0]}, ${L.start[1]}, ${L.goal[0]}, ${L.goal[1]}, ${L.controls.length}, ${L.world}`,
      `    .word name_${n}, ctrls_${n}`,
      `    .word whirls_${n}`,
      `    .byte ${L.whirls.length}, 0`,
      `    .word links_${n}`,
      `    .byte ${L.sides.length}, 0`,
      `    .word objs_${n}`,
      `    .byte ${L.objects.length}, 0`,
      `    .word events_${n}`,
      `    .byte ${L.events.length}, 0`,
    );
  }
  for (const L of levels) {
    const n = lab(L.id);
    out.push(`name_${n}: .byte ${[...encode(L.name), 255].join(', ')}   ; ${L.name}`);
    out.push(`ctrls_${n}: .byte ${L.controls.map((c) => `${c.c}, ${c.r}, ${CONTROL_KINDS[c.kind]}`).join(', ')}`);
    out.push(...whirlAsm(L, n));
    // side links (8 B): cell, side view, exit at its left edge (cell), exit at its right edge (cell)
    // objects (6 B): kind (1 power-up, 2 nature-book entry, 3 building site), column, row, argument (the power-up, the
    // entry's index, the built cell's new byte), the built cell (index)
    out.push(`objs_${n}:`);
    const book = readBook().map((e) => e.name);
    const bytes = cellBytes(L);
    for (const o of L.objects) {
      const arg = o.kind === 'item' ? POWERUPS[o.name as keyof typeof POWERUPS] : o.kind === 'entry' ? book.indexOf(o.name!) : CELL_BY_CH.get(o.ch!)! | (bytes[o.tr! * L.w + o.tc!]! & 0xc0);
      const target = o.kind === 'build' ? o.tr! * L.w + o.tc! : 0;
      out.push(`    .byte ${{ item: 1, entry: 2, build: 3 }[o.kind]}, ${o.c}, ${o.r}, ${arg}`, `    .word ${target}`);
    }
    // events (EV_REC B): trigger (control index + 1, 0 = the start), kind (1 FALL, 2 SLIDE, 3 FLOOD), cell count,
    // when (frames after the trigger), warning (frames before), the cells (4 B: index, new byte)
    out.push(`events_${n}:`);
    L.events.forEach((e, k) => out.push(`    .byte ${e.trigger}, ${EVENT_KINDS[e.kind]}, ${e.cells.length}, 0`, `    .word ${e.at}, ${e.warn}, evcells_${n}_${k}`));
    L.events.forEach((e, k) => {
      out.push(`evcells_${n}_${k}:`);
      for (const c of e.cells) {
        const i = c.r * L.w + c.c;
        out.push(`    .word ${i}`, `    .byte ${CELL_BY_CH.get(c.ch)! | (bytes[i]! & 0xc0)}, 0`);
      }
    });
    out.push(`links_${n}:`);
    for (const s of L.sides)
      out.push(`    .word ${s.r * L.w + s.c}`, `    .byte ${sideIds().indexOf(s.side)}, ${s.needs ? CELL_BY_CH.get(s.needs)! + 1 : 0}`, `    .word ${s.exitL[1] * L.w + s.exitL[0]}, ${s.exitR[1] * L.w + s.exitR[0]}`);
  }
  // side views (16 B): far address of the packed tiles (column-major, SIDE_ROWS a column), columns, sky, the
  // compass direction of the right edge (16ths of a turn), wind (1/16 px per frame), start x, y (feet, 1/16 px)
  const sides = sideIds().map((id) => parseSide(id));
  out.push('side_table:');
  for (const S of sides) {
    const n = S.id.replace(/-/g, '_');
    out.push(
      `    .word side_${n} >> 16, side_${n} & 0xFFFF`,
      `    .byte ${S.w}, ${S.sky}, ${RIGHT_DIR[S.right]}, 0`,
      `    .word ${S.wind}, ${(S.start[0] * 8 + 4) * 16}, ${(S.start[1] + 1) * 8 * 16}, 0`,
    );
  }
  out.push('', '.xdata');
  for (const S of sides) {
    out.push(`side_${S.id.replace(/-/g, '_')}:`, '.pack');
    for (let c = 0; c < S.w; c++) out.push(`    .byte ${S.rows.map((r) => (r[c] === ' ' ? 0 : SIDE_INDEX.get(r[c]!)!)).join(', ')}   ; column ${c}`);
    out.push('.endpack');
  }
  for (const L of levels) {
    const bytes = cellBytes(L);
    out.push(`cells_${lab(L.id)}:`, '.pack');
    for (let r = 0; r < L.h; r++) out.push(`    .byte ${bytes.slice(r * L.w, r * L.w + L.w).join(', ')}   ; ${L.rows[r]}`);
    out.push('.endpack');
  }
  return { asm: out.join('\n') + '\n', levels };
}

/** Preview: the level top-down (1 px = 1 px, screen borders dotted), and beside it the map colours (8 px a cell). */
export function previewPng(L: Level): Buffer {
  const W = L.w * 32;
  const H = L.h * 32;
  const width = W + 8 + L.w * 8;
  const png = new PNG({ width, height: H });
  const put = (x: number, y: number, c: number) => {
    const rgb = PALETTE[c]!;
    const i = (y * width + x) * 4;
    png.data[i] = rgb >> 16;
    png.data[i + 1] = (rgb >> 8) & 255;
    png.data[i + 2] = rgb & 255;
    png.data[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < width; x++) put(x, y, 0);
  const bytes = cellBytes(L);
  bytes.forEach((b, i) => {
    const c = i % L.w;
    const r = Math.floor(i / L.w);
    const pat = patternBytes(CELLS[b & 31]!.pattern);
    for (let ty = 0; ty < 4; ty++)
      for (let tx = 0; tx < 4; tx++) {
        let t = pat[(b & 0x20 ? ty ^ 2 : ty) * 4 + tx]!;
        if (b & 0x40 && tx === 1 && ty === 1) t = 0;
        const px = tilePixels(t);
        for (let p = 0; p < 64; p++) put(c * 32 + tx * 8 + (p % 8), r * 32 + ty * 8 + (p >> 3), px[p] || 11);
      }
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) put(W + 8 + c * 8 + x, r * 8 + y, CELLS[b & 31]!.fill);
    if (b & 0x80) for (let k = 0; k < 6; k++) put(c * 32 + 13 + (k % 3), r * 32 + 13 + Math.floor(k / 3), 6);
  });
  for (let x = 0; x < W; x += 2) for (let r = 0; r < L.h; r += 3) put(x, r * 32, 15);
  for (let y = 0; y < H; y += 2) for (let c = 0; c < L.w; c += 4) put(c * 32, y, 15);
  return PNG.sync.write(png);
}

if (isMain(import.meta.url)) {
  const { asm, levels } = generateLevels();
  writeFileSync(join(GAME_DIR, 'levels.gen.asm'), asm);
  for (const L of levels) writeFileSync(join(LEVEL_DIR, `${L.id}.png`), previewPng(L));
  console.log(`levels.gen.asm: ${levels.map((L) => `${L.id} ${L.w}x${L.h}`).join(', ')}`);
}
