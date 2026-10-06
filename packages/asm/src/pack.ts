// The packed-data format of ISA 2 (`SYS UNPACK`, documented in packages/vm/VM.md). This is the encoder the
// assembler uses for `.pack` blocks, plus a reference decoder. The VM has its own decoder (asm may not import
// vm); test/pack.test.ts checks that the two agree.
//
//   u16 n                 unpacked length (little-endian)
//   then tokens until n bytes are written:
//   0lllllll              literals: the next l+1 bytes (1..128)
//   10llllll d            match: copy l+3 bytes (3..66) from d+1 bytes back (1..256)
//   11llllll dd dd        match: copy l+3 bytes from (u16 dd)+1 bytes back (1..65536)
// Matches copy byte by byte, so they may overlap their own output (runs).

export const PACK_MAX = 0xffff;
const MIN_MATCH = 3;
const MAX_MATCH = 66;
const MAX_LIT = 128;
const CHAIN = 256;

/** Smallest encoding (optimal parse over literal runs and the matches a hash chain finds). */
export function pack(data: Uint8Array): Uint8Array {
  const n = data.length;
  if (n > PACK_MAX) throw new Error(`pack: ${n} bytes is more than ${PACK_MAX}`);
  // prev[i]: the previous position whose next 3 bytes hash like those at i
  const prev = new Int32Array(n).fill(-1);
  const head = new Map<number, number>();
  for (let i = 0; i + MIN_MATCH <= n; i++) {
    const h = data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16);
    prev[i] = head.get(h) ?? -1;
    head.set(h, i);
  }
  // cost[i]: bytes to encode data[i..n); how[i]: >0 literal run length, <0 -(match length), dist[i] for matches
  const cost = new Float64Array(n + 1);
  const how = new Int32Array(n + 1);
  const dist = new Int32Array(n + 1);
  for (let i = n - 1; i >= 0; i--) {
    let best = Infinity;
    let bh = 0;
    let bd = 0;
    for (let k = 1; k <= MAX_LIT && i + k <= n; k++) {
      const c = 1 + k + cost[i + k]!;
      if (c < best) {
        best = c;
        bh = k;
      }
    }
    let maxShort = 0;
    let maxLong = 0;
    let dShort = 0;
    let dLong = 0;
    for (let j = prev[i]!, steps = 0; j >= 0 && steps < CHAIN; j = prev[j]!, steps++) {
      let len = 0;
      while (len < MAX_MATCH && i + len < n && data[j + len] === data[i + len]) len++;
      if (len < MIN_MATCH) continue;
      if (i - j <= 256 && len > maxShort) {
        maxShort = len;
        dShort = i - j;
      }
      if (len > maxLong) {
        maxLong = len;
        dLong = i - j;
      }
    }
    for (let len = MIN_MATCH; len <= maxLong; len++) {
      const short = len <= maxShort;
      const c = (short ? 2 : 3) + cost[i + len]!;
      if (c < best) {
        best = c;
        bh = -len;
        bd = short ? dShort : dLong;
      }
    }
    cost[i] = best;
    how[i] = bh;
    dist[i] = bd;
  }
  const out: number[] = [n & 0xff, n >>> 8];
  for (let i = 0; i < n; ) {
    const h = how[i]!;
    if (h > 0) {
      out.push(h - 1);
      for (let k = 0; k < h; k++) out.push(data[i + k]!);
      i += h;
    } else {
      const len = -h;
      const d = dist[i]! - 1;
      if (d < 256) out.push(0x80 | (len - MIN_MATCH), d);
      else out.push(0xc0 | (len - MIN_MATCH), d & 0xff, d >>> 8);
      i += len;
    }
  }
  return Uint8Array.from(out);
}

/** Reference decoder (the VM's SYS UNPACK must produce the same bytes). */
export function unpack(src: Uint8Array): Uint8Array {
  const at = (i: number) => src[i] ?? 0;
  const n = at(0) | (at(1) << 8);
  const out = new Uint8Array(n);
  let p = 2;
  let o = 0;
  while (o < n) {
    const t = at(p++);
    if (t < 0x80) {
      for (let k = 0; k <= t && o < n; k++) out[o++] = at(p++);
    } else {
      const len = (t & 0x3f) + MIN_MATCH;
      let d = at(p++);
      if (t >= 0xc0) d |= at(p++) << 8;
      d += 1;
      for (let k = 0; k < len && o < n; k++, o++) out[o] = o - d >= 0 ? out[o - d]! : 0;
    }
  }
  return out;
}
