# QR Console VM — ISA version 1

A tiny deterministic 16-bit machine for small games (SPEC L2–L7). The VM core (`src/vm.ts`) has no
DOM dependencies: it produces a framebuffer and a list of audio commands per frame; canvas and WebAudio
are backends in `apps/web`.

## Machine

| Item | Value |
|---|---|
| Word size | 16 bit, little-endian in memory, unaligned access allowed |
| Registers | `r0`–`r7` (general), `PC`, `SP`, flags `Z N C V` |
| Address space | 64 KB, byte addressed, addresses wrap at 0x10000 |
| Display | 128×128, 4-bit palette indices (fixed DawnBringer-16 palette, `src/palette.ts`) |
| Frame rate | fixed 60 Hz; one call of the cartridge's `update` entry per frame |
| Cycle budget | 50 000 cycles per entry call; 1 per instruction, 8 per `SYS` |
| Arithmetic | integer only; no floats, no clock; RNG only via `SYS RND` (seeded by the host) |

## Memory map

| Range | Content |
|---|---|
| `0x0000–0x7FFF` | **ROM** (read-only; writes are silently ignored). Cartridge sections are loaded contiguously: code at 0, then rodata, then sound. |
| `0x0000–0x0003` | vector table (first 4 bytes of code): `init` address, `update` address (`0xFFFF` = none) |
| `0x8000–0xFFFF` | **RAM**, zeroed at start. Game variables grow up from `0x8000` (`.var`); the stack grows down from `0xFFFF`. |

The framebuffer is not memory-mapped; it is written by drawing syscalls only and persists between
frames (games usually `SYS CLS` first).

## Frame model and calling convention

- Frame 0: `init` (if present) is called once, then `update`. Every later frame: `update`.
- Each entry call starts with **all registers = 0 and SP = 0** (empty stack). Game state therefore
  lives in RAM, never in registers between frames.
- `RET` with an empty stack returns from the entry point and ends the call.
- If the call uses up its cycle budget, execution stops at that point, the frame ends, and the next
  frame starts the entry point afresh. `overruns` counts this. Deterministic.
- An illegal opcode or unknown syscall sets `fault` and the VM stops executing (later frames are no-ops).
- `CALL` pushes the return address (`SP -= 2; [SP] = PC`), `RET` pops it. `PUSH`/`POP` likewise.
- Convention for game subroutines: arguments and results in `r0…`, callee may clobber anything unless
  documented; save what you need with `PUSH`/`POP`.
- Syscalls take arguments in `r0…r7`, return a result in `r0` (if any) and **preserve all other registers**.

## Instruction encoding

Every instruction is 4 bytes: `op`, `mode`, `imm16` (little-endian).

```
mode: bit 7 = I | bits 5..3 = b (source/base register) | bits 2..0 = a (destination register)
```

- ALU ops and `MOV`: source = `imm` if `I` else `r[b]`.
- Memory ops: address = `imm` if `I` (absolute) else `(r[b] + imm) & 0xFFFF`.
- `JMP`/`CALL`: target = `imm` if `I` else `r[b]`. Conditional jumps: target = `imm`.

## Opcodes

| Op | Mnemonic | Effect | Flags |
|---:|---|---|---|
| 00 | `NOP` | – | – |
| 01 | `MOV a, src` (`LDI` alias) | `a = src` | – |
| 02 | `LD a, [addr]` | `a = mem16[addr]` | – |
| 03 | `LDB a, [addr]` | `a = mem8[addr]` (zero-extended) | – |
| 04 | `ST [addr], a` | `mem16[addr] = a` | – |
| 05 | `STB [addr], a` | `mem8[addr] = a & 0xFF` | – |
| 06 | `ADD a, src` | `a += src` | Z N C(carry) V |
| 07 | `SUB a, src` | `a -= src` | Z N C(borrow) V |
| 08 | `MUL a, src` | `a = low16(a * src)` | Z N, C=V=0 |
| 09 | `DIV a, src` | signed, truncating; `/0 → 0` | Z N, C=V=0 |
| 0A | `MOD a, src` | signed remainder (sign of dividend); `%0 → 0` | Z N, C=V=0 |
| 0B | `AND a, src` | | Z N, C=V=0 |
| 0C | `OR a, src` | | Z N, C=V=0 |
| 0D | `XOR a, src` | | Z N, C=V=0 |
| 0E | `SHL a, src` | shift left by `src & 15` | Z N, C=V=0 |
| 0F | `SHR a, src` | logical right | Z N, C=V=0 |
| 10 | `SAR a, src` | arithmetic right | Z N, C=V=0 |
| 11 | `CMP a, src` | flags of `a − src` | Z N C V |
| 12 | `NEG a` | `a = −a` | Z N, C=V=0 |
| 13 | `JMP target` | | – |
| 14 | `JZ` / `JEQ` | if Z | – |
| 15 | `JNZ` / `JNE` | if !Z | – |
| 16 | `JLT` | signed <: N≠V | – |
| 17 | `JGE` | signed ≥: N=V | – |
| 18 | `JGT` | signed >: !Z ∧ N=V | – |
| 19 | `JLE` | signed ≤: Z ∨ N≠V | – |
| 1A | `JB` | unsigned <: C | – |
| 1B | `JAE` | unsigned ≥: !C | – |
| 1C | `CALL target` | push PC; jump | – |
| 1D | `RET` | pop PC (empty stack: end entry) | – |
| 1E | `PUSH a` | | – |
| 1F | `POP a` | | – |
| 20 | `SYS n` | syscall `n` (= imm) | – |

## Syscalls

Coordinates and sizes are interpreted as **signed** 16-bit; drawing is clipped to the screen.

| # | Name | Arguments | Result |
|---:|---|---|---|
| 0 | `CLS` | r0 colour | |
| 1 | `PSET` | r0 x, r1 y, r2 colour | |
| 2 | `PGET` | r0 x, r1 y | r0 colour (0 off-screen) |
| 3 | `RECT` | r0 x, r1 y, r2 w, r3 h, r4 colour (outline) | |
| 4 | `RECTFILL` | r0 x, r1 y, r2 w, r3 h, r4 colour | |
| 5 | `LINE` | r0 x0, r1 y0, r2 x1, r3 y1, r4 colour | |
| 6 | `SPR` | r0 address, r1 x, r2 y, r3 flags (1 flip-x, 2 flip-y) | |
| 7 | `MAP` | r0 map address, r1 tiles address, r2 columns, r3 rows, r4 x, r5 y | |
| 8 | `TEXT` | r0 string address (0-terminated, `\n` = new line), r1 x, r2 y, r3 colour | r0 x after text |
| 9 | `NUM` | r0 value (unsigned decimal), r1 x, r2 y, r3 colour | r0 x after text |
| 10 | `BTN` | | r0 buttons held (bitmask) |
| 11 | `BTNP` | | r0 buttons newly pressed this frame |
| 12 | `OVERLAP` | r0..r3 = ax, ay, aw, ah; r4..r7 = bx, by, bw, bh | r0 = 1 if the rectangles intersect |
| 13 | `RND` | r0 n | r0 = random in `[0, n)`; n = 0 → 16 random bits |
| 14 | `SOUND` | r0 channel (0,1 square; 2 noise), r1 freq Hz, r2 duration (frames), r3 volume 0–15 | |
| 15 | `SFX` | r0 sound-definition id | |
| 16 | `FRAME` | | r0 = frame counter (low 16 bits) |

Buttons: `LEFT 1, RIGHT 2, UP 4, DOWN 8, A 16, B 32`.

**Sprites** are 8×8, 4 bits per pixel, 32 bytes, row-major, high nibble = left pixel; colour 0 is
transparent. **Tilemaps** are `columns × rows` bytes of tile indices; tile `t` is the sprite at
`tiles + 32·t`, tile 0 is empty (not drawn). **Text** uses the built-in 3×5 font in a 4×6 cell
(ASCII 32–95; lowercase is drawn as uppercase).

**RNG**: xorshift32 (`x ^= x<<13; x ^= x>>>17; x ^= x<<5`), state seeded by the host (`seed || 0x9E3779B9`).
`RND n` returns `state % n`.

## Sound

The sound section is `u8 count` followed by `count` 8-byte definitions:
`u8 channel, u8 volume, u8 duration (frames), u8 reserved, u16 freq (Hz), i16 sweep (Hz per frame)`.
`SFX id` and `SOUND` append an `AudioCommand {channel, freq, duration, volume, sweep}` to the frame's
list; the host's audio backend plays them (2 square channels + 1 noise channel, SPEC L5). A new command
on a channel replaces what that channel was playing.

## Determinism (L7)

Same cartridge + same seed + same per-frame button sequence ⇒ bit-identical RAM, RNG state, frame
counter and framebuffer after every frame. `VM.stateHash()` fingerprints exactly that
(SHA-256 over framebuffer ‖ RAM ‖ RNG state ‖ frame counter); `qrc replay` prints it per frame.

## Cartridge requirements

The VM accepts only cartridges with ISA version 1 (`VMError: unsupported ISA version …` otherwise),
ROM (code + rodata + sound) ≤ 32 KB and a code section of at least 4 bytes (vector table).
