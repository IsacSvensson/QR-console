; Build configuration: the ray width (col1/col2/col4.asm) and the rays cast per frame.
; The benchmark (tools/bench.ts) assembles other combinations by replacing this file.
.include "col2.asm"
RAY_CHUNK = 32
