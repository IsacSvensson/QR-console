; BLACKBOX 3D — the raycaster (DESIGN.md §3.2-3.4): the FPS spike's (games/fps/render.asm, SPIKE.md §3) on the
; room's render map, with low cells (desks, terminals, chargers, the cable) drawn in a second pass per ray.
; The view (128x88) is drawn into a RAM buffer of 8x8 tiles in column order and shown with one MAP.

.code

.var rray                       ; next ray to cast
.var rend
.var rc
.var rc2
.var rdx
.var rdy
.var sdx
.var ddx
.var stx
.var hcode                      ; render code of the wall hit
.var cx                         ; the image's camera (taken when its first ray is cast)
.var cy
.var cang
.var cfx
.var cfy
.var cfx16
.var cfy16
.var cidx
.var cdx
.var cdy
.var cplx
.var cply
.var images                     ; images presented (tests, benchmark)
; per ray (tests, sprites)
.var zb, NRAYS * 2              ; distance of the wall
.var rh, NRAYS * 2              ; wall height
.var rcell, NRAYS               ; cell of the wall
.var rtx, NRAYS                 ; texture column | side << 4
.var zlow, NRAYS * 2            ; distance of the nearest low block (0xFFFF = none)
.var ylow, NRAYS                ; first row of its top (sprites behind it are cut there)
.var nlowr, NRAYS               ; low blocks drawn on this ray
; the low blocks of the current ray, nearest first: front and back distance, side, render code
.var lw_n
.var lw_front, 4
.var lw_back, 4
.var lw_side, 4
.var lw_code, 4
.var lw_s
.var lw_c
.var scratch, 16
.var run_idx, (QMAX + 1) * 2    ; address of the run list of each q = height / 2 (built at start)
.var rcost                      ; estimated cycles of the rays cast this frame (DESIGN.md §3.8)
.var rgroup                     ; rcost when the current group of four rays began

; Cast rays in groups of four (a tile column) while the estimated cost so far plus that of the last group stays
; under RAY_BUDGET, so every frame casts at least one group; present the image after its last ray (DESIGN.md §3.8).
render_step:
    LDI r0, 0
    ST [rcost], r0
    ST [rgroup], r0
    LD r0, [rray]
    CMP r0, 0
    JNZ @ray
    CALL snapshot
    LD r0, [rray]
@ray:
    ST [rc], r0
    CALL cast
    LD r0, [rc]
    ADD r0, 1
    CMP r0, NRAYS
    JGE @last
    MOV r1, r0
    AND r1, RAYS_PER_TC - 1
    JNZ @ray
    LD r1, [rcost]              ; a group done: would the next one (as dear as this one) still fit?
    MOV r2, r1
    LD r3, [rgroup]
    SUB r2, r3
    ST [rgroup], r1
    ADD r1, r2
    CMP r1, RAY_BUDGET
    JLT @ray
    ST [rray], r0
    RET
@last:
    LDI r0, 0
    ST [rray], r0
    JMP present

snapshot:
    CALL sync_pos                   ; the game may have moved the player (a dialogue runs before player_update)
    LD r0, [pfx]
    ST [cx], r0
    MOV r1, r0
    AND r1, 255
    ST [cfx], r1
    SHL r1, 8
    ST [cfx16], r1
    LD r2, [pfy]
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
    LD r0, [ang]
    ST [cang], r0
    CALL sincos
    ST [cdx], r3
    ST [cdy], r2
    MOV r4, r2                      ; plane = PLANE/256 * (-sin, cos), rounded (SPIKE.md §3.1)
    MUL r4, 256 - PLANE
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

; cast ray r0 (= [rc]); draw its wall column, then its low blocks far to near
cast:
    MOV r1, r0
    AND r1, RAYS_PER_TC - 1
    JNZ @nofill
    MOV r1, r0                      ; first ray of a tile column: ceiling and floor for the whole column
    SHL r1, 1
    LD r0, [r1 + colb_64]
    LD r3, [set]
    LDB r1, [r3 + set_ceil]
    LDI r2, VIEW_H * 2
    SYS FILL
    ADD r0, VIEW_H * 2
    LDB r1, [r3 + set_floor]
    SYS FILL
    LD r0, [rc]
@nofill:
    LDI r1, 0
    ST [lw_n], r1
    SHL r0, 1
    ST [rc2], r0
    LD r1, [r0 + cam_64]
    ; ---- x ----
    LD r2, [cplx]
    MUL r2, r1
    ADD r2, 64
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
    MOV r5, r2
    SHR r5, 8
    MUL r5, r4
    AND r2, 255
    MUL r2, r4
    SHR r2, 8
    ADD r5, r2
    ST [sdx], r5
    JMP @y
@xtiny:
    CALL tiny_side
    ST [sdx], r5
    LDI r2, 32767
    ST [ddx], r2
@y:
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
    MOV r3, r5
    MOV r5, r7
    JMP @dda
@ytiny:
    CALL tiny_side
    MOV r3, r5
    LDI r5, 32767
@dda:
    LD r2, [sdx]
    LD r4, [ddx]
    LD r6, [stx]
    LD r0, [cidx]
@loop:
    CMP r2, r3
    JAE @sy
    ADD r0, r6
    LDB r7, [r0 + rmap]
    ADD r2, r4
    CMP r7, 0
    JZ @loop
    CMP r7, R_LOW
    JAE @lowx
    ST [hcode], r7
    SUB r2, r4
    MOV r7, r2
    LD r1, [rdy]
    MUL r1, r7
    LD r2, [cfy16]
    ADD r1, r2
    LDI r2, 0
    JMP @common
@sy:
    ADD r0, r1
    LDB r7, [r0 + rmap]
    ADD r3, r5
    CMP r7, 0
    JZ @loop
    CMP r7, R_LOW
    JAE @lowy
    ST [hcode], r7
    SUB r3, r5
    MOV r7, r3
    LD r1, [rdx]
    MUL r1, r7
    LD r2, [cfx16]
    ADD r1, r2
    LDI r2, 1
    JMP @common
@lowx:                              ; a low cell entered through an x side: record it and look on
    ST [lw_c], r7
    LDI r7, 0
    ST [lw_s], r7
    PUSH r1
    PUSH r6
    MOV r1, r2
    SUB r1, r4                      ; entry distance
    JMP @low
@lowy:
    ST [lw_c], r7
    LDI r7, 1
    ST [lw_s], r7
    PUSH r1
    PUSH r6
    MOV r1, r3
    SUB r1, r5
@low:
    MOV r6, r2                      ; exit distance: the nearer of the next sides
    CMP r6, r3
    JB @lrec
    MOV r6, r3
@lrec:
    CALL low_rec
    POP r6
    POP r1
    JMP @loop
    ; ---- the wall: r0 = cell, r7 = distance, r1 = wall fraction, r2 = side ----
@common:
    LD r6, [rc]
    STB [r6 + rcell], r0
    MOV r3, r1
    SHR r3, 12
    MOV r4, r2
    SHL r4, 4
    OR r4, r3
    STB [r6 + rtx], r4
    LD r0, [hcode]
    CALL tex_col                    ; r2 = side, r3 = u -> scratch
    CMP r7, PERP_MIN
    JGE @near
    LDI r7, PERP_MIN
@near:
    LD r6, [rc2]
    ST [r6 + zb], r7
    LDI r5, FOCAL256
    DIV r5, r7                      ; q: the wall is 2q high
    MOV r0, r5
    SHL r0, 1
    ST [r6 + rh], r0
    SHL r5, 1
    LD r2, [r5 + run_idx]
    LDB r1, [r2]
    LDB r3, [r2 + 1]
    ADD r2, 2
    SHL r1, 2
    LD r4, [r6 + colb_64]
    ADD r1, r4
    SUB r1, 4 * VIEW_H
    CALL col_draw
    ; ---- the low blocks, far to near ----
    LD r6, [rc2]
    LDI r0, 0xFFFF
    ST [r6 + zlow], r0
    LD r6, [rc]
    LD r0, [lw_n]
    STB [r6 + nlowr], r0
@lows:
    LD r0, [lw_n]
    CMP r0, 0
    JEQ @cost
    SUB r0, 1
    ST [lw_n], r0
    CALL draw_low
    JMP @lows
@cost:
    ; the ray's estimated cost: set-up, 7 per DDA step (cells crossed), 13 per texel run, 1 per row,
    ; COST_LOW per low block
    LD r6, [rc]
    LDB r0, [r6 + rcell]
    LD r1, [cidx]
    MOV r2, r0
    AND r2, 15
    MOV r3, r1
    AND r3, 15
    SUB r2, r3
    JGE @dx
    NEG r2
@dx:
    SHR r0, 4
    SHR r1, 4
    SUB r0, r1
    JGE @dy
    NEG r0
@dy:
    ADD r0, r2
    MUL r0, 7
    ADD r0, COST_RAY
    LD r6, [rc2]
    LD r1, [r6 + rh]
    MOV r2, r1                      ; runs: up to 16
    CMP r2, 16
    JLE @runs
    LDI r2, 16
@runs:
    MUL r2, 13
    ADD r0, r2
    CMP r1, VIEW_H                  ; rows: up to the view
    JLE @rows
    LDI r1, VIEW_H
@rows:
    ADD r0, r1
    LD r6, [rc]
    LDB r1, [r6 + nlowr]
    MUL r1, COST_LOW
    ADD r0, r1
    LD r1, [rcost]
    ADD r1, r0
    ST [rcost], r1
    RET

; r1 = entry distance, r6 = exit distance, [lw_c] code, [lw_s] side: a new low block, or the last one goes on
; (the next low cell starts exactly where the last one ended); at most two. Keeps every register but r7.
low_rec:
    PUSH r0
    LD r7, [lw_n]
    CMP r7, 0
    JEQ @new
    SHL r7, 1
    LD r0, [r7 + lw_back - 2]
    CMP r0, r1
    JNE @other
    ST [r7 + lw_back - 2], r6
    POP r0
    RET
@other:
    SHR r7, 1
@new:
    CMP r7, 2
    JAE @full
    SHL r7, 1
    ST [r7 + lw_front], r1
    ST [r7 + lw_back], r6
    LD r0, [lw_c]
    ST [r7 + lw_code], r0
    LD r0, [lw_s]
    ST [r7 + lw_side], r0
    SHR r7, 1
    ADD r7, 1
    ST [lw_n], r7
@full:
    POP r0
    RET

; r0 = render code, r2 = side, r3 = texture column -> that column of the room's tileset into scratch.
; Keeps r1, r5-r7.
tex_col:
    AND r0, 127
    LD r4, [set]
    MUL r4, NUM_TEX
    ADD r4, r0
    SHL r4, 1
    ADD r4, r2
    SHL r4, 2                       ; tex_far: (set, texture, side) -> far address (hi, lo)
    PUSH r1
    LD r1, [r4 + tex_far]
    LD r2, [r4 + tex_far + 2]
    SHL r3, 4
    ADD r2, r3
    LDI r0, scratch
    LDI r3, 16
    SYS COPY
    POP r1
    RET

; draw low block [lw_n] of ray [rc]: its top surface (from the back edge's top row to the front edge's) in the
; top colour, then the lower 6/16 of a wall at the front distance (texture rows LOW_ROW-15)
draw_low:
    SHL r0, 1
    LD r7, [r0 + lw_front]
    LD r1, [r0 + lw_back]
    LD r5, [r0 + lw_side]
    LD r4, [r0 + lw_code]
    ST [lw_c], r4
    ST [lw_s], r5
    ; nearest block: what sprites behind it lose
    PUSH r1
    CMP r0, 0
    JNE @far
    LD r6, [rc2]
    ST [r6 + zlow], r7
@far:
    ; row of the back edge's top, (696 + 2h + 15) >> 4 for h at the back distance
    LDI r2, FOCAL256
    CMP r1, PERP_MIN
    JGE @bok
    LDI r1, PERP_MIN
@bok:
    DIV r2, r1                      ; q at the back: h = 2q
    SHL r2, 2
    ADD r2, 8 * VIEW_H - 8 + 15
    SHR r2, 4
    POP r1
    LD r6, [rc]
    CMP r0, 0
    JNE @far2
    STB [r6 + ylow], r2
@far2:
    ; the front: wall fraction for the texture, then its height
    MOV r3, r7
    LD r0, [lw_s]
    CMP r0, 0
    JNE @fy
    LD r1, [rdy]
    MUL r1, r3
    LD r0, [cfy16]
    JMP @fu
@fy:
    LD r1, [rdx]
    MUL r1, r3
    LD r0, [cfx16]
@fu:
    ADD r1, r0
    SHR r1, 12
    PUSH r2
    LD r0, [lw_c]
    LD r2, [lw_s]
    MOV r3, r1
    CALL tex_col
    POP r2
    CMP r7, PERP_MIN
    JGE @fok
    LDI r7, PERP_MIN
@fok:
    LDI r5, FOCAL256
    DIV r5, r7                      ; q at the front
    MOV r3, r5
    SHL r3, 2
    ADD r3, 8 * VIEW_H - 8 + 15
    SHR r3, 4                       ; first row of the front face
    CMP r3, VIEW_H
    JLE @rows
    LDI r3, VIEW_H
@rows:
    ; top surface: rows r2 .. r3 - 1
    MOV r4, r3
    SUB r4, r2
    JLE @face
    PUSH r5
    LD r6, [rc2]
    LD r1, [r6 + colb_64]
    SHL r2, 2
    ADD r1, r2
    SUB r1, 4 * VIEW_H
    SHL r4, 2
    ADD r1, r4
    LD r0, [set]
    SHL r0, 2
    LD r6, [lw_c]
    AND r6, 127
    ADD r0, r6
    LDB r6, [r0 + low_top - FIRST_LOW]
    LDI r7, duff_end
    SUB r7, r4
    CALL r7
    POP r5
@face:
    ; the face: the wall run list of h from the first run of texel LOW_ROW on
    SHL r5, 1
    LD r2, [r5 + run_idx]
    LDB r1, [r2]                    ; y0
    LDB r3, [r2 + 1]                ; runs
    ADD r2, 2
@skip:
    CMP r3, 0
    JEQ @none
    LDB r0, [r2]
    CMP r0, LOW_ROW
    JAE @draw
    LDB r0, [r2 + 1]
    ADD r1, r0
    ADD r2, 2
    SUB r3, 1
    JMP @skip
@draw:
    SHL r1, 2
    LD r6, [rc2]
    LD r4, [r6 + colb_64]
    ADD r1, r4
    SUB r1, 4 * VIEW_H
    JMP col_draw
@none:
    RET

; r0 = angle -> r0 = sin in 8.8, from the quarter-wave table (r1 clobbered)
sin_of:
    AND r0, 1023
    MOV r1, r0
    SHR r1, 8                       ; quadrant
    AND r0, 255
    PUSH r1
    AND r1, 1
    JZ @fwd
    NEG r0                          ; 2nd and 4th quadrant: mirrored
    ADD r0, 256
@fwd:
    SHL r0, 1
    LD r0, [r0 + sinq]
    POP r1
    AND r1, 2
    JZ @pos
    NEG r0                          ; 3rd and 4th: negative
@pos:
    RET

; r0 = angle -> r2 = sin, r3 = cos (8.8); r0, r1 clobbered
sincos:
    PUSH r0
    CALL sin_of
    MOV r2, r0
    POP r0
    ADD r0, 256
    CALL sin_of
    MOV r3, r0
    RET

; the address of every height's run list (they are stored one after another: y0, count, count pairs)
build_run_idx:
    LDI r0, runs_ram
    LDI r1, 0
@h:
    ST [r1 + run_idx], r0
    CMP r1, 0
    JEQ @first                      ; h = 0 has no list: it shares h = 1's address
    LDB r2, [r0 + 1]
    SHL r2, 1
    ADD r0, r2
    ADD r0, 2
@first:
    ADD r1, 2
    CMP r1, (QMAX + 1) * 2
    JLT @h
    RET

; r2 = |ray component| (0 or 1), r4 = fraction to the first side -> r5 = distance to it, saturated (SPIKE.md §3.3)
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

; draw the run list at r2 (r3 entries of texel, rows) from the row at r1 + 4 * VIEW_H, texels from scratch
col_draw:
@e:
    LDB r4, [r2]
    LDB r6, [r4 + scratch]
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

.include "duff.gen.asm"

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
