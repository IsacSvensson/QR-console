# PROGRESS.md

_Dashboard, not a diary. Keep it short. Update after every milestone and before long-running tasks._

**Current milestone:** M29 — NADIR weapon, combat and the first enemy (PLAN.md Part 4)
**Status:** Parts 1–3 complete (one flaky Part 1 acceptance test, see *Blocked / needs human*); they await the
human's manual acceptance. Part 4 (NADIR, a first-person shooter) planned and approved 2026-10-29: design in
`games/nadir/DESIGN.md`, milestones M26–M32 in PLAN.md.
**Last updated:** 2026-10-30

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

- [x] M19 Engine: levels, scrolling, rolling
- [x] M20 Skate mechanics and the feel prototype
- [x] M21 Enemies, power-ups, items, HUD, Bo's voice
- [x] M22 World 1 and the game around it (budget gate)
- [x] M22b ISA 2: xdata + COPY/FILL/UNPACK (human decision after the budget gate)
- [x] M23 Worlds 2 and 3
- [x] M24 Worlds 4 and 5, the theft and the ending
- [x] M25 Picture codes, music, delivery

Part 4 — NADIR (design: `games/nadir/DESIGN.md`)

- [ ] M26 Renderer prototype (risk gate) — built and verified; **cycle gate fails (19.2k / 15.6k vs 14k / 11k), human decision, D-040**
- [ ] M27 Player, collision, doors, masked walls (feel build) — built and verified; **cycle gate fails (33.8k per image vs 16k), D-042**
- [x] M28 Sprites and props — 3D boxes (M28b, D-044); prop drawing 9 991 vs 5 000 cycles per frame **accepted by the human** (2026-10-30), the gate stays red in `nadir-gate` as a measurement
- [x] M29 Weapon, combat, the first enemy (D-045; the M26/M27/M28 cycle gates stay red, see below)
- [ ] M30 Atmosphere, effects, the second enemy (budget gate)
- [ ] M31 The vertical slice and the game around it
- [ ] M32 Sound, polish, delivery

## Current work

Part 4: M29 done (D-045): the bolt shotgun (MAP art, sway, recoil, pump, reload, muzzle flash that lights the
image), 5 pellets with aim assist and line of sight, Kryp (12 animation frames, idle/alert/chase/windup/leap/
recover/pain/dead), health, medkits and ammunition only when needed, death and restart, a minimal HUD, green hit
sparks; the bot fights by itself. Tested automatically: an independent model of DESIGN §6 equals the RAM state of
weapon, every pellet, every enemy and the player's health in every frame of eight replays; the restart equals a
fresh start (RAM); the flash's light in every column. Every frame <= 24 388 cycles (three-frame images for the
heaviest views). ROM 31.2 KB of 32: M30 starts nearly full. Not verified: how it plays on a phone.
Part 4: M28b done (D-044), on the human's "the objects are two-dimensional, especially the boxes": crates and
consoles are real axis-aligned 3D boxes (flat-shaded sides with per-column light by the walls' rule, lid, crate
frame and cross brace, console screens); round props and pickups stay billboards (barrel with cylinder shading).
Tested automatically against a ray/box oracle in every column of every image of six replays: side 99.91-100 %,
h, top and light 100 %; occlusion (two VMs) clean; every frame of the six replays <= 24 866 cycles (stress replay 23 306). Measured: drawing all props up to
9 991 cycles per frame (criterion 5 000: red in `nadir-gate`). New poses crate, crate_near, console in the sheet.
Part 4: M28 done (D-043): rect sprites (a layered greedy compiler, LOD 0-2, every list = NN upscaling at 1x-4x),
19+3 props and pickups in the level, projection within 1 px of floating point in every image of six replays, LOD
budget, far-to-near order, column occlusion against walls and masked planes (two-VM test), blocking props and
pickups in the player model, per-cell prop tables in xdata (PVS) fetched with COPY, a fitted pacing estimate
(every frame <= 24 402). Sprite drawing <= 2 275 cycles with eight sprites. Contact sheet games/nadir/m28-sheet.png.
Part 4: M27 built (D-042): the whole level `levels/nadir.map` (elevator, shaft, workshop, dark corridor, control
room with the red key, security door, core, south corridor), the player (S2 controls, double-tap side step,
accelerating turns, wall sliding, head bob, S1 flag), sliding doors with keys, masked walls (grate, window,
railing, low wall) as centre planes, wide coplanar interpolation, adaptive pacing (max 22 824 per frame). Every
cell/door/key/lamp in RAM matches the source; the player, collision and doors match a DESIGN model in every frame of
five replays; walls, doors and masked planes match the oracle (faces >= 99.7 %); masked walls are see-through
(two VMs, 0 of 880 564 pixels differ); `demo/nadir.gif` verified; contact sheet games/nadir/m27-sheet.png. Music
direction noted (DESIGN §8: original thrash-style metal, no copy of an existing song).
Part 4 (PLAN.md Part 4): planned 2026-10-29 (D-039). M26 built (D-040): the hybrid raycaster with VM hacks (code
compiled per texture column and run from RAM, one DIV per ray, half-step tables with XOR folding, floor records in
xdata fetched with COPY, line-ellipse light pools); every column of the 2 723-frame fly-through matches the
floating-point oracle and the light rule; contact sheet games/nadir/m26-sheet.png. All M26 criteria pass except the
cycle gate (max 19 153 / mean 15 624 against 14 000 / 11 000; under the hard 25 000): flagged below. **Part 4 runtime baseline = 932e534 (M22b):**
`git diff 932e534 -- packages/vm packages/cartridge packages/transport packages/qr apps` must stay empty.

Part 3 (PLAN.md Part 3): M19 done — level format + generator + previews (`games/bo/levels/`), column-major level
buffer, camera, parallax, HUD frame, Bo's rolling physics on flat ground, hills, blocks and one-way platforms; test
levels T1/T2; bot-recorded replays; `npm run test:bo` checks the ROM table and every level's RAM against an
independent reader of the `.lvl` sources and measures DESIGN §3.3 from the replays (all within rounding, D-029).
M20 done — kickers, landing boost, rails and grind, tricks and combos, sloppy landings, sand/ice/trampoline,
weak blocks and boxes, water and pits, flags, lives, game over; Bo's signature poses, bubbles in the game's font
(`tools/text.ts`), wheel clicks; test level T3; `demo/bo.gif` (starts in the test menu: the feel prototype for the
human's first Bo test, PLAN *Manual acceptance* 1). All seven T3 kicker launches match DESIGN §3.3 (D-030).
M21 done — the 13 enemies of DESIGN §9 (nine behaviours, every landing joke and side hit shown in the zoo test
levels T4/T5), apple helmet, pommes (music 1.5× faster), godis (one extra jump), 100 apples = a life, a music
sequencer with a World 1 loop, the bubble font with ÅÄÖ checked byte for byte against DESIGN §11–12 (D-031).
M22 done — title, intro, picture-code screen (test levels via the code of four Bos), world map, level cards,
tally, after-boss scene; levels 1-1..1-4 and Stora Måsen (1-5); replays from the title to the World 2 map, every
star and part of World 1, the boss pattern and a retry, FIRST10 §8 rules, all 71 apple patterns followed (D-032).
**Budget gate: ROM 27.1 KB after World 1 (code 20.1 KB); five worlds projected 41-43 KB** (D-033). The human
chose to extend the VM: **M22b = ISA 2** (D-034) — an optional xdata section (256 KB, outside the address
space) and `COPY`/`FILL`/`UNPACK`; every ISA 1 game is byte-identical; the app marks cartridges that need a
newer ISA. Bo is now ISA 2: levels packed in xdata, ROM 25.6 KB (D-035). M23 done — Worlds 2 (Skogen) and 3 (Staden): each
world looks clearly different (own sky, parallax, colours, decor; world blocks in xdata), moving platforms (logs, the
bus), the rabbit chase, the bulldozer, world music; one replay from the title to the World 4 map (D-036). M24 done —
Worlds 4 (Snö: ice, the ski lift, Backhoppet, the longest jump) and 5 (Godislandet: lollipops, chocolate and rafts,
licorice, the cake mountain), the theft and the licorice board, the final (Stora Måsen in three phases), the ending
with the statistics and the golden board, boards, SUPERBOSSE, the seagull's food; one replay plays the whole game
(D-037). M25 done — picture codes (all 1 365 valid codes round-trip, the rest rejected; a replay resumes from a
code), ten music tracks, the Bo e2e scan, `games/bo/GUIDE.md`, REPORT Part 3 (D-038). ROM 31.6 KB of 32 KB. **Runtime baseline for M23-M25 = 932e534 (M22b).** Human request (2026-10-06): the worlds must look clearly
different (own sky, parallax, ground/structure colours, decor) — added to DESIGN §14.4, done in M23–M24.
DESIGN §17 defaults apply (only question 1 answered). Part 3 runtime baseline was the M19 commit (394e012) until
M22b; from the M22b commit on
`git diff 932e534 -- packages/vm packages/cartridge packages/transport packages/qr apps` must stay empty.

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
| Bo mockup: full-screen draw cost | 1 356 cycles/frame (17 MAP columns + sprites + bubble + HUD); font 47 glyphs = 376 B | D-025–D-027 |
| Bo ROM estimate | 23.5–29 KB of 32 KB (code 11–13 KB); measured at the M22 budget gate | DESIGN §16 |
| Bo ROM after M25 (final) | 31.6 KB (code 25.4 KB, data 6.0 KB), ISA 2; cartridge 22.9 KB; 132-frame GIF loop (19.8 s) | test:bo, npm run demo |
| Bo ROM after M21 | 21.7 KB (code 16.1 KB, data 5.4 KB); cartridge 12.0 KB | test:bo |
| Bo ROM after M20 | 16.1 KB (code 12.1 KB, data 3.9 KB); cartridge 9.1 KB, 53-frame GIF loop (8.0 s) | test:bo, npm run demo |
| NADIR M26 (prototype) | ROM 11.7 KB, xdata 37 KB (textures, compiled columns 13.8 KB, floor records 16 KB), cartridge 16.9 KB; fly-through max 19 153 / mean 15 624 cycles | test:nadir, D-040 |
| Bo ROM after M19 | 8.2 KB (code 5.8 KB, data 2.4 KB); cartridge 4.7 KB; play frames ~1.4k cycles, loading ≤ 15.1k | test:bo |

## Known issues

- Commit 8bec378 (and possibly 4436750) had a red `npm run check`: the `unit` Vitest project globbed
  `test/**` and ran the slow robust test with a 5 s timeout. Fixed in d53dc27; later commits verified green.

## Blocked / needs human

- **NADIR cycle gates (D-040, D-042, D-043, D-044):** per image (rays + drawing) the whole level costs (M29) max
  50 712 / mean 19 500-33 600 cycles (M28: max 42 288 / mean 17 900-26 800); M28 prop drawing 10 201 (accepted) (M27: max 33 753 / mean 17 000-18 800) against M26's 14 000 / 11 000 and M27's 16 000 (`nadir-gate`, red as specified). The hard
  25 000 per frame is met by adaptive pacing (mask-heavy views draw at 30 images/s). Per the human's "proceed per your
  recommendations": the gate is re-derived after M28-M29 with measured sprite and logic costs; floor layer kept.
- **NADIR ROM 31.2 KB of 32 KB after M29 (D-045):** M30's budget gate starts nearly full; its cut list will apply.
- **NADIR M27 feel test (manual, PLAN Manual acceptance 2):** scan `demo/nadir.gif`, try S2 on a phone (B walks,
  double tap = side step); say if S1 should be the default. Not verified by me (no device).

- **`npm run test:e2e:offline` (M10) is flaky: 3 of 8 runs pass.** Every failure is one browser-initiated
  `GET /sw.js` (the service-worker update check on reload) reaching the server ~2 s after going offline; the
  app itself makes no requests. Fixing it needs a change in `apps/web` (frozen in Part 2) or a decision on what
  the criterion means. Measurement and options: DECISIONS.md D-021.

## Ideas for later

- Calibrate the distortion simulator with real camera captures of the demo GIFs.
- APNG output; Raptor-style precode for K ≫ 256; a `--scale` auto-choice from screen size.
- A really giant Jättekaninen (32×24 sprites; it is Bo's size now), from the world assets.
- Double resolution (256×256) as a later ISA: needs a human decision to change L3, and graphics grow ~4×
  (considered with ISA 2 on 2026-10-06, D-034). Also generic syscalls for tile lookup and `TEXT` with a
  cartridge font (~0.5 KB each for Bo).
- (From planning Part 3) a generic save area persisted per cartridge id by the web app, which would replace picture
  codes (runtime + app change); UTF-8 in `.title` (the cartridge format already allows it); Gamepad API input in
  the web player for fast games.
