# SPEC.md — QR Console

## 1. Concept

A user installs a PWA once. After that, with **no network**, they can point the phone camera at
an animated QR code (a looping GIF on a laptop screen), watch a progress bar fill up as frames
are received in any order, and then press PLAY on a fully verified game.

The game — including its **executable logic** — lives entirely in the cartridge. The player app
knows nothing about any specific game.

The prototype is proven when two different games (Breakout and a second one) can each be built,
encoded, scanned and played with **zero changes** to the player/runtime.

## 2. Locked decisions

These are fixed. Do not change them. If one blocks you, see `CLAUDE.md`.

| # | Decision |
|---|----------|
| L1 | **Cartridge format is transport-agnostic.** No fountain, QR, block-size or frame concepts in the cartridge. A cartridge is an opaque byte array that could be sent by any means. |
| L2 | **Runtime contains no game-specific logic.** All game logic is VM bytecode inside the cartridge. A generic built-in system font and generic syscalls (drawing, input, sound, rect overlap test, RNG) are allowed. |
| L3 | **Display: 128×128 pixels, fixed 16-colour palette** defined by the runtime. |
| L4 | **Input: six buttons** — LEFT, RIGHT, UP, DOWN, A, B — from keyboard and on-screen touch controls. |
| L5 | **Audio: 2 square-wave channels + 1 noise channel.** No PCM / sampled audio. |
| L6 | **Games are written in an assembler** (labels, constants, data directives, macros optional). No high-level language, no parser for an expression language beyond simple constant arithmetic. |
| L7 | **VM is deterministic.** Same cartridge + same seed + same per-frame input sequence ⇒ bit-identical VM state and framebuffer at every frame. No floats in VM semantics, no wall-clock access, RNG only via seeded syscall. |
| L8 | **Transport uses a Luby Transform–style fountain code** with self-contained packets; decoding is order-independent and tolerant of loss and duplicates. |
| L9 | **QR payloads are raw binary (byte mode).** The scanner must use the decoder's raw bytes, never a text string. |
| L10 | **Animations are lossless**: GIF (required), APNG (optional). No lossy video formats. |
| L11 | **Fully offline after install.** No CDN, no runtime network requests. QR decoding, reconstruction, VM and assets all local. |
| L12 | **Primary target: Android + Chrome.** iOS/Safari is best-effort, not required. |
| L13 | **Real-device camera testing is manual** and done by the human, not claimed by the agent. |

## 3. Architecture

```
games/*.asm ──assembler──▶ cartridge bytes (.qrc)
                                │
                     fountain encoder (transport)
                                │
                     packets ──▶ QR images ──▶ GIF
                                                │  camera
                                                ▼
                  scanner (Web Worker, local QR decoder)
                                │ raw bytes
                     fountain decoder (transport)
                                │
                     cartridge bytes ── verify SHA-256 ──▶ VM ──▶ canvas + WebAudio
```

### Repository layout

```
packages/
  cartridge/   format, compression, hashing, parse/serialize           (no DOM)
  transport/   packet format, PRNG, degree distribution, LT enc/dec     (no DOM)
  vm/          CPU, memory map, syscalls, framebuffer, audio *commands* (no DOM)
  asm/         assembler: .asm → cartridge                              (no DOM)
  qr/          QR frame generation, GIF/APNG output, image-level decode helpers
  tools/       CLI (`qrc`)
apps/
  web/         PWA: scanner UI, library, player, canvas/audio backends
games/
  hello/       HELLO WORLD
  breakout/
  <second>/    e.g. pong
bench/         benchmark scripts and results
```

Dependency rules (enforced by a lint rule or a test in M0):

| Package | May import |
|---|---|
| `cartridge` | nothing internal |
| `transport` | nothing internal — operates on arbitrary bytes, **never imports `cartridge`** |
| `vm` | `cartridge` |
| `asm` | `cartridge` |
| `qr` | `transport` |
| `tools` | anything |
| `web` | anything it needs |

## 4. Cartridge format (L1)

Opaque, self-verifying binary. Required content — exact byte layout is yours to define and must be
documented in `packages/cartridge/FORMAT.md`:

- magic (4 bytes, e.g. `QRC1`) and format version
- title (short UTF-8 string, ≤ 32 bytes) — **metadata for Library/UI only**; the VM never reads it
- **VM instruction-set version** — the VM refuses to run a cartridge whose ISA version it does not support
- payload type (initially only: VM bytecode ROM)
- compression method (none | deflate-raw) and uncompressed size
- **SHA-256 of the body** stored in the header, verified on load
- body: sections at minimum for code, read-only data (sprites/tilemaps/tables), sound definitions

A cartridge that fails magic, format version, ISA version, size or hash checks is rejected with a clear error.

**Hash definitions (use exactly these, everywhere):**

- **Body hash** = SHA-256 over the cartridge body *as stored* (after compression, if any). Stored in the header.
- **Cartridge id** = SHA-256 over the **entire serialized cartridge file** (header + body, the exact bytes of the `.qrc`).
  The transport uses its first 8 bytes; tools and UI may show a short prefix.

Browser decompression uses `DecompressionStream('deflate-raw')`; Node uses `zlib`. Both must
produce identical results in tests.

## 5. Transport (L8)

### Packet (one per QR frame)

Required fields — exact layout yours, documented in `packages/transport/PACKET.md`:

- magic (2 bytes) and protocol version
- cartridge id: first 8 bytes of the cartridge id defined in §4 (SHA-256 of the entire serialized file; transport computes it over the bytes it is given, without parsing them)
- total cartridge length
- block size
- seed (determines degree and source-block selection via a documented PRNG)
- payload (one block-sized XOR combination)
- CRC (CRC-16 or CRC-32) over the packet, so a packet corrupted despite QR error correction is
  **rejected before it can poison the decoder**

Block count, degree and neighbour set are **derived** from seed + header fields, never transmitted.

### Coding

- Implement correct LT with a robust soliton degree distribution and a peeling decoder.
- Also implement a **systematic mode** (the first K seeds map 1:1 to source blocks, then repair
  packets). Benchmark both (`PLAN.md`, M2). The default mode is chosen **by measurement** and
  recorded in `DECISIONS.md`.
- If peeling alone stalls too often at small K, a Gaussian-elimination fallback on the residual
  system is allowed.
- Final reconstruction is verified by the transport (SHA-256 of reconstructed bytes matches the 8-byte id) and then by the cartridge loader (body hash).

### Targets

- Functional: a **50 KB** arbitrary binary survives the full round trip.
- Overhead and loss tolerance are **measured**, not assumed.

## 6. QR and animation (L9, L10)

Configurable, with these starting defaults (adjust defaults only on benchmark evidence, recorded
in `DECISIONS.md`):

| Parameter | Default | Benchmark range |
|-----------|---------|-----------------|
| QR version | 12 | 10–15 |
| Error correction | M | L, M, Q |
| Frame duration | 150 ms | 100–250 ms |
| Quiet zone | 4 modules | — |

Rendering: pure black/white, integer module scaling, no anti-aliasing, no dithering.
Block size is derived from QR capacity minus packet header.

## 7. VM (L2–L7)

Optimised for **small games and small ROMs**, not general programmability.

Guidance (you finalise it in `packages/vm/VM.md`):

- 16-bit words, ~8 general registers, PC, SP, flags; integer arithmetic only
- roughly 30–40 opcodes: load/store, arithmetic, logic, shifts, compare, branch, call/ret, push/pop, `SYS n`
- 64 KB address space: ROM mapped read-only, RAM, a framebuffer or draw-command model (your choice, documented)
- fixed 60 Hz tick: the cartridge's `update` entry runs once per frame; a **per-frame cycle budget**
  prevents hangs (exceeding it ends the frame deterministically)
- syscalls: clear, pixel, rect/fill-rect, line (optional), sprite (8×8, 4bpp, from ROM), tilemap draw,
  text (built-in font), button state, rect-overlap test, seeded RNG, sound (channel, pitch, duration, volume)
- the VM core produces a framebuffer and a list of audio commands; canvas and WebAudio are **backends**
  in `apps/web`, so the VM runs headless in Node for tests

Sprite data may be written as ASCII-art blocks in assembler source to avoid image tooling.

## 8. Games

- `games/hello`: prints HELLO WORLD. First vertical slice.
- `games/breakout`: paddle, ball, bricks, score, lives, sound on hit. Target cartridge size **≤ 10 KB** (*measure*).
- `games/<second>`: a meaningfully different game (e.g. Pong with a simple CPU opponent).
  Must require **no changes** to `packages/vm` or `apps/web`.

## 9. PWA

- Installable (manifest, icons, service worker precaching every asset).
- Screens: **Scan** (camera view + progress bar + received/needed counts), **Library** (cartridges stored in
  IndexedDB), **Play** (canvas scaled to screen, touch controls, keyboard support).
- Scanner decodes in a Web Worker with a **locally bundled** QR decoder (e.g. zxing-wasm or jsQR — choose by
  measurement). `BarcodeDetector` may be used as a fast path where available, never as the only path.
- Ignores packets from other cartridges while a scan is in progress; shows which cartridge is being received.

## 10. Non-goals

JavaScript cartridges · high-level language · multiplayer · accounts or servers · sync · cartridge editor UI ·
marketplace · iOS polish · printed static codes for large games · performance tuning beyond stated targets.
