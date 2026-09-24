# PROGRESS.md

_Dashboard, not a diary. Keep it short. Update after every milestone and before long-running tasks._

**Current milestone:** M17 — Content, sections 4–7, bosses and endings (Part 2: BLACKBOX)
**Status:** Part 1 (M0–M11) complete; Part 2 in progress
**Last updated:** 2026-09-24

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
- [ ] M17 Content, sections 4–7, bosses and endings
- [ ] M18 Music, access codes, delivery

## Current work

Part 2 planned (PLAN.md M12–M18); design complete in `games/blackbox/`. Part 1 still awaits the human's
real-device check (PLAN.md *Manual acceptance*). **M12 baseline commit: 5a7ca7d** — from here on
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
| Second game cartridge size | Pong 789 B (ROM 1259 B); `git diff bd2e1b8 -- packages apps` empty at M8 | test:games |

## Known issues

- Commit 8bec378 (and possibly 4436750) had a red `npm run check`: the `unit` Vitest project globbed
  `test/**` and ran the slow robust test with a 5 s timeout. Fixed in d53dc27; later commits verified green.

## Blocked / needs human

—

## Ideas for later

- Calibrate the distortion simulator with real camera captures of the demo GIFs.
- APNG output; Raptor-style precode for K ≫ 256; a `--scale` auto-choice from screen size.
