# REPORT — QR Console prototype

Every claim is tagged:
**[tested]** = asserted by an automated test that passes · **[measured]** = number produced by a script, not a
pass/fail gate · **[not verified]** = not checked by the agent.

All milestone commands were re-run from a fresh `git clone` + `npm ci` on 2026-09-24 (headless Chromium via
Playwright, Node 22, Linux dev container) and passed. **No real phone or camera was used.**

## What works

| # | Capability | Status |
|---|---|---|
| 1 | Cartridge format `QRC1`: header, title, ISA version, deflate-raw, SHA-256 body hash, 3 sections; rejects bad magic/version, every truncation length, every single flipped body bit; Node zlib and `DecompressionStream` agree | [tested] `npm test -w packages/cartridge` (30 tests) |
| 2 | Fountain transport: 25-byte-overhead packets with CRC-32, LT (robust soliton) and systematic modes, peeling + Gaussian elimination; order-independent, duplicates/extra/foreign-id packets handled, every corrupted byte rejected by CRC; 200 × 50 KB random trials per mode with 20 % loss, shuffling and duplicates | [tested] `npm test -w packages/transport` (17 tests) |
| 3 | 16-bit VM (33 opcodes, 17 syscalls, 50 000-cycle budget, ROM/RAM map) + assembler (labels, local labels, constants, `.sprite` ASCII art, `.sfx`, `.var`) | [tested] `npm test -w packages/vm -w packages/asm` (53 + 18 tests) |
| 4 | Determinism: same cartridge + seed + inputs ⇒ identical per-frame state hashes (500 frames); one changed input or seed changes them; `qrc replay` prints them | [tested] |
| 5 | Layer 2 vertical slice: `hello.asm` → cartridge → packets → QR images / real GIF (shuffled, frames dropped) → decode → fountain → verify → VM → frame 1 equals the committed reference | [tested] `npm run test:slice` |
| 6 | Layer 3: default parameters decode **199/200 = 99.5 %** of frames at "moderate" simulated distortion (threshold 95 %), 0 wrong decodes; the transfer completes | [tested] `npm run test:qr-robust` |
| 7 | Breakout: paddle, ball, 40 bricks (tilemap), score, lives, game over/restart, sound; 1200-frame scripted replay matches committed hashes; breaks bricks, loses lives, reaches game over | [tested] `npm run test:games` |
| 8 | Pong (player vs CPU, first to 5): 1800-frame replay matches; both sides score, rallies, match won and restarted — added with **zero changes** to `packages/` and `apps/` (`git diff bd2e1b8 aecdde2 -- packages apps` is empty) | [tested] |
| 9 | PWA: Library (IndexedDB), Scan (camera → zxing in a Web Worker → fountain → verify), Play (canvas, WebAudio, touch + keyboard). Canvas output equals the VM reference frame byte-for-byte for hello, Breakout, Pong | [tested] `npm run test:e2e` |
| 10 | Fake-camera scan of the Breakout GIF (as `.y4m`) to 100 %, PLAY, first frame matches, cartridge persists after reload and plays from the Library | [tested] `npm run test:e2e` |
| 11 | Keyboard (arrows, Z, X) and on-screen touch buttons reach the VM input; A starts a game | [tested] `npm run test:e2e` |
| 12 | Offline: after one online load, offline reload starts the app, Library shows the stored cartridge, fake-camera scan of Pong completes and plays; the service worker made no network fetches, no page request failed, every page request was answered from the SW cache | [tested] `npm run test:e2e:offline` — **but see the correction below: the "zero requests reached the server" assertion fails in 5 of 8 runs** |
| 13 | CLI `qrc build / encode / decode / inspect / run / replay`; `npm run demo` builds both games, writes `demo/breakout.gif` and `demo/pong.gif`, decodes them back and the SHA-256 matches | [tested] |
| 14 | Installable manifest + icons, `preview:https` with a self-signed certificate | [tested] build + HTTPS smoke test only; **installation on a phone [not verified]** |
| 15 | Audio: VM emits correct audio commands [tested]; that the WebAudio backend *sounds* right | [not verified] |

### Correction (found in Part 2): the offline test is flaky

The Part 1 claim that `npm run test:e2e:offline` passes was true for the runs made then, but **measured over 8
consecutive runs it passes 3 times and fails 5 times** [measured]. Every failure is a single `GET /sw.js` reaching
the test server about 2 s after going offline: Chromium's service-worker *update check* on reload, issued by the
browser process, which Playwright's offline emulation does not cover. The app's own code makes no request, and
every other offline assertion holds in every run. On a really offline phone the attempt cannot leave the device
[not verified on a device]. The assertion was not weakened; fixing it needs a change in `apps/web` (frozen during
Part 2) or a decision about what the criterion means — options in DECISIONS.md D-021.

## Benchmark headlines

**Fountain (layer 1)** — `bench/fountain.md`, 100 trials per cell, success = full reconstruction + hash [measured]:

| K | loss | systematic p99 overhead | pure LT p99 overhead | floor |
|---:|---:|---:|---:|---:|
| 128 | 20 % | 38 % | 61 % | 25 % |
| 256 | 20 % | 34 % | 44 % | 25 % |
| 256 | 0 % | 0 % | 37 % | 0 % |

Default = **systematic with dense repair packets (degree ≥ K/2), peeling + GE** (D-003). Plain soliton repair
packets were measured at ~79 % overhead under 20 % loss and abandoned.

**QR (layers 2–3)** — `bench/qr.md`, versions 10–15 × ECC L/M/Q × 4 distortion levels, 30 frames per cell,
in Node [measured]:

| decoder | moderate, all cells | v12-M moderate | mean decode time |
|---|---:|---:|---:|
| jsQR 1.4 | 0 % | 0 % | 20–100 ms |
| zxing-wasm single pass | 90 % | 97 % | ~2.5 ms |
| **zxing-wasm + GlobalHistogram fallback (shipped)** | **99 %** | 97 % | ~2.8 ms |

Chosen: zxing-wasm with fallback; defaults unchanged at **v12, ECC M, 150 ms/frame** (262-byte payload per frame).
How the fallback was found (the first robust run measured 92.5 % and failed) is recorded honestly in D-007.

**50 KB cartridge transfer** [measured]:

- Simulation (Node, i.i.d. 20 % frame loss, loop of 294 frames, K = 196): p50 246 / p90 259 / p99 269 frames
  shown → **~39 s at p90, 1.29 KB/s** (`bench/qr.md`).
- Browser pipeline (headless Chromium, clean fake camera, `npm run bench:scan`): **34.7 s, 1.44 KB/s**,
  4 ms per decode (`bench/scan.md`).

**Cartridge sizes** [measured]: Breakout **877 B** (target ≤ 10 KB met), Pong **789 B**, HELLO WORLD 126 B —
each fits in **4 QR frames** (8-frame loops, 1.2 s).

## Part 2 — BLACKBOX

An original stealth adventure (story, characters, pixel art and music all made for this project), designed in
`games/blackbox/DESIGN.md`, `LAYOUT.md`, `DIALOGUE.md`, `LOGS.md` and built with **no change to the runtime**:
`git diff 5a7ca7d -- packages/vm packages/cartridge packages/transport packages/qr apps` is empty after M12
[tested]. The only VM change in Part 2 is a read-only trace hook, added before that baseline (D-013).

| # | Capability | Status |
|---|---|---|
| B1 | Tools: `.include`, `.macro` with local labels, symbol file, listing, `qrc run --ram/--trace` with disassembly | [tested] `npm test -w packages/asm -w packages/tools` |
| B2 | All 37 rooms: the ROM room table (decoded independently) and every room unpacked into RAM by the engine equal `LAYOUT.md` tile class by tile class | [tested] `npm run test:blackbox` |
| B3 | Movement and collision: in every frame of every replay the player's box overlaps no blocking tile of `LAYOUT.md`; locked doors hold until their flag | [tested] |
| B4 | Stealth: every detection in 10 replays is confirmed by an independent line-of-sight model, and no frame has sight or contact without a detection; the room restarts with the player at the entrance and actors reset; EMP stuns machines for exactly 240 frames; charges and recharging | [tested] |
| B5 | Text: all 80 dialogue boxes and 15 log pages in ROM equal the documents byte for byte; dialogue box and terminal reference frames | [tested] |
| B6 | ORACLE engine: derived values equal a reference model in every frame of every replay; accuracy, THIS SUBJECT and the forecast checked for all 6 561 prediction states and all 512 profiles, against the long formula (974 + c)/(1000 + n) | [tested] |
| B7 | Four endings played end to end by recorded bot replays: E1 obedient (accuracy 97.4 %), E4 cable (PREDICTION ERROR), E2 forecast (CONFIRMED), E3 other (RECALIBRATING); the accuracy screen text equals the model; together with the M16 run they reach all D1–D20, L1–L10, P1–P8 | [tested] |
| B8 | Access codes: 306 states round-trip (independent encoder → VM decoder); a replay types R1's code and resumes with R1's exact ORACLE state; 3 720/3 720 single-character typos rejected | [tested] / [measured] |
| B9 | Music: 761 notes in three replays equal a reference sequencer reading the note data from ROM; effects mute their channel and the music resumes (43 times) | [tested] |
| B10 | Delivery: `demo/blackbox.gif` (87 frames, 13.1 s loop, 1.2 MB) decodes back byte-identical; the unchanged web app scans it with a fake camera to 100 % (11 s) and renders the VM reference frame | [tested] `npm run demo`, `npm run test:e2e` |
| B11 | Size and speed: ROM 26.1 KB of 32 KB (80 %), cartridge 15.0 KB; heaviest frame in any replay well under the 25 000-cycle limit | [measured] |
| B12 | Whether it is fun; how it sounds; playing it on a phone | [not verified] — the human's manual check |

Design flaws found by making a bot play the game (each fixed in the design documents first, D-015, D-019): a
guard walking into the entrance of 2.1, the 5.4 guard post that could not be passed, boss 1 seeing the player
through the south door on the first frame, a missing charging station before the final fight, chasers stuck on
shelves. Engine bugs found by the tests: a clobbered register in room transitions, a stale forecast in RAM, and a
jump that skipped the music player entirely.

## Known limitations

- **Real-device scanning is not verified.** The distortion simulator (scale, rotation, perspective, blur,
  contrast, noise, illumination) does not model moiré between screen pixels and the camera sensor,
  rolling shutter, motion blur, autofocus hunting, glare, or GIF frames caught mid-refresh. [not verified]
- Decoder benchmarks ran in Node on an x86 dev container; decode time on a phone is unknown. [not verified]
- Frame loss is modelled as i.i.d. 20 %; a real camera loses frames in bursts and duplicates others.
- The fake camera in e2e delivers perfect frames, so e2e tests prove the pipeline, not optical robustness.
- iOS/Safari: not tested (best-effort per L12). [not verified]
- WebAudio output quality and touch-control ergonomics on a real phone. [not verified]
- The service worker uses `skipWaiting`/`clients.claim`; an update could swap assets under a running session.
  Acceptable for a prototype.
- Git history: commit 8bec378 (and possibly 4436750) had a red `npm run check` because the `unit` test
  project also globbed the slow suites; fixed in d53dc27. All later commits were verified green.
- The offline e2e test is flaky (above); `npm run check` takes about 2½ minutes now that it replays BLACKBOX.
- BLACKBOX replays are recorded by a bot, so "completable" means completable by that bot's routes; difficulty
  and fairness for a human player are [not verified].

## Next steps

1. Human manual acceptance on an Android phone (README, *Scan on a phone*). If scanning is slow or flaky, first
   try `qrc encode --scale 10` (bigger modules), then `--ecc Q`, then `--frame-ms 200`.
2. Capture a few real camera frames of the demo GIF and add them as fixtures to `test:qr-robust`, so the
   simulator can be calibrated against reality.
3. If larger cartridges matter: measure GE cost in the browser at K ≈ 500–1000, consider a Raptor-style precode.
4. Optional APNG output (L10 allows it); BarcodeDetector cannot be used because it returns text, not raw bytes (L9).

## Where to look

`SPEC.md` (what) · `PLAN.md` (how it is proven) · `PROGRESS.md` (status) · `DECISIONS.md` (D-001 … D-011) ·
`packages/cartridge/FORMAT.md` · `packages/transport/PACKET.md` · `packages/vm/VM.md` · `packages/asm/ASM.md` ·
`bench/*.md` · `README.md` (how to run everything, including the phone test).
