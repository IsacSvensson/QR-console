// NADIR - sound (DESIGN.md §8): art/music.txt and the effect table of §8.1 -> music.gen.asm. The effects become
// `.sfx` definitions plus a table of (channel, frames, priority); the tracks' notes go to xdata as 4-byte records
// (Hz word, step in frames, klang << 4 | volume), each voice ended by a marker (step 0; Hz 0 = again, 1 = stop,
// 2 = the track's successor), and a ROM table gives per track its three voices' xdata offsets and its successor.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR, byteLines, wordLines } from './util';

/** Track ids in DESIGN §8.2's order. */
export const TRACKS = ['NONE', 'START', 'DRONE', 'FIGHT', 'DEATH', 'VICTORY'] as const;
export const MARK_AGAIN = 0;
export const MARK_STOP = 1;
export const MARK_NEXT = 2;
/** Drums on the noise channel: Hz and klang (0 = the whole step). */
const DRUMS: Record<string, { hz: number; klang: number }> = { K: { hz: 90, klang: 3 }, S: { hz: 1500, klang: 4 }, H: { hz: 6000, klang: 1 }, R: { hz: 60, klang: 0 } };
const PM_KLANG = 2;
const STEPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface Note {
  hz: number;
  step: number;
  klang: number;
  vol: number;
}
export interface Track {
  name: string;
  tempo: number;
  next: string | null;
  voices: Note[][];
}
export interface Effect {
  name: string;
  ch: number;
  hz: number;
  frames: number;
  vol: number;
  sweep: number;
  prio: number;
}

export function noteHz(name: string): number {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) throw new Error(`music: bad note ${name}`);
  const n = STEPS.indexOf(m[1]!) + 12 * (Number(m[2]) + 1); // MIDI number
  return Math.round(440 * 2 ** ((n - 69) / 12));
}

/** DESIGN §8.1: the effect table, in its order (= the sfx ids). */
export function readEffects(): Effect[] {
  const design = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');
  const a = design.indexOf('### 8.1');
  const b = design.indexOf('### 8.2');
  const out: Effect[] = [];
  for (const m of design.slice(a, b).matchAll(/^\| ([A-Z]+) \| (\d) \| (\d+) \| (\d+) \| (\d+) \| (-?\d+) \| (\d) \|/gm))
    out.push({ name: m[1]!, ch: +m[2]!, hz: +m[3]!, frames: +m[4]!, vol: +m[5]!, sweep: +m[6]!, prio: +m[7]! });
  if (out.length < 20) throw new Error('DESIGN.md §8.1: effect table not found');
  return out;
}

/** art/music.txt -> the tracks by name. */
export function readMusic(file = join(GAME_DIR, 'art', 'music.txt')): Map<string, Track> {
  const pats = new Map<string, string[]>();
  const tracks = new Map<string, Track>();
  let cur: Track | null = null;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  // expands $names and ( ... )xN into a flat token list
  const expand = (src: string[], where: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < src.length; i++) {
      const t = src[i]!;
      if (t.startsWith('$')) {
        const p = pats.get(t.slice(1));
        if (!p) throw new Error(`${where}: no pattern ${t}`);
        out.push(...p);
      } else if (t.startsWith('(')) {
        let depth = 0;
        let j = i;
        const inner: string[] = [];
        for (; j < src.length; j++) {
          const u = src[j]!;
          depth += [...u].filter((c) => c === '(').length;
          depth -= [...u].filter((c) => c === ')').length;
          inner.push(u);
          if (depth === 0) break;
        }
        const last = inner[inner.length - 1]!;
        const m = /\)x(\d+)$/.exec(last);
        if (!m) throw new Error(`${where}: a group ends with )xN`);
        inner[0] = inner[0]!.slice(1);
        inner[inner.length - 1] = last.slice(0, last.length - m[0].length);
        const body = expand(inner.filter((x) => x !== ''), where);
        for (let k = 0; k < Number(m[1]); k++) out.push(...body);
        i = j;
      } else out.push(t);
    }
    return out;
  };
  lines.forEach((raw, li) => {
    const where = `art/music.txt:${li + 1}`;
    const line = raw.replace(/(^|\s)#(\s.*)?$/, '').trim(); // a comment: '#' alone or before a space (A#3 is a note)
    if (!line) return;
    let m: RegExpExecArray | null;
    if ((m = /^pat (\w+):\s*(.*)$/.exec(line))) pats.set(m[1]!, expand(m[2]!.split(/\s+/), where));
    else if ((m = /^track (\w+) tempo (\d+)(?: next (\w+))?$/.exec(line))) {
      cur = { name: m[1]!, tempo: Number(m[2]), next: m[3] ?? null, voices: [[], [], []] };
      tracks.set(cur.name, cur);
    } else if ((m = /^v([012]) vol (\d+)(?: pm (\d+))?(?: acc (\d+))?:\s*(.*)$/.exec(line))) {
      if (!cur) throw new Error(`${where}: a voice outside a track`);
      const t: Track = cur;
      const v = Number(m[1]);
      const vol = Number(m[2]);
      const pm = m[3] ? Number(m[3]) : vol;
      const acc = m[4] ? Number(m[4]) : vol;
      const F = 3600 / (4 * t.tempo);
      let pos = t.voices[v]!.reduce((s, n) => s + (n as Note & { len16: number }).len16, 0);
      for (const tok of expand(m[5]!.split(/\s+/), where)) {
        const tm = /^(-|[KSHR]|[A-G]#?\d)(?:\/(\d+))?(['>])?$/.exec(tok);
        if (!tm) throw new Error(`${where}: bad token ${tok}`);
        const len16 = tm[2] ? Number(tm[2]) : 1;
        const step = Math.floor((pos + len16) * F) - Math.floor(pos * F);
        pos += len16;
        const mark = tm[3];
        const volN = mark === "'" ? pm : mark === '>' ? acc : vol;
        let n: Note;
        if (tm[1] === '-') n = { hz: 0, step, klang: 0, vol: 0 };
        else if (DRUMS[tm[1]!]) {
          if (v !== 2) throw new Error(`${where}: drums only in voice 2`);
          n = { hz: DRUMS[tm[1]!]!.hz, step, klang: DRUMS[tm[1]!]!.klang, vol: volN };
        } else n = { hz: noteHz(tm[1]!), step, klang: mark === "'" ? PM_KLANG : 0, vol: volN };
        if (n.klang >= step && n.klang) n.klang = 0;
        if (n.hz === 0 && step > 255) {
          // a long rest: several rests (each <= 255 frames)
          for (let r = step; r > 0; r -= 255) t.voices[v]!.push(Object.assign({ ...n, step: Math.min(255, r) }, { len16: r === step ? len16 : 0 }));
          continue;
        }
        if (step < 1 || step > 255 || n.vol > 15) throw new Error(`${where}: ${tok}: step ${step}, volume ${n.vol}`);
        t.voices[v]!.push(Object.assign(n, { len16 }));
      }
    } else throw new Error(`${where}: cannot read "${line}"`);
  });
  for (const t of tracks.values()) {
    const lens = t.voices.map((vs) => vs.reduce((s, n) => s + n.step, 0));
    if (!t.next && new Set(lens).size !== 1) throw new Error(`music: track ${t.name}: voices of ${lens.join(', ')} frames do not loop together`);
    if (t.next && !TRACKS.includes(t.next as (typeof TRACKS)[number])) throw new Error(`music: track ${t.name}: no track ${t.next}`);
  }
  for (const name of TRACKS.slice(1)) if (!tracks.has(name)) throw new Error(`music: no track ${name}`);
  return tracks;
}

export function musicAsm(): string {
  const fx = readEffects();
  const tracks = readMusic();
  const x: number[] = [];
  const offs: number[][] = [[0xffff, 0xffff, 0xffff, 0]];
  for (const name of TRACKS.slice(1)) {
    const t = tracks.get(name)!;
    const o: number[] = [];
    t.voices.forEach((vs, v) => {
      o.push(x.length);
      for (const n of vs) x.push(n.hz & 255, n.hz >> 8, n.step, (n.klang << 4) | n.vol);
      const mark = !t.next ? MARK_AGAIN : v === 0 ? MARK_NEXT : MARK_STOP;
      x.push(mark, 0, 0, 0);
    });
    o.push(t.next ? TRACKS.indexOf(t.next as (typeof TRACKS)[number]) : 0);
    offs.push(o);
  }
  const L: string[] = [
    '; GENERATED by games/nadir/tools/music.ts from DESIGN.md §8 and art/music.txt - do not edit.',
    ...TRACKS.map((t, i) => `MUS_${t} = ${i}`),
    `NUM_SFX = ${fx.length}`,
    '; the effects (DESIGN §8.1): the .sfx definitions in the table\'s order',
    ...fx.map((e) => `.sfx SFX_${e.name}, ${e.ch}, ${e.hz}, ${e.frames}, ${e.vol}, ${e.sweep}`),
    '.data',
    '; per effect: channel, frames, priority, 0',
    'sfx_meta:',
    ...fx.map((e) => `    .byte ${e.ch}, ${e.frames}, ${e.prio}, 0          ; ${e.name}`),
    '; per track: the xdata offsets (from mus_x) of voices 0, 1, 2 (0xFFFF: silent) and the successor track',
    'mus_tracks:',
    ...offs.map((o, i) => `${wordLines(o)[0]}          ; ${TRACKS[i]}`),
    '.xdata',
    '; the notes: Hz (word), step in frames, klang << 4 | volume; step 0 = a marker (Hz 0 again, 1 stop, 2 next)',
    'mus_x:',
    ...byteLines(x),
    '.code',
    '',
  ];
  return L.join('\n');
}
