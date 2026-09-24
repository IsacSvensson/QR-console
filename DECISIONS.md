# DECISIONS.md

Append-only log of choices between real alternatives. Newest at the bottom.
Locked decisions live in `SPEC.md` §2 and are not repeated here.

Format:

```
## D-NNN — <short title>
Date: YYYY-MM-DD · Milestone: Mn
Decision: <what was chosen>
Alternatives: <what else was considered>
Why: <reasoning or measurement, link to bench/ file if relevant>
Revisit if: <condition that would change this>
```

---

## D-000 — Pre-agreed starting points (from design discussion)
Date: 2026-09-24 · Milestone: —
Decision: Start QR defaults at version 12 / ECC M / 150 ms per frame; implement both pure LT and
systematic LT and choose the default by benchmark; per-packet CRC is kept because a single corrupted
packet would otherwise propagate through XOR into many blocks.
Alternatives: pure LT only; systematic only; no per-packet CRC (rely on QR Reed–Solomon + final hash).
Why: small block counts make LT overhead uncertain, so measure instead of assume; CRC costs 2–4 bytes
per frame and lets the decoder isolate bad packets.
Revisit if: benchmarks show one mode dominates, or CRC never triggers in layer-3 tests.

## D-001 — Toolchain and monorepo wiring
Date: 2026-09-24 · Milestone: M0
Decision: TypeScript 6.0 (typescript-eslint 8 supports < 6.1; TS 7 not yet supported by it), Vitest 5
projects (one per package, `npm test -w packages/x` runs its project from the root config), ESLint 10 flat
config, Vite 8, tsx for running TS CLIs. Packages export `src/index.ts` directly (no build step for
libraries). Two typecheck passes: `tsconfig.pure.json` checks cartridge/transport/vm/asm with only ES libs
plus a tiny `types/web-globals.d.ts` (TextEncoder/Decoder, (De)CompressionStream) so DOM or Node usage fails
to compile; `tsconfig.json` checks everything with DOM + Node types.
Dependency rules (SPEC §3) are enforced twice: ESLint `no-restricted-imports` and `test/architecture.test.ts`.
Alternatives: project references with emitted builds; TS 7 native compiler.
Why: least moving parts, no build artefacts to keep in sync.
Revisit if: package consumers outside this repo need compiled JS.

## D-002 — Cartridge layout, hashing and compression implementation
Date: 2026-09-24 · Milestone: M1
Decision: 52-byte fixed header + title, body = section table (code/rodata/sound, all required).
SHA-256 is a small pure-TS implementation (sync, works without a secure context) duplicated verbatim in
`cartridge` and `transport` (SPEC §3 forbids either importing the other; a test asserts the copies are
identical). Compression uses `(De)CompressionStream('deflate-raw')` in both Node and browser, so the
package has no Node imports; `auto` mode keeps whichever of raw/deflated is smaller.
Alternatives: `crypto.subtle` (async, needs secure context), a shared `hash` package (not in SPEC layout),
Node `zlib` for compression (would make the package Node-only).
Why: keeps pure packages runnable anywhere with zero dependencies.
Revisit if: hashing speed matters (it does not at ≤ 64 KB).

## D-003 — Default fountain mode: systematic with dense repair packets, GE always on
Date: 2026-09-24 · Milestone: M2
Decision: Default mode = systematic. Repair packets (seed ≥ K) draw a robust-soliton degree d and use
max(d, ⌈K/2⌉). The decoder is peeling + Gaussian elimination on the residual system (always enabled).
Alternatives: pure LT (robust soliton c=0.1, δ=0.5); systematic with plain soliton repair; repair floors of
K/8, K/4, fixed 8 (scratch experiment, 60 trials: K/2 best; K/8 and K/4 close at large K but worse at K ≤ 64).
Why: bench/fountain.md — with plain soliton repair, systematic needed ~79 % overhead at 20 % loss because
low-degree repair packets rarely touch the ~20 % of blocks that are missing. With the ⌈K/2⌉ floor it is at or
below pure LT in every cell (K=256, 20 % loss: p99 34 % vs LT 44 %; floor 25 %), and zero-overhead with no loss.
Cost: dense repair packets cannot be peeled, so GE is required (≤ ~10 ms at K=256 in Node).
Revisit if: K grows well beyond ~1000 (GE cost O(K³/32)), or a precode (Raptor-style) is wanted.

## D-004 — VM and assembler design
Date: 2026-09-24 · Milestone: M3
Decision: Fixed 4-byte instructions (op, mode, imm16), 33 opcodes, 8 registers; one I-bit selects
immediate/absolute vs register/base+offset, so every ALU op has both forms without extra opcodes.
ROM (code|rodata|sound, contiguous from 0x0000, ≤ 32 KB) read-only; RAM 0x8000–0xFFFF; framebuffer not
memory-mapped (drawn via syscalls). Each entry call starts with zeroed registers and an empty stack; a RET
on the empty stack ends the call; the cycle budget (50 000) aborts the call and the next frame restarts
`update`. Budget overruns and illegal opcodes are deterministic. Palette = DawnBringer-16, own 3×5 font.
Assembler: two-pass with lazy constant resolution, local `@labels`, `.sprite` ASCII art, `.sfx`, `.var`.
The opcode table is duplicated in `asm` (asm may not import vm, SPEC §3); `test/isa-sync.test.ts` guards it.
Tests that need a built game in `packages/vm` read the committed `games/<g>/<g>.qrc`; `packages/asm` tests
assert that a fresh assembly has identical sections, which closes the chain without cross-imports.
Alternatives: variable-length encoding (smaller code, but compression recovers most of it and decoding
is simpler this way); memory-mapped framebuffer (more flexible, but more RAM traffic in asm for games).
Why: simplest thing that makes games pleasant to write in assembly and trivially deterministic.
Revisit if: cartridge size becomes a bottleneck.

## D-005 — QR generation and GIF libraries
Date: 2026-09-24 · Milestone: M4
Decision: `qrcode` (byte-mode segments from a Uint8Array; its capacity table gives block size) for
generation, `omggif` for GIF write/read (2-colour palette, loop forever, delay in 10 ms units),
`jsqr` as the initial image decoder (returns `binaryData`, the raw bytes). Decoder choice is revisited by
measurement in M5.
Alternatives: own QR encoder (large, error-prone), gifenc (writer only).
Why: small, dependency-free, well-used libraries; lossless output.
Revisit if: M5 benchmark shows a better decoder.

## D-006 — Definition of distortion levels for layer-3 tests (recorded BEFORE measuring)
Date: 2026-09-24 · Milestone: M5
Decision: The simulator renders the QR at 4 px/module with a 4-module quiet zone (what a phone camera
frame downscaled to ~640 px sees when a v12 code fills roughly half the frame), then applies, with
parameters drawn uniformly per frame from a seeded RNG:

| level | scale | rotation | perspective (max corner shift, fraction of size) | Gaussian blur σ (px) | contrast (white−black)/255 | noise σ (0–255) | illumination gradient |
|---|---|---|---|---|---|---|---|
| none | 1 | 0° | 0 | 0 | 1.0 | 0 | 0 |
| mild | 0.8–1.25 | ±3° | 0.02 | 0.5 | 0.8 | 4 | ±5 % |
| **moderate** | **0.6–1.4** | **±7°** | **0.04** | **0.8** | **0.6** | **8** | **±10 %** |
| strong | 0.5–1.5 | ±10° | 0.06 | 1.2 | 0.45 | 14 | ±20 % |

Resampling is bilinear from the output pixel through the inverse homography; outside the source is
white (the screen around the code). "Decoded" means the decoder returned exactly the packet bytes.
Acceptance (`npm run test:qr-robust`): default parameters decode ≥ 95 % of frames at **moderate**.
Alternatives: define levels after seeing results (explicitly disallowed by PLAN.md).
Why: covers the ranges PLAN.md M5 lists; "moderate" sits in the middle of each range.
Revisit if: real-device testing shows camera frames are much worse or better than "moderate".

## D-007 — QR decoder: zxing-wasm with binarizer fallback; defaults stay v12-M / 150 ms; loop = K + 50 %
Date: 2026-09-24 · Milestone: M5
Decision: The scanner uses **zxing-wasm** (reader build, wasm bundled locally and passed as a binary, never
fetched from a CDN), `tryHarder`, first with its default LocalAverage binarizer and, only when that finds
nothing, again with GlobalHistogram. QR defaults unchanged: version 12, ECC M, 150 ms/frame, 4 px/module in
tests. Generated animations loop over N = K + max(4, ⌈K/2⌉) frames.
Alternatives: jsQR (pure JS); zxing single pass; ECC Q (100 % at moderate in the first run but −32 % payload);
FixedThreshold binarizer (200/200 on the robust frames, but only because the simulator keeps mid-grey at 128 —
rejected as overfitting to the simulator); BarcodeDetector (returns only a text `rawValue`, violating L9).
Why: bench/qr.md. jsQR: 0 % at moderate for every version/ECC and 20–100 ms/frame; zxing single pass: 90 %
overall, 97 % for v12-M, ~2.5 ms. History, for honesty: the first `test:qr-robust` run (single pass, 200 frames)
measured **92.5 %** (fail). Diagnosis showed all 15 failures were the smallest-scale frames; GlobalHistogram
recovered 14. The fallback was then validated on the benchmark's independent seeds: moderate 90 % → 99 %
overall, v12-M 97 %, no time cost, and `test:qr-robust` now gives 99.5 %. With the fallback no version/ECC in
10–15 × L/M/Q is clearly better than v12-M at moderate, so SPEC defaults stay. Loop length: the 50 KB transfer
simulation (20 % loss) needs p90 = 259 frames with K + 50 % vs 300 with K + 25 % and 396 with K + 10 %;
K + 100 % gives no further gain.
Revisit if: real-device scanning (human test) shows a different failure mode, e.g. moiré from screens.

## D-008 — Abandoned: GE retry guard keyed on equation count
Date: 2026-09-24 · Milestone: M5
The fountain decoder skipped Gaussian elimination when the number of stored equations equalled that of the
last failed attempt. When source packets arrive *after* repair packets (camera joining a looping GIF mid-way),
unknowns shrink while the equation count stays the same, so GE was wrongly skipped until an extra repair packet
arrived. Found through the loop simulation in bench/qr.md (p90 ≫ one loop). Replaced by a dirty flag set on
every change to the residual system; regression test "looping-animation order" added.

## D-009 — Game-specific test logic lives in games/<name>/checks.ts; second game = Pong
Date: 2026-09-24 · Milestone: M7/M8
Decision: `test/games/games.test.ts` is fully generic (discovers every game with a `replay.json`); what a run
must demonstrate is asserted by `games/<name>/checks.ts` via RAM symbols from the assembler. Replays are
recorded once by a small bot script in the game's folder (`record-replay.ts`) and committed as data.
Pong (player vs CPU, first to 5) is the second game; it uses a different syscall mix from Breakout (LINE net,
RECTFILL sprites-free drawing, direct SOUND jingle vs Breakout's MAP tilemap bricks and SPR ball).
M8 was done with zero changes under `packages/` and `apps/` relative to the M7 commit bd2e1b8.
Alternatives: per-game branches in the shared test (would put game knowledge outside games/<name>/).
Why: PLAN M8 forbids game-specific code outside the game's folder.

## D-010 — PWA architecture
Date: 2026-09-24 · Milestone: M9
Decision: Plain TypeScript + DOM (no UI framework), Vite build with relative base. Service worker is generated
at build time by a 60-line Vite plugin (cache-first, precaches every emitted file incl. the 950 KB zxing wasm)
instead of vite-plugin-pwa/Workbox. QR decoding runs in a module Web Worker (zxing-wasm, wasm fetched from the
app's own origin); the fountain decoder runs on the main thread (microseconds per packet). Camera frames are
downscaled to ≤ 960 px on the long side and a new frame is grabbed only when the worker is idle.
BarcodeDetector is **not** used, not even as a fast path: it only exposes a text `rawValue`, which would violate
L9 (raw bytes). The scanner locks onto the first valid cartridge id; the UI shows that id (the title is only
known after verification, since the transport never parses the cartridge). Library = IndexedDB keyed by
cartridge id. Test hooks (`window.__qrc`) exist only with `?test`; `?seed` and `?maxFrames` make the player
deterministic for tests. e2e uses a tiny logging static server over the production build so the offline test
can assert on server-side requests.
Alternatives: vite-plugin-pwa (bigger dependency tree), React/Preact (unneeded for three screens), jsQR in
the worker (0 % at moderate distortion, bench/qr.md).
Revisit if: the UI grows beyond three screens.

## D-011 — How "zero network requests" is asserted offline
Date: 2026-09-24 · Milestone: M10
Decision: Three independent checks after `context.setOffline(true)`: (1) the logging static server records no
new requests; (2) with `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`, Playwright reports no network fetch
made by the service worker and no failed request; (3) every page request was answered by the service worker.
Negative controls run once by hand (not committed): without SW registration the test fails; with the wasm
left out of the precache list the offline scan never completes and the test fails.
Alternatives: only `page.on('request')` (cannot distinguish cache hits from network).

## D-012 — Hosting on GitHub Pages
Date: 2026-09-24 · Milestone: post-M11
Decision: GitHub Actions workflow (`.github/workflows/pages.yml`): `npm ci`, `npm run check`, build, copy
`demo/*.gif` into `dist/demo/`, deploy with `actions/deploy-pages`. No app changes needed: relative `base`
makes the build and the service-worker scope work under `/<repo>/`. The demo GIFs are served but not
precached (they are for the laptop, not the phone).
Alternatives: `gh-pages` branch committed by hand; running e2e in CI (needs Playwright browsers, slower —
left out of the deploy path).

## D-013 — M12: a read-only trace hook in the VM (deviation from "M12 changes only asm and tools")
Date: 2026-09-24 · Milestone: M12
Decision: `VM.tracer` — an optional callback invoked with the PC before each instruction, null in normal play.
It is used only by `qrc run --trace`. It has no effect on execution (all committed replay hashes of hello,
Breakout and Pong are unchanged) and it lands **before** the M12 baseline commit, so the Part 2 rule
"the runtime does not change from M12 on" is unaffected.
Alternatives: a second interpreter in `tools` just for tracing (duplicated semantics that could drift from the
real VM); single-stepping by a cycle budget of 1 (impossible: an exhausted budget restarts the entry point).
Why: PLAN.md M12 asks for `--trace`; a read-only observer is the only way to trace the real VM.

## D-014 — Macro and include semantics
Date: 2026-09-24 · Milestone: M12
Decision: a text-level preprocessor before pass 1. `.include "name.asm"` accepts only plain file names; the
assembler stays file-system-free (the caller passes a resolver restricted to the game directory), so game code
cannot reach outside `games/<name>/`. Macros substitute parameters as whole words and rename `@@x` to a local
label unique per expansion; errors report the body line plus the expansion site.
Alternatives: macros with typed parameters; `\@`-style counters (less readable).

## D-015 — BLACKBOX engine structure (M13–M14)
Date: 2026-09-24 · Milestone: M13/M14
Decision: Data-driven. The RAM room buffer holds one tile *class* code per LAYOUT character; each zone group
has its own tileset (MAP gets the zone's tile base), and a per-code attribute table gives SOLID / OPAQUE / USE.
Rooms are RLE in ROM (1 byte per run; 1.7 KB for all 37), generated from LAYOUT.md by
`games/blackbox/tools/gen.ts`; walls with floor below are auto-tiled to a front face at unpack. Game events are
bytecode scripts (macros in `script.asm`) run as coroutines by an interpreter, fired by per-room triggers
(ENTER, USE cell, STEP cell, EXIT side, TALK, TOUCH). Actors live in an 8-slot RAM table spawned from the room's
object list on entry and on every detection restart. Sight = cell-by-cell ray along the facing direction,
stopped by OPAQUE tiles. A stunned actor is skipped iff its counter is still > 0 after decrementing, so the RAM
state after each frame tells tests exactly who acted. Replays are recorded by a stealth-aware bot
(`tools/bot.ts`, BFS avoiding watched cells, anticipating turns).
Level fix found by the bot: the 2.1 guard spawned walking towards the entrance in the same column; the entrance
was a trap (no escape before its line of sight reached the door). It now starts walking away.
Alternatives: metatile room compression (larger decoder, similar size); per-zone hand-written room code.
