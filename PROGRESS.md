# PROGRESS.md

_Dashboard, not a diary. Keep it short. Update after every milestone and before long-running tasks._

**Current milestone:** M31 (Sixten: Worlds 4 and 5 and the final) — M26-M30 done
**Status:** Part 1 and Part 2 complete — with one flaky Part 1 acceptance test, see *Blocked / needs human*.
Part 3 (Bo's Skateäventyr) complete: M19–M25 done; ROM 31.6 KB of 32 KB on ISA 2. Next: the Bo test (PLAN *Manual acceptance* 3).
Part 4 (Sixtens expedition) on branch `claude/sixtens-expedition`: planned (DESIGN, mockup, PLAN Part 4, D-040); M26 done
(the top-down engine, D-041), M27 done (the whirlwind and the wind, D-042), M28 done (the side view as a code
overlay, D-043). Open decisions taken by Claude on the human's word (D-044).
**Last updated:** 2026-10-06

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

Part 4 — SIXTENS EXPEDITION (design: `games/sixten/DESIGN.md`; planned, not started)

- [x] M26 Engine: cells, screens, walking, map and compass
- [x] M27 The whirlwind and the wind
- [x] M28 Side view as a code overlay
- [x] M29 World 1 and the game around it (budget gate)
- [x] M30 Worlds 2 and 3
- [ ] M31 Worlds 4 and 5 and the final
- [ ] M32 Save code, music, delivery

## Current work

Part 4 (PLAN.md Part 4): M26 done — `.map` levels + generator + previews, the cell map packed in xdata, screens expanded
from cells (one MAP per column), the screen slide, Sixten walking with collision by cell type, the HUD with the compass,
the map screen from the same cells ("you are here", course, step counter), a level card; test levels T1/T2 and 1-1;
bot-recorded replays; `npm run test:sixten` checks map = world cell for cell (RAM, tile buffer, framebuffer) (D-041).
M27 done — whirlwinds as `.map` data (exact integer legs, cell changes at waypoints), warning, strength steps, wind
particles and bending grass, shelter (ditch, hollow, cabin) and AJ!; test level T3 and 1-1's whirlwind; tests: never
random (seeds, routes), warning >= 300 frames, the wind turns 120 frames first, no step > speed, shelter is real (D-042).
M28 done — side views (`levels/*.side`, `side:` links) run by a code overlay copied from xdata to 0xE000: walk, jump,
climb, crouch, a horizontal wind with the lee, exits back to cells; T4 (cave, ravine, cliff); tests: the overlay is in
RAM before it runs and runs only in side frames, its jumps stay inside it, the wind and the lee match the source (D-043).
M29 done — title, world map with the save code, tally, nature-book pages and book, power-ups, wood and building sites,
music; levels 1-1 to 1-4 (1-3 through a cave side view, 1-4 the first whirlwind level); NATURBOK.md (40 entries, checked
by Claude, D-044); tests: safe routes, everything collected, 1-1's rules, sites optional, power-ups, texts = NATURBOK.md,
the code computed independently; budget gate (D-045).
M30 done — events in level data (falling trees, a landslide, floods: DESIGN §6.6), flowing water (S8), rain, a ground
colour and a tune per world; levels 2-1 to 3-4 (2-3: a whirlwind opens a cave); tests: safe routes never in flowing
water, every event at its time with its full warning, everything collected, World 2 map -> World 4 map (D-046).
**Runtime baseline for Part 4 = 02d7058.**

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
| Sixten mockup (planning) | cartridge 4 479 B (ISA 2); max cycles/frame: top-down 10 627 (with screen expansion; else ≤ 4 853), map 8 067, side view 2 793, overlays 9 900; QR round trip identical | D-040, `games/sixten/mockup/measure.ts` |
| Sixten after Worlds 2-3 (M30) | ROM 22.9 KB (code 15.1, data 7.8), xdata 7.1 KB, cartridge 16.7 KB | test:sixten, D-046 |
| Sixten budget gate after World 1 (M29) | ROM 20.6 KB (code 14.3, data 6.3), side overlay 2.0 KB in xdata, xdata 6.4 KB, cartridge 14.9 KB; projected 5 worlds: ROM 27-28 KB, cartridge 21-23 KB | test:sixten, D-045 |
| Sixten ROM after M28 | 14.1 KB (code 9.6 KB, data 4.4 KB) + the side-view overlay 1 972 B in xdata; xdata 2.7 KB, cartridge 9.0 KB | test:sixten, D-043 |
| Sixten ROM after M27 | 12.7 KB (code 9.1 KB, data 3.6 KB), xdata 0.6 KB, cartridge 7.1 KB; max 19 716 cycles/frame (funnel + particles + screen expansion) | test:sixten, D-042 |
| Sixten ROM after M26 | 9.1 KB (code 6.0 KB, data 3.1 KB), xdata 0.5 KB, cartridge 5.2 KB; max 13 613 cycles/frame (a slide's first frame) | test:sixten, D-041 |
| Sixten projection | code 17.8–22.0 KB; ROM 22–28 KB (17–22 KB with overlays); cartridge 22–27 KB (target < 25 KB) | DESIGN §12 (sixten) |
| Bo ROM after M19 | 8.2 KB (code 5.8 KB, data 2.4 KB); cartridge 4.7 KB; play frames ~1.4k cycles, loading ≤ 15.1k | test:bo |

## Known issues

- Commit 8bec378 (and possibly 4436750) had a red `npm run check`: the `unit` Vitest project globbed
  `test/**` and ran the slow robust test with a 5 s timeout. Fixed in d53dc27; later commits verified green.

## Blocked / needs human

- **`npm run test:e2e:offline` (M10) is flaky: 3 of 8 runs pass.** Every failure is one browser-initiated
  `GET /sw.js` (the service-worker update check on reload) reaching the server ~2 s after going offline; the
  app itself makes no requests. Fixing it needs a change in `apps/web` (frozen in Part 2) or a decision on what
  the criterion means. Measurement and options: DECISIONS.md D-021.

- **Part 4 (Sixten), for the human when convenient** (the open decisions were delegated to Claude, D-044): tick or
  correct the fact rows Claude checked (DESIGN §1.3, §8.3, `NATURBOK.md`). S3 (a ditch or hollow as shelter from a
  whirlwind) still has only a US source (NWS).
- **CI split (D-039) is not verified on GitHub:** `pages.yml` runs only on `main`; the first push there will show it.

## Ideas for later

- (From planning Part 4) Sixten: a space world or bonus area, stone and iron as resources (the draft's §11, §17);
  an `.overlay ADDR` assembler directive (see *Blocked / needs human*).

- Calibrate the distortion simulator with real camera captures of the demo GIFs.
- APNG output; Raptor-style precode for K ≫ 256; a `--scale` auto-choice from screen size.
- A really giant Jättekaninen (32×24 sprites; it is Bo's size now), from the world assets.
- Double resolution (256×256) as a later ISA: needs a human decision to change L3, and graphics grow ~4×
  (considered with ISA 2 on 2026-10-06, D-034). Also generic syscalls for tile lookup and `TEXT` with a
  cartridge font (~0.5 KB each for Bo).
- (From planning Part 3) a generic save area persisted per cartridge id by the web app, which would replace picture
  codes (runtime + app change); UTF-8 in `.title` (the cartridge format already allows it); Gamepad API input in
  the web player for fast games.
