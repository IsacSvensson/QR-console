import type { AudioCommand } from '@qrc/vm';

// WebAudio backend for the VM's audio commands: 2 square-wave channels + 1 noise channel (SPEC L5).
// A new command on a channel replaces whatever that channel was playing.
const FRAME = 1 / 60;
const MASTER = 0.15;

export class AudioBackend {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private voices: (AudioScheduledSourceNode | null)[] = [null, null, null];

  /** Must be called from a user gesture (browser autoplay rules). */
  resume() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let x = 1;
      for (let i = 0; i < len; i++) {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        d[i] = (x & 0xffff) / 0x8000 - 1;
      }
    }
    void this.ctx.resume();
  }

  play(cmds: AudioCommand[]) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    for (const c of cmds) {
      this.voices[c.channel]?.stop();
      this.voices[c.channel] = null;
      if (c.duration === 0 || c.volume === 0) continue;
      const t0 = ctx.currentTime;
      const t1 = t0 + c.duration * FRAME;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime((c.volume / 15) * MASTER, t0);
      gain.gain.linearRampToValueAtTime(0, t1);
      gain.connect(ctx.destination);
      let src: AudioScheduledSourceNode;
      const endFreq = Math.max(20, c.freq + c.sweep * c.duration);
      if (c.channel === 2) {
        const n = ctx.createBufferSource();
        n.buffer = this.noise;
        n.loop = true;
        // "pitch" of noise: playback rate relative to 1 kHz
        n.playbackRate.setValueAtTime(Math.max(0.05, c.freq / 1000), t0);
        n.playbackRate.linearRampToValueAtTime(Math.max(0.05, endFreq / 1000), t1);
        src = n;
      } else {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(Math.max(20, c.freq), t0);
        o.frequency.linearRampToValueAtTime(endFreq, t1);
        src = o;
      }
      src.connect(gain);
      src.start(t0);
      src.stop(t1);
      this.voices[c.channel] = src;
    }
  }
}
