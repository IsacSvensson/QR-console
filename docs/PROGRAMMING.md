# Programming QR Console — assembly and bytecode guide

This is the practical guide to writing games for QR Console: how the machine works, how to write
assembly for it, the idioms that work well, the traps, and the tooling. It is written to be read by a
human or handed to a later AI session as the single reference.

Normative references (if this guide and they disagree, they win, and this guide has a bug):

- `packages/vm/VM.md` — ISA version 1: opcodes, encoding, memory map, syscalls
- `packages/asm/ASM.md` — assembler syntax reference
- `packages/cartridge/FORMAT.md` — cartridge file format
- Source of truth: `packages/vm/src/vm.ts`, `packages/vm/src/isa.ts`, `packages/asm/src/assembler.ts`

Every complete program in this file (a fenced `asm` block containing an `update:` label) is assembled and
run for 300 frames by `test/docs.test.ts`, so the examples are known to work.

---

## 1. The machine in one page

| | |
|---|---|
| CPU | 16-bit, registers `r0`–`r7`, plus `PC`, `SP`, flags `Z N C V` |
| Instructions | 33 opcodes, every instruction exactly **4 bytes** |
| Memory | 64 KB: **ROM 0x0000–0x7FFF** (read-only), **RAM 0x8000–0xFFFF** |
| Screen | 128×128 pixels, 16 fixed colours, not memory-mapped (draw with syscalls) |
| Input | 6 buttons: LEFT, RIGHT, UP, DOWN, A, B |
| Sound | 2 square-wave channels + 1 noise channel, driven by commands |
| Timing | 60 frames per second; your `update` routine is called once per frame |
| Budget | 50 000 cycles per call (1 per instruction, 8 per `SYS`) |
| Determinism | same cartridge + seed + button presses ⇒ bit-identical game, every time |

### Lifecycle — the most important rule

```
frame 0:  init()   (if you define it)   then  update()
frame 1:  update()
frame 2:  update()   …
```

Each call starts with **all registers = 0 and an empty stack**. Nothing in registers survives from one
frame to the next. **All game state lives in RAM** (declare it with `.var`). `update` ends when it executes
`RET` with an empty stack.

If a call runs out of its 50 000-cycle budget, the frame simply ends there and the next frame starts
`update` from the top again. Nothing crashes, but half-done work is lost — keep `update` well under budget
(the example games use 200–1000 cycles per frame).

An illegal opcode or an unknown syscall number **faults**: the VM stops executing for good (the screen
freezes). The host reports the fault.

### Memory map

```
0x0000  ┌──────────────────────────┐
        │ vector table (4 bytes):  │  init address, update address (0xFFFF = none)
0x0004  │ code        (.code)      │
        │ read-only data (.data)   │  sprites, tilemaps, strings, tables
        │ sound definitions (.sfx) │
0x7FFF  └──────────────────────────┘  ROM ends (32 KB max for all three together)
0x8000  ┌──────────────────────────┐
        │ your variables (.var) ↓  │  allocated upwards from 0x8000
        │                          │
        │           stack ↑        │  grows downwards from 0xFFFF
0xFFFF  └──────────────────────────┘
```

Writes to ROM addresses are **silently ignored** (a common bug: storing to a label in `.data`).

---

## 2. Your first program

```asm
; HELLO — clears the screen and prints a line of text every frame.
.title "HELLO"

update:
    LDI r0, 2               ; colour 2 (navy)
    SYS CLS                 ; clear screen
    LDI r0, msg             ; r0 = address of the string
    LDI r1, 42              ; x
    LDI r2, 61              ; y
    LDI r3, 15              ; colour 15 (white)
    SYS TEXT
    RET

.data
msg: .string "HELLO WORLD"
```

Build and look at it:

```sh
mkdir -p games/mygame && $EDITOR games/mygame/mygame.asm   # one .asm file per game directory
npm run qrc -- build games/mygame                           # → games/mygame/mygame.qrc
npm run qrc -- run games/mygame/mygame.qrc --frames 1 --dump-frame out.png --scale 4
```

Or load the `.qrc` into the web app with *Load a .qrc file* on the Library screen
(`npm run dev -w apps/web`).

---

## 3. Assembly language

### 3.1 Lines

```
[label:] [instruction or directive] [; comment]
NAME = constant expression
```

- Mnemonics, directives and register names are case-insensitive. **Symbols are case-sensitive.**
- `name:` is a global label. `@name:` is a **local label**: it belongs to the most recent global label, so
  every routine can have its own `@loop`, `@done`, … Refer to it as `@loop` inside that routine.
- Several labels may share a line: `a: b: NOP`.

### 3.2 Operands

| Form | Examples | Notes |
|---|---|---|
| register | `r0` … `r7` | |
| immediate | `42`, `-1`, `0x2A`, `$2A`, `0b101010`, `'A'`, `MAX - 8` | must fit 16 bits: −32768 … 65535 |
| memory | `[r1]`, `[r1 + 4]`, `[r1 - 2]`, `[label]`, `[label + 2]` | **the register must come first**: `[r1 + table]` works, `[table + r1]` does not |

### 3.3 Constant expressions

Integers, symbols (constants, labels, `.var` addresses), parentheses, unary `- + ~`, and binary
`* / %`, `+ -`, `<< >>`, `&`, `^`, `|` with C precedence. `/` truncates towards zero. That is all — there
is no expression language beyond constant arithmetic (SPEC L6).

Constants may refer to labels and to constants defined later:

```
.const LEVEL_BYTES, level_end - level     ; fine, resolved after layout
tiles = tile_data - 32                     ; the "tile 0 is empty" trick (§7.4)
```

Exception: the size given to `.var` and the count given to `.fill` must be computable **where they appear**
(they decide the layout), so they may use only constants, not labels.

Character literals: `'A'`, `'\n'`, `'\''`, `'\\'`.

### 3.4 Directives

| Directive | Meaning |
|---|---|
| `.title "NAME"` | cartridge title shown in the Library (≤ 32 bytes) |
| `.code` / `.data` | switch section. Code is the default. `.data` (= `.rodata`) is read-only data placed after all code |
| `NAME = expr` / `.const NAME, expr` | constant |
| `.var NAME [, size]` | reserve `size` bytes of RAM (default 2 = one word). `NAME` = its address |
| `.byte e, e, "str", …` | bytes; strings here are **not** zero-terminated; values −128 … 255 |
| `.word e, …` | 16-bit little-endian words (labels allowed → jump/data tables) |
| `.string "text"` | zero-terminated string. Escapes: `\n \t \0 \\ \"` |
| `.fill count [, value]` | `count` bytes of `value` (default 0) |
| `.sprite` + 8 rows | one 8×8 sprite; each row is 8 characters: `.` = transparent, `0`–`F` = colour |
| `.sfx NAME, channel, freq, frames, volume [, sweep]` | a sound effect; `NAME` becomes its id for `SYS SFX` |

### 3.5 Built-in names

Syscalls: `CLS PSET PGET RECT RECTFILL LINE SPR MAP TEXT NUM BTN BTNP OVERLAP RND SOUND SFX FRAME`.
Buttons: `BTN_LEFT=1 BTN_RIGHT=2 BTN_UP=4 BTN_DOWN=8 BTN_A=16 BTN_B=32`. Also `RAM_START=0x8000`.
They cannot be redefined. There are **no colour names**: define your own (`C_WHITE = 15`).

### 3.6 Macros and includes

```
.include "rooms.asm"          ; inline another file from the SAME game directory (no paths)

.macro CLAMP reg, lo, hi      ; parameters are replaced as whole words
    CMP reg, lo
    JGE @@not_low             ; @@name = a local label unique to each expansion
    LDI reg, lo
@@not_low:
    CMP reg, hi
    JLE @@done
    LDI reg, hi
@@done:
.endm

    CLAMP r1, 0, 120          ; expands in place (labels may precede it: `here: CLAMP r1, 0, 9`)
```

- A game directory's main file is `<dirname>.asm`; other `.asm` files there are pulled in with `.include`.
- Macros must be defined before use; they may call other macros and be defined in included files.
- Errors inside an include or a macro report the real file and line, plus where the macro was expanded.
- Parameters are replaced everywhere in the body as whole words, including inside strings — pick names
  that do not collide with symbols you use in the body.

---

## 4. Instructions

`a` = destination register, `src` = register **or** immediate.

### Data movement

| Instruction | Effect | Flags |
|---|---|---|
| `MOV a, src` / `LDI a, imm` | `a = src` | – |
| `LD a, [addr]` | `a = 16-bit word at addr` | – |
| `LDB a, [addr]` | `a = byte at addr` (zero-extended) | – |
| `ST [addr], a` | store word | – |
| `STB [addr], a` | store low byte | – |
| `PUSH a` / `POP a` | stack | – |

### Arithmetic and logic (all results are 16-bit, wrapping)

| Instruction | Effect | Flags |
|---|---|---|
| `ADD a, src` | `a += src` | Z N C V |
| `SUB a, src` | `a -= src` | Z N C V (C = borrow) |
| `CMP a, src` | like SUB but only sets flags | Z N C V |
| `MUL a, src` | low 16 bits of `a * src` | Z N |
| `DIV a, src` | **signed**, truncating; divide by 0 gives 0 | Z N |
| `MOD a, src` | signed remainder (sign of `a`); mod 0 gives 0 | Z N |
| `AND / OR / XOR a, src` | bitwise | Z N |
| `SHL a, src` | shift left by `src & 15` | Z N |
| `SHR a, src` | logical shift right | Z N |
| `SAR a, src` | arithmetic shift right (keeps the sign) — use for signed ÷ 2ⁿ | Z N |
| `NEG a` | `a = -a` | Z N |

`MOV`, `LD`, `ST`, `PUSH`, `POP`, jumps and syscalls **do not change flags**.
There is no `NOT`: use `XOR a, -1`. No `INC`/`DEC`: use `ADD a, 1`.

### Control flow

| Instruction | Jumps when | Use after `CMP x, y` for |
|---|---|---|
| `JMP target` | always (target = label or register) | |
| `JZ` / `JEQ` | Z | x = y |
| `JNZ` / `JNE` | not Z | x ≠ y |
| `JLT` | N ≠ V | x < y **signed** |
| `JGE` | N = V | x ≥ y signed |
| `JGT` | not Z and N = V | x > y signed |
| `JLE` | Z or N ≠ V | x ≤ y signed |
| `JB` | C | x < y **unsigned** |
| `JAE` | not C | x ≥ y unsigned |
| `CALL target` | always; pushes return address (target = label or register) | |
| `RET` | pops return address; with an empty stack it ends `init`/`update` | |
| `SYS n` | calls syscall `n` | |
| `NOP` | – | |

Conditional jumps take a label only. `JMP` and `CALL` can also take a register, which is how jump tables
work (§7.3).

Signed vs unsigned: coordinates, velocities and anything that can go negative → `JLT/JGE/JGT/JLE`.
Addresses and values that can exceed 32767 → `JB/JAE`.

---

## 5. Syscalls

Arguments go in `r0`… in order. A syscall that returns something writes it to **`r0`**; **every other
register is left unchanged** (so you can keep loop counters in `r4`–`r7` across drawing calls).
Coordinates and sizes are signed; everything is clipped to the screen, so drawing partly off-screen is fine.
Each `SYS` costs 8 cycles regardless of how many pixels it draws.

| Syscall | Arguments | Returns |
|---|---|---|
| `CLS` | r0 colour | |
| `PSET` | r0 x, r1 y, r2 colour | |
| `PGET` | r0 x, r1 y | r0 colour (0 off-screen) |
| `RECT` | r0 x, r1 y, r2 w, r3 h, r4 colour — outline | |
| `RECTFILL` | r0 x, r1 y, r2 w, r3 h, r4 colour | |
| `LINE` | r0 x0, r1 y0, r2 x1, r3 y1, r4 colour | |
| `SPR` | r0 sprite address, r1 x, r2 y, r3 flags (1 = flip x, 2 = flip y) | |
| `MAP` | r0 map address, r1 tiles address, r2 columns, r3 rows, r4 x, r5 y (max 64×64 tiles) | |
| `TEXT` | r0 string address, r1 x, r2 y, r3 colour | r0 x after the text |
| `NUM` | r0 value (unsigned decimal), r1 x, r2 y, r3 colour | r0 x after the digits |
| `BTN` | – | r0 buttons held now |
| `BTNP` | – | r0 buttons that went down **this frame** |
| `OVERLAP` | r0–r3 = x, y, w, h of A; r4–r7 = x, y, w, h of B | r0 1 if the rectangles overlap |
| `RND` | r0 n | r0 random in 0 … n−1 (n = 0 → 0 … 65535) |
| `SOUND` | r0 channel (0, 1 square; 2 noise), r1 Hz, r2 frames, r3 volume 0–15 | |
| `SFX` | r0 sound id (from `.sfx`) | |
| `FRAME` | – | r0 frame counter (wraps at 65536) |

### Colours (DawnBringer 16)

| # | colour | # | colour | # | colour | # | colour |
|---:|---|---:|---|---:|---|---:|---|
| 0 | black | 4 | brown | 8 | blue | 12 | peach |
| 1 | dark purple | 5 | dark green | 9 | orange | 13 | cyan |
| 2 | navy | 6 | red | 10 | light grey | 14 | yellow |
| 3 | dark grey | 7 | grey | 11 | green | 15 | white |

### Text

Built-in 3×5 font in a 4×6 cell: 32 characters per 128-pixel line, 21 lines. ASCII 32–95 only:
**uppercase letters, digits and punctuation**. Lowercase is drawn as uppercase; anything else (å, ä, ö, …)
is drawn blank. `\n` in a string starts a new line at the original x. `TEXT` stops after 256 characters.

### Sprites and tilemaps

A sprite is 8×8 pixels, 4 bits per pixel, 32 bytes (the assembler's `.sprite` builds them). Colour 0 is
transparent, so black-looking pixels must use a non-zero dark colour (1, 2 or 3) if they should be opaque.

A tilemap is `columns × rows` bytes, one tile number per cell, drawn with 8×8 tiles; tile `t` is the sprite at
`tiles + 32 × t`, and **tile 0 is never drawn**. The screen is 16×16 tiles.

### Sound

`SFX id` plays a `.sfx` definition; `SOUND` plays an ad-hoc tone. A new sound on a channel replaces whatever
the channel was playing. Sweep changes the frequency by that many Hz every frame (negative = falling).
Frequencies are integers in Hz; musical pitch table: A4 = 440, C5 = 523, E5 = 659, G5 = 784.
Music is played from code by issuing `SOUND` whenever a note starts (see §7.8).

---

## 6. Complete example: moving a sprite

```asm
; A sprite you can move with the D-pad; A plays a sound.
.title "MOVE"

SPEED = 1
MAX   = 128 - 8

.sfx BEEP, 0, 440, 6, 10

.var px                     ; player x (pixels)
.var py                     ; player y

init:
    LDI r0, 60
    ST [px], r0
    ST [py], r0
    RET

update:
    SYS BTN                 ; r0 = buttons held
    MOV r7, r0              ; keep a copy: syscalls only ever write r0
    LD r1, [px]
    LD r2, [py]

    MOV r0, r7
    AND r0, BTN_LEFT
    JZ @no_left
    SUB r1, SPEED
@no_left:
    MOV r0, r7
    AND r0, BTN_RIGHT
    JZ @no_right
    ADD r1, SPEED
@no_right:
    MOV r0, r7
    AND r0, BTN_UP
    JZ @no_up
    SUB r2, SPEED
@no_up:
    MOV r0, r7
    AND r0, BTN_DOWN
    JZ @no_down
    ADD r2, SPEED
@no_down:
    MOV r0, r1
    CALL clamp
    ST [px], r0
    MOV r0, r2
    CALL clamp
    ST [py], r0

    SYS BTNP                ; r0 = buttons pressed this frame
    AND r0, BTN_A
    JZ @draw
    LDI r0, BEEP
    SYS SFX
@draw:
    LDI r0, 1               ; dark purple background
    SYS CLS
    LDI r0, hero
    LD r1, [px]
    LD r2, [py]
    LDI r3, 0               ; no flip
    SYS SPR
    RET

; r0 = value -> r0 clamped to 0..MAX (signed)
clamp:
    CMP r0, 0
    JGE @not_low
    LDI r0, 0
@not_low:
    CMP r0, MAX
    JLE @done
    LDI r0, MAX
@done:
    RET

.data
hero: .sprite
    ..eeee..
    .eeeeee.
    ee0ee0ee
    eeeeeeee
    ee0000ee
    .ee00ee.
    ..eeee..
    ........
```

Note: `clamp` uses `@not_low`/`@done`, and `update` has its own `@...` labels — local labels keep routines
independent.

---

## 7. Idioms

### 7.1 Variables, arrays and structs

```
.var score                  ; one word
.var flags, 1               ; one byte (use LDB/STB)
.var grid, 16 * 15          ; byte array
.var enemies, 8 * EN_SIZE   ; array of structs

EN_X    = 0                 ; struct field offsets
EN_Y    = 2
EN_TYPE = 4
EN_SIZE = 6

    ; enemies[i].y += 1, with i in r1
    MOV r2, r1
    MUL r2, EN_SIZE
    LD r3, [r2 + enemies + EN_Y]
    ADD r3, 1
    ST [r2 + enemies + EN_Y], r3

    ; word array: index * 2
    MOV r2, r1
    SHL r2, 1
    LD r3, [r2 + word_table]
```

### 7.2 Loops

```
    LDI r4, 0               ; r4 survives syscalls
@loop:
    ; ... body using r4 ...
    ADD r4, 1
    CMP r4, COUNT
    JLT @loop
```

Counting down saves the `CMP`: `SUB r4, 1` sets Z, so `JNZ @loop` loops while r4 ≠ 0.

### 7.3 Jump tables and state machines

```
    LD r1, [state]
    SHL r1, 1
    LD r1, [r1 + handlers]
    CALL r1
    ...
.data
handlers: .word on_title, on_play, on_game_over
```

A state machine with a word in RAM plus a jump table scales much better than chains of `CMP`/`JEQ`.

### 7.4 Tilemaps where tile 0 is "empty"

```
tiles = tile_data - 32      ; tile 1 is the first real tile
tile_data:
.sprite                     ; tile 1
    ...
```

### 7.5 Sub-pixel movement (fixed point)

Positions with 4 fractional bits (1/16 pixel) give smooth, slow or angled movement with integers only:

```
FIX = 4
.var bx                     ; x * 16
.var vx                     ; pixels/frame * 16 (signed), e.g. 22 = 1.375 px/frame

    LD r1, [bx]
    LD r2, [vx]
    ADD r1, r2
    ST [bx], r1
    ; for drawing: pixel x = bx >> 4, signed
    SAR r1, FIX
```

Range: ±2047 pixels at 4 fractional bits — plenty for a 128-pixel screen. Always use `SAR`, not `SHR`, on
signed values.

### 7.6 Timers and animation

Count frames in RAM (`timer += 1; if timer >= 30 …`), or derive animation from the global frame counter:

```
    SYS FRAME
    SHR r0, 3               ; changes every 8 frames
    AND r0, 1               ; 0 or 1: two-frame animation
    SHL r0, 5               ; * 32 bytes per sprite
    ADD r0, walk_frames     ; r0 = address of the current frame
```

### 7.7 Collisions

- **Rectangles:** `SYS OVERLAP` with both boxes in r0–r7. It needs all eight registers, so load them last.
- **Against a tile grid:** convert pixel → cell with `SHR 3` (÷ 8), then `LDB` from the map:
  `index = (y >> 3) * COLUMNS + (x >> 3)`; tile ≠ 0 means solid. Check the corners of the moving box.
- **Line of sight on a grid:** step cell by cell in the facing direction until a wall; a handful of `LDB`s.

### 7.8 Music

Store notes as data and let a small player in `update` issue `SOUND` when a note starts:

```
.data
tune:                       ; Hz, frames; 0,0 = loop
    .word 523, 12, 659, 12, 784, 24, 0, 0
```

Keep a note pointer and a countdown in RAM; when the countdown reaches 0, load the next pair and
`SYS SOUND` with channel 0 or 1. Use channel 2 (noise) for percussion. Sound effects on the same channel
interrupt the music; give effects their own channel where possible.

### 7.9 Randomness

`SYS RND` with r0 = n gives 0 … n−1 from the host-seeded generator. The seed comes from the host (tests
fix it), so runs are reproducible. Never try to get randomness any other way — there is none (SPEC L7).

---

## 8. Complete example: tables, tilemap, text, numbers, jump table

```asm
; Tour of tables, tilemaps, text, numbers, a jump table and a frame timer.
.title "TOUR"

ST_TITLE   = 0
ST_MAP     = 1
ST_COUNTER = 2
NUM_STATES = 3

.var state
.var timer
.var counter

init:
    LDI r0, ST_TITLE
    ST [state], r0
    RET

update:
    ; every 120 frames (2 s) advance to the next state, wrapping after the last one
    LD r0, [timer]
    ADD r0, 1
    ST [timer], r0
    CMP r0, 120
    JLT @dispatch
    LDI r0, 0
    ST [timer], r0
    LD r0, [state]
    ADD r0, 1
    CMP r0, NUM_STATES
    JLT @store
    LDI r0, 0
@store:
    ST [state], r0

@dispatch:
    LDI r0, 0
    SYS CLS
    LD r1, [state]
    SHL r1, 1               ; word table: index * 2
    LD r1, [r1 + handlers]
    CALL r1                 ; indirect call through the table
    RET

show_title:
    LDI r0, s_title
    LDI r1, 30
    LDI r2, 50
    LDI r3, 15
    SYS TEXT
    RET

show_map:
    LDI r0, level
    LDI r1, tiles
    LDI r2, LEVEL_W
    LDI r3, LEVEL_H
    LDI r4, 32
    LDI r5, 40
    SYS MAP
    RET

show_count:
    LD r0, [counter]
    ADD r0, 1
    ST [counter], r0
    LDI r1, 56
    LDI r2, 60
    LDI r3, 14
    SYS NUM                 ; draws r0 as an unsigned decimal
    RET

.data
handlers: .word show_title, show_map, show_count
s_title:  .string "TOUR OF THE VM\n(TEXT, MAP, NUM)"

LEVEL_W = 8
LEVEL_H = 4
level:
    .byte 1, 1, 1, 1, 1, 1, 1, 1
    .byte 1, 0, 0, 2, 0, 0, 0, 1
    .byte 1, 0, 0, 0, 0, 2, 0, 1
    .byte 1, 1, 1, 1, 1, 1, 1, 1

tiles = tile_data - 32      ; tile 0 is never drawn, so the table can start one tile early
tile_data:
.sprite                     ; 1: wall
    77777777
    7aaaaaa7
    7a7777a7
    7a7777a7
    7a7777a7
    7a7777a7
    7aaaaaa7
    77777777
.sprite                     ; 2: coin
    ........
    ..9999..
    .99ee99.
    .9e99e9.
    .9e99e9.
    .99ee99.
    ..9999..
    ........
```

---

## 8b. Complete example: macros

```asm
; Macros keep repetitive code short. Two sprites bounce inside different boxes.
.title "MACROS"

.macro CLAMP reg, lo, hi
    CMP reg, lo
    JGE @@not_low
    LDI reg, lo
@@not_low:
    CMP reg, hi
    JLE @@done
    LDI reg, hi
@@done:
.endm

; x += dx; bounce between lo and hi by flipping dx
.macro BOUNCE x, dx, lo, hi
    LD r1, [x]
    LD r2, [dx]
    ADD r1, r2
    CMP r1, lo
    JLE @@flip
    CMP r1, hi
    JLT @@store
@@flip:
    NEG r2
    ST [dx], r2
@@store:
    CLAMP r1, lo, hi
    ST [x], r1
.endm

.var ax
.var adx
.var bx
.var bdx

init:
    LDI r0, 1
    ST [adx], r0
    LDI r0, -2
    ST [bdx], r0
    LDI r0, 40
    ST [ax], r0
    ST [bx], r0
    RET

update:
    BOUNCE ax, adx, 0, 60
    BOUNCE bx, bdx, 64, 120
    LDI r0, 0
    SYS CLS
    LDI r0, dot
    LD r1, [ax]
    LDI r2, 40
    LDI r3, 0
    SYS SPR
    LD r1, [bx]
    LDI r2, 80
    SYS SPR                 ; r0 and r3 still hold the sprite and flags
    RET

.data
dot: .sprite
    ..eeee..
    .eeeeee.
    eeeeeeee
    eeeeeeee
    eeeeeeee
    eeeeeeee
    .eeeeee.
    ..eeee..
```

---

## 9. Traps and limits

1. **Registers do not survive between frames.** Keep state in `.var`s.
2. **Storing into `.data` does nothing** (ROM is read-only, writes are ignored silently).
3. **`[label + r1]` is a syntax error** — write `[r1 + label]`.
4. **Signed vs unsigned compares.** `CMP r0, 0` followed by `JLT` is "negative?"; `JB` would never be taken.
5. **`SHR` on a negative number** turns it into a huge positive one. Use `SAR` for signed values.
6. **`MUL` keeps only the low 16 bits**; `DIV` and `MOD` are signed.
7. **`OVERLAP` reads all of r0–r7** — load them right before the call.
8. **Colour 0 in a sprite is transparent.** Use colour 1–3 for dark but opaque pixels.
9. **Tile 0 in a map is never drawn.**
10. **Uppercase ASCII only** in text.
11. **ROM limit 32 KB** (code + data + sfx, uncompressed). Every instruction is 4 bytes, so 1000
    instructions = 4 KB. Put repetitive behaviour in data tables rather than code.
12. **RAM:** `.var` grows up from 0x8000, the stack grows down from 0xFFFF. Deep recursion into your variables
    is possible in theory; in practice keep call depth small.
13. **Cycle budget 50 000 per frame.** Per-pixel loops over the whole screen (16 384 pixels × several
    instructions) do not fit; use `RECTFILL`, `MAP` and `SPR`, which cost 8 cycles each no matter how big.
14. **Illegal opcode / unknown syscall stops the VM for good.** Usually this means execution ran into data:
    a routine without `RET`, or a `JMP` to a data label.
15. **The screen is not cleared for you.** Call `SYS CLS` (or redraw everything) each frame.

---

## 10. Tooling and workflow

| Task | Command |
|---|---|
| Assemble a game directory (`<g>.asm`, plus files it includes) | `npm run qrc -- build games/<g>` — also writes `<g>.sym` (symbols) and `<g>.lst` (listing: address, bytes, file:line, source) |
| Watch variables per frame | `npm run qrc -- run games/<g>/<g>.qrc --frames 300 --inputs replay.json --ram score,lives` |
| Trace instructions with registers and flags | `npm run qrc -- run games/<g>/<g>.qrc --frames 60 --trace 200 --trace-frame 60` (disassembled, with labels) |
| Run N frames headless, save a screenshot | `npm run qrc -- run games/<g>/<g>.qrc --frames 120 --dump-frame f.png --scale 4 [--seed N]` |
| Per-frame state hashes for an input script | `npm run qrc -- replay games/<g>/<g>.qrc inputs.json [--frames N]` |
| Inspect a cartridge (sizes, sections, QR frames needed) | `npm run qrc -- inspect games/<g>/<g>.qrc` |
| Make the animated QR GIF / decode it back | `npm run qrc -- encode <g>.qrc --out <g>.gif` / `qrc decode <g>.gif --out <g>.qrc` |
| Regenerate committed references for every game | `npm run refs:games` |
| Test every game that has a `replay.json` | `npm run test:games` |
| Play it in the browser | `npm run dev -w apps/web`, then *Load a .qrc file* |

**Input scripts** (`replay.json`): `{"seed": 7, "frames": 1200, "inputs": [[20, 0], [1, 16], ...]}` —
run-length pairs `[frames, buttons]`, or a plain array with one button mask per frame.

**A game directory** under test looks like this:

```
games/<g>/<g>.asm            main source (may .include other .asm files in the same directory)
games/<g>/<g>.qrc            built cartridge            (npm run refs:games)
games/<g>/frame1.png         frame 1, seed 1, no input  (npm run refs:games)
games/<g>/reference.json     frame-1 hashes and size    (npm run refs:games)
games/<g>/replay.json        scripted inputs            (written by hand or by a bot script)
games/<g>/hashes.txt         state hash after every replay frame (npm run refs:games)
games/<g>/checks.ts          what the replay must demonstrate, via RAM symbols
games/<g>/record-replay.ts   optional bot that records replay.json
```

**Debugging** — there is no interactive debugger yet. What works:

- `qrc run --dump-frame` at the frame you care about; `--ram` to watch variables; `--trace` to single-step a
  frame with registers, flags and disassembly (labels from the `.sym` file).
- A small `npx tsx` script: `buildCartridge()` returns the symbol table, so you can read your variables by
  name each frame (`vm.read16(asm.symbols.get('score')!)`), and check `vm.fault`, `vm.overruns` and
  `vm.cyclesLastFrame`. `games/breakout/record-replay.ts` is a template.
- `checks.ts` for assertions over a whole replay (see `games/pong/checks.ts`).

Determinism makes bugs reproducible: record the inputs that trigger it and replay them.

---

## 11. Bytecode reference (for tools)

Every instruction is 4 bytes:

```
byte 0   opcode
byte 1   mode:  bit 7 = I   bits 5–3 = b (source/base register)   bits 2–0 = a (destination register)
byte 2-3 imm16, little-endian
```

- ALU ops, `MOV`: source = `imm` if I else `r[b]`.
- `LD`/`LDB`/`ST`/`STB`: address = `imm` if I (absolute) else `(r[b] + imm) & 0xFFFF`.
- `JMP`/`CALL`: target = `imm` if I else `r[b]`. Conditional jumps: target = `imm`.

| op | mnemonic | op | mnemonic | op | mnemonic | op | mnemonic |
|---|---|---|---|---|---|---|---|
| 00 | NOP | 09 | DIV | 12 | NEG | 1B | JAE |
| 01 | MOV | 0A | MOD | 13 | JMP | 1C | CALL |
| 02 | LD | 0B | AND | 14 | JZ | 1D | RET |
| 03 | LDB | 0C | OR | 15 | JNZ | 1E | PUSH |
| 04 | ST | 0D | XOR | 16 | JLT | 1F | POP |
| 05 | STB | 0E | SHL | 17 | JGE | 20 | SYS |
| 06 | ADD | 0F | SHR | 18 | JGT | | |
| 07 | SUB | 10 | SAR | 19 | JLE | | |
| 08 | MUL | 11 | CMP | 1A | JB | | |

Syscall numbers: CLS 0, PSET 1, PGET 2, RECT 3, RECTFILL 4, LINE 5, SPR 6, MAP 7, TEXT 8, NUM 9, BTN 10,
BTNP 11, OVERLAP 12, RND 13, SOUND 14, SFX 15, FRAME 16.

Example: `ADD r3, 5` = `06 83 05 00`; `LD r1, [r2 + 6]` = `02 11 06 00`; `SYS TEXT` = `20 80 08 00`.

Sound section: `u8 count`, then per effect 8 bytes: `channel, volume, frames, 0, freq (u16), sweep (i16)`.

The cartridge that carries code, data and sounds is described in `packages/cartridge/FORMAT.md`; its ISA
version field must be 1 for this VM.

---

## 12. Changing the machine

The instruction set, syscalls, memory map and cycle budget are shared by the VM (`packages/vm/src/isa.ts`)
and the assembler (`packages/asm/src/isa.ts`, a copy guarded by `test/isa-sync.test.ts`). Any change to them
is an **ISA change**: bump `ISA_VERSION`, keep old cartridges' behaviour in mind, update `VM.md`, this guide
and the tests, and record the decision in `DECISIONS.md`. SPEC L2 still applies: new syscalls must be
generic (useful to any game), never game-specific.
