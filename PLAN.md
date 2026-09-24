# PLAN.md — Milestones and acceptance tests

Work in order. Each milestone lists its acceptance criteria and the command that proves them.
Command names below are the intended npm scripts; create them. A milestone is done only when its
command passes (see `CLAUDE.md`).

Testing is split into three **transport layers**, never debugged together:

- **Layer 1** — bytes → fountain → bytes (no images)
- **Layer 2** — bytes → packets → QR images → QR decoder → bytes (clean images)
- **Layer 3** — same as layer 2 with simulated camera distortion

---

## M0 — Scaffold

- npm workspaces per `SPEC.md` §3, TypeScript strict, Vitest, ESLint, Playwright installed.
- `npm run check` = typecheck + lint + unit tests.
- `CLAUDE.md` *Commands* section filled in.

**Accept:** `npm run check` passes on a clean clone after `npm ci`.

## M1 — Cartridge format

- Serialize/parse, deflate-raw compression, SHA-256 verification, `FORMAT.md` written.

**Accept:** `npm test -w packages/cartridge`
- round trip for random bodies of 0 B, 1 B, 1 KB, 50 KB, compressed and uncompressed
- rejects: wrong magic, unknown version, truncated data, any single flipped bit in body (hash)
- Node zlib and a `DecompressionStream`-compatible path produce identical output

## M2 — Transport, layer 1 + benchmark

- Packet format with CRC, documented PRNG, robust soliton distribution, LT encoder, peeling decoder,
  systematic mode, `PACKET.md` written.

**Accept:** `npm test -w packages/transport`
- round trip of random 50 KB input over ≥ 200 seeded trials
- arbitrary order, duplicates, and extra packets after completion are all handled
- any packet with a corrupted byte is rejected by CRC and never enters the decoder
- packets from a different cartridge id are ignored
- for every seeded trial, the decoder reconstructs the input once the benchmark-defined sufficient packet count has been received; if peeling stalls, it keeps accepting repair packets or uses the permitted Gaussian-elimination fallback (no hard overhead number asserted)

**Benchmark:** `npm run bench:fountain` → writes `bench/fountain.md`
- K ∈ {32, 64, 128, 256}; loss ∈ {0, 10, 20, 30, 40 %}; pure LT vs systematic; 100 trials each
- report: packets needed for 50 / 90 / 99 % decode success, as overhead % over K
- **success rate = fraction of trials that fully reconstruct the input and pass the hash**, never fraction of blocks recovered
- choose the default mode and record it in `DECISIONS.md`

## M3 — Minimal VM + assembler

- Enough CPU, syscalls (clear, text) and assembler to run `games/hello`.
- Headless runner: `qrc run <cartridge> --frames N --dump-frame out.png`.

**Accept:** `npm test -w packages/vm -w packages/asm`
- opcode unit tests
- `games/hello` assembles to a cartridge, runs headless, frame 1 matches committed reference image
- reference images and hashes are generated **from the VM framebuffer**, never from a browser canvas, so a canvas-backend bug cannot mask a VM bug
- the VM rejects a cartridge with an unsupported ISA version

## M4 — Layer 2 + first vertical slice

- QR frame generation (byte mode), GIF output, image-level decode helper using the chosen local decoder.

**Accept:** `npm run test:slice`
- `hello.asm` → cartridge → packets → QR images → decode each image → fountain decode → verify →
  VM → frame 1 matches reference image
- the same through a real GIF file: write GIF, read frames back, decode

## M5 — Layer 3 + QR benchmark

- Distortion simulator: scale 0.5–1.5×, rotation ±10°, mild perspective, blur, noise, reduced contrast.

**Accept:** `npm run test:qr-robust` — default parameters decode ≥ 95 % of frames at moderate distortion
(define "moderate" in `DECISIONS.md` before measuring, not after).

**Benchmark:** `npm run bench:qr` → `bench/qr.md`
- decode success rate per QR version (10–15) × ECC (L/M/Q) × distortion level, for each candidate decoder
- choose decoder and defaults; record in `DECISIONS.md`

**Transfer estimate** in `bench/qr.md` for a 50 KB cartridge with the chosen defaults:
blocks → packets needed at 20 % frame loss → seconds at the chosen frame duration → effective KB/s.

## M6 — Full VM

- All syscalls in `SPEC.md` §7: sprites, tilemap, rect overlap, RNG, sound commands, cycle budget.
- Determinism harness: `qrc replay <cartridge> <inputs.json> --frames N` prints a hash per frame.
- `VM.md` complete (opcode table, memory map, syscalls, calling convention).

**Accept:** `npm test -w packages/vm`
- syscall tests; cycle-budget test (infinite loop cartridge ends frame deterministically)
- same cartridge + seed + inputs run twice ⇒ identical per-frame hashes for 500 frames

## M7 — Breakout

**Accept:** `npm run test:games`
- assembles; cartridge size reported (target ≤ 10 KB, *measure*)
- scripted input sequence for 500+ frames matches committed per-frame hash reference
- a scripted run demonstrably breaks at least one brick and loses at least one life (asserted via VM RAM or framebuffer)

## M8 — Second game

**Accept:** `npm run test:games` includes the second game with the same kind of checks, and
`git diff <M7 commit> -- packages apps` is **empty** for this milestone's commits.
No game-specific code may be added anywhere outside `games/<name>/` — not in a shared helper package,
not in the assembler, not in the web app.
If a runtime or assembler change is truly needed, it is a generic feature, made in a separate commit with a
`DECISIONS.md` entry explaining why it is not game-specific, and Breakout's references still pass.

## M9 — PWA: scanner, library, player

- Scan / Library / Play screens per `SPEC.md` §9; canvas and WebAudio backends; touch + keyboard.

**Accept:** `npm run test:e2e` (Playwright, Chromium)
- load a cartridge file directly into the player (test hook) and verify rendered canvas matches the VM reference frame
- fake camera: generate `.y4m` from the Breakout GIF (own encoder or ffmpeg if present), launch Chromium with
  `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<file>`, scan to 100 %, press PLAY,
  verify first frame
- cartridge persists in Library after page reload

## M10 — Offline

**Accept:** `npm run test:e2e:offline`
- production build served, page loaded once, then `context.setOffline(true)`, reload
- app starts, Library shows stored cartridge, fake-camera scan of the second game completes, game plays
- zero network requests after going offline (assert on request log)

## M11 — CLI, docs, report

- `qrc build <game dir>` → `.qrc`
- `qrc encode <file.qrc> --out game.gif [--version --ecc --frame-ms]`
- `qrc inspect <file.gif|file.qrc>` → id, size, blocks, frames, parameters
- `qrc decode <file.gif> --out file.qrc`
- `README.md`: install, test, dev server, build, generate demo GIFs, scan on a phone
- `REPORT.md`: what works, test results, benchmark summary, known limitations, next steps —
  each claim marked *tested automatically* / *measured* / *not verified*

**Accept:** from a clean clone: `npm ci && npm run demo` builds both games, writes both GIFs to `demo/`,
decodes them back with the CLI, and verifies hashes. `npm run check && npm run test:e2e:offline` pass.

---

## Final definition of done

All milestone commands pass from a clean clone, `demo/` contains GIFs for both games, and `REPORT.md` exists.

## Manual acceptance (human only — the agent must not claim this)

1. Serve the production build to the phone over a **secure context** (camera and service worker
   require it): either `adb reverse tcp:<port> tcp:<port>` and open `http://localhost:<port>`, or
   `npm run preview:https` (self-signed cert), or a one-time static deploy. The agent documents all
   three in `README.md` and provides `preview:https`. Open in Android Chrome and install the PWA.
2. Turn off Wi-Fi and mobile data on the phone.
3. Show `demo/breakout.gif` full-screen on a laptop.
4. Scan in the app until 100 %, press PLAY, play.
5. Repeat with the second game.

---

# Part 2 — BLACKBOX (added 2026-09-24 at the human's request)

A large original game that proves the console can carry a rich, story-driven adventure. Design is complete
and is the **specification** for these milestones:

- `games/blackbox/DESIGN.md` — locked design decisions, ORACLE prediction engine, room format, budget
- `games/blackbox/LAYOUT.md` — all 37 rooms (validated by `test/blackbox-layout.test.ts`)
- `games/blackbox/DIALOGUE.md`, `games/blackbox/LOGS.md` — all text (validated by `test/blackbox-text.test.ts`)

Rules for M12–M18 (in addition to CLAUDE.md):

- **The runtime does not change.** M12 may change only the assembler and tools (plus one read-only trace
  hook in the VM for `--trace`, D-013). From the M12 commit on,
  `git diff <M12 commit> -- packages/vm packages/cartridge packages/transport packages/qr apps` must stay
  **empty** through M18, exactly like M8. If a generic runtime change proves unavoidable (e.g. ISA v2 with
  a larger ROM, see `DESIGN.md` §5), it is not made silently: record the measurement in `DECISIONS.md`,
  flag it under *Blocked / needs human* in `PROGRESS.md`; a human decides.
- **The design documents are the test oracle.** Whatever the engine holds in RAM or ROM (rooms, text,
  prediction state) is compared against the documents, not against itself.
- **All game code lives in `games/blackbox/`** (several `.asm` files joined with `.include` are fine).
- Every milestone has recorded replays (`games/blackbox/replays/*.json`) with committed per-frame hashes,
  generated from the VM only (`npm run refs:games`), and assertions in `games/blackbox/checks*.ts`.
- **Budgets, asserted in every replay:** no fault, 0 cycle-budget overruns, max cycles per frame
  ≤ 25 000 (half the budget); ROM size reported by `test:games` (target ≤ 32 KB, *measure* until M17).

The test command for all BLACKBOX milestones is `npm run test:blackbox` (a Vitest project for
`test/blackbox/**`); each milestone adds to it and never removes earlier checks.

## M12 — Tools for a large game

- Assembler: `.include "file.asm"` (only files in the same game directory; errors report the included file
  and line), `.macro NAME p1, p2 … .endm` with parameter substitution and per-expansion local labels.
- `qrc build` also writes `<game>.sym` (symbol → address) and a listing (address, bytes, source line).
- `qrc run --ram sym[,sym…]` prints named RAM values per frame; `--trace N` prints PC and registers for the
  first N instructions of a frame.
- `docs/PROGRAMMING.md` documents both features with a tested example.

**Accept:** `npm test -w packages/asm -w packages/tools` (new macro/include/symbol/listing/trace tests) and
`npm run check`; `npm run test:games` unchanged (hello, Breakout and Pong assemble to identical sections).

## M13 — Engine: rooms, movement, HUD

- Room data in ROM in the compact format of `DESIGN.md` §3.1, unpacked into the 16×15 RAM buffer on entry;
  `SYS MAP` draws from RAM; player movement with tile collision; exits, doors, vents and warps between rooms;
  HUD row; room flags persist.
- All 37 rooms encoded, with the locks, flags and warps of `LAYOUT.md`.

**Accept:** `npm run test:blackbox`
- for **every room**, the RAM buffer after unpacking equals the `LAYOUT.md` grid tile class by tile class
  (a TypeScript decoder of the ROM room table is also compared against `LAYOUT.md`)
- a replay walks 0.1 → 1.1 → 1.2 → 1.3 → 1.4 → 2.1 and back; per-frame hashes match; in every frame the player
  box overlaps no blocking tile of the current room (checked against `LAYOUT.md`, not against the engine)
- a locked door does not open without its flag and opens with it

## M14 — Stealth: guards, cameras, drones, EMP

- Guards (patrol, turn, line of sight along rows/columns, `=` does not block sight), static cameras, drones,
  heavy guard, hunter, prototype, ORACLE agent as described in `LAYOUT.md`; detection restarts the room;
  EMP with charges and charging stations.

**Accept:** `npm run test:blackbox`
- replays: sneaking through 1.1, 1.3 and 1.4 undetected; being caught (room restarts with the player at the
  entry and the room state reset); drones stunned by EMP for the documented time; EMP charges and recharge
- every detection in every replay is confirmed by a **TypeScript reference line-of-sight** computed from the
  RAM positions and the `LAYOUT.md` grid, and no frame has line of sight without a detection

## M15 — Text and the ORACLE engine

- Dialogue box (1 + 5 × 31) and full-screen terminal (32 × 21), text stored compactly (packing chosen by
  measurement and recorded in `DECISIONS.md`), barks, yes/no prompt.
- ORACLE state (`DESIGN.md` §2.1), the accuracy display `974 − misses` in tenths, THIS SUBJECT `hits/resolved`,
  the P8 forecast rule, the protocol list (D16).

**Accept:** `npm run test:blackbox`
- a TypeScript decoder of the ROM text reproduces **every box of `DIALOGUE.md` and every page of `LOGS.md`**
  byte for byte (placeholders excepted)
- rendered dialogue and terminal frames match committed reference frames (from the VM)
- a TypeScript reference model of the ORACLE engine, fed the same events, gives the same RAM state after every
  frame of every replay; accuracy and P8 guess tested for all combinations of misses and profile counters

## M16 — Content, sections 0–3

- Intro, entrance, administration, security: all rooms, enemies, items, dialogues D1–D6, logs L1–L3,
  predictions P1–P2 (asked), access codes shown at section ends (display only; entry comes in M18).

**Accept:** `npm run test:blackbox` — replays from 0.1 to the lift in 3.5 both ways at P1 (left first; right
first then left), asserting P1 hit/miss, D5 seen only on the right-hand path, and the flags of `LAYOUT.md`.

## M17 — Content, sections 4–7, bosses and endings

- Labs, underground, servers, core: both bosses, D7–D20, L4–L10, P2–P8, all four endings.

**Accept:** `npm run test:blackbox` — full-game replays from 0.1 to an ending:
- **R1** obedient: follows every Mira instruction, says yes at P3, takes LEFT at P7 → ending E1, accuracy 97.4 %
- **R2** refuses Mira at P3 (prototype-hall route), takes RIGHT, pulls the cable → ending E4 with the accuracy
  before/after and THIS SUBJECT equal to the TypeScript reference model
- **R3** RIGHT, menu choice equal to the forecast → E2; **R4** a different menu choice → E3
- together the replays reach every D1–D20, L1–L10 and P1–P8 (event trace in RAM)
- ROM size ≤ 32 KB, or the measured overrun recorded and flagged for a human (ISA v2 decision)

## M18 — Music, access codes, delivery

- Three music loops and sound effects (`DESIGN.md` §5); access-code entry and resume (`DESIGN.md` §2.4).
- BLACKBOX delivered like the other games: `npm run demo` also writes `demo/blackbox.gif`.

**Accept:**
- `npm run test:blackbox`: every access code round-trips (TypeScript reference encoder ⇄ VM decoder) for all
  sections and for random prediction/profile states; a replay enters a code and resumes with identical
  ORACLE state; music commands follow the note data; SFX interrupt and music resumes
- `npm run test:e2e`: the BLACKBOX GIF scanned with the fake camera to 100 %, PLAY, first frame matches
- `npm run demo` verifies the BLACKBOX GIF round trip; `npm run check` green
- `REPORT.md` gains a BLACKBOX section (tested / measured / not verified)

## Manual acceptance for Part 2 (human only)

Scan `demo/blackbox.gif` on a phone, play through at least one ending, and judge the one thing tests cannot:
whether it is any good.
