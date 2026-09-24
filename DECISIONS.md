# DECISIONS.md

Append-only log of choices between real alternatives. Newest at the bottom.
Locked decisions live in `SPEC.md` §2 and are not repeated here.

Format:

```
## D-NNN — <short title>
Date: YYYY-MM-DD · Milestone: Mn
Decision: <what was chosen>
Alternatives: <what else was considered>
Why: <reasoning or measurement, link to bench/ file if relevant>
Revisit if: <condition that would change this>
```

---

## D-000 — Pre-agreed starting points (from design discussion)
Date: 2026-09-24 · Milestone: —
Decision: Start QR defaults at version 12 / ECC M / 150 ms per frame; implement both pure LT and
systematic LT and choose the default by benchmark; per-packet CRC is kept because a single corrupted
packet would otherwise propagate through XOR into many blocks.
Alternatives: pure LT only; systematic only; no per-packet CRC (rely on QR Reed–Solomon + final hash).
Why: small block counts make LT overhead uncertain, so measure instead of assume; CRC costs 2–4 bytes
per frame and lets the decoder isolate bad packets.
Revisit if: benchmarks show one mode dominates, or CRC never triggers in layer-3 tests.

## D-001 — Toolchain and monorepo wiring
Date: 2026-09-24 · Milestone: M0
Decision: TypeScript 6.0 (typescript-eslint 8 supports < 6.1; TS 7 not yet supported by it), Vitest 5
projects (one per package, `npm test -w packages/x` runs its project from the root config), ESLint 10 flat
config, Vite 8, tsx for running TS CLIs. Packages export `src/index.ts` directly (no build step for
libraries). Two typecheck passes: `tsconfig.pure.json` checks cartridge/transport/vm/asm with only ES libs
plus a tiny `types/web-globals.d.ts` (TextEncoder/Decoder, (De)CompressionStream) so DOM or Node usage fails
to compile; `tsconfig.json` checks everything with DOM + Node types.
Dependency rules (SPEC §3) are enforced twice: ESLint `no-restricted-imports` and `test/architecture.test.ts`.
Alternatives: project references with emitted builds; TS 7 native compiler.
Why: least moving parts, no build artefacts to keep in sync.
Revisit if: package consumers outside this repo need compiled JS.

## D-002 — Cartridge layout, hashing and compression implementation
Date: 2026-09-24 · Milestone: M1
Decision: 52-byte fixed header + title, body = section table (code/rodata/sound, all required).
SHA-256 is a small pure-TS implementation (sync, works without a secure context) duplicated verbatim in
`cartridge` and `transport` (SPEC §3 forbids either importing the other; a test asserts the copies are
identical). Compression uses `(De)CompressionStream('deflate-raw')` in both Node and browser, so the
package has no Node imports; `auto` mode keeps whichever of raw/deflated is smaller.
Alternatives: `crypto.subtle` (async, needs secure context), a shared `hash` package (not in SPEC layout),
Node `zlib` for compression (would make the package Node-only).
Why: keeps pure packages runnable anywhere with zero dependencies.
Revisit if: hashing speed matters (it does not at ≤ 64 KB).
