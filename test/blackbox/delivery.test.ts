import { beforeAll, describe, expect, it } from 'vitest';
import { rng, testSeed } from '../helpers/rng';
import { referenceCode } from './content.test';
import { buildBlackbox, newVm, rooms, runReplay, symbol, type FrameView } from './oracle';

// M18 acceptance: access codes and music. PLAN.md Part 2.
let bb: Awaited<ReturnType<typeof buildBlackbox>>;
beforeAll(async () => {
  bb = await buildBlackbox();
});
const SEED = testSeed(1818);
const START = ['', '', '2.1', '3.1', '4.1', '5.1', '6.1', '7.1'];

function enterViaHook(code: string) {
  const vm = newVm(bb.cart, 1);
  const S = (n: string) => symbol(bb.sym, n);
  vm.step(0);
  for (let i = 0; i < 8; i++) vm.write8(S('code_text') + i, code.charCodeAt(i));
  vm.write16(S('dbg_code'), 1);
  vm.step(0);
  return { vm, S };
}

describe(`access codes (M18, seed ${SEED})`, () => {
  it('every section and 300 random states: the VM decodes the reference encoding and resumes with that state', () => {
    const r = rng(SEED);
    const states = [];
    for (let section = 2; section <= 7; section++) states.push({ section, done: 0, hit: 0, emp: 0, logs: 0, mira: 0, charges: section >= 4 ? 3 : 0 });
    for (let i = 0; i < 300; i++) {
      const done = Math.floor(r() * 256);
      states.push({ section: 2 + Math.floor(r() * 6), done, hit: done & Math.floor(r() * 256), emp: Math.floor(r() * 8), logs: Math.floor(r() * 8), mira: Math.floor(r() * 8), charges: Math.floor(r() * 5) });
    }
    const problems: string[] = [];
    for (const st of states) {
      const code = referenceCode(st);
      const { vm, S } = enterViaHook(code);
      const w = (n: string) => vm.read16(S(n));
      const got = { section: 0, done: w('pred_done'), hit: w('pred_hit'), emp: w('emp_uses'), logs: w('logs_read'), mira: w('mira_followed'), charges: w('charges') };
      const room = rooms[w('room')]!.id;
      if (w('code_ok') !== 1) problems.push(`${code} (${JSON.stringify(st)}) rejected`);
      else if (room !== START[st.section] || JSON.stringify({ ...got, section: st.section }) !== JSON.stringify(st)) problems.push(`${code}: resumed ${room} ${JSON.stringify(got)} != ${JSON.stringify(st)}`);
      if (vm.fault) problems.push(`fault ${vm.fault}`);
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it('resuming restores the flags of every earlier section (a section-7 code opens the core)', () => {
    const { vm, S } = enterViaHook(referenceCode({ section: 7, done: 0x3f, hit: 0x2f, emp: 2, logs: 3, mira: 4, charges: 2 }));
    const flag = (n: string) => (vm.read8(S('flags') + (S(`F_${n}`) >> 3)) >> (S(`F_${n}`) & 7)) & 1;
    for (const f of ['BADGE', 'L1', 'KEYNOTE', 'CARD', 'DIRDOOR', 'L3', 'EMP', 'SHUTTER', 'L4', 'LABCARD', 'L6', 'HALE', 'LIVE']) expect(flag(f), f).toBe(1);
    expect(flag('BOSS2')).toBe(0);
    expect(rooms[vm.read16(S('room'))]!.id).toBe('7.1');
  });

  it('a mistyped character is rejected (measured over every single-character change of 40 codes)', () => {
    const r = rng(SEED + 1);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let tried = 0;
    let rejected = 0;
    for (let i = 0; i < 40; i++) {
      const done = Math.floor(r() * 256);
      const code = referenceCode({ section: 2 + Math.floor(r() * 6), done, hit: done & Math.floor(r() * 256), emp: Math.floor(r() * 8), logs: Math.floor(r() * 8), mira: Math.floor(r() * 8), charges: Math.floor(r() * 5) });
      for (let pos = 0; pos < 8; pos += 3) {
        for (const ch of alphabet) {
          if (ch === code[pos]) continue;
          tried++;
          const bad = code.slice(0, pos) + ch + code.slice(pos + 1);
          const { vm, S } = enterViaHook(bad);
          if (vm.read16(S('code_ok')) === 0) rejected++;
        }
      }
    }
    console.log(`[codes] ${rejected}/${tried} single-character changes rejected (${((100 * rejected) / tried).toFixed(1)} %)`);
    expect(rejected / tried).toBeGreaterThan(0.95);
  });

  it('m18-resume: typing R1\'s section-6 code on the title screen resumes with exactly R1\'s ORACLE state at that moment', () => {
    // R1's state when the section-6 code was on screen
    let atCode: Record<string, number> | null = null;
    const snap = (v: FrameView) => Object.fromEntries(['pred_done', 'pred_hit', 'emp_uses', 'logs_read', 'mira_followed', 'charges', 'final_guess', 'pred_misses'].map((n) => [n, v.vm.read16(v.S(n))]));
    runReplay(bb, 'm17-obedient', (v) => {
      if (!atCode && v.room.id === '6.1' && v.mode === v.S('M_DIALOG')) atCode = snap(v);
    });
    let resumed: Record<string, number> | null = null;
    let usedCodeScreen = false;
    const r = runReplay(bb, 'm18-resume', (v) => {
      if (v.mode === v.S('M_CODE')) usedCodeScreen = true;
      if (!resumed && v.room.id === '6.1' && v.mode !== v.S('M_TITLE') && v.mode !== v.S('M_CODE')) resumed = snap(v);
    });
    expect(usedCodeScreen).toBe(true);
    expect(r.hashMismatch).toBe(-1);
    expect(atCode).not.toBeNull();
    expect(resumed).toEqual(atCode);
  });
});

// ---- music: a reference sequencer reading the note data straight from ROM ------------------------
describe('music (M18)', () => {
  it('every replay: each music note played is the one the note data schedules; effects mute their channel and the music resumes', () => {
    const rom = new Uint8Array(0x10000);
    rom.set(bb.cart.sections.code, 0);
    rom.set(bb.cart.sections.rodata, bb.cart.sections.code.length);
    const S = (n: string) => symbol(bb.sym, n);
    const w16 = (a: number) => rom[a]! | (rom[a + 1]! << 8);
    const voice = (addr: number) => {
      const notes: { hz: number; frames: number }[] = [];
      for (let a = addr; rom[a + 2] !== 0; a += 3) notes.push({ hz: w16(a), frames: rom[a + 2]! });
      return notes;
    };
    const tracks = Array.from({ length: S('MUS_COUNT') }, (_, t) => (t === 0 ? null : [voice(w16(S('tracks') + t * 4)), voice(w16(S('tracks') + t * 4 + 2))]));
    const VOL = S('MUSIC_VOL');
    let resumes = 0;
    let notes = 0;
    const heard = new Set<number>();
    const problems: string[] = [];
    for (const name of ['m17-obedient', 'm17-cable', 'm18-resume']) {
      let track = 0;
      const t = [0, 0];
      const p = [0, 0];
      const busy = [0, 0, 0];
      const mutedSince = [-1, -1];
      runReplay(bb, name, (v) => {
        // music_step runs at the start of the frame with the track chosen by the end of the previous frame
        const expected: string[] = [];
        for (let ch = 0; ch < 2; ch++) {
          if (busy[ch]! > 0) busy[ch]!--;
          const tr = tracks[track];
          if (!tr) continue;
          if (t[ch]! > 0) {
            t[ch]!--;
            if (t[ch]! > 0) continue;
          }
          const list = tr[ch]!;
          if (p[ch]! >= list.length) p[ch] = 0;
          const note = list[p[ch]!]!;
          t[ch] = note.frames;
          p[ch]!++;
          if (note.hz !== 0 && busy[ch] === 0) {
            expected.push(`${ch}:${note.hz}:${note.frames}`);
            if (mutedSince[ch]! >= 0) {
              resumes++;
              mutedSince[ch] = -1;
            }
          }
        }
        if (busy[2]! > 0) busy[2]!--;
        const got = v.vm.audio.filter((c) => c.volume === VOL && c.channel < 2).map((c) => `${c.channel}:${c.freq}:${c.duration}`);
        notes += got.length;
        if (JSON.stringify(got) !== JSON.stringify(expected)) problems.push(`${name} frame ${v.f + 1}: music ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
        for (const c of v.vm.audio) {
          if (c.volume === VOL && c.channel < 2) continue;
          busy[c.channel] = c.duration; // an effect owns the channel
          if (c.channel < 2) mutedSince[c.channel] = v.f;
        }
        const now = v.vm.read16(v.S('music_track'));
        if (got.length) heard.add(track);
        if (now !== track) {
          track = now;
          t[0] = t[1] = 0;
          p[0] = p[1] = 0;
        }
      });
    }
    console.log(`[music] ${notes} notes checked, ${resumes} resumes after an effect`);
    expect(problems.slice(0, 5)).toEqual([]);
    expect(notes).toBeGreaterThan(500);
    expect(resumes).toBeGreaterThan(10);
    expect([...heard].sort((a, b) => a - b), 'tracks heard').toEqual(Array.from({ length: S('MUS_COUNT') - 1 }, (_, i) => i + 1));
  });

  it('each section from 1 (entrance) to 7 (core) has its own track', () => {
    const rom = new Uint8Array(0x10000);
    rom.set(bb.cart.sections.code, 0);
    rom.set(bb.cart.sections.rodata, bb.cart.sections.code.length);
    const zm = Array.from({ length: 8 }, (_, z) => rom[symbol(bb.sym, 'zone_music') + z]!);
    expect(new Set(zm.slice(1)).size, `zone_music ${zm}`).toBe(7);
    expect(zm.every((t) => t > 0 && t < symbol(bb.sym, 'MUS_COUNT'))).toBe(true);
  });
});
