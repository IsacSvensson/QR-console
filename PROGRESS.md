# PROGRESS.md

_Dashboard, not a diary. Keep it short. Update after every milestone and before long-running tasks._

**Current milestone:** — (Part 3 planned; M19 is next)
**Status:** Part 1 and Part 2 complete — with one flaky Part 1 acceptance test, see *Blocked / needs human*.
Part 3 (Bo's Skateäventyr) is designed and planned, not started.
**Last updated:** 2026-10-05

## Milestones

- [x] M0 Scaffold
- [x] M1 Cartridge format
- [x] M2 Transport layer 1 + fountain benchmark
- [x] M3 Minimal VM + assembler (HELLO WORLD)
- [x] M4 Layer 2 + first vertical slice
- [x] M5 Layer 3 + QR benchmark
- [x] M6 Full VM + determinism
- [x] M7 Breakout
- [x] M8 Second game (no runtime changes)
- [x] M9 PWA: scanner, library, player
- [x] M10 Offline
- [x] M11 CLI, docs, report

Part 2 — BLACKBOX (design: `games/blackbox/`)

- [x] M12 Tools for a large game (macros, include, symbols, trace)
- [x] M13 Engine: rooms, movement, HUD
- [x] M14 Stealth: guards, cameras, drones, EMP
- [x] M15 Text and the ORACLE engine
- [x] M16 Content, sections 0–3
- [x] M17 Content, sections 4–7, bosses and endings
- [x] M18 Music, access codes, delivery

Part 3 — BO'S SKATEÄVENTYR (design: `games/bo/DESIGN.md`)

- [ ] M19 Engine: levels, scrolling, rolling
- [ ] M20 Skate mechanics and the feel prototype
- [ ] M21 Enemies, power-ups, items, HUD, Bo's voice
- [ ] M22 World 1 and the game around it (budget gate)
- [ ] M23 Worlds 2 and 3
- [ ] M24 Worlds 4 and 5, the theft and the ending
- [ ] M25 Picture codes, music, delivery

## Current work

Part 3 planned (PLAN.md Part 3, DECISIONS D-024/D-025): `games/bo/DESIGN.md` (draft) and a VM-rendered mockup
(`games/bo/mockup/`). Before M19, check DESIGN.md §17 for the human's answers; unanswered questions use the defaults.
M19 sets the Part 3 baseline commit for the runtime-freeze diff.

Part 2 done (M12–M18). Both parts await the human's real-device checks (PLAN.md *Manual acceptance*). **M12 baseline commit: 5a7ca7d** — from here on
`git diff 5a7ca7d -- packages/vm packages/cartridge packages/transport packages/qr apps` must stay empty.

## Key numbers (fill in as measured)

| Metric | Value | Source |
|---|---|---|
| Default fountain mode | systematic, dense repair (deg ≥ K/2), peeling + GE | bench/fountain.md |
| Overhead for 99 % success (K≈200, 20 % loss) | 38 % (K=128) / 34 % (K=256) transmitted; floor 25 % | bench/fountain.md |
| QR version / ECC / frame ms | v12 / M / 150 ms; decoder zxing-wasm (+GlobalHistogram fallback) | bench/qr.md, D-007 |
| Payload bytes per frame | 262 (287 − 25 overhead) | bench/qr.md |
| 50 KB transfer: frames / seconds / KB/s | K=196, loop 294; p90 259 frames / 38.9 s / 1.29 KB/s (simulated 20 % loss); browser fake camera 34.7 s / 1.44 KB/s | bench/qr.md, bench/scan.md |
| Breakout cartridge size | 877 B (ROM 1551 B, deflate-raw); target ≤ 10 KB met | test:games |
| BLACKBOX ROM / cartridge | 26.1 KB of 32 KB ROM (80 %) / 15.0 KB cartridge; 4 endings replayed (7.7k–8.2k frames each) | test:blackbox |
| BLACKBOX as QR | 58 blocks, 87-frame loop (13.1 s), 1.2 MB GIF; fake-camera scan 11 s in e2e | npm run demo, test:e2e |
| Second game cartridge size | Pong 789 B (ROM 1259 B); `git diff bd2e1b8 -- packages apps` empty at M8 | test:games |
| Bo mockup: full-screen draw cost | 1 278 cycles/frame (17 MAP columns + sprites + bubble + HUD); font 47 glyphs = 376 B | D-025 |
| Bo ROM estimate | 23.5–29 KB of 32 KB (code 11–13 KB); measured at the M22 budget gate | DESIGN §16 |

## Known issues

- Commit 8bec378 (and possibly 4436750) had a red `npm run check`: the `unit` Vitest project globbed
  `test/**` and ran the slow robust test with a 5 s timeout. Fixed in d53dc27; later commits verified green.

## Blocked / needs human

- **`npm run test:e2e:offline` (M10) is flaky: 3 of 8 runs pass.** Every failure is one browser-initiated
  `GET /sw.js` (the service-worker update check on reload) reaching the server ~2 s after going offline; the
  app itself makes no requests. Fixing it needs a change in `apps/web` (frozen in Part 2) or a decision on what
  the criterion means. Measurement and options: DECISIONS.md D-021.

## Ideas for later

- Calibrate the distortion simulator with real camera captures of the demo GIFs.
- APNG output; Raptor-style precode for K ≫ 256; a `--scale` auto-choice from screen size.
- (From planning Part 3) a generic save area persisted per cartridge id by the web app, which would replace picture
  codes (runtime + app change); UTF-8 in `.title` (the cartridge format already allows it); Gamepad API input in
  the web player for fast games.
