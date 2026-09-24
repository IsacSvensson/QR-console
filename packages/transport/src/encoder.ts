import { encodePacket, blockCount, Mode } from './packet';
import { neighbours } from './neighbours';
import { sha256 } from './sha256';

export interface EncoderOptions {
  blockSize: number;
  mode?: Mode;
}

export class FountainEncoder {
  readonly id: Uint8Array;
  readonly K: number;
  readonly blockSize: number;
  readonly mode: Mode;
  private readonly blocks: Uint8Array[];

  constructor(
    readonly data: Uint8Array,
    opts: EncoderOptions,
  ) {
    if (!(opts.blockSize >= 1 && opts.blockSize <= 0xffff)) throw new Error('blockSize must be 1..65535');
    if (data.length > 0xffffffff) throw new Error('data too large');
    this.blockSize = opts.blockSize;
    this.mode = opts.mode ?? Mode.Systematic;
    this.id = sha256(data).slice(0, 8);
    this.K = blockCount(data.length, this.blockSize);
    this.blocks = [];
    for (let i = 0; i < this.K; i++) {
      const b = new Uint8Array(this.blockSize);
      b.set(data.subarray(i * this.blockSize, (i + 1) * this.blockSize));
      this.blocks.push(b);
    }
  }

  payload(seed: number): Uint8Array {
    const out = new Uint8Array(this.blockSize);
    for (const n of neighbours(this.mode, seed, this.K)) {
      const b = this.blocks[n]!;
      for (let i = 0; i < out.length; i++) out[i]! ^= b[i]!;
    }
    return out;
  }

  packet(seed: number): Uint8Array {
    return encodePacket({ mode: this.mode, id: this.id, totalLength: this.data.length, blockSize: this.blockSize, seed, payload: this.payload(seed) });
  }
}
