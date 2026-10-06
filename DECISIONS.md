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

## D-016 — BLACKBOX text packing, chosen by measurement
Date: 2026-09-24 · Milestone: M15
Decision: a 128-entry dictionary (bytes 0x80–0xFF) chosen greedily by byte savings, where an entry may include
one adjacent space; everything else is plain ASCII 32–95 plus newline and five placeholder bytes. Measured by
`games/blackbox/tools/text.ts` over all 80 boxes and 15 log pages: raw 8 369 B → words-only dictionary 6 604 B
→ words+spaces 6 509 B (chosen). The decoder is ~40 instructions and runs into a RAM buffer, so the built-in
TEXT syscall draws whole boxes/pages in one call; a typewriter effect terminates the buffer temporarily.
Alternatives: 6-bit packing (~6.3 KB, but needs a bit-stream decoder and still a dictionary to go lower);
leaving text raw (8.4 KB).
Revisit if: the ROM overruns 32 KB at M17 (6-bit + dictionary is the next step, `DESIGN.md` §5).

## D-017 — Protocol list on the terminal; ORACLE values kept current
Date: 2026-09-24 · Milestone: M15
Decision: a box whose text is exactly `<PROTOCOL>` (D16) is shown on the full-screen terminal (it needs up to
9 lines; a dialogue box has 5). Every change to a profile counter recomputes the forecast immediately, so the
RAM state is always consistent (found by the per-frame reference-model test: after the first EMP the forecast
in RAM was stale until the next prediction).

## D-018 — Access codes shown on entering a section; D5 on the right-hand path
Date: 2026-09-24 · Milestone: M16
Decision: the access code for section n is shown when the player first enters that section's first room
(2.1, 3.1, … 7.1), not when leaving the previous one, so a code box never interrupts a room transition and
"resume" means exactly that room. Format (code.asm): section 3 bits, prediction masks 8+8, the three profile
counters 3+3+3, charges 3, 9-bit checksum over the first 32 bits; 8 symbols from a 32-letter alphabet without
I, O, 0, 1, each XORed with a per-position key. D5 (the alarm log) is reachable only by disobeying Mira at P1:
the player who disobeys learns early that the break-in was expected.

## D-019 — Level-design fixes found by playing BLACKBOX with the bot (M17)
Date: 2026-09-24 · Milestone: M17
Each was found when the recording bot could not complete a route; each is a real design flaw, fixed in the
design documents first:
- **5.4 (P5):** the guard stood in the gap's column facing the entrance — the player was seen on entering, and
  after "waiting" could not get past the guard's own body. Now it watches the row below the gap from (3,6), and
  ORACLE's warning *sets its timer* so it really turns 3 s later (ORACLE controls it). P5 = hit if the player
  gets past without a detection after the warning.
- **4.5 boss 1:** the south door (the route after refusing Mira) is in the boss's column; it re-aims every frame,
  so the player was seen on the first frame. It now powers up for 1 s (BOSS_WAKE) after the player comes in.
- **6.5:** added a charging station before the core: without it a player who used the EMP on the agent in 6.2
  could not win the 7.1 fight (the unit's panels are hackable only while it is stunned).
- **Chasers** (hunter, agent, unit) stuck on shelves when the step along the dominant axis was blocked; they
  now try the other axis.
Bot strategies (tools/routes.ts) for the bosses and for crossing 4.1's drones without the EMP compute their
timing windows from the actors' speeds and sight ranges (documented next to the code).
Alternatives: tuning the bot until it squeezed through (would have hidden the flaws).

## D-020 — BLACKBOX music and access-code entry
Date: 2026-09-24 · Milestone: M18
Decision: three original two-voice loops (ambient, alarm for the boss rooms, ORACLE from the core airlock) on the
two square channels; the noise channel is left to effects. Every effect goes through `play_sfx`, which records
the effect's channel and length (the SOUND macro emits `.sfx` plus a metadata row); the music skips notes on that
channel while the effect lasts and resumes with the next scheduled note. The music runs in every mode except
the title and the endings. Access codes are typed on a screen reached with B from the title (UP/DOWN change a
character, LEFT/RIGHT move, A submits); the decoder rejects bad characters, a wrong checksum, an impossible
section, too many charges, and hits outside the resolved predictions. Resuming restores every flag the earlier
sections imply and marks their code boxes as seen.
Bug found by the music test: the ORACLE test-hook check jumped past the music player (and the code hook) whenever
the hook was off, so no music played in normal play; fixed.

## D-021 — MEASURED: the M10 offline test is flaky (browser-initiated service-worker update check)
Date: 2026-09-24 · Milestone: M18 (affects M10, Part 1)
Measurement: 8 consecutive runs of `npm run test:e2e:offline` → 3 passed, 5 failed. Every failure is the same:
one `GET /sw.js` reaches the static server ~2 s after `context.setOffline(true)` (logged timestamps, e.g.
offline at …37758, request at …39691). All other offline assertions pass in every run (no page request left the
service-worker cache, no request failed, the scan and the game work offline).
Reasoning: Chromium performs a service-worker *update check* for the registered script on navigation; it is issued
by the browser process, which Playwright's offline emulation does not cover, so in this test environment it reaches
the (still running) server. The app's own code makes no request. On a phone that is really offline the attempt
cannot leave the device. The earlier green runs (M10, M11 clean clone) were partly lucky timing.
Not done: weakening the assertion (it is a PLAN.md criterion), or changing `apps/web` (frozen during Part 2).
Options for a human: (a) register the worker with `updateViaCache: 'all'` and serve `sw.js` with a long max-age
in production hosting and in the e2e server (app + server change); (b) make the test environment really offline
(shut the server) and assert on attempted requests through CDP instead; (c) accept the browser's update check as
out of scope for "the app makes no network requests" and state that in PLAN.md M10.

## D-022 — BLACKBOX: one second of grace on entering a room (bug found on a phone)
Date: 2026-09-24 · After M18 (human play test)
Bug: entering 2.1 from 2.6 (its N door) put the player in the office guard's line of sight at once (the guard
spawns at (7,5) looking north up the centre aisle — the D-015 fix for the S door made the N door the trap).
The detection restarted the room at the same doorway with the guard respawned the same way: an endless loop.
No recorded route used 2.6 → 2.1, so no test saw it.
Chosen: a general rule instead of moving that one guard: for GRACE_FRAMES (60) after entering a room or a
restart nobody can detect the player (`grace_t`, counted down while the actors run; `got_caught` ignores
detections meanwhile). Same idea as boss 1's BOSS_WAKE. Moving the guard alone would only move the trap again.
Test: `test/blackbox/entrances.test.ts` walks through every doorway cell of every room (66) and requires the
player to get out of sight within the grace period and stay unseen 120 frames more. With the grace period off it
fails on 2.6 → 2.1 (the reported bug) and 7.2 → 7.1 (the boss room: the same trap). The stealth reference oracle
treats frames with `grace_t > 0` as non-detecting; m14-caught checks that a restart sets the grace period, and its
route now waits out the grace period before walking into view. All replays re-recorded.

## D-023 — BLACKBOX: a music loop per section (human play test)
Date: 2026-09-24 · After M18
Observation (phone): the music was the same in every room. True by design: DESIGN.md §5 budgeted three loops
(ambient for sections 0-6, alarm in the boss rooms, ORACLE from 6.5), which M18 implemented.
Chosen: five more original two-voice loops so every section 1-7 has its own (administration: orderly D minor with
one wrong note per half; security: clipped E-phrygian pulse; laboratory: whole-tone arpeggios; underground:
almost silent; server complex: fast arpeggios shifting by ORACLE's semitone). Cost ~0.2 KB ROM; the sequencer is
unchanged. The M18 music test now reads every track (MUS_COUNT) from ROM, requires every track to be heard in the
replays, and a new test requires distinct tracks for sections 1-7. PLAN.md's "three music loops" is a minimum
already met; DESIGN.md §5 updated.

## D-024 — Part 3 planned: Bo's Skateäventyr, scope and the main design choices (proposed)
Date: 2026-10-05 · Milestone: Part 3 planning (before M19)
Decision: a side-scrolling skateboard platformer, `games/bo/DESIGN.md`. 5 worlds × (4 levels + 1 boss or set-piece
level) = 25 levels; bosses Stora Måsen (W1), Jättekaninen as a chase level (W2), Bulldozern (W3), the Backhoppet
set piece where the seagull steals the board (W4), and the final (W5). Where the human's pitch was open or
contradictory: the power-up is a big apple, distinct from the collectible apples; B tricks are always available
and candy adds the "godissnurr" (one extra jump per airtime, double trick points); the seagull is the recurring
antagonist and the board thief, and it is befriended at the end. In-game text is Swedish uppercase in the game's
own 5×6 bubble font with ÅÄÖ; everything important is also shown with pictures. Saving uses a 4-picture code
(16 bits). The engine has about ten tile/object kinds and nine enemy behaviours, which the worlds re-skin. Each
world adds at most two mechanics.
Alternatives: 5 levels + boss per world (30 levels, over the ROM estimate); Jättekaninen as a snow hare in W4 with
no boss in W2; English text as in BLACKBOX (a six-year-old Swedish player); diacritics drawn over the built-in
3×5 font (only a single line, and too small for an early reader); persistent save RAM (a runtime change, human
decision); 8-character text codes as in BLACKBOX (too hard for a six-year-old).
Why: the ROM estimate (DESIGN §16, calibrated on BLACKBOX, D-025), a six-year-old's reading and motor skills,
and no runtime change.
Revisit if: the human answers DESIGN §17 differently (defaults apply otherwise), or the M22 budget gate projects
more than 32 KB (cut list in DESIGN §16.1).

## D-025 — Bo: drawing approach and ROM estimate, measured with a mockup and the BLACKBOX listing
Date: 2026-10-05 · Milestone: Part 3 planning (before M19)
Decision: the level lives in RAM column-major (32 rows per column) and each visible column is drawn with one
`MAP` call (columns = 1 makes a column contiguous, because `MAP` reads `map + row × columns + column`). The bubble
font is stored at 1 bit per pixel and unpacked once into RAM sprites (`SPR` reads any address). The skateboard is
drawn with `RECTFILL`, so a new board costs only a colour. World tiles are planned at 2 bits per pixel, unpacked
to RAM when the world changes.
Measurement (`games/bo/mockup/`, a static screen of level 1-1 rendered by the VM): the full screen (sky, parallax
strip, 17 columns with a 5 px scroll offset, 8 sprites, Bo, a 15-character bubble, HUD) costs **1 278 cycles per
frame** (2.6 % of the budget). The font has 47 glyphs including ÅÄÖ: **376 B ROM, 1 504 B RAM**. The mockup
cartridge is 1.5 KB, and `mockup.gif` has 10 frames.
BLACKBOX calibration (address differences in `blackbox.lst`): code 10 884 B = 2 721 instructions (actors 2.7 KB,
text engine 1.6, script interpreter 1.3, player 1.2, rooms 1.0, bosses 1.0); data 15 536 B (text 7.2 KB, rooms 2.7,
tiles 1.6, sprites 0.9, music 0.6). Bo's estimate is 23.5–29 KB of 32 KB (DESIGN §16.1): little text, more
graphics and physics.
Alternatives: a ring buffer (impossible, `MAP` has no stride); a row-major buffer drawn one row per call (same
cost, but vertical scrolling and column-wise decoding are simpler column-major); the big font as 4bpp sprites in
ROM (1.5 KB instead of 376 B).
Revisit if: real level data or code size differ from the estimate at the M22 budget gate.

## D-026 — Bo's look from the human's photo; the apple power-up recolours the helmet
Date: 2026-10-05 · Milestone: Part 3 planning (DESIGN.md §17 question 1)
Decision: Bo is drawn after a photo the human shared (it is not in the repository): he always wears his pink
helmet, has light curly hair, purple knee and elbow pads, a white T-shirt, khaki trousers, grey shoes, and rides a
black board with light wheels. Palette mapping (DawnBringer 16, SPEC L3): the helmet dome is 12 with a white rim (15),
curls 14 + 9 at the back of the neck, pads 1 + 8 (two pixels: plum + blue-violet), trousers 7, shoes 10, deck 0 with
raised tails, wheels 15. Because Bo already wears a helmet, STORA ÄPPLET now turns the helmet into a red apple
(dome 6, stem and leaf drawn above it) instead of giving him one; a hit turns it pink again. Bubble line `ÄPPELHJÄLM!`.
Alternatives (rendered side by side in the VM before choosing): an all-pink helmet (12, the skin colour: it merges
with the face and reads as a bald head); a white helmet with a pink tip (reads as white); a dark brim line (reads as
sunglasses); curls across the forehead (read as a headband); pads 8 (reads blue), 2 (navy), 1 (brown); beige
trousers 12 (read as bare legs).
Measurement: with the new board drawing the mockup scene costs 1 309 cycles per frame (D-025: 1 278); the new
character sheet with two 4× drawings costs 8 100. The mockup cartridge is 1 972 B, and its GIF has 12 frames and
decodes back to the identical cartridge.
Revisit if: the human prefers another variant, or the palette ever changes (it is locked).

## D-027 — Bo: an identity pass after the human's review (no new mechanics)
Date: 2026-10-05 · Milestone: Part 3 planning
Decision (from the human's eight review points; DESIGN.md §0.2, §1, §5, §8.2–8.5, §9, §11.1, §4):
- **Bo's signature** (§0.2): push kicks with the back foot on the ground, leaning forward above 2 px/frame, leaning
  back and dust when braking, an idle pop after 3 s, balancing after 8 s, `WIII!` after a clean grind, looking back
  after a landing with at least 0.8 s of air. These are visual only: they never move Bo or change his box, and any
  button cancels the idle ones. Most are offsets and mirrors of existing sprites.
- **One message per power-up:** 🍎 = protection, 🍟 = speed, 🍬 = one extra jump. Pommes lost its extra rules
  (breaking weak obstacles, bumping enemies away). Everything now follows from the speed, plus feedback: the music
  plays 1.5× faster, push kicks speed up and the board vibrates. Godis lost the double trick points. The seagull
  still takes the pommes (it is the story's running gag).
- **The apple language** (§8.4): rows, arcs, columns and a "KOLLA" apple sticking out of a hedge, with the rule
  "apples never lie". The generator computes arcs from the physics, and tests check a route per pattern.
- **Godis is the discovery mechanic** (§8.5): it always lies near something that looks out of reach, seen first.
  **Pommes stretches**: ramps with arcs computed for pommes speed and no ground enemies.
- **A memory per world** (§8.2), and every `POFF` is a joke (§9). **The seagull's journey** (§11.1): it is always
  hungry and steals one food per world, which the ending pays off. **SUPERBOSSE** (§4): a secret 3000-point trick,
  unlocked by finishing the game (picture-code world value 6), never needed.
- Rendering detail for secrets: sparse foreground (hedges and bushes drawn over Bo, with holes).
Alternatives: keeping pommes' extra rules (more for a six-year-old to learn, and the human asked for one clear
message); unlocking SUPERBOSSE from the start (it should be a reward to show off); hiding secrets only above the
screen (that needs 32-row levels, which the first level should not need).
Measurement (mockup, three screens): scene with push animation 1 356 cycles per frame, character sheet 8 103, and
the signature sheet 9 379 (one 2× pose per frame via PGET). The cartridge is 2 544 B and the GIF 15 frames; it
decodes back to the identical cartridge. Estimated ROM cost of the identity details: ~0.7 KB (DESIGN §16.1).

## D-028 — The first ten minutes are specified before any level is built
Date: 2026-10-05 · Milestone: Part 3 planning (affects M22)
Decision: `games/bo/FIRST10.md` fixes the title screen, the intro (15 s, skippable), level 1-1 column by column
(208 columns, a two-minute target), the first three minutes of 1-2, nine rules the tests check, and the observation
list for the human's Bo test. Choices: the first play goes straight from the intro into 1-1 with no map. Until the
first checkpoint (about the first minute) nothing can cost a life: there are no pits, water or enemies, and walls only
stop him. The box with the apple helmet sits in the way before the first enemy, with an apple arc leading onto it, and
1-1 and 1-2 have no pits or water at all. Every lesson is taught without text (geometry, apples, three pictogram signs), with a
blinking hint after 2–3 s of standing still. The first secret is a sparse hedge on the garage roof rather than a
climb above the screen, so 1-1 stays one screen tall. Jump numbers were computed with the §3 physics: kicker with A
at a 1.8 px/frame lip = 64 px high, 12 tiles long; bin window 11–41 px after takeoff.
Alternatives: start on the world map (an extra step before the first push); a tree climb to a hidden treehouse
(needs precise jumps and a vertical camera in the first level); a text tutorial (excludes a child who cannot read
yet).
Revisit if: the Bo test (FIRST10.md §9) shows where it does not work.

## D-029 - Bo engine (M19): level format, physics details the design left open
Date: 2026-10-05 - Milestone: M19
Decision:
- **Level sources** (`games/bo/levels/FORMAT.md`): a terrain profile (flat, 22.5/45 degree hills, gaps, liquid
  pits, steps, materials) plus an object list sorted by column. Heights count tiles from the bottom of the
  32-row buffer; a 16-row level uses rows 16-31. In ROM: one byte per terrain segment and 4 bytes per object
  (+ extras); apple arcs are expanded by the generator from the physics into cells (one apple per 16 px).
- **Tiles**: fixed codes with fixed meaning in every world (1-26 structure, 27-50 common items, 64-95 per world),
  2 bits per pixel with a 4-colour palette per tile and *shared* pixel patterns (a slope drawn once is recoloured
  per world: a tile costs 3 bytes per world plus its pattern once). 96 codes = 3 KB RAM.
- **Kickers are their own class (RAMP)**: a height-mapped surface without slope deceleration. Otherwise the
  speed "at the lip" could never be 3.5 px per frame (a 45 degree ramp costs 2 per frame on the way up), and the
  ramp rows of DESIGN 3.3 would be unreachable. Terrain hills (SLOPE) decelerate up and accelerate down.
- **Down = crouch, not brake.** DESIGN 2 says "huka ... bromsar lite. Hall ned for att stanna"; 3.2 said BRAKE
  applies to down or the opposite arrow. Braking at 3 per frame would stop Bo before he is under a bar, so down
  crouches with a gentle `CROUCH_FRIC` (1 per 2 frames) and the opposite arrow brakes. Added to 3.2.
- **The brake holds Bo still on a slope** once he has stopped. This also lets the tests measure "from
  standstill" on a slope (DESIGN 3.3).
- **Air steering** `AIR_ACC` (1 per 2 frames), never beyond the push speed; added to 3.2.
- **Pushing at exactly the push speed holds it** (no friction tick); above it (after a hill) Bo rolls out.
- **Ollie on an up-slope or a ramp** adds the launch (speed x slope) to JUMP_V, capped at LAUNCH_MAX: "A at
  the lip" works anywhere on the ramp, which is forgiving for a six-year-old and gives the same numbers.
- **Collision model**: feet sensor in the middle (steps up at most 6 px, follows down |dx| + 1 px), two edge
  sensors (flat tops exactly at the feet), body box 6 x 14 (crouching 6 x 9) above the board for walls and
  heads. One-way surfaces only from above.
- **Physics constants live in a ROM table** (`phys`, `PH_*`) that the engine reads, so the test can compare
  the ROM against DESIGN 3.2 directly.
- **Test levels are reached by input** (replays are pure input): until M22 the cartridge starts in a test
  menu; from M22 it will be reached from the title screen.
Measurement (M19 replays, from RAM): ollie 26.56 px / 34 frames; tap 5.25 px / 14 frames; jump length at
1.5/2.5/3.5 px per frame 51/85/119 px; push 0-24 24 frames 18.75 px; coasting 96 frames 73.5 px; brake from
24 8 frames 5.25 px, from 40 14 frames 15.44 px; downhill 22.5/45 degrees 56 frames 99.75 px / 28 frames
50.75 px. All within DESIGN 3.3's rounding. Play frames ~1.4k cycles; loading frames up to 15k (terrain 64
columns per frame; tile unpacking split over two frames after a 25.6k-cycle first try).
Alternatives: down brakes at BRAKE (no way under bars); kickers as terrain slopes (3.5 px per frame at the
lip impossible); a ring buffer for the level (impossible with MAP, D-025).

## D-030 - Bo skate mechanics (M20): rules the design left open
Date: 2026-10-06 - Milestone: M20
Decision:
- **Tricks**: B in the air starts one trick at a time; it scores when its frames have passed (DESIGN 4).
  GRAB lasts while down+B are held, at least 12 frames, and scores 50 + 10 per full 8 frames beyond the first 12;
  a grab still held at landing counts as clean. A landing with any other trick in progress is sloppy: speed
  halved (truncated), the combo lost, OJ!, no damage. 360 needs 40 frames, so only a ramp gives the air for it.
- **Combos**: every completed trick of one airtime plus a grind adds its points; a clean landing on the ground
  scores the sum x the number of tricks (OLLIE is named in the combo text but counts 0 and does not multiply,
  as in DESIGN's `OLLIE + KICKFLIP = 100`). Landing on a rail keeps the combo going (GRIND is added once per
  rail, then 10 points per 8 frames); a trampoline bounce does not end it. Clean landings give TRICK_BOOST per
  trick up to the speed cap. The combo text is drawn with the built-in font for 1 s.
- **A at the lip**: besides an ollie anywhere on the ramp (D-029), A within LIP_GRACE = 6 frames after a ramp
  launch still adds the ollie (capped at LAUNCH_MAX).
- **Grind**: landing on a rail or rolling onto one starts it; flat rails have no friction, diagonal ones
  accelerate like a 45 degree hill; A is an ollie off; at the end of a rail Bo flies on with his velocity (down
  a down-rail: vy = speed). WIII! when a grind of at least 16 frames ends, at most every 5 s.
- **Breakables**: landing on a weak block or a box clears exactly that object's cells (found in the ROM object
  list) and Bo bounces up with STOMP_V = 40. A box leaves its content in its own cell (apples: up to five in a
  column upwards, into empty cells).
- **Lives**: water/chocolate/a pit cost a life even with the apple helmet (DESIGN 6); the helmet stays. Respawn
  at the last flag passed; at 0 lives FORSOK IGEN! and the level loads again with 5 lives (counters kept).
- **Signature**: the idle pop plays once at 3 s for 24 frames, balancing from 8 s until a button; looking back
  for 0.5 s after a landing with at least 48 frames in the air; poses never touch position or box.
- **Wheels**: a click (noise, 2400 Hz, 2 frames) every 16 px rolled on the ground, none on ice. The soft
  rolling noise of DESIGN 15 is left for the M25 sound pass (it would cut off the board's noise effects on the
  same channel without the sequencer's channel bookkeeping).
- **DESIGN 3.3** gains the sand row (coasting out from 1.5 px per frame: 24 frames, 17 px), derived from
  SAND_FRIC, so the M20 test has a document value to compare with.
- **T3**: each high-speed kicker sits at the bottom of a hill (RAMP keeps the speed to the lip) and a hill climbs
  back up after its landing zone; the bot regulates the launch speed exactly by braking and searching over when
  to start.
Measurement (m20-t3): launches 45 degrees without ollie at 1.5/2.5/3.5: 5.25/15.44/30.94 px, 2.81/8.13/16.19
tiles; with ollie at 2.5/3.5: 64.19 px, 53 frames, 16.56/23.19 tiles; 22.5 degrees with ollie at 1.5/2.5:
40.69/51.75 px, 7.88/15.00 tiles; ice brake from 2.5: 80 frames, 100 px; sand: 24 frames, 17.25 px. ROM 16.1 KB
(code 12.1 KB), max 15.1k cycles per frame (loading), play frames under 2k.
