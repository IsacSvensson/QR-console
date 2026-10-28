; Rays four pixels wide (32 rays): one word of the buffer per row (SPIKE.md §3.5).
COLW = 4
NRAYS = 32
RAYS_PER_TC = 2
CAM = cam_32
COLB = colb_32
COLW_SHIFT = 2

col_draw:
@e:
    LDB r4, [r2]
    LDB r6, [r4 + scratch]
    MUL r6, 257                 ; the colour in both bytes
    LDB r5, [r2 + 1]
    SHL r5, 2
    ADD r1, r5
    LDI r7, duff_end
    SUB r7, r5
    CALL r7
    ADD r2, 2
    SUB r3, 1
    JNZ @e
    RET

.include "duff4.gen.asm"
