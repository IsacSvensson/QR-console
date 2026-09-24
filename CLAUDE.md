# CLAUDE.md — How to work in this repository

You are building **QR Console**: an offline-first PWA that receives small games ("cartridges")
through animated QR codes and runs them in a tiny custom VM.

- **What** we build: `SPEC.md` (architecture, locked decisions, formats, non-goals)
- **How it is proven**: `PLAN.md` (milestones, acceptance criteria, commands)
- **Where you are**: `PROGRESS.md` (you keep this current)
- **Why you chose what you chose**: `DECISIONS.md` (you append to this)
- **How to write games** (assembly, bytecode, syscalls, idioms, tooling): `docs/PROGRAMMING.md`

Read all four before writing any code. Re-read `PROGRESS.md` and the current milestone in
`PLAN.md` whenever you resume after a break or context compaction.

## Working mode

- Work **autonomously** through the milestones in `PLAN.md`, in order.
- Do **not** stop to ask questions. When something is unspecified, make a reasonable decision,
  record it in `DECISIONS.md`, and continue.
- The only exception: a change that would contradict a **Locked decision** in `SPEC.md`.
  Do not make it. Record the problem under *Blocked / needs human* in `PROGRESS.md`,
  work around it within the locks if possible, and continue with other work.
- When an approach fails, diagnose, try a simpler approach, and continue. Record abandoned
  approaches briefly in `DECISIONS.md` so they are not retried.

## Definition of "done" for a milestone

A milestone is done only when **every acceptance criterion in `PLAN.md` passes by running the
listed command**. Not by reasoning, not by inspection.

- Never weaken, skip, or delete a test or acceptance criterion to make it pass.
- If a criterion proves genuinely infeasible, keep it failing, record the measurement and the
  reasoning in `DECISIONS.md`, and flag it in `PROGRESS.md`. A human decides.
- Benchmark targets marked *measure* are measured and reported, not forced.

## Git

- Commit after each completed milestone, and at meaningful checkpoints within long ones.
- Message format: `M<n>: <what works now>` (e.g. `M4: hello world survives full QR round trip`).
- Keep `main` green: `npm run check` (typecheck + lint + unit tests) must pass at every commit.
  Work-in-progress experiments go on a branch or behind a clearly named flag.

## Scope ceiling

This is a **prototype that proves a concept**, not a console platform.

- Build only what `SPEC.md` and `PLAN.md` require.
- No high-level game language, no JS cartridges, no accounts, no server, no cloud sync,
  no editor UI, no marketplace. See *Non-goals* in `SPEC.md`.
- If you feel the urge to generalise, write the idea under *Ideas for later* in `PROGRESS.md`
  and move on.

## Honesty about verification

- You cannot hold a phone. **Never** claim that real-camera scanning on a physical device
  was verified. Real-device testing is the human's manual final check (`PLAN.md`, *Manual acceptance*).
- In reports, distinguish clearly between *tested automatically*, *measured*, and *not verified*.

## Engineering conventions

- TypeScript, strict mode, ES modules. Node ≥ 20.
- npm workspaces monorepo (layout in `SPEC.md`).
- Vitest for unit/integration tests, Playwright for browser/e2e tests.
- Prefer few, well-maintained dependencies. Every runtime dependency of the web app must be
  bundled locally (no CDN, no runtime network access).
- Pure logic (cartridge, transport, VM, assembler) must have no DOM dependencies and run in Node.
- Randomness in tests uses explicit seeds and prints the seed on failure.

## Keeping state

- Update `PROGRESS.md` after every milestone, and before any long-running task.
  Keep it short: it is a dashboard, not a diary.
- Append to `DECISIONS.md` whenever you choose between real alternatives.
- Fill in the *Commands* section below once the scaffold exists, and keep it accurate.

## Commands

<!-- Filled in by the agent in M0 and kept up to date. -->

| Command | What it does |
|---|---|
| `npm ci` | install everything (then `npx playwright install --with-deps chromium` once for e2e) |
| `npm run check` | typecheck (pure packages without DOM/Node types, then everything) + ESLint + unit tests |
| `npm test -w packages/<name>` | one package's tests (cartridge, transport, vm, asm, qr, tools) |
| `npm run qrc -- <cmd>` | CLI: `build <game dir>` (+ `.sym`, `.lst`), `run <file.qrc> --frames N --dump-frame out.png [--inputs f --ram a,b --trace N --trace-frame F]`, `replay <file.qrc> <inputs.json> --frames N` |
| `npm run refs:games` | rebuild every `games/<g>/<g>.qrc`, `frame1.png`, `reference.json`, `hashes.txt` (from the VM, never a browser) |
| `npm run bench:fountain` | layer-1 fountain benchmark → `bench/fountain.md` |
| `npm run test:slice` | layer-2 vertical slice: hello.asm → QR images / GIF → decode → VM → reference frame |
| `npm run test:qr-robust` | layer 3: moderate camera distortion, default params must decode ≥ 95 % |
| `npm run bench:qr` | QR decoder/version/ECC × distortion benchmark + transfer estimate → `bench/qr.md` (~5 min) |
| `npm run test:games` | every game with a `replay.json`: assemble, size, per-frame hash replay, `games/<g>/checks.ts` rules |
| `npm run dev -w apps/web` | Vite dev server (no service worker in dev) |
| `npm run build -w apps/web` | production build → `apps/web/dist` (incl. generated `sw.js`) |
| `npm run test:e2e` | Playwright (Chromium): player vs VM reference frames, fake-camera scans of Breakout and BLACKBOX, Library persistence |
| `npm run test:e2e:offline` | production build, SW precache, offline reload, fake-camera scan of Pong, zero network requests |
| `npm run demo` | build Breakout, Pong and BLACKBOX → `demo/*.gif`, decode back with the CLI, verify SHA-256 |
| `npm run preview` / `npm run preview:https` | serve the production build on :4173 (https: self-signed cert in `.tmp/cert`) |
| `npm run bench:scan` | 50 KB cartridge through the browser scanner with a fake camera → `bench/scan.md` |
| `npm run test:blackbox` | BLACKBOX (PLAN Part 2): generated data up to date, ROM vs LAYOUT, every room in RAM vs LAYOUT, replays with per-frame hashes and oracle checks |
| `npm run blackbox:gen` | regenerate `games/blackbox/rooms.gen.asm` and `tiles.gen.asm` from LAYOUT.md / tools |
| `npm run blackbox:record [name…]` | re-record bot replays (`games/blackbox/tools/routes.ts`) and pick reference frames, then `npm run refs:games` |
