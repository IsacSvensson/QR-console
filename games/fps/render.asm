; The raycaster (SPIKE.md §3). The view (128x96) is drawn into a RAM buffer laid out as 8x8 tiles in column
; order, so that one pixel column is a run of bytes 4 apart; one MAP call puts the whole buffer on screen.
; An image is rendered RAY_CHUNK rays per frame: the first chunk takes the camera, the last one presents it.

.var rray                       ; next ray to cast
.var rend                       ; end of this frame's chunk
.var rc                         ; current ray
.var rc2                        ; current ray * 2
.var rdx                        ; ray direction (8.8, not normalised)
.var rdy
.var sdx                        ; DDA: distance to the next x side
.var ddx                        ; DDA: distance between x sides
.var stx                        ; DDA: map step in x (+-1)
.var hcode                      ; map code of the wall hit
; per ray, for the sprites and for the test oracle
.var zb, NRAYS * 2              ; perpendicular distance of the wall (8.8, clamped to PERP_MIN)
.var rh, NRAYS * 2              ; wall height in pixels
.var rcell, NRAYS               ; map cell hit
.var rtx, NRAYS                 ; texture column (0..15) | side << 4
.var scratch, 16                ; the texture column of the current ray

render_step:
    LD r0, [rray]
    CMP r0, 0
    JNZ @go
    CALL snapshot
    LD r0, [rray]
@go:
    MOV r1, r0
    ADD r1, RAY_CHUNK
    ST [rend], r1
@ray:
    ST [rc], r0
    CALL cast
    LD r0, [rc]
    ADD r0, 1
    LD r1, [rend]
    CMP r0, r1
    JLT @ray
    CMP r0, NRAYS
    JLT @store
    LDI r0, 0
    ST [rray], r0
    JMP present
@store:
    ST [rray], r0
    RET

; take the camera for a new image
snapshot:
    LD r0, [px]
    ST [cx], r0
    MOV r1, r0
    AND r1, 255
    ST [cfx], r1
    SHL r1, 8
    ST [cfx16], r1
    LD r2, [py]
    ST [cy], r2
    MOV r1, r2
    AND r1, 255
    ST [cfy], r1
    SHL r1, 8
    ST [cfy16], r1
    SHR r2, 8
    SHL r2, 4
    SHR r0, 8
    ADD r2, r0
    ST [cidx], r2
    LD r1, [ang]
    ST [cang], r1
    SHL r1, 1
    LD r2, [r1 + sin_t]             ; sin
    LD r3, [r1 + sin_t + 512]       ; cos
    ST [cdx], r3
    ST [cdy], r2
    MOV r4, r2                      ; plane = PLANE/256 * (-sin, cos), rounded; as v - v*(256-PLANE)/256,
    MUL r4, 256 - PLANE             ; because v * PLANE does not fit 16 bits
    ADD r4, 128
    SAR r4, 8
    SUB r4, r2
    ST [cplx], r4
    MOV r4, r3
    MUL r4, 256 - PLANE
    ADD r4, 128
    SAR r4, 8
    NEG r4
    ADD r4, r3
    ST [cply], r4
    RET

; cast ray r0 (= [rc]) and draw its wall column
cast:
    MOV r1, r0
    AND r1, RAYS_PER_TC - 1
    JNZ @nofill
    MOV r1, r0                      ; first ray of a tile column: ceiling and floor for the whole column
    SHL r1, 1
    LD r0, [r1 + COLB]
    LDI r1, C_CEIL * 17
    LDI r2, VIEW_H * 2
    SYS FILL
    ADD r0, VIEW_H * 2
    LDI r1, C_FLOOR * 17
    SYS FILL
    LD r0, [rc]
@nofill:
    SHL r0, 1
    ST [rc2], r0
    LD r1, [r0 + CAM]               ; camera-plane position of the ray (1.7)
    ; ---- x: direction, step, distances ----
    LD r2, [cplx]
    MUL r2, r1
    ADD r2, 64                      ; rounded
    SAR r2, 7
    LD r3, [cdx]
    ADD r2, r3
    ST [rdx], r2
    LD r5, [cfx]
    CMP r2, 0
    JLT @xneg
    LDI r6, 1
    LDI r4, 256
    SUB r4, r5
    JMP @xd
@xneg:
    NEG r2
    LDI r6, -1
    MOV r4, r5
@xd:
    ST [stx], r6
    CMP r2, 2
    JB @xtiny
    SHL r2, 1
    LD r2, [r2 + recip_t]
    ST [ddx], r2
    MOV r5, r2                      ; side distance = fraction * delta >> 8, as two 8x8 products
    SHR r5, 8
    MUL r5, r4
    AND r2, 255
    MUL r2, r4
    SHR r2, 8
    ADD r5, r2
    ST [sdx], r5
    JMP @y
@xtiny:                             ; |rdx| <= 1/256: the first x side is fraction * 256 / |rdx| away (or never)
    CALL tiny_side
    ST [sdx], r5
    LDI r2, 32767
    ST [ddx], r2
@y:
    ; ---- y ----
    LD r2, [cply]
    MUL r2, r1
    ADD r2, 64
    SAR r2, 7
    LD r3, [cdy]
    ADD r2, r3
    ST [rdy], r2
    LD r5, [cfy]
    CMP r2, 0
    JLT @yneg
    LDI r1, 16
    LDI r4, 256
    SUB r4, r5
    JMP @yd
@yneg:
    NEG r2
    LDI r1, -16
    MOV r4, r5
@yd:
    CMP r2, 2
    JB @ytiny
    SHL r2, 1
    LD r2, [r2 + recip_t]
    MOV r7, r2
    MOV r5, r2
    SHR r5, 8
    MUL r5, r4
    AND r2, 255
    MUL r2, r4
    SHR r2, 8
    ADD r5, r2
    MOV r3, r5                      ; r3 = side distance y
    MOV r5, r7                      ; r5 = delta y
    JMP @dda
@ytiny:
    CALL tiny_side
    MOV r3, r5
    LDI r5, 32767
@dda:
    LD r2, [sdx]                    ; r2 = side distance x
    LD r4, [ddx]                    ; r4 = delta x
    LD r6, [stx]                    ; r6 = step x, r1 = step y
    LD r0, [cidx]                   ; r0 = map cell
    ; ---- DDA ----
@loop:
    CMP r2, r3
    JAE @sy
    ADD r0, r6
    LDB r7, [r0 + map]
    ADD r2, r4
    CMP r7, 0
    JZ @loop
    CMP r7, CELL_DOOR_V
    JEQ @doorx
@wallx:
    ST [hcode], r7
    SUB r2, r4                      ; perpendicular distance
    MOV r7, r2
    LD r1, [rdy]
    MUL r1, r7
    LD r2, [cfy16]
    ADD r1, r2                      ; fraction of the wall's y coordinate, 0..65535
    LDI r2, 0
    JMP @common
@sy:
    ADD r0, r1
    LDB r7, [r0 + map]
    ADD r3, r5
    CMP r7, 0
    JZ @loop
    CMP r7, CELL_DOOR_H
    JEQ @doory
@wally:
    ST [hcode], r7
    SUB r3, r5
    MOV r7, r3
    LD r1, [rdx]
    MUL r1, r7
    LD r2, [cfx16]
    ADD r1, r2
    LDI r2, 1
    JMP @common
@doorx:                             ; the door plane is in the middle of the cell
    MOV r7, r4
    SHR r7, 1
    NEG r7
    ADD r7, r2
    CMP r7, r3
    JAE @loop                       ; the ray leaves the cell through a y side first
    PUSH r1
    PUSH r4
    LD r1, [rdy]
    MUL r1, r7
    LD r4, [cfy16]
    ADD r1, r4
    LDB r4, [r0 + dopen]
    SHL r4, 8
    CMP r1, r4
    JB @xpass                       ; through the open part
    SUB r1, r4                      ; the door slides towards -y: its texture moves with it
    POP r4
    POP r4
    LDI r4, CELL_DOOR_V
    ST [hcode], r4
    LDI r2, 0
    JMP @common
@xpass:
    POP r4
    POP r1
    JMP @loop
@doory:
    MOV r7, r5
    SHR r7, 1
    NEG r7
    ADD r7, r3
    CMP r7, r2
    JAE @loop
    PUSH r1
    PUSH r4
    LD r1, [rdx]
    MUL r1, r7
    LD r4, [cfx16]
    ADD r1, r4
    LDB r4, [r0 + dopen]
    SHL r4, 8
    CMP r1, r4
    JB @ypass
    SUB r1, r4
    POP r4
    POP r4
    LDI r4, CELL_DOOR_H
    ST [hcode], r4
    LDI r2, 1
    JMP @common
@ypass:
    POP r4
    POP r1
    JMP @loop
    ; ---- r0 = cell, r7 = perpendicular distance, r1 = wall fraction (16 bits), r2 = side ----
@common:
    LD r6, [rc]
    STB [r6 + rcell], r0
    MOV r3, r1
    SHR r3, 12                      ; texture column u
    MOV r4, r2
    SHL r4, 4
    OR r4, r3
    STB [r6 + rtx], r4
    LD r4, [hcode]
    SHL r4, 2
    SHL r2, 1
    ADD r4, r2
    LD r4, [r4 + tex_table]
    SHL r3, 4
    ADD r4, r3                      ; address of the texture column
    CMP r7, PERP_MIN
    JGE @near
    LDI r7, PERP_MIN
@near:
    LD r6, [rc2]
    ST [r6 + zb], r7
    LDI r5, FOCAL256
    DIV r5, r7                      ; wall height h
    ST [r6 + rh], r5
    LDI r0, scratch
    LDI r1, 0
    MOV r2, r4
    LDI r3, 16
    SYS COPY
    SHL r5, 1
    LD r2, [r5 + run_idx]           ; run list of height h: y0, count, (texel, rows) ...
    LDB r1, [r2]
    LDB r3, [r2 + 1]
    ADD r2, 2
    SHL r1, 2
    LD r4, [r6 + COLB]
    ADD r1, r4
    SUB r1, 384                     ; col_draw keeps r1 = (address of the next row) - 384
    JMP col_draw

; r2 = |ray component| (0 or 1), r4 = fraction to the first side (1..256) -> r5 = distance to it, saturated
tiny_side:
    LDI r5, 0xFFFF
    CMP r2, 0
    JEQ @done
    CMP r4, 256
    JEQ @done
    MOV r5, r4
    SHL r5, 8
@done:
    RET

; put the finished image on screen, then the enemy, the gun and the status bar
present:
    LDI r0, view_map
    LDI r1, buf - 32
    LDI r2, 16
    LDI r3, VIEW_H / 8
    LDI r4, 0
    LDI r5, 0
    SYS MAP
    CALL enemy_draw
    CALL gun_draw
    CALL hud_draw
    LD r0, [images]
    ADD r0, 1
    ST [images], r0
    LD r0, [images_sec]
    ADD r0, 1
    ST [images_sec], r0
    RET

; r0 = a (8.8, |a| < 128 cells), r1 = b (8.8, |b| <= 256) -> r0 = a * b >> 8 (r1, r2 clobbered)
fmul:
    SAR r1, 1
    MOV r2, r0
    SAR r2, 8
    AND r0, 255
    MUL r0, r1
    SAR r0, 7
    MUL r2, r1
    SHL r2, 1
    ADD r0, r2
    RET
