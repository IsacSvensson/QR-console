# Transport packet format (protocol version 1)

One packet = one QR frame payload. The transport operates on arbitrary bytes and never parses them
(it does not import `cartridge`). All integers little-endian.

| Offset | Size | Field |
|---:|---:|---|
| 0 | 2 | magic `51 46` ("QF") |
| 2 | 1 | high nibble: protocol version (`1`); low nibble: mode (`0` = LT, `1` = systematic) |
| 3 | 8 | id: first 8 bytes of SHA-256 over the complete input (for a cartridge: the cartridge id, SPEC §4) |
| 11 | 4 | total input length *L* in bytes |
| 15 | 2 | block size *B* |
| 17 | 4 | seed |
| 21 | *B* | payload: XOR of the source blocks selected by the seed |
| 21+*B* | 4 | CRC-32 (IEEE, as zlib/PNG) over bytes `0 … 21+B−1` |

Overhead: 25 bytes per packet. With QR v12-M (287 bytes byte-mode capacity) *B* = 262.

## Validation order

1. length ≥ 26 and magic → else `bad-magic`/`too-short`
2. CRC-32 over the whole packet → else `bad-crc`. **Nothing else is read from a packet that fails
   the CRC**, so a packet corrupted despite QR error correction cannot poison the decoder.
3. protocol version, mode, block size ≠ 0 → else `bad-version`/`bad-fields`
4. id ≠ locked id → `other-cartridge` (ignored). The decoder locks onto the first valid packet's id
   (or an `expectId` given up front).
5. same id but different *L*, *B* or mode → `inconsistent` (ignored)

## Derivation (never transmitted)

- Block count `K = max(1, ceil(L / B))`. Source block *i* = input bytes `[iB, (i+1)B)`, the last one zero-padded.
- **Systematic mode**, seed `< K`: the payload is source block `seed` verbatim.
- Otherwise (LT mode, or systematic seed `≥ K`):
  1. PRNG = **mulberry32** seeded with `seed` (state `+= 0x6D2B79F5`; `t = imul(t ^ t>>>15, t|1)`;
     `t ^= t + imul(t ^ t>>>7, t|61)`; output `t ^ t>>>14`, all uint32).
  2. degree *d* = first *d* in 1…K with `r < cdf[d]`, where `r` is the first PRNG output and `cdf` is the
     **robust soliton** distribution (c = 0.1, δ = 0.5) quantised to `floor(P(deg ≤ d) · 2^32)`, with
     `cdf[K] = 2^32−1`. The table is computed with IEEE-exact operations only and a series-based `ln`
     (`detLn`), so all engines agree bit for bit.
  3. systematic repair packets only: `d = max(d, ceil(K/2))` (see D-003).
  4. neighbours: partial Fisher–Yates over `[0 … K−1]`: for `i` in `0 … d−1`,
     `j = i + floor(next() · (K−i) / 2^32)`, swap `idx[i]`, `idx[j]`; take `idx[0 … d−1]`.

## Decoding

Order-independent; duplicates (same seed) and packets after completion are ignored.
Peeling (belief propagation) resolves degree-1 equations and propagates. When peeling stalls and
there are at least as many stored equations as unknown blocks, Gaussian elimination over GF(2) runs on
the residual system (a cheap coefficient-only rank check first; payload XORs only if full rank).
On completion the output is truncated to *L* and **SHA-256(output)[0..8] must equal the id**, otherwise
the decoder reports `hash-mismatch` (a cartridge loader then also checks its own body hash).

## Sender

`FountainEncoder.packet(seed)`. The default mode is systematic; a looping animation typically shows seeds
`0 … N−1` with `N > K` (source blocks then repair packets).
