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
