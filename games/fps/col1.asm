; Rays one pixel wide (128 rays): half a byte per row, read-modify-write (SPIKE.md §3.5).
COLW = 1
NRAYS = 128
RAYS_PER_TC = 8
CAM = cam_128
COLB = colb_128
COLW_SHIFT = 0

col_draw:
    LD r5, [rc]                 ; even ray = left pixel = high nibble
    AND r5, 1
    LDI r0, 0xF0
    LDI r5, 0x0F
    JZ @e
    LDI r0, 0x0F
    LDI r5, 0xF0
@e:
    LDB r4, [r2]
    LDB r6, [r4 + scratch]
    AND r6, r0
    LDB r4, [r2 + 1]
    SHL r4, 4                   ; 16 bytes of code per row
    LDI r7, duff_end
    SUB r7, r4
    SHR r4, 2
    ADD r1, r4
    CALL r7
    ADD r2, 2
    SUB r3, 1
    JNZ @e
    RET

.include "duff1.gen.asm"
