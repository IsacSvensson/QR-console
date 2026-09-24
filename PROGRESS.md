# PROGRESS.md

_Dashboard, not a diary. Keep it short. Update after every milestone and before long-running tasks._

**Current milestone:** M7 — Breakout
**Status:** in progress
**Last updated:** 2026-09-24

## Milestones

- [x] M0 Scaffold
- [x] M1 Cartridge format
- [x] M2 Transport layer 1 + fountain benchmark
- [x] M3 Minimal VM + assembler (HELLO WORLD)
- [x] M4 Layer 2 + first vertical slice
- [x] M5 Layer 3 + QR benchmark
- [x] M6 Full VM + determinism
- [ ] M7 Breakout
- [ ] M8 Second game (no runtime changes)
- [ ] M9 PWA: scanner, library, player
- [ ] M10 Offline
- [ ] M11 CLI, docs, report

## Current work

—

## Key numbers (fill in as measured)

| Metric | Value | Source |
|---|---|---|
| Default fountain mode | systematic, dense repair (deg ≥ K/2), peeling + GE | bench/fountain.md |
| Overhead for 99 % success (K≈200, 20 % loss) | 38 % (K=128) / 34 % (K=256) transmitted; floor 25 % | bench/fountain.md |
| QR version / ECC / frame ms | v12 / M / 150 ms; decoder zxing-wasm (+GlobalHistogram fallback) | bench/qr.md, D-007 |
| Payload bytes per frame | 262 (287 − 25 overhead) | bench/qr.md |
| 50 KB transfer: frames / seconds / KB/s | K=196, loop 294; p90 259 frames / 38.9 s / 1.29 KB/s (simulated 20 % loss) | bench/qr.md |
| Breakout cartridge size | — | test:games |
| Second game cartridge size | — | test:games |

## Known issues

—

## Blocked / needs human

—

## Ideas for later

—
