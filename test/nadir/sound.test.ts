// PLAN.md M32 (sound, done before M31 as M32a on the human's request): DESIGN §8 against the VM's audio commands.
// An independent reader of art/music.txt and of DESIGN §8.1 and a model of §8.2-8.3 predict, frame by frame, every
// music note (channel, Hz, length, volume), every threat cue and which channels effects own; the effects
// themselves come from the game's events, so the model takes them from the stream and checks their definition and
// priority. Every effect and track is heard; effects interrupt the music on their channel and it resumes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VM, type AudioCommand } from '@qrc/vm';
import { GAME_DIR, K } from './ref';
import { REPLAYS, buildNadir, runReplay, type Nadir } from './play';

const design = readFileSync(join(GAME_DIR, 'DESIGN.md'), 'utf8');
const s16 = (v: number) => (v << 16) >> 16;

// ---- DESIGN §8.1: the effects
interface Fx {
  name: string;
  ch: number;
  hz: number;
  frames: number;
  vol: number;
  sweep: number;
  prio: number;
}
const FX: Fx[] = [...design.slice(design.indexOf('### 8.1'), design.indexOf('### 8.2')).matchAll(/^\| ([A-Z]+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (-?\d+) \| (\d+) \|/gm)].map((m) => ({
  name: m[1]!,
  ch: +m[2]!,
  hz: +m[3]!,
  frames: +m[4]!,
  vol: +m[5]!,
  sweep: +m[6]!,
  prio: +m[7]!,
}));
const fxOf = (a: AudioCommand) => FX.find((e) => e.ch === a.channel && e.hz === a.freq && e.frames === a.duration && e.vol === a.volume && e.sweep === a.sweep);

// ---- art/music.txt (its header is the grammar)
interface Note {
  hz: number;
  step: number;
  len: number; // the SOUND length
  vol: number;
}
interface Track {
  next: string | null;
  voices: Note[][];
}
const TRACKS = ['NONE', 'START', 'DRONE', 'FIGHT', 'DEATH', 'VICTORY'];
function readScore(): Map<string, Track> {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const DR: Record<string, [number, number]> = { K: [90, 3], S: [1500, 4], H: [6000, 1], R: [60, 0] };
  const pats = new Map<string, string[]>();
  const out = new Map<string, Track>();
  let cur: (Track & { tempo: number; pos: number[] }) | null = null;
  const flat = (toks: string[]): string[] => {
    const r: string[] = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]!;
      if (t.startsWith('$')) r.push(...pats.get(t.slice(1))!);
      else if (t.startsWith('(')) {
        const body: string[] = [t.slice(1)];
        while (!/\)x\d+$/.test(body[body.length - 1]!)) body.push(toks[++i]!);
        const last = body.pop()!;
        const n = Number(/x(\d+)$/.exec(last)![1]);
        const lastTok = last.replace(/\)x\d+$/, '');
        if (lastTok) body.push(lastTok);
        const f = flat(body.filter(Boolean));
        for (let k = 0; k < n; k++) r.push(...f);
      } else r.push(t);
    }
    return r;
  };
  for (const raw of readFileSync(join(GAME_DIR, 'art', 'music.txt'), 'utf8').split('\n')) {
    const line = raw.replace(/(^|\s)#(\s.*)?$/, '').trim();
    if (!line) continue;
    let m = /^pat (\w+):\s*(.*)$/.exec(line);
    if (m) {
      pats.set(m[1]!, flat(m[2]!.split(/\s+/)));
      continue;
    }
    m = /^track (\w+) tempo (\d+)(?: next (\w+))?$/.exec(line);
    if (m) {
      cur = { next: m[3] ?? null, voices: [[], [], []], tempo: +m[2]!, pos: [0, 0, 0] };
      out.set(m[1]!, cur);
      continue;
    }
    m = /^v(\d) vol (\d+)(?: pm (\d+))?(?: acc (\d+))?:\s*(.*)$/.exec(line)!;
    const v = +m[1]!;
    const vol = +m[2]!;
    const pm = m[3] ? +m[3] : vol;
    const acc = m[4] ? +m[4] : vol;
    const c = cur!;
    for (const tok of flat(m[5]!.split(/\s+/))) {
      const t = /^([^/'>]+)(?:\/(\d+))?(['>])?$/.exec(tok)!;
      const n16 = t[2] ? +t[2] : 1;
      const step = Math.floor(((c.pos[v]! + n16) * 3600) / (4 * c.tempo)) - Math.floor((c.pos[v]! * 3600) / (4 * c.tempo));
      c.pos[v]! += n16;
      const vv = t[3] === "'" ? pm : t[3] === '>' ? acc : vol;
      const name = t[1]!;
      if (name === '-') c.voices[v]!.push({ hz: 0, step, len: 0, vol: 0 });
      else if (DR[name]) c.voices[v]!.push({ hz: DR[name]![0], step, len: DR[name]![1] || step, vol: vv });
      else {
        const nm = /^([A-G]#?)(\d)$/.exec(name)!;
        const midi = NAMES.indexOf(nm[1]!) + 12 * (+nm[2]! + 1);
        c.voices[v]!.push({ hz: Math.round(440 * 2 ** ((midi - 69) / 12)), step, len: t[3] === "'" && step > 2 ? 2 : step, vol: vv });
      }
    }
  }
  return out;
}
const SCORE = readScore();

// ---- the model of DESIGN §8.2-8.3
class Model {
  busy = [0, 0, 0];
  prio = [0, 0, 0];
  cur = 'NONE';
  calm = 0;
  thr = 0;
  /** per voice: index of its next note (-1 = silent) and frames left */
  idx = [-1, -1, -1];
  t = [0, 0, 0];
  setMusic(name: string) {
    if (name === this.cur) return;
    this.cur = name;
    this.idx = name === 'NONE' ? [-1, -1, -1] : [0, 0, 0];
    this.t = [0, 0, 0];
  }
  reset() {
    this.busy = [0, 0, 0];
    this.prio = [0, 0, 0];
    this.thr = 0;
    this.calm = 0;
    this.setMusic('START');
  }
  /** an effect the stream played: it must be allowed (DESIGN §8.1) */
  effect(e: Fx, where: string) {
    expect(this.busy[e.ch] === 0 || e.prio >= this.prio[e.ch]!, `${where}: ${e.name} over a higher effect on channel ${e.ch}`).toBe(true);
    this.busy[e.ch] = e.frames;
    this.prio[e.ch] = e.prio;
  }
  /** music_step: returns whether a threat cue is attempted, then (via `voices`) the notes */
  select(dead: boolean, awake: number) {
    if (dead) return;
    if (!['START', 'DRONE', 'FIGHT'].includes(this.cur)) return;
    if (awake > 0) {
      this.calm = K.MUS_CALM!;
      this.setMusic('FIGHT');
    } else if (this.cur === 'FIGHT' && --this.calm === 0) this.setMusic('DRONE');
  }
  threat(dead: boolean, awake: number, gap: () => number): boolean {
    if (dead || awake === 0) {
      this.thr = 0;
      return false;
    }
    if (this.thr > 0 && --this.thr > 0) return false;
    this.thr = gap();
    return true;
  }
  voices(): AudioCommand[] {
    const out: AudioCommand[] = [];
    for (let v = 0; v < 3; v++) {
      if (this.idx[v]! < 0) continue;
      if (this.t[v] === 0) {
        const tr = SCORE.get(this.cur)!;
        if (this.idx[v]! >= tr.voices[v]!.length) {
          if (!tr.next) this.idx[v] = 0;
          else if (v > 0) {
            this.idx[v] = -1;
            continue;
          } else {
            this.setMusic(tr.next);
            out.length = 0;
            v = -1;
            continue;
          }
        }
        const n = tr.voices[v]![this.idx[v]!]!;
        this.idx[v]!++;
        this.t[v] = n.step;
        if (n.hz && this.busy[v] === 0) out.push({ channel: v, freq: n.hz, duration: n.len, volume: n.vol, sweep: 0 });
      }
      this.t[v]!--;
    }
    return out;
  }
  tickChannels() {
    for (let k = 0; k < 3; k++) if (this.busy[k]! > 0) this.busy[k]!--;
  }
}

function octnorm(dx: number, dy: number) {
  const a = Math.abs(dx);
  const b = Math.abs(dy);
  return Math.max(a, b) + (Math.min(a, b) >> 1);
}

interface Seen {
  effects: Set<string>;
  tracks: Set<string>;
  cues: number;
  interrupted: number;
  notes: number;
}

/** Runs a replay against the model; every frame's stream must match it. */
function check(n: Nadir, name: string): Seen {
  const m = new Model();
  m.reset(); // init runs game_reset
  const seen: Seen = { effects: new Set(), tracks: new Set(), cues: 0, interrupted: 0, notes: 0 };
  let prevDead = 0;
  let prevRestarts = 0;
  const lastMusic = [-1, -1, -1];
  const pendingResume: { ch: number; since: number; until: number }[] = [];
  runReplay(n, name, (f, vm) => {
    const where = `${name} frame ${f + 1}`;
    const audio = vm.audio;
    const dead = vm.read16(n.S('dead'));
    const restarts = vm.read16(n.S('restarts'));
    if (restarts !== prevRestarts) m.reset();
    prevRestarts = restarts;
    const fx = audio.filter((a) => a.sweep !== 0);
    const music = audio.filter((a) => a.sweep === 0);
    // effects of the logic, then the death's track change, then music_step
    const enemies = Array.from({ length: n.S('NUM_ENEMIES') }, (_, i) => {
      const b = n.S('enemies') + 24 * i;
      return { x: vm.read16(b), y: vm.read16(b + 2), st: vm.read8(b + 4) };
    });
    const awake = enemies.filter((e) => e.st !== 0 && e.st !== 7).length;
    const logicFx = fx.filter((a) => fxOf(a)?.name !== 'THREAT');
    for (const a of logicFx) {
      const e = fxOf(a);
      expect(e, `${where}: ${JSON.stringify(a)} is no effect of DESIGN §8.1`).toBeDefined();
      for (const p of pendingResume) if (p.ch === e!.ch) p.until = Math.max(p.until, f + e!.frames);
      if (m.busy[e!.ch] === 0 && lastMusic[e!.ch]! >= f - 30) pendingResume.push({ ch: e!.ch, since: f, until: f + e!.frames });
      m.effect(e!, where);
      seen.effects.add(e!.name);
    }
    if (dead && !prevDead) m.setMusic('DEATH');
    prevDead = dead;
    m.select(dead > 0, awake);
    const cx = vm.read16(n.S('cam_x'));
    const cy = vm.read16(n.S('cam_y'));
    const gap = () => {
      const d = Math.min(...enemies.filter((e) => e.st !== 0 && e.st !== 7).map((e) => octnorm(s16(cx - e.x), s16(cy - e.y))));
      return Math.min(K.THREAT_MAX!, K.THREAT_MIN! + K.THREAT_K! * (d >> 8));
    };
    const cue = m.threat(dead > 0, awake, gap);
    const heard = fx.filter((a) => fxOf(a)?.name === 'THREAT').length;
    const T = FX.find((e) => e.name === 'THREAT')!;
    const audible = cue && (m.busy[T.ch] === 0 || T.prio >= m.prio[T.ch]!);
    expect(heard, `${where}: threat cue (thr ${m.thr}, awake ${awake})`).toBe(audible ? 1 : 0);
    if (audible) {
      m.effect(T, where);
      seen.cues++;
      seen.effects.add('THREAT');
    }
    const want = m.voices();
    expect(music, `${where}: the music (${m.cur})`).toEqual(want);
    seen.tracks.add(m.cur);
    for (const a of music) {
      lastMusic[a.channel] = f;
      seen.notes++;
      const i = pendingResume.findIndex((p) => p.ch === a.channel && f >= p.until);
      if (i >= 0) {
        seen.interrupted++;
        pendingResume.splice(i, 1);
      }
    }
    m.tickChannels();
  });
  return seen;
}

describe('M32a sound (DESIGN §8)', () => {
  const all: Seen[] = [];
  for (const name of REPLAYS)
    it(`${name}: every music note, threat cue and effect follows DESIGN §8 and art/music.txt in every frame`, async () => {
      const n = await buildNadir();
      const s = check(n, name);
      all.push(s);
      console.log(`[sound] ${name}: ${s.notes} notes, ${s.cues} threat cues, ${s.effects.size} effects, tracks ${[...s.tracks].join(' ')}, ${s.interrupted} effects interrupted the music and it resumed`);
      expect(s.notes).toBeGreaterThan(100);
    });

  it('every effect of DESIGN §8.1 and the tracks START, DRONE, FIGHT, DEATH are heard in the replays; effects interrupt the music and it resumes', () => {
    const fx = new Set(all.flatMap((s) => [...s.effects]));
    const tracks = new Set(all.flatMap((s) => [...s.tracks]));
    expect(all.length).toBe(REPLAYS.length);
    expect(FX.filter((e) => !fx.has(e.name)).map((e) => e.name).join(' '), 'effects never heard').toBe('');
    for (const t of ['START', 'DRONE', 'FIGHT', 'DEATH']) expect(tracks.has(t), `${t} heard`).toBe(true);
    expect(all.reduce((a, s) => a + s.interrupted, 0)).toBeGreaterThan(50);
    expect(all.reduce((a, s) => a + s.cues, 0)).toBeGreaterThan(50);
  });

  it('VICTORY (played from M31): its notes follow art/music.txt, then silence', async () => {
    const n = await buildNadir();
    const vm = VM.fromCartridge(n.cart, { seed: 1 });
    vm.step(0);
    const id = TRACKS.indexOf('VICTORY');
    vm.write16(n.S('mus_cur'), id);
    for (let v = 0; v < 3; v++) {
      vm.write16(n.S('v_off') + 2 * v, vm.read16(n.S('mus_tracks') + 8 * id + 2 * v));
      vm.write16(n.S('v_t') + 2 * v, 0);
      vm.write16(n.S('snd_busy') + 2 * v, 0);
    }
    const m = new Model();
    m.setMusic('VICTORY');
    let notes = 0;
    for (let f = 0; f < 400; f++) {
      vm.step(0);
      const music = vm.audio.filter((a) => a.sweep === 0);
      const want = m.voices();
      expect(music, `frame ${f + 1}`).toEqual(want);
      notes += music.length;
    }
    expect(notes).toBe(SCORE.get('VICTORY')!.voices.flat().filter((x) => x.hz).length);
    expect(m.cur).toBe('NONE');
  });
});
