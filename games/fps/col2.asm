; Rays two pixels wide (64 rays): one byte of the buffer per row (SPIKE.md §3.5).
COLW = 2
NRAYS = 64
RAYS_PER_TC = 4                 ; rays per 8-pixel tile column
CAM = cam_64
COLB = colb_64
COLW_SHIFT = 1

; draw the run list at r2 (r3 entries of texel, rows) from the row at r1 + 384, texels from scratch
col_draw:
@e:
    LDB r4, [r2]
    LDB r6, [r4 + scratch]
    LDB r5, [r2 + 1]
    SHL r5, 2
    ADD r1, r5
    LDI r7, duff_end
    SUB r7, r5
    CALL r7                     ; the last `rows` stores of the unrolled block
    ADD r2, 2
    SUB r3, 1
    JNZ @e
    RET

.include "duff2.gen.asm"
