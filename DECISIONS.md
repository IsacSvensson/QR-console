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
