# BLACKBOX — screen-by-screen layout

Step 4 of `DESIGN.md` §6. Every room of the game, drawn in the engine's room format (`DESIGN.md` §3.1):
**16 × 15 tiles**, one character per tile. `test/blackbox-layout.test.ts` checks the whole file:
grid sizes and characters, door reciprocity, reachability inside every room, that every dialogue, log and
prediction is placed, and that the game can be completed from 0.1 to 7.4 **even if the player says no to
Mira** (optional flags are not used by the check).

## Legend

| Char | Tile | Moves | Sight |
|---|---|---|---|
| `#` | wall | blocks | blocks |
| `S` | shelf / server rack / planter | blocks | blocks |
| `C` | camera (on a wall or pillar; facing in *objects*) | blocks | blocks |
| `.` | floor | free | free |
| `=` | desk, counter, glass | blocks | **free** (guards see over it) |
| `+` | doorway (on the border = exit) | free | free |
| `D` | locked door (on the border = exit; see *locks*) | locked | blocks |
| `V` | vent (on the border = crawl exit) | free | blocks |
| `T` | terminal / console / interactive desk | blocks, use with A | free |
| `E` | EMP charging station | blocks, use with A | free |
| `L` | lift / blast door / warp point (see *warp*) | blocks, use with A | blocks |
| `K` | the cable (7.4) | blocks, use with A | free |
| `i` | pick-up on the floor | free | free |
| `@` | player start (0.1) / arrival point in a room entered by warp that has no `L` tile (1.1) | free | free |
| `g d h u p a` | guard, drone, heavy guard, hunter, prototype, ORACLE agent — start cell | free | – |
| `n b` | NPC, boss — start cell | free | – |

Coordinates are `(column, row)`, 0-based from the top-left. Exits use the same column (N/S) or row (E/W) on
both sides of a door; by default column 7 and row 7.

## Header keys

- `exits:` side + room (`N 2.6, W 2.2`). A side may lead to `END` (an ending).
- `warp:` target room reached through an `L` tile, optionally followed by the flag it needs.
- `locks:` side + flag needed to pass that exit from this room.
- `gives:` flags this room can set. `CARD<KEYNOTE` = needs KEYNOTE first. A trailing `?` = optional
  (a player choice); the completion check never relies on it.
- `events:` dialogues (D), logs (L), predictions (P) placed here.
- `objects:` free text: patrols, camera directions, what each `T` is.

## Maps

```
ZONE 1-2 (ground floor)            ZONE 3 (security)       ZONE 4 (labs)
 2.5  2.6  2.4                           3.5                 4.2  4.4  4.5
 2.2  2.1  2.3                     3.2   3.3   3.4           4.1  4.3  4.6
      1.4                                3.1
 1.1  1.2  1.3                           (2.6 below)         lift 3.5 → 4.1, lift 4.6 → 5.1

ZONE 5 (underground)               ZONE 6 (servers)        ZONE 7 (core)
 5.3  5.2  5.1                      6.3  6.4  6.5                  7.4
 5.4  5.5  5.6                      6.2  6.1                 7.2   7.3      (7.2 west = LEFT ending)
                                                             7.1
 blast door 5.6 → 6.1               airlock 6.5 → 7.1
```

---

## 0 INTRO

```room
id: 0.1
name: ELI'S APARTMENT
exits:
warp: 1.1
locks:
gives:
events: D1
objects: T(3,1) Eli's computer (D1 starts here). L(14,13) front door -> 1.1.
################
#==T.....SSSS..#
#........SSSS..#
#..@...........#
#..............#
#..==..........#
#..==..........#
#..............#
#..........====#
#..............#
#..............#
#..............#
#..............#
#.............L#
################
```

## 1 ENTRANCE — learning to sneak

```room
id: 1.1
name: GATE
exits: E 1.2
warp:
locks:
gives:
events:
objects: g(7,6) patrols row 6 between columns 2 and 13, looking along the row. Player arrives at @(1,12).
################
#..............#
#..............#
#..SSSS..SSSS..#
#..SSSS..SSSS..#
#..SSSS..SSSS..#
#......g.......#
#..............+
#..............#
#..=====..=====#
#..............#
#..............#
#@.............#
#..............#
################
```

```room
id: 1.2
name: LOBBY
exits: W 1.1, E 1.3
warp:
locks:
gives: BADGE
events: D2
objects: T(4,3) reception terminal: D2, prints the VISITOR BADGE.
################
#..............#
#..=========...#
#..=T.......=..#
#..=........=..#
#..............#
#..............#
+..............+
#..............#
#....SS....SS..#
#....SS....SS..#
#..............#
#..............#
#..............#
################
```

```room
id: 1.3
name: SECURITY CHECKPOINT
exits: W 1.2, E 1.4
warp:
locks: E BADGE
gives:
events:
objects: g(3,2) looks down column 3, g(12,2) looks down column 12, both turn every 3 s. Their sight lines cross the room; the counters (=) do not hide the player.
################
#......##......#
#..g...##...g..#
#......##......#
#..............#
#..==......==..#
#..............#
+..............D
#..............#
#..==......==..#
#..............#
#......##......#
#......##......#
#......##......#
################
```

```room
id: 1.4
name: CORRIDOR
exits: W 1.3, N 2.1
warp:
locks:
gives:
events:
objects: C(15,7) static camera looking west along row 7 — walk along row 6 or 8. It never turns yet.
#######+########
#######..#######
#######..#######
#######..#######
#######..#######
#######..#######
#..............#
+..............C
#..............#
################
################
################
################
################
################
```

## 2 ADMINISTRATION — something is wrong

```room
id: 2.1
name: OPEN OFFICE
exits: S 1.4, W 2.2, E 2.3, N 2.6
warp:
locks: N DIRDOOR
gives:
events:
objects: g(7,5) patrols the central aisle (column 7) rows 1-13. The director's door (N) only opens from inside.
#######D########
#..............#
#.==.==.==.==..#
#.==.==.==.==..#
#..............#
#......g.......#
#.==.==.==.==..#
+.==.==.==.==..+
#..............#
#..............#
#.==.==.==.==..#
#.==.==.==.==..#
#..............#
#..............#
#######+########
```

```room
id: 2.2
name: COPY ROOM
exits: E 2.1, N 2.5
warp:
locks: N L1
gives: L1
events: L1
objects: T(4,5) copier terminal: prints the memo (L1) and releases the grille to the janitor's closet (N).
#######D########
#..............#
#.SSSS...SSSS..#
#..............#
#..............#
#...T..........#
#..............#
#..............+
#..==....==....#
#..............#
#..............#
#..............#
#..............#
#..............#
################
```

```room
id: 2.3
name: SERVER CLOSET
exits: W 2.1, N 2.4
warp:
locks:
gives:
events: D3
objects: T(12,12) maintenance terminal: Mira's first message (D3) appears when the player enters.
#######+########
#.SS.SS.SS.SS..#
#.SS.SS.SS.SS..#
#..............#
#..............#
#.SS.SS.SS.SS..#
#.SS.SS.SS.SS..#
+..............#
#..............#
#.SS.SS.SS.SS..#
#.SS.SS.SS.SS..#
#..............#
#...........T..#
#..............#
################
```

```room
id: 2.4
name: RESEARCHER'S OFFICE
exits: S 2.3
warp:
locks:
gives:
events: D4, L2
objects: n(5,3) Dr. Reyes (D4). T(11,2) her desk terminal: personal notes (L2, optional).
################
#..............#
#..====....T...#
#..=.n.........#
#..............#
#.SS...........#
#.SS.......==..#
#..............#
#..............#
#..............#
#..............#
#..............#
#..............#
#..............#
#######+########
```

```room
id: 2.5
name: JANITOR'S CLOSET
exits: S 2.2, E 2.6
warp:
locks:
gives:
events:
objects: i(3,10) spare EMP charge (kept until the EMP is found). V(15,7) vent into the director's office.
################
#SS......SS....#
#SS............#
#..............#
#..............#
#..............#
#..............#
#..............V
#..............#
#....SS........#
#....SS........#
#..i...........#
#..............#
#..............#
#######+########
```

```room
id: 2.6
name: DIRECTOR'S OFFICE
exits: W 2.5, S 2.1, N 3.1
warp:
locks: N CARD
gives: KEYNOTE, CARD<KEYNOTE, DIRDOOR
events:
objects: T(5,3) keyboard: the safe code taped underneath (KEYNOTE). T(10,3) safe: SECURITY CARD. C(2,6) camera on a pillar facing east along row 6. The door S opens from inside (DIRDOOR).
#######D########
#..............#
#...========...#
#...=T....T=...#
#..............#
#..............#
#.C............#
V..............#
#..............#
#..............#
#.SS........SS.#
#..............#
#..............#
#..............#
#######+########
```

## 3 SECURITY — the first prediction

```room
id: 3.1
name: SURVEILLANCE
exits: S 2.6, N 3.3
warp:
locks: N L3
gives: L3
events: L3
objects: T(2,2) camera index (L3) — reading it unlocks the stairwell (N). T(3..5,2) other monitors show live feeds, including Eli a few seconds ago. g(10,6) sits and turns every 4 s.
#######D########
#..............#
#.TTTT.........#
#..............#
#..==..........#
#..............#
#.........g....#
#..............#
#..............#
#.SS......SS...#
#..............#
#..............#
#..............#
#..............#
#######+########
```

```room
id: 3.3
name: CROSSROADS
exits: S 3.1, W 3.2, E 3.4, N 3.5
warp:
locks: N SHUTTER
gives:
events: P1
objects: Mira: TURN LEFT. (P1) as the player reaches row 7. P1 = the first exit taken, W (hit) or E (miss). The shutter (N) is controlled from the armory.
#######D########
#######..#######
#######..#######
#######..#######
#######..#######
#######..#######
#..............#
+..............+
#..............#
#######..#######
#######..#######
#######..#######
#######..#######
#######..#######
#######+########
```

```room
id: 3.2
name: ARMORY
exits: E 3.3
warp:
locks:
gives: EMP, SHUTTER
events: P2
objects: i(3,3) EMP: Mira: TAKE THE EMP. YOU WILL NEED IT. (P2 asked) + hint B: EMP. T(10,5) shutter terminal (SHUTTER). E(14,9) charging station.
################
#SSSS....SSSS..#
#..............#
#..i...........#
#..............#
#.SS......T....#
#..............#
#..............+
#..............#
#.SS..........E#
#..............#
#..............#
#..............#
#..............#
################
```

```room
id: 3.4
name: ALARM CENTRE
exits: W 3.3
warp:
locks:
gives: ALARM?
events: D5
objects: The "wrong" way at P1. C(7,1) camera facing south down column 7; d(10,6) drone patrols a square. T(3..5,3) alarm console: D5 (optional). Being seen here sets ALARM: one more heavy guard in 3.5.
################
#......C.......#
#..............#
#..TTT.........#
#..............#
#..............#
#.........d....#
+..............#
#..............#
#.SS......SS...#
#..............#
#..............#
#..............#
#..............#
################
```

```room
id: 3.5
name: LIFT HALL
exits: S 3.3
warp: 4.1
locks:
gives:
events: D6
objects: D6 on entry (security level 3). h(3,4) heavy guard, slow, patrols the west half. L(7,1),(8,1) lift down to the labs.
################
#......LL......#
#..............#
#..............#
#..h...........#
#..............#
#..SS......SS..#
#..............#
#..............#
#..............#
#..SS......SS..#
#..............#
#..............#
#..............#
#######+########
```

## 4 LABORATORY — the first boss

```room
id: 4.1
name: LAB CORRIDOR
exits: N 4.2
warp: 3.5
locks:
gives:
events: P2
objects: Lift arrival L(7,13),(8,13). d(7,3) and d(8,7) sweep rows 3 and 7. E(14,11). P2 resolved when leaving north: hit if the EMP was used in this room.
#######+########
#..............#
#.==........==.#
#......d.......#
#..............#
#.==........==.#
#..............#
#.......d......#
#..............#
#.==........==.#
#..............#
#.............E#
#..............#
#......LL......#
################
```

```room
id: 4.2
name: OBSERVATION ROOM
exits: S 4.1, E 4.4
warp:
locks: E L4
gives: L4
events: L4
objects: The glass (=) looks into an empty test cell. T(3,3) observation log TEST 14 (L4) — reading it unlocks the door east.
################
#======.======.#
#..............#
#..T...........#
#..............#
#..............#
#..............#
#..............D
#..............#
#..............#
#..............#
#..............#
#..............#
#..............#
#######+########
```

```room
id: 4.4
name: CONTROL ROOM
exits: W 4.2, E 4.5, S 4.3
warp:
locks: E MIRA_DOOR
gives: MIRA_DOOR?
events: D7, P3
objects: T(6,2) main console: D7 and P3 (send the access key? A yes / B no). Yes opens the east door to the test chamber; no means the long way through the prototype hall (S). g(3,5) watches the consoles.
################
#..............#
#..TTTTTTTT....#
#..............#
#..............#
#..g...........#
#..............#
+..............D
#..............#
#..==....==....#
#..............#
#..............#
#..............#
#..............#
#######+########
```

```room
id: 4.3
name: PROTOTYPE HALL
exits: N 4.4, E 4.6
warp:
locks:
gives:
events: L5
objects: p(2,2),(5,2),(8,2),(11,2) inactive prototypes whose heads follow the player (visual only). d(8,6) drone. T(4,11) founding brief (L5, optional). E(14,12).
#######+########
#..............#
#.p..p..p..p...#
#..............#
#.SS.SS.SS.SS..#
#..............#
#.......d......#
#..............+
#..............#
#.SS.SS.SS.SS..#
#..............#
#...T..........#
#.............E#
#..............#
################
```

```room
id: 4.6
name: FREIGHT LIFT
exits: W 4.3, N 4.5
warp: 5.1 LABCARD
locks:
gives:
events:
objects: L(7,12),(8,12) freight lift down, needs the LAB CARD from the Security Director.
#######+########
#..............#
#..............#
#..............#
#..SS......SS..#
#..............#
#..............#
+..............#
#..............#
#..SS......SS..#
#..............#
#..............#
#......LL......#
#..............#
################
```

```room
id: 4.5
name: TEST CHAMBER
exits: W 4.4, S 4.6
warp:
locks:
gives: LABCARD
events: D8, P4
objects: b(7,5) SECURITY DIRECTOR: powers up for 1 s when the player comes in (the S door is in its column), then fires 3 times and turns for 2 s. T(1,1), T(14,1), T(4,13) override panels — hack all three while its back is turned. P4 = first panel hacked in the first turn window. Drops the LAB CARD.
################
#T............T#
#..............#
#..............#
#..............#
#......b.......#
#..............#
+..............#
#..............#
#..............#
#..............#
#..............#
#..............#
#...T..........#
#######+########
```

## 5 UNDERGROUND — the twist

```room
id: 5.1
name: BUNKER STAIRS
exits: W 5.2
warp: 4.6
locks:
gives:
events:
objects: Lift arrival L(13,1),(14,1). u(6,6) hunter: wakes when the player is within 4 tiles in its line of sight, then follows at walking speed.
################
#............LL#
#..............#
#..SSSSSSSSSS..#
#..............#
#..............#
#.....u........#
+..............#
#..............#
#..SSSSSSSSSS..#
#..............#
#..............#
#..............#
#..............#
################
```

```room
id: 5.2
name: ARCHIVE
exits: E 5.1, W 5.3
warp:
locks: W L6
gives: L6
events: L6, D9
objects: T(8,7) archive index (L6, then D9) — unlocks the inner archive (W). u(7,13) hunter asleep between the shelves.
################
#.SSSS.SSSS.SS.#
#..............#
#.SSSS.SSSS.SS.#
#..............#
#.SSSS.SSSS.SS.#
#..............#
D.......T......+
#..............#
#.SSSS.SSSS.SS.#
#..............#
#.SSSS.SSSS.SS.#
#..............#
#......u.......#
################
```

```room
id: 5.3
name: INNER ARCHIVE
exits: E 5.2, S 5.4
warp:
locks:
gives:
events: D10
objects: T(7,3) TEST 17 file (D10). No enemies: a quiet room for the reveal.
################
#..............#
#..SS......SS..#
#..SS..T...SS..#
#..............#
#..............#
#..............#
#..............+
#..............#
#..SS......SS..#
#..SS......SS..#
#..............#
#..............#
#..............#
#######+########
```

```room
id: 5.4
name: COOLING ROOM
exits: N 5.3, E 5.5
warp:
locks:
gives:
events: P5, L7
objects: The wall on row 5 has one gap (7..8,5). g(3,6) watches the row below the gap (facing east) and turns south every 6 s. Mira: THE GUARD WILL TURN IN THREE SECONDS. (P5) when the player reaches row 4 — and the guard does turn exactly 3 s later (ORACLE controls it). P5 = hit if the player gets past without being detected after the warning, miss if detected here first. T(4,11) incident report (L7, optional).
#######+########
#..............#
#.SS.SS.SS.SS..#
#..............#
#..............#
#######..#######
#..g...........#
#..............+
#..............#
#.SS.SS.SS.SS..#
#..............#
#...T..........#
#..............#
#..............#
################
```

```room
id: 5.5
name: SILENT TERMINAL
exits: W 5.4, E 5.6
warp:
locks:
gives:
events: D11
objects: T(7,6) terminal: D11, Mira is gone. No enemies, no music — only the cooling fans.
################
#..............#
#..SS......SS..#
#..SS......SS..#
#..............#
#..............#
#......T.......#
+..............+
#..............#
#..............#
#..SS......SS..#
#..SS......SS..#
#..............#
#..............#
################
```

```room
id: 5.6
name: AIRLOCK
exits: W 5.5
warp: 6.1 EMP
locks:
gives:
events:
objects: p(10,7) PROTOTYPE stands in front of the blast door L(13,7),(14,7) and tracks the player; an EMP hit freezes it for 4 s — enough to use the door.
################
#..............#
#..............#
#..SS......SS..#
#..............#
#..............#
#..............#
+.........p..LL#
#..............#
#..............#
#..SS......SS..#
#..............#
#..............#
#..............#
################
```

## 6 SERVER COMPLEX — ORACLE speaks

```room
id: 6.1
name: SERVER HALL A
exits: W 6.2
warp: 5.6
locks:
gives:
events: D12, P6
objects: Arrival through the blast door L(13,1),(14,1). D12 on entry; from here the HUD shows the live ORACLE figure. T(11,7): YOU WILL READ THIS MESSAGE. scrolls on it only within 3 tiles (P6 = hit if the player uses it).
################
#SS.SS.SS.SS.LL#
#SS.SS.SS.SS...#
#..............#
#SS.SS.SS.SS...#
#SS.SS.SS.SS...#
#..............#
+..........T...#
#..............#
#SS.SS.SS.SS...#
#SS.SS.SS.SS...#
#..............#
#..............#
#..............#
################
```

```room
id: 6.2
name: SERVER HALL B
exits: E 6.1, N 6.3
warp:
locks:
gives:
events:
objects: a(7,5) ORACLE AGENT: moves towards the cell the player will reach in 1 s (current position + velocity), not where the player is.
#######+########
#..............#
#.SS.SS..SS.SS.#
#.SS.SS..SS.SS.#
#..............#
#......a.......#
#.SS.SS..SS.SS.#
#.SS.SS..SS.SS.+
#..............#
#.SS.SS..SS.SS.#
#.SS.SS..SS.SS.#
#..............#
#..............#
#..............#
################
```

```room
id: 6.3
name: COOLING CORRIDOR
exits: S 6.2, E 6.4
warp:
locks:
gives:
events: L8
objects: T(10,5) personality model MIRA (L8, optional). A narrow, quiet corridor.
################
################
################
################
################
#######...T#####
#######........#
#######........+
#######..#######
#######..#######
#######..#######
#######..#######
#######..#######
#######..#######
#######+########
```

```room
id: 6.4
name: DIRECTOR'S CHECKPOINT
exits: W 6.3, E 6.5
warp:
locks: E HALE
gives: HALE
events: D13, L9
objects: n(7,3) Director Hale behind his desk (D13); afterwards he opens the core door (HALE). T(3,5) his printout (L9, optional, after D13).
################
#..............#
#.....====.....#
#.....=n.=.....#
#..............#
#..T...........#
#..............#
+..............D
#..............#
#..............#
#..............#
#..............#
#..............#
#..............#
################
```

```room
id: 6.5
name: CORE AIRLOCK
exits: W 6.4
warp: 7.1
locks:
gives:
events:
objects: L(13,7),(14,7) the last door. E(14,4) a last charging station before the core. Silence; the ORACLE music loop starts here.
################
#..............#
#..............#
#..SS......SS..#
#.............E#
#..............#
#..............#
+............LL#
#..............#
#..............#
#..SS......SS..#
#..............#
#..............#
#..............#
################
```

## 7 ORACLE CORE — the choice

```room
id: 7.1
name: CORE HALL
exits: N 7.2
warp: 6.5
locks: N BOSS2
gives: BOSS2
events: D14
objects: Arrival L(7,13),(8,13). b(7,6) measuring unit, ORACLE comments with barks. T(2,2), T(13,2), T(2,10), T(13,10) panels: hack all four while the unit is stunned by EMP.
#######D########
#..............#
#.T..........T.#
#..............#
#..SS......SS..#
#..............#
#......b.......#
#..............#
#..SS......SS..#
#..............#
#.T..........T.#
#..............#
#..............#
#......LL......#
################
```

```room
id: 7.2
name: FORK
exits: S 7.1, W END, E 7.3
warp:
locks:
gives:
events: D15, P7
objects: D15 on entry at (7,7). P7 = the exit taken: W (LEFT, hit, ending E1) or E (RIGHT, miss).
################
################
################
################
################
################
#..............#
+..............+
#..............#
#######..#######
#######..#######
#######..#######
#######..#######
#######..#######
#######+########
```

```room
id: 7.3
name: CORE
exits: W 7.2, N 7.4
warp:
locks: N L10
gives: L10
events: D16, D17, L10
objects: The core ring (S) with ORACLE's terminal T(7,4),(8,4) inside. D16 and D17 play at the terminal, then the session log (L10) opens the last door.
#######D########
#..............#
#..SSSSSSSSSS..#
#..S........S..#
#..S...TT...S..#
#..S........S..#
#..SSSS..SSSS..#
+..............#
#..............#
#..............#
#..............#
#..............#
#..............#
#..............#
################
```

```room
id: 7.4
name: THE TERMINAL AND THE CABLE
exits: S 7.3
warp: END
locks:
gives:
events: D18, P8, D19, D20
objects: D18 on entry. T(7,6) the terminal (DELETE / RELEASE / LISTEN). K(1,1) the cable, in the far corner, away from the terminal ORACLE told the player to walk to. Using either ends the game (D19, D20).
################
#K.............#
#..............#
#..............#
#..............#
#..............#
#......T.......#
#..............#
#..............#
#..............#
#..............#
#..............#
#..............#
#..............#
#######+########
```
