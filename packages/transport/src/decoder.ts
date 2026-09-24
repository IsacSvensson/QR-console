import { blockCount, decodePacket, Mode, type PacketParseError } from './packet';
import { neighbours } from './neighbours';
import { sha256 } from './sha256';

export type ReceiveStatus =
  | 'accepted' // valid packet with new information
  | 'redundant' // valid, but duplicate seed or no new information
  | 'complete' // this packet completed and verified the transfer
  | 'already-complete'
  | 'other-cartridge' // valid packet for a different cartridge id: ignored
  | 'inconsistent' // same id but different length/blockSize/mode: ignored
  | 'hash-mismatch' // reconstructed bytes do not match the id (should never happen)
  | PacketParseError; // rejected before touching decoder state

export interface DecoderOptions {
  /** Only accept this 8-byte cartridge id. Default: lock onto the first valid packet. */
  expectId?: Uint8Array;
  /** Allow Gaussian elimination when peeling stalls. Default true. */
  gaussian?: boolean;
}

interface Equation {
  nbrs: Set<number>;
  data: Uint8Array;
}

const eqBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

function xorInto(dst: Uint8Array, src: Uint8Array) {
  for (let i = 0; i < dst.length; i++) dst[i]! ^= src[i]!;
}

export class FountainDecoder {
  id: Uint8Array | null = null;
  totalLength = 0;
  blockSize = 0;
  mode: Mode = Mode.Systematic;
  K = 0;
  /** Valid, same-cartridge packets with a new seed. */
  received = 0;
  /** Packets rejected before reaching the decoder (CRC, magic, version...). */
  rejected = 0;
  ignoredOtherCartridge = 0;
  gaussianRuns = 0;
  private known = 0;
  private blocks: (Uint8Array | null)[] = [];
  private seeds = new Set<number>();
  private eqs = new Map<number, Equation>();
  private blockEqs = new Map<number, Set<number>>();
  private nextEqId = 0;
  private lastFailedGeSize = -1;
  private result: Uint8Array | null = null;
  private failed = false;
  private readonly gaussian: boolean;

  constructor(opts: DecoderOptions = {}) {
    this.gaussian = opts.gaussian ?? true;
    if (opts.expectId) this.id = opts.expectId.slice();
  }

  get done(): boolean {
    return this.result !== null;
  }
  /** Source blocks recovered so far. */
  get recovered(): number {
    return this.known;
  }
  get progress(): number {
    return this.K === 0 ? 0 : this.known / this.K;
  }

  /** The verified reconstructed bytes, or null if not complete. */
  getResult(): Uint8Array | null {
    return this.result;
  }

  receive(bytes: Uint8Array): ReceiveStatus {
    const p = decodePacket(bytes);
    if (typeof p === 'string') {
      this.rejected++;
      return p;
    }
    if (this.id && !eqBytes(this.id, p.id)) {
      this.ignoredOtherCartridge++;
      return 'other-cartridge';
    }
    if (this.K === 0) {
      this.id = p.id;
      this.totalLength = p.totalLength;
      this.blockSize = p.blockSize;
      this.mode = p.mode;
      this.K = blockCount(p.totalLength, p.blockSize);
      this.blocks = new Array<Uint8Array | null>(this.K).fill(null);
    } else if (p.totalLength !== this.totalLength || p.blockSize !== this.blockSize || p.mode !== this.mode) {
      return 'inconsistent';
    }
    if (this.result) return 'already-complete';
    if (this.failed) return 'hash-mismatch';
    if (this.seeds.has(p.seed)) return 'redundant';
    this.seeds.add(p.seed);
    this.received++;

    const before = this.known;
    const added = this.addEquation(neighbours(this.mode, p.seed, this.K), p.payload);
    if (this.known < this.K && this.gaussian) this.tryGaussian();
    if (this.known === this.K) return this.finish();
    return added || this.known > before ? 'accepted' : 'redundant';
  }

  private addEquation(nbrs: number[], data: Uint8Array): boolean {
    const unknown = new Set<number>();
    for (const n of nbrs) {
      const b = this.blocks[n];
      if (b) xorInto(data, b);
      else unknown.add(n);
    }
    if (unknown.size === 0) return false;
    if (unknown.size === 1) {
      this.resolve(unknown.values().next().value!, data);
      return true;
    }
    const id = this.nextEqId++;
    this.eqs.set(id, { nbrs: unknown, data });
    for (const n of unknown) {
      let s = this.blockEqs.get(n);
      if (!s) this.blockEqs.set(n, (s = new Set()));
      s.add(id);
    }
    return true;
  }

  /** Peeling: record a solved block and propagate it through every equation that references it. */
  private resolve(block: number, data: Uint8Array) {
    if (this.blocks[block]) return;
    this.blocks[block] = data;
    this.known++;
    const queue = [block];
    while (queue.length) {
      const x = queue.pop()!;
      const ids = this.blockEqs.get(x);
      if (!ids) continue;
      this.blockEqs.delete(x);
      const bx = this.blocks[x]!;
      for (const id of ids) {
        const eq = this.eqs.get(id);
        if (!eq) continue;
        xorInto(eq.data, bx);
        eq.nbrs.delete(x);
        if (eq.nbrs.size <= 1) {
          this.eqs.delete(id);
          if (eq.nbrs.size === 1) {
            const y = eq.nbrs.values().next().value!;
            this.blockEqs.get(y)?.delete(id);
            if (!this.blocks[y]) {
              this.blocks[y] = eq.data;
              this.known++;
              queue.push(y);
            }
          }
        }
      }
    }
  }

  /** Gaussian elimination over GF(2) on the residual system, once it could possibly be full rank. */
  private tryGaussian() {
    const u = this.K - this.known;
    const m = this.eqs.size;
    if (m < u || m === this.lastFailedGeSize) return;
    this.gaussianRuns++;
    const unknown: number[] = [];
    const col = new Map<number, number>();
    for (let i = 0; i < this.K; i++) if (!this.blocks[i]) col.set(i, unknown.push(i) - 1);
    const W = (u + 31) >>> 5;
    const eqList = [...this.eqs.values()];
    const rows = eqList.map((eq) => {
      const r = new Uint32Array(W);
      for (const n of eq.nbrs) {
        const c = col.get(n)!;
        r[c >>> 5]! |= 1 << (c & 31);
      }
      return r;
    });
    // Pass 1: rank check on coefficients only (cheap), recording the pivot row order.
    const bits = rows.map((r) => r.slice());
    const order = eqList.map((_, i) => i);
    for (let c = 0; c < u; c++) {
      const w = c >>> 5;
      const mask = 1 << (c & 31);
      let p = c;
      while (p < m && !(bits[order[p]!]![w]! & mask)) p++;
      if (p === m) {
        this.lastFailedGeSize = m;
        return;
      }
      [order[c], order[p]] = [order[p]!, order[c]!];
      const pr = bits[order[c]!]!;
      for (let r = c + 1; r < m; r++) {
        const rr = bits[order[r]!]!;
        if (rr[w]! & mask) for (let k = 0; k < W; k++) rr[k]! ^= pr[k]!;
      }
    }
    // Pass 2: full Gauss–Jordan with payloads on the chosen u rows.
    const R = order.slice(0, u).map((i) => rows[i]!);
    const D = order.slice(0, u).map((i) => eqList[i]!.data.slice());
    for (let c = 0; c < u; c++) {
      const w = c >>> 5;
      const mask = 1 << (c & 31);
      let p = c;
      while (!(R[p]![w]! & mask)) p++;
      [R[c], R[p]] = [R[p]!, R[c]!];
      [D[c], D[p]] = [D[p]!, D[c]!];
      for (let r = 0; r < u; r++) {
        if (r !== c && R[r]![w]! & mask) {
          for (let k = 0; k < W; k++) R[r]![k]! ^= R[c]![k]!;
          xorInto(D[r]!, D[c]!);
        }
      }
    }
    for (let c = 0; c < u; c++) this.blocks[unknown[c]!] = D[c]!;
    this.known = this.K;
    this.eqs.clear();
    this.blockEqs.clear();
  }

  private finish(): ReceiveStatus {
    const out = new Uint8Array(this.totalLength);
    for (let i = 0; i < this.K; i++) {
      const b = this.blocks[i]!;
      const start = i * this.blockSize;
      out.set(b.subarray(0, Math.min(this.blockSize, this.totalLength - start)), start);
    }
    if (!eqBytes(sha256(out).slice(0, 8), this.id!)) {
      this.failed = true;
      return 'hash-mismatch';
    }
    this.result = out;
    return 'complete';
  }
}
