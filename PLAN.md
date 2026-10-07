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

---

# Part 3 — BO'S SKATEÄVENTYR (planned 2026-10-05 at the human's request)

A side-scrolling skateboard platformer for a six-year-old (and the adults who play with him). It proves that the
console can carry a fast, physics-driven action game with scrolling, slopes and 25 levels, which neither
Breakout, Pong nor BLACKBOX needed. The design is the **specification** for these milestones:

- `games/bo/DESIGN.md` — locked design decisions, physics constants and derived values (§3), tricks (§4),
  power-ups (§5), enemies (§9), bosses (§10), texts (§11–12), level and graphics formats (§14), budget (§16).
  It is a draft: the open questions in §17 have defaults that apply unless the human changes them before M19.
- `games/bo/FIRST10.md` — the first ten minutes: title, intro, level 1-1 column by column, the start of 1-2, the
  rules its tests check (§8) and the observation list for the Bo test (§9).
- `games/bo/mockup/` — a VM-rendered spike of one screen (drawing approach measured, DECISIONS D-025).
- `games/bo/levels/*.lvl` — the level sources, written from M19 on (one per level, generator + preview PNG).

Rules for M19–M25 (in addition to CLAUDE.md, same spirit as Part 2):

- **The runtime does not change**, except in M22b (ISA 2, decided by the human on 2026-10-06 after the M22
  budget gate). From the M22b commit on,
  `git diff <M22b commit> -- packages/vm packages/cartridge packages/transport packages/qr apps` stays **empty**
  through M25 (before M22b the baseline was the M19 commit). Wiring Bo into the existing scripts (the demo list, e2e fixtures, a Vitest project) is expected; any
  other change to `packages/asm` or `packages/tools` must be generic, needs a `DECISIONS.md` entry, and every other
  game must still assemble to identical sections. If something seems to need a runtime change (ROM over 32 KB, a
  save feature), record the measurement, flag it under *Blocked / needs human*, and continue within the limits.
- **The design documents are the test oracle.** The tests read the tables of `DESIGN.md` (§0.2, §3.2–3.3, §4, §5,
  §9, §11–12), `FIRST10.md` and the `.lvl` sources; what the engine holds in RAM or ROM is compared against them,
  never against itself.
- **All game code and data live in `games/bo/`**; generators and the replay bot in `games/bo/tools/`.
- Every milestone has recorded replays (`games/bo/replays/*.json`) with committed per-frame hashes from the VM
  (`npm run refs:games`), recorded by the bot from RAM-driven routes (re-recordable when the physics is tuned), and
  assertions in `test/bo/**`.
- **Budgets, asserted in every replay:** no fault, 0 cycle-budget overruns, max cycles per frame ≤ 25 000 (half
  the budget); ROM size reported by `test:bo` (≤ 32 KB, *measure*; projected at M22).

The test command for all Part 3 milestones is `npm run test:bo` (a Vitest project for `test/bo/**`); each
milestone adds to it and never removes earlier checks.

## M19 — Engine: levels, scrolling, rolling

- `.lvl` source format; `games/bo/tools/levels.ts` writes `levels.gen.asm` and a preview PNG per level; the ROM
  level table (terrain profile + objects, DESIGN §14.1); unpacking into the column-major RAM buffer (32 rows per
  column); camera and drawing (one `MAP` per visible column, parallax strip); HUD frame.
- Bo on flat ground and slopes: push, coast, brake, crouch, ollie with variable height, landing; solid blocks and
  one-way platforms. Test levels `T1` (flat ground and blocks) and `T2` (slopes and platforms).

**Accept:** `npm run test:bo`
- a TypeScript decoder of the ROM level table reproduces the terrain and objects of every `.lvl` source; for every
  level the RAM buffer after unpacking equals the reference grid that an independent TypeScript decoder builds from
  the `.lvl` source
- replays on T1 and T2 with per-frame hashes; in **every frame** Bo's box overlaps no solid tile of the reference
  grid, and whenever he is grounded his feet are exactly on the reference surface height
- the derived values of DESIGN §3.3 for flat ground and slopes are **measured from the replays** and match the
  table within its rounding (±1 px, ±1 frame): ollie height and airtime, tap height, push to top speed, coasting
  and braking distance, downhill acceleration; the constants in ROM equal §3.2
- budgets as above; ROM size reported

## M20 — Skate mechanics and the feel prototype

- Ramp launch (with and without an ollie at the lip), landing boost on down-slopes, rails and grind (flat and
  diagonal), tricks and combos (DESIGN §4), sloppy landings, surfaces (sand, ice, bounce), breakable blocks and
  boxes, hazards (pits, water), checkpoints, lives, respawn, game over → level restart. Test level `T3`
  (a small skatepark).
- Bo's signature (DESIGN §0.2: push kicks, leaning forward and back, the idle pop and balance, looking back after a
  big landing) and the wheel sound (§15: rolling noise and a click every 16 px), because the feel test needs them.
- From now on `npm run demo` also writes `demo/bo.gif` (at this stage it starts in the test levels), so the human
  can try the feel on a phone before any content is built.

**Accept:** `npm run test:bo`
- ramp launches on 22.5° and 45° at 1.5 / 2.5 / 3.5 px per frame, with and without ollie, match DESIGN §3.3
- grind: in every frame where Bo's feet are on a rail cell of the reference grid his state is GRIND; speed is
  constant on flat rails and increases on diagonal ones; A jumps off
- every trick of §4 scores its points; a two-trick combo scores the combo formula; landing mid-trick gives OJ
  (speed halved, no damage); a clean landing gives `TRICK_BOOST` per trick
- ice braking distance and sand slow-down match §3.3; landing on a breakable removes exactly its tiles from the
  RAM buffer (and the reference grid agrees)
- a fall into a pit or water costs one life and respawns at the last checkpoint; at 0 lives the level restarts
  with 5 lives
- every signature behaviour of DESIGN §0.2 appears in a replay at its trigger (Bo's pose in RAM) and never changes
  his position or his box; any button cancels the idle pop and the balance in the same frame
- the wheel clicks in the audio commands match the distance travelled (one per 16 px)
- `npm run demo` writes and verifies `demo/bo.gif`; `npm run check` green

## M21 — Enemies, power-ups, items, HUD, Bo's voice

- The nine enemy behaviours and the enemy table of DESIGN §9; power-ups (§5), hits, lives and checkpoints (§6),
  apples, stars and skate parts (§7.1); complete HUD; the bubble font (1 bit per pixel, ÅÄÖ) and Bo's lines,
  encoded by `games/bo/tools/text.ts` from DESIGN §11–12.

**Accept:** `npm run test:bo`
- for every enemy of §9, replays show each outcome of its row (landing on it and its joke, side contact); every
  hit happens on a frame where the boxes in RAM overlap, and no overlap goes unhandled
- the helmet absorbs exactly one hit and gives 120 frames of invulnerability; pommes lasts 600 frames, the measured
  top speed is 2.5 px per frame and the music's note lengths shrink to 2/3, and pommes changes nothing else
  (obstacles and enemies behave as without it); a seagull takes the pommes without damage; godis gives exactly one
  extra jump per airtime; 100 apples give one life
- a TypeScript decoder of the ROM text reproduces every line of DESIGN §11–12 byte for byte; rendered bubble
  frames match committed reference frames (from the VM)

## M22 — World 1 and the game around it (budget gate)

- Title, intro, world map, level cards, tally, game over; levels 1-1 to 1-4 and 1-5 (Stora Måsen, DESIGN §10.1);
  the World 1 tileset, enemies and music. The first play goes straight from the intro into 1-1. 1-1 and 1-2 are
  built exactly as `FIRST10.md` §5 and §7 describe. Apple arcs are generated from the physics (DESIGN §14.1).

**Accept:** `npm run test:bo`
- for every World 1 level a replay from its start to the goal; together these replays collect **every star and
  skate part** of World 1 (checked against the `.lvl` sources)
- boss: one replay wins with exactly three hits in the pattern of §10.1, another loses a life to the dive and retries
- one replay plays from the title to the World 2 map; the tally on screen equals the RAM counters
- **the first ten minutes:** every rule of `FIRST10.md` §8 passes (checked against the `.lvl` sources and replays)
- **apples never lie:** for every apple pattern in World 1 there is a replay route that follows it, collects all of
  its apples and loses no life (DESIGN §8.4)
- **budget gate:** code bytes, World 1 data bytes and ROM size are measured and a projection for five worlds is
  recorded in `DECISIONS.md`. If it exceeds 32 KB, apply DESIGN §16.1's cut list in order and flag it for a human

## M22b — ISA 2: extended data and block syscalls (human decision, 2026-10-06)

The M22 budget gate projected Bo at 41–43 KB (D-033). The human chose a generic VM extension over cutting
content, with the rule that old cartridges keep working unchanged:

- ISA 2 = ISA 1 + an optional **xdata** cartridge section (≤ 256 KB, outside the address space) + three
  generic syscalls: `COPY` and `FILL` (block copy/fill, far source) and `UNPACK` (a simple LZ format).
  The VM runs ISA 1 and 2; a cartridge declares the lowest ISA it needs; features newer than a cartridge's
  ISA behave as if they did not exist. The assembler picks the ISA itself (`.xdata`, `.pack`/`.endpack`).
- The app marks a stored cartridge that needs a newer ISA ("needs a newer QR Console") and disables Play.
- Double resolution was considered and **not** done (it would change locked decision L3 and quadruple
  graphics data): *Ideas for later* in `PROGRESS.md`.

**Accept:** `npm run check` (with `test/isa2.test.ts`), `npm run test:games`, `npm run test:blackbox`,
`npm run test:bo`, `npm run test:e2e`
- every committed ISA 1 game (hello, Breakout, Pong, BLACKBOX, and Bo until it moves) still assembles to its
  committed `.qrc`, byte for byte, and its replay hashes are unchanged
- the VM runs ISA 1 and 2 and refuses 0 and 3 with a clear message; an xdata section needs ISA 2; in an ISA 1
  cartridge syscalls 17–19 fault exactly like any unknown syscall
- `COPY`/`FILL`/`UNPACK` semantics and cycle costs as in `VM.md`; the encoder (asm) and the VM decoder agree on
  seeded random data of several kinds (the seed is printed on failure)
- the assembler chooses ISA 1 or 2 as `ASM.md` says; `.pack` rejects labels, instructions and late values
- e2e: an ISA 2 cartridge (xdata + UNPACK) plays in the app; an ISA 3 cartridge is stored but marked and
  cannot be started
- `VM.md`, `ASM.md`, `FORMAT.md` and `docs/PROGRAMMING.md` (§7.10, with a tested example) describe ISA 2

## M23 — Worlds 2 and 3

- Levels 2-1 to 2-5 (Kaninjakten, §10.2) and 3-1 to 3-5 (Bulldozern, §10.3); moving platforms, the chase, the
  World 2 and 3 tilesets, enemies and music.

**Accept:** `npm run test:bo` — as M22 for Worlds 2 and 3 (including "apples never lie", and every godis leads to a
secret it is needed for, DESIGN §8.5), plus: in the winning chase replay the rabbit never
overlaps Bo, and a second replay is caught and restarts at the checkpoint; the bulldozer stops after exactly three
STOP presses; replays from the World 2 map to the World 4 map.

## M24 — Worlds 4 and 5, the theft and the ending

- Levels 4-1 to 4-5 (Backhoppet and the theft, §10.4) and 5-1 to 5-5 (the final, §10.5); the ending; every board
  of §7.2 including the golden one; the seagull's food at every tally (§11.1); SUPERBOSSE (§4), unlocked by the
  final.

**Accept:** `npm run test:bo`
- as M22 for Worlds 4 and 5; the Backhoppet replay's jump is the longest in the game (measured in RAM); after the
  theft the board flag is set and World 5 uses the licorice board
- **one replay from the title to the end of the game** (all 25 levels, no code entry); a replay with all 60 stars
  shows the golden board
- after the final a replay performs SUPERBOSSE (3000 points); before the final the same input gives no SUPERBOSSE
- ROM ≤ 32 KB, or the overrun measured and flagged for a human

## M25 — Picture codes, music, delivery

- Picture codes (DESIGN §7.3), all music tracks and sound effects (§15), Bo's speech blips (optional in §12).
- Bo delivered like the other games.

**Accept:**
- `npm run test:bo`: every code round-trips (TypeScript reference encoder ⇄ VM decoder) for all worlds (and value 6,
  game complete, which unlocks SUPERBOSSE) × board sets × star sets, and wrong codes are rejected; a replay enters a code and resumes in the right world with the right
  boards; every world has its own track and every track is heard in the replays; sound effects interrupt the
  music and it resumes
- `npm run demo` writes and verifies `demo/bo.gif`; `npm run test:e2e` scans it with the fake camera to 100 %,
  presses PLAY and the first frame matches the VM reference
- `games/bo/GUIDE.md` (Swedish, for parents and Bo); `REPORT.md` gains a Bo section (tested / measured / not
  verified); `npm run check` green

## Manual acceptance for Part 3 (human only)

1. **After M20 (feel test):** scan `demo/bo.gif` on a phone and ride the test levels. Does rolling, jumping and
   grinding feel right? Change the constants in DESIGN §3.2 if not; the bot re-records the replays.
2. **After M22 (first ten minutes):** Bo plays from the title without help, and the human observes with the list in
   `FIRST10.md` §9. The answers go into `PROGRESS.md`; what they show is tuned before Worlds 2–5 are built.
3. **After M25 (Bo test):** Bo plays. The tests cannot judge the one thing that matters: whether it is fun for a
   six-year-old, and whether he can read the bubbles and use the touch controls. Notes go into `PROGRESS.md`.

---

# Part 4 — SIXTENS EXPEDITION (planned 2026-10-06 at the human's request)

An orienteering adventure for a nine-year-old: top-down, screen by screen (like BLACKBOX and Zelda), with short
side-view action stretches (like Zelda II), a whirlwind that is weather and not an enemy, a map that *is* the world,
and a nature book. It proves that the console can carry two engines in one cartridge — the second one as a **code
overlay** copied from xdata into RAM — and a deterministic weather system whose fairness is tested. The design is
the **specification** for these milestones:

- `games/sixten/DESIGN.md` — the ten locked decisions (§1), the safety principle and its sources (§1.1–1.3), the two
  views (§3), the cell format and map symbols (§4), compass (§5), the whirlwind system (§6), worlds and phenomena
  (§7), power-ups, nature book, facts and wood (§8), controls per level (§9), HUD and the save code (§10), the
  defaults for the draft's open questions (§11), budget (§12), the 1-1 sketch and its rules (§13).
- `games/sixten/mockup/` — a VM-rendered spike of the top-down screen, the map screen, the side view and an overlay
  swap (cycles measured, QR round trip tested; DECISIONS D-040).
- `games/sixten/levels/*.map` — the level sources, written from M26 on (one per level: cell map as text, controls,
  view transitions, whirlwind waypoints and cell changes, animals and nature-book objects; generator + preview PNG).
- `games/sixten/NATURBOK.md` — the 40 entries with a source and a review box each, written before M29.

Rules for M26–M32 (in addition to CLAUDE.md, same spirit as Parts 2 and 3):

- **The runtime is frozen on ISA 2.** From the planning commit on,
  `git diff 02d7058 -- packages/vm packages/cartridge packages/transport packages/qr apps` stays **empty** through
  M32. Wiring Sixten into the existing scripts (the demo list, the CI game matrix, e2e fixtures, a Vitest project) is
  expected. Any change to `packages/asm` or `packages/tools` must be generic, needs a `DECISIONS.md` entry and a human
  decision, and every other game must still assemble to identical sections. The `.overlay` directive (DESIGN §12.4)
  is such a change: optional, not needed, the human's decision. If something seems to need a runtime change, record
  the measurement, flag it under *Blocked / needs human*, and continue within the limits.
- **The design documents are the test oracle.** The tests read `DESIGN.md` (§4.1 cell table, §6 whirlwind rules,
  §8.1 power-ups, §10.2 code layout, §13 rules for 1-1), `NATURBOK.md` and the `.map` sources; what the engine holds
  in RAM or ROM is compared against them, never against itself.
- **Safety is a test, not a hope.** Every safety rule (DESIGN §1.3) and every nature-book entry has a source and a
  recorded check against it; from M29 on the tests require both on every row. (On 2026-10-07 the human delegated the
  review to Claude, D-044: the check column records Claude's check; the human's own tick stays a manual step.)
- **All game code and data live in `games/sixten/`**; generators and the replay bot in `games/sixten/tools/`.
- Every milestone has recorded replays (`games/sixten/replays/*.json`) with committed per-frame hashes from the VM,
  recorded by a bot from RAM-driven routes ("go to cell", "wait for whirlwind phase", "take shelter", "press A here"),
  and assertions in `test/sixten/**`.
- **Budgets, asserted in every replay:** no fault, 0 cycle-budget overruns, max cycles per frame ≤ 25 000 (half the
  budget); ROM size and cartridge size reported by `test:sixten` (ROM ≤ 32 KB; cartridge target < 25 KB, *measure*).

The test command for all Part 4 milestones is `npm run test:sixten` (a Vitest project for `test/sixten/**`); each
milestone adds to it and never removes earlier checks. From M26 on, the CI game matrix (`pages.yml`, D-039) gets a
`sixten` entry.

## M26 — Engine: cells, screens, walking, map and compass

- `.map` source format; `games/sixten/tools/levels.ts` packs every cell map into xdata and writes a preview PNG (the
  top-down view and the map side by side); the cell patterns and map-symbol tables of DESIGN §4.1; the cell map
  unpacked into RAM at level start; one screen (4 × 3 cells) expanded into a column-major tile buffer and drawn with
  one `MAP` per column; the screen slide; Sixten walks (4 directions, sliding round corners), collision by cell type;
  HUD (DESIGN §10.1); the map screen (B, pauses) with the "you are here" rule of DESIGN §5; the compass with course
  arrow and step counter. Test levels `T1` (every cell type once) and `T2` (a 6 × 5-screen maze of paths and forest).

**Accept:** `npm run test:sixten`
- **the map and the world agree cell for cell:** for every level, an independent TypeScript reader of the `.map`
  source reproduces the RAM cell map after unpacking; for every screen of T1 and T2 the tile buffer equals the
  reference expansion of those cells (patterns, the variant's swapped halves), and the map screen's fill colour and symbol for
  every cell equal the reference tables, read back from the framebuffer
- after a cell change written into RAM by a test hook, the next screen expansion **and** the next map screen show the
  new cell (the map is never stale)
- replays on T1 and T2: in **every frame** Sixten's box overlaps no blocking cell of the reference grid; walking speed
  per cell type matches DESIGN (path faster, dense forest slower) within ±1 px over a measured stretch
- the map shows "you are here" in exactly the frames where Sixten stands on a control, a crossing or the start (or
  has the cucumber), and never otherwise; the course arrow after setting a course points within one sixteenth of a
  turn at the target control; the step counter equals the cells walked
- budgets as above; ROM size reported

## M27 — The whirlwind and the wind

- The whirlwind object (DESIGN §6.1), waypoints and triggers from the `.map` source, the phases and warnings (§6.2),
  the visual language for strength 1–5 (§6.3), cell changes at waypoints (§6.4), damage and shelter (§6.5), wind
  particles and bending grass, falling branches in forest at wind ≥ 3, the whirlwind's sound language. Test level
  `T3` (one whirlwind of each strength crossing open land, forest, a ditch, a hollow and a cabin).

**Accept:** `npm run test:sixten`
- **never random:** two runs of every whirlwind replay with different RNG seeds give identical whirlwind state (RAM)
  in every frame; a route that takes a different path through the level gives the same whirlwind state in every
  frame after the same trigger (the whirlwind does not follow Sixten)
- **warning first:** for every whirlwind in every level, the first warning (phase 1) comes at least **300 frames**
  (5 s, DESIGN §6.2) before its strength first reaches 3 on any cell of the screen where Sixten is in the replay; the
  wind turns at least 120 frames before every change of direction
- **no jumps:** in every frame, the whirlwind's movement is at most its speed (+1/16 px rounding); its strength
  changes by at most one step per 60 frames
- cell changes happen only at their waypoint and only within the whirlwind's radius; after them the RAM cell map
  equals the `.map` source with the listed changes applied
- **shelter is real:** a replay that stands still in a ditch, a hollow and the cabin while a strength-3 whirlwind
  passes loses no heart; the same replay standing in forest or on open land inside the radius loses one (`AJ!`) and
  returns to the last control; a choklad replay inside the radius still loses one (DESIGN §8.1)
- budgets as above

## M28 — Side view as a code overlay

- The side-view engine (DESIGN §3.2): walk, variable jump, climb, crouch, horizontal wind force, lee; side-view levels
  in xdata; transitions from transition cells and back (§3.3); the compass shows the facing direction. The side-view
  engine (and the screens around the game, as far as they are written by now) is a **code overlay**: written in
  `.xdata` with relocated internal jumps (the `OJ` macro of the mockup, DESIGN §12.4), copied to `0xE000` with
  `SYS COPY` when the view changes. Test level `T4` (a cave, a ravine with a fallen tree, a cliff to climb).

**Accept:** `npm run test:sixten`
- every overlay is copied to RAM before its first instruction runs, and a trace of a side-view replay shows the PC in
  the overlay area for the side-view frames and never there in top-down frames; entering and leaving a side view
  twice gives the same state hashes both times
- every jump target inside an overlay that the assembler emitted lies inside that overlay's RAM range (checked from
  the listing: a relocation mistake fails here, not on the phone)
- in every frame Sixten's box overlaps no solid tile of the reference side-view grid; with wind w and no shelter his
  x speed changes by exactly w per frame; standing in the lee or with choklad it does not change
- entering a transition cell and pressing A starts the right side view; its exit leaves Sixten on the right cell
- ROM size reported, and how much ROM the overlays saved (code bytes in xdata)

## M29 — World 1 and the game around it (budget gate)

- Title, world map, level cards, tally, game over, the code screen; levels 1-1 to 1-4 (DESIGN §7); power-ups (§8.1),
  the nature book with the World 1 entries (§8.2), wood and building sites (§8.4); the World 1 tileset, animals and
  music. 1-1 is built exactly as DESIGN §13 describes.

**Accept:** `npm run test:sixten`
- **a safe route exists in every level:** for every World 1 level a bot replay follows the level's safe route from
  start to goal, takes every obligatory control, loses no heart, uses no wood, no power-up and no compass course
- for every World 1 level a replay that collects **every control and nature-book entry** of World 1 (checked against
  the `.map` sources)
- **1-1 rules** (DESIGN §13.2): no whirlwind before control 3; at least 300 frames of warning; a shelter cell at most
  2 cells from every cell of the safe route while the whirlwind is active; the first control at most 6 cells from the
  start; no forest cell inside the radius on the safe route
- every building site is optional: the safe route never needs it, and each one leads to a shortcut, an optional
  control or a nature-book entry
- power-ups do what DESIGN §8.1 says, measured from replays (cucumber: "you are here" on; chips: 1.5× speed; choklad:
  no wind push at strength 1–2, damage inside the radius unchanged)
- **safety review:** every row of DESIGN §1.3 and every World 1 entry in `NATURBOK.md` has a source and a recorded
  check (D-044); the texts in ROM/xdata equal `NATURBOK.md` byte for byte (glyph indices)
- one replay plays from the title to the World 2 map
- **budget gate:** code bytes (ROM and overlays), World 1 data bytes, ROM and cartridge size measured, and a
  projection for five worlds recorded in `DECISIONS.md`. If it exceeds 32 KB ROM or 25 KB cartridge, apply DESIGN
  §12.6's cut list in order and flag it for a human

## M30 — Worlds 2 and 3

- Levels 2-1 to 2-4 and 3-1 to 3-4 with their phenomena (falling trees and landslides; heavy rain/flooding and
  currents, DESIGN §7), the World 2 and 3 tilesets, animals, nature-book entries and music.

**Accept:** `npm run test:sixten` — as M29 for Worlds 2 and 3 (safe route, every control and entry, building sites
optional, safety review ticked), plus: flooded cells follow their schedule from the `.map` source and the safe route
never enters one; a landslide warns (trickling gravel) at least 120 frames before it changes cells; one replay from
the World 2 map to the World 4 map.

## M31 — Worlds 4 and 5 and the final

- Levels 4-1 to 4-4 (thunder, fog) and 5-1 to 5-4 (the final: a strength-5 whirlwind, DESIGN §7), the ending
  (`JAG FÖRSTÅR.`).

**Accept:** `npm run test:sixten`
- as M29 for Worlds 4 and 5; under thunder, no safe route passes a lone tree, a height or water while lightning is
  active, and a replay crouching in a hollow loses no heart
- in fog, a replay that follows the course arrow and the step counter reaches the control it set the course to
- **one replay from the title to the end of the game** (all 20 levels, no code entry)
- ROM ≤ 32 KB, or the overrun measured and flagged for a human; cartridge size reported against 25 KB

## M32 — Save code, music, delivery

- The save code (DESIGN §10.2), all music and sound effects (§15), Sixten delivered like the other games.

**Accept:**
- `npm run test:sixten`: every code round-trips (TypeScript reference encoder ⇄ VM decoder) for every world (1–6) ×
  a seeded sample of nature-book sets (the seed printed on failure) plus the empty and the full book; wrong checksums
  and impossible worlds are rejected; a replay enters a code and resumes in the right world with the right book
- every world has its own track and every track is heard in the replays; the whirlwind's sound follows its strength
- `npm run demo` writes and verifies `demo/sixten.gif`; `npm run test:e2e` scans it with the fake camera to 100 %,
  presses PLAY and the first frame matches the VM reference; the CI game matrix publishes it
- `games/sixten/GUIDE.md` (Swedish, for parents and Sixten); `REPORT.md` gains a Sixten section (tested / measured /
  not verified); `npm run check` green

## Manual acceptance for Part 4 (human only)

1. **Facts (any time):** tick every row of DESIGN §1.3 and `NATURBOK.md` that Claude checked, or correct it. S3
   (ditch as shelter from a whirlwind) still has only a US source (NWS).
2. **After M27 (feel test):** scan the demo GIF on a phone: can a whirlwind and its strength be read in 128 × 128?
   Does taking shelter feel obvious without text?
3. **After M29 (Sixten test):** a nine-year-old plays 1-1 and 1-2 without help. Does he find the controls, read the
   map, see the wind coming and find shelter? Notes go into `PROGRESS.md`; the tests cannot judge whether it is fun,
   or whether he learns the right thing.
