# QR Console assembler

> Practical guide with examples, idioms and traps: `docs/PROGRAMMING.md`. This file is the terse reference.

`assemble(source)` turns one `.asm` file into the three cartridge sections; `buildCartridge(source)`
also serializes the cartridge. CLI: `npm run qrc -- build games/<name>`. Instruction set and syscalls:
`packages/vm/VM.md`.

## Lines

```
[label:] [instruction | directive] [; comment]
NAME = constant expression
```

- Mnemonics, directives and register names are case-insensitive; symbols are case-sensitive.
- `name:` defines a global label and opens a scope. `@name:` is a **local label**, visible only
  until the next global label (so every routine can have its own `@loop`).
- The entry points are the labels `update` (required, called every frame) and `init` (optional, called
  once before the first update). The assembler writes them into the 4-byte vector table at address 0.

## Operands

| Form | Example |
|---|---|
| register | `r0` … `r7` |
| constant expression | `42`, `0x2A`, `$2A`, `0b101010`, `'A'`, `SCREEN_W - 8`, `(1 << 4) \| 3` |
| memory | `[r1]`, `[r1 + 4]`, `[r1 - 2]`, `[label]`, `[label + 2]` |

Expressions: integers, symbols, parentheses, unary `- + ~`, and `* / %`, `+ -`, `<< >>`, `&`, `^`, `|`
(C precedence). Division truncates. Nothing else: this is constant arithmetic only (SPEC L6).
Values must fit 16 bits (−32768 … 65535).

`LDI r, expr` is an alias for `MOV r, expr`. `JEQ`/`JNE` are aliases for `JZ`/`JNZ`.
`ST`/`STB` take the address first: `ST [addr], r`.

## Directives

| Directive | Meaning |
|---|---|
| `.title "NAME"` | cartridge title (≤ 32 bytes) |
| `.code` / `.data` | switch section (code is default; `.data` = read-only data, placed after code) |
| `.xdata` | switch to the extended-data section (ISA 2): outside the address space, labels are far addresses `0x10000 + offset` |
| `.pack` … `.endpack` | the data between them (`.byte .word .string .fill .sprite` only, no labels, only values known at that point) is stored packed in the format of `SYS UNPACK` |
| `NAME = expr` or `.const NAME, expr` | constant (may reference labels, also later ones) |
| `.var NAME [, size]` | allocate `size` bytes of RAM (default 2) starting at `0x8000` |
| `.byte e, e, "str", …` | bytes (strings are not terminated) |
| `.word e, …` | 16-bit little-endian words (labels allowed: jump tables) |
| `.string "text"` | zero-terminated string; escapes `\n \t \0 \\ \"` |
| `.fill count [, value]` | `count` bytes |
| `.sprite` | followed by 8 rows of 8 characters, `.` = transparent (0), `0`–`F` = palette index |
| `.sfx NAME, channel, freq, duration, volume [, sweep]` | sound definition; `NAME` = its id for `SYS SFX` |

## ISA version

The assembler writes the **lowest ISA the program needs** into the cartridge: 2 if it has an xdata section or
uses a syscall introduced in ISA 2 (`COPY`, `FILL`, `UNPACK`), otherwise 1. A program without them builds to
exactly the same cartridge as before ISA 2 existed.

## Built-in constants

Syscall names (`CLS`, `PSET`, …, `FRAME`, and in ISA 2 `COPY`, `FILL`, `UNPACK`), buttons (`BTN_LEFT`, `BTN_RIGHT`, `BTN_UP`, `BTN_DOWN`,
`BTN_A`, `BTN_B`) and `RAM_START`. They cannot be redefined.

## Errors

Every error is an `AsmError` with `file:line: message` (unknown instruction, undefined or duplicate
symbol, bad register or memory operand, value out of range, circular constant, missing `update`, …).
