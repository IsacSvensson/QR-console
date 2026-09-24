# QR Console

An offline-first PWA that receives small games ("cartridges") through **animated QR codes** and runs
them in a tiny deterministic VM. Point the phone at a looping GIF on a laptop screen, watch the progress
bar fill as frames arrive in any order, press **PLAY** — no network needed after the app is installed.

- Games are written in a small assembler (`games/*/*.asm`), assembled into self-verifying cartridges
  (`packages/cartridge/FORMAT.md`), and run by a 16-bit VM (`packages/vm/VM.md`, `packages/asm/ASM.md`).
- Cartridges travel as a fountain code (systematic LT + Gaussian elimination, `packages/transport/PACKET.md`),
  one packet per QR frame (raw byte mode), looped in a lossless GIF.
- The player never knows which game it runs: Breakout and Pong both run with zero game-specific code in
  the runtime.

Design: `SPEC.md`. Milestones and proofs: `PLAN.md`. Status: `PROGRESS.md`. Decisions: `DECISIONS.md`.
Results: `REPORT.md`.

## Install

Node ≥ 22.12 and npm.

```sh
npm ci
npx playwright install --with-deps chromium   # only for the browser tests
```

## Test

```sh
npm run check              # typecheck + lint + unit tests (all packages, layer-1/2 transport, VM, assembler)
npm run test:slice         # layer 2: hello.asm → QR images / GIF → decode → VM → reference frame
npm run test:qr-robust     # layer 3: simulated camera distortion, ≥ 95 % frames must decode
npm run test:games         # Breakout + Pong: size, 1200/1800-frame replay hashes, game-rule checks
npm run test:e2e           # Playwright: player vs VM reference, fake-camera scan, Library persistence
npm run test:e2e:offline   # Playwright: production build + service worker, offline scan & play, zero requests
npm run bench:fountain     # → bench/fountain.md
npm run bench:qr           # → bench/qr.md (~5 min)
```

## Develop and build

```sh
npm run dev -w apps/web     # Vite dev server on :5173 (no service worker in dev)
npm run build -w apps/web   # production build → apps/web/dist (includes generated sw.js)
npm run preview             # build + serve the production build on :4173
```

## Games and the CLI

```sh
npm run qrc -- build games/breakout                        # → games/breakout/breakout.qrc
npm run qrc -- encode games/breakout/breakout.qrc --out breakout.gif [--version 12 --ecc M --frame-ms 150 --scale 8]
npm run qrc -- inspect breakout.gif                        # id, size, blocks, frames, QR parameters
npm run qrc -- decode breakout.gif --out breakout.qrc      # GIF → verified cartridge
npm run qrc -- run games/pong/pong.qrc --frames 60 --dump-frame pong.png --scale 4
npm run qrc -- replay games/pong/pong.qrc games/pong/replay.json   # per-frame state hashes
npm run refs:games                                         # regenerate committed cartridges and references
```

### Generate the demo GIFs

```sh
npm run demo     # builds both games, writes demo/breakout.gif and demo/pong.gif,
                 # decodes them back with the CLI and checks the SHA-256 of the result
```

## Scan on a phone (manual check)

Camera access and service workers need a **secure context**. Three ways to get the production build
onto an Android phone running Chrome:

1. **USB + adb reverse** (plain http is fine because it is `localhost` on the phone):
   ```sh
   npm run preview                         # serves on :4173
   adb reverse tcp:4173 tcp:4173
   ```
   Open `http://localhost:4173` in Chrome on the phone.
2. **Self-signed HTTPS on the LAN**:
   ```sh
   npm run preview:https                   # creates .tmp/cert once, serves https on :4173 (all interfaces)
   ```
   Open `https://<laptop-ip>:4173` on the phone and accept the certificate warning once.
3. **One-time static deploy**: upload `apps/web/dist/` to any static HTTPS host (GitHub Pages, Netlify, …).
   All paths are relative, so any sub-path works.

Then:

1. In Chrome, open the app and *Add to Home screen* / *Install app*. Open it once while online so the
   service worker caches everything (~1 MB, mostly the QR decoder).
2. Turn off Wi-Fi and mobile data.
3. Open `demo/breakout.gif` on the laptop, full screen (the loop is 8 frames × 150 ms).
4. In the app: **Scan**, point at the screen until the bar reaches 100 % and the title appears, press **PLAY**.
   Controls: on-screen D-pad and A/B (keyboard: arrows, Z/Space = A, X = B).
5. Repeat with `demo/pong.gif`.

This real-device test has **not** been performed by the agent that built the prototype; see `REPORT.md`.

## Layout

```
packages/cartridge  format, compression, hashing            (pure, no DOM)
packages/transport  packets, PRNG, soliton, LT encoder/decoder (pure, never imports cartridge)
packages/vm         CPU, memory map, syscalls, framebuffer, audio commands (pure)
packages/asm        assembler                                (pure)
packages/qr         QR frames, GIF, distortion simulator, decoders
packages/tools      qrc CLI, reference generation, demo, y4m
apps/web            PWA: scanner (worker), library (IndexedDB), player (canvas + WebAudio)
games/              hello, breakout, pong (source, cartridge, references, replay, checks)
bench/              benchmark scripts and results
e2e/                Playwright tests and fixtures
```
