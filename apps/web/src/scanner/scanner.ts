import { FountainDecoder, toHex } from '@qrc/transport';
import type { DecodeRequest, DecodeResponse } from './worker';

// Camera -> frames -> worker (zxing) -> raw bytes -> fountain decoder. The transport never parses the
// bytes; the caller verifies the finished cartridge.

/** Longest side of the image handed to the decoder (camera frames are downscaled to this). */
const MAX_SIDE = 960;

export interface ScanProgress {
  /** 8-byte transport id of the cartridge being received (hex), once locked. */
  id: string | null;
  /** Distinct valid packets received for it. */
  received: number;
  /** Source blocks K (packets needed ≈ K, a few more on loss). */
  needed: number;
  recovered: number;
  frames: number;
  decoded: number;
  rejected: number;
  otherCartridge: number;
  decodeMs: number;
}

export class Scanner {
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private decoder = new FountainDecoder();
  private busy = false;
  private running = false;
  private seq = 0;
  private stats = { frames: 0, decoded: 0, decodeMs: 0 };
  private canvas = document.createElement('canvas');

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onProgress: (p: ScanProgress) => void,
    private readonly onComplete: (bytes: Uint8Array) => void,
  ) {}

  async start() {
    this.stop();
    this.decoder = new FountainDecoder();
    this.stats = { frames: 0, decoded: 0, decodeMs: 0 };
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<DecodeResponse>) => this.onDecoded(e.data);
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.report();
    this.pump();
  }

  stop() {
    this.running = false;
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    this.video.srcObject = null;
  }

  /** Grab the current camera frame whenever the worker is idle. */
  private pump = () => {
    if (!this.running) return;
    const v = this.video;
    if (!this.busy && this.worker && v.readyState >= 2 && v.videoWidth > 0) {
      const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
      const w = Math.round(v.videoWidth * scale);
      const h = Math.round(v.videoHeight * scale);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const req: DecodeRequest = { id: ++this.seq, width: w, height: h, rgba: img.data.buffer };
      this.busy = true;
      this.stats.frames++;
      this.worker.postMessage(req, [req.rgba]);
    }
    setTimeout(this.pump, 15);
  };

  private onDecoded(r: DecodeResponse) {
    this.busy = false;
    this.stats.decodeMs = this.stats.decodeMs * 0.9 + r.ms * 0.1;
    if (!this.running || !r.bytes) return;
    this.stats.decoded++;
    const status = this.decoder.receive(r.bytes);
    this.report();
    if (status === 'complete') {
      const bytes = this.decoder.getResult()!;
      this.stop();
      this.onComplete(bytes);
    } else if (status === 'hash-mismatch') {
      // Should be impossible (CRC + GE); start over rather than hand out corrupted data.
      this.decoder = new FountainDecoder();
    }
  }

  private report() {
    const d = this.decoder;
    this.onProgress({
      id: d.id ? toHex(d.id) : null,
      received: d.received,
      needed: d.K,
      recovered: d.recovered,
      frames: this.stats.frames,
      decoded: this.stats.decoded,
      rejected: d.rejected,
      otherCartridge: d.ignoredOtherCartridge,
      decodeMs: this.stats.decodeMs,
    });
  }
}
