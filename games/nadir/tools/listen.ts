// Development aid: renders NADIR's audio commands to WAV files to listen to without a phone, with the web player's
// semantics (apps/web/src/audio.ts: two square channels and a noise channel, a new command replaces its channel,
// the volume falls linearly to 0 over the command's length, the sweep moves the frequency linearly).
//   npx tsx games/nadir/tools/listen.ts            -> demo/nadir-music.wav (each track), demo/nadir-sfx.wav (each effect),
//                                                     demo/nadir-play.wav (the stress replay as heard in the game)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AudioCommand, expandInputs } from '@qrc/vm';
import { loadGame } from './game';
import { readEffects, TRACKS } from './music';
import { GAME_DIR } from './util';

const RATE = 22050;
const PER_FRAME = RATE / 60;
const MASTER = 0.3;

/** Mixes per-frame command lists into 16-bit mono samples. */
function render(frames: AudioCommand[][]): Uint8Array {
  const out = new Float32Array(Math.ceil((frames.length + 120) * PER_FRAME));
  const voice: ({ c: AudioCommand; t0: number } | null)[] = [null, null, null];
  const noise = new Float32Array(RATE);
  let x = 1;
  for (let i = 0; i < RATE; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    noise[i] = (x & 0xffff) / 0x8000 - 1;
  }
  const phase = [0, 0, 0];
  for (let f = 0; f < frames.length + 120; f++) {
    for (const c of frames[f] ?? []) voice[c.channel] = c.duration && c.volume ? { c, t0: f * PER_FRAME } : null;
    for (let s = Math.floor(f * PER_FRAME); s < Math.floor((f + 1) * PER_FRAME); s++) {
      let v = 0;
      for (let ch = 0; ch < 3; ch++) {
        const vc = voice[ch];
        if (!vc) continue;
        const len = vc.c.duration * PER_FRAME;
        const t = s - vc.t0;
        if (t >= len) {
          voice[ch] = null;
          continue;
        }
        const k = t / len;
        const hz = Math.max(20, vc.c.freq + vc.c.sweep * vc.c.duration * k);
        const gain = (vc.c.volume / 15) * (1 - k);
        if (ch === 2) {
          phase[2]! += Math.max(0.05, hz / 1000);
          v += noise[Math.floor(phase[2]!) % RATE]! * gain;
        } else {
          phase[ch]! += hz / RATE;
          v += (phase[ch]! % 1 < 0.5 ? 1 : -1) * gain;
        }
      }
      out[s] = v * MASTER;
    }
  }
  return Uint8Array.from(out, (v) => Math.max(0, Math.min(255, Math.round(128 + v * 127)))); // 8-bit PCM
}

function wav(file: string, pcm: Uint8Array) {
  const b = Buffer.alloc(44 + pcm.length);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + pcm.length, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write('data', 36);
  b.writeUInt32LE(pcm.length, 40);
  b.set(pcm, 44);
  writeFileSync(file, b);
  console.log(`wrote ${file} (${(pcm.length / RATE).toFixed(1)} s)`);
}

const dir = join(GAME_DIR, '..', '..', 'demo');
mkdirSync(dir, { recursive: true });

// each track from the VM's sequencer: START, DRONE (20 s), FIGHT (2 loops), DEATH, VICTORY, with a pause between
{
  const g = await loadGame(1);
  g.vm.step(0);
  const all: AudioCommand[][] = [];
  const play = (name: string, frames: number) => {
    const id = TRACKS.indexOf(name as (typeof TRACKS)[number]);
    g.vm.write16(g.S('mus_cur'), id);
    for (let v = 0; v < 3; v++) {
      g.vm.write16(g.S('v_off') + 2 * v, g.vm.read16(g.S('mus_tracks') + 8 * id + 2 * v));
      g.vm.write16(g.S('v_t') + 2 * v, 0);
    }
    for (let f = 0; f < frames; f++) {
      g.vm.write16(g.S('mus_calm'), 1000); // no enemy is awake at the start: STRID would turn into DRÖNARE
      g.vm.step(0);
      all.push(g.vm.audio.filter((a) => a.sweep === 0));
    }
    for (let f = 0; f < 45; f++) all.push([]);
  };
  play('START', 108);
  play('DRONE', 1200);
  play('FIGHT', 1152);
  play('DEATH', 330);
  play('VICTORY', 150);
  wav(join(dir, 'nadir-music.wav'), render(all));
}

// every effect once, 0.6 s apart
{
  const fx = readEffects();
  const frames: AudioCommand[][] = [];
  for (const e of fx) {
    frames.push([{ channel: e.ch, freq: e.hz, duration: e.frames, volume: e.vol, sweep: e.sweep }]);
    for (let f = 1; f < Math.max(36, e.frames + 12); f++) frames.push([]);
  }
  wav(join(dir, 'nadir-sfx.wav'), render(frames));
  console.log(`effects in order: ${fx.map((e) => e.name).join(' ')}`);
}

// the stress replay as the game plays it
{
  const rf = JSON.parse(readFileSync(join(GAME_DIR, 'replays', 'm30-stress.json'), 'utf8'));
  const g = await loadGame(rf.seed);
  const inputs = expandInputs(rf.inputs, rf.frames);
  const frames: AudioCommand[][] = [];
  for (let f = 0; f < rf.frames; f++) frames.push(g.vm.step(inputs[f]!).slice());
  wav(join(dir, 'nadir-play.wav'), render(frames));
}
