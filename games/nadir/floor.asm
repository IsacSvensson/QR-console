; NADIR - floor and ceiling (DESIGN §3.7): CLS, then one MAP with the zone's dithered gradient tiles.
.code

draw_bg:
    LD r0, [dbg_sentinel]           ; 0 normally; the coverage test draws with other colours here
    SYS CLS
    MOV r0, bg_map
    LD r1, [cam_zone]
    MUL r1, BG_ZONE_BYTES
    ADD r1, bgram - 32              ; tile 1 is the first tile of the zone
    LDI r2, 16
    LDI r3, BG_ROWS
    LDI r4, 0
    LD r5, [bob]
    SUB r5, 8
    SYS MAP
    RET

; ---- floor seams (DESIGN §3.7): the grid lines of the floor within 6 cells, from the angle record in xdata ----
.var frec, 16                       ; this frame's record (floor.gen.asm)
.var fl_n                           ; lines left
.var fl_xb                          ; radial: x at the bottom row, 1/16 px
.var fl_xf                          ; radial: x at the far row
.var fl_d                           ; crossing: line - camera, u8.8
.var fl_perp                        ; the camera coordinate across the crossing seams

floor_lines:
    LD r0, [dbg_flags]
    AND r0, FL_NOFLOOR
    JZ @go
    RET
@go:
    LD r2, [cam_a]
    SHR r2, 2
    SHL r2, 4
    LDI r1, floor_x >> 16
    ADD r2, floor_x & 0xFFFF
    JAE @nc
    ADD r1, 1
@nc:
    LDI r0, frec
    LDI r3, 16
    SYS COPY                        ; 10 cycles: random access into a 16 KB table in xdata
    LD r4, [cam_x]
    LD r5, [cam_y]
    LD r0, [frec]
    CMP r0, 0
    JEQ @axes
    MOV r0, r4                      ; radial seams are the y = k lines
    MOV r4, r5
    MOV r5, r0
@axes:
    ST [fl_perp], r5
    ; ---- radial seams: x(k) = XV + 6 step + step * frac / 256 at k = 0, then - step per line
    AND r4, 255                     ; fraction of the radial coordinate
    LD r0, [frec + 4]               ; SB16
    CALL @first
    ST [fl_xb], r0
    LD r0, [frec + 6]               ; SF16
    CALL @first
    ST [fl_xf], r0
    LDI r0, 13
    ST [fl_n], r0
@rad:
    LD r2, [fl_xb]
    LD r0, [fl_xf]
    SAR r2, 4
    SAR r0, 4
    LDI r3, FL_YB
    LDI r6, 3                       ; pull a far-off bottom end towards the far row, at most 3 times
@pull:
    MOV r1, r2
    SUB r1, 64
    CMP r1, 400
    JLT @lo
    JMP @half
@lo:
    CMP r1, -400
    JGT @vis
@half:
    SUB r6, 1
    JLT @skip
    ADD r2, r0
    SAR r2, 1
    ADD r3, FL_YF
    SHR r3, 1
    JMP @pull
@vis:
    MOV r1, r2                      ; both ends off the same side: nothing to draw
    CMP r1, r0
    JLT @minok
    MOV r1, r0
@minok:
    CMP r1, 128
    JGE @skip
    MOV r1, r2
    CMP r1, r0
    JGT @maxok
    MOV r1, r0
@maxok:
    CMP r1, 0
    JLT @skip
    LD r5, [bob]
    ADD r3, r5
    LDI r1, FL_YF
    ADD r1, r5
    LD r4, [cam_zone]
    LDB r4, [r4 + seam_tab]
    SYS LINE
@skip:
    LD r0, [fl_xb]
    LD r1, [frec + 4]
    SUB r0, r1
    ST [fl_xb], r0
    LD r0, [fl_xf]
    LD r1, [frec + 6]
    SUB r0, r1
    ST [fl_xf], r0
    LD r0, [fl_n]
    SUB r0, 1
    ST [fl_n], r0
    JNZ @rad
    ; ---- crossing seams: y = horizon + PP / d at x = 0 and x = 127
    LD r0, [fl_perp]
    AND r0, 255
    NEG r0
    SUB r0, 6 * 256
    ST [fl_d], r0
    LDI r0, 13
    ST [fl_n], r0
@cross:
    LD r5, [fl_d]
    MOV r0, r5                      ; |d|
    CMP r0, 0
    JGE @pos
    NEG r0
@pos:
    CMP r0, 48                      ; nearer than 0.2 cells: below the screen
    JLT @cnext
    CMP r0, 3 * 256                 ; further than 3 cells they alias into stripes near the horizon
    JGE @cnext
    LD r4, [cam_zone]
    LDB r4, [r4 + seam_tab]
    LD r1, [frec + 8]
    DIV r1, r5
    LD r3, [frec + 10]
    DIV r3, r5
    CMP r1, 0
    JGT @front
    CMP r3, 0
    JLE @cnext                      ; both ends above the horizon: behind the camera
@front:
    LD r0, [hor]
    ADD r1, r0
    ADD r3, r0
    LDI r0, 0
    LDI r2, 127
    SYS LINE
@cnext:
    LD r0, [fl_d]
    ADD r0, 256
    ST [fl_d], r0
    LD r0, [fl_n]
    SUB r0, 1
    ST [fl_n], r0
    JNZ @cross
    RET

; r0 = step (1/16 px per cell, signed), r4 = fraction 0..255 -> r0 = XV + 6 step + step * fraction / 256.
@first:
    MOV r6, r0
    CMP r0, 0
    JGE @fp
    NEG r0
@fp:
    MULQ8 r1, r0, r4, r2
    CMP r6, 0
    JGE @fs
    NEG r1
@fs:
    MOV r0, r6
    MUL r0, 6
    ADD r0, r1
    LD r1, [frec + 2]
    ADD r0, r1
    RET

; ---- lamps (DESIGN §3.7): a glowing fixture on the ceiling and a light pool on the floor, drawn before the walls
; (a wall nearer than the lamp covers them; a lamp nearer than a wall is outside the wall's span by geometry).
.var lp_i
.var lp_x                           ; screen x of the lamp
.var lp_h                           ; wall height at the lamp's depth (inverse depth)
.var lp_core
.var lp_rim
.var lp_w                           ; pool half-width
.var lp_hh                          ; pool half-height
.var lp_y                           ; pool centre y
.var lp_r                           ; pool row

draw_lamps:
    LD r0, [dbg_flags]
    AND r0, FL_NOFLOOR
    JZ @go
    RET
@go:
    LDI r0, 0
    ST [lp_i], r0
@lamp:
    LD r6, [lp_i]
    SHL r6, 2
    LDB r0, [r6 + lamps]            ; cell x
    SHL r0, 8
    ADD r0, 128
    LD r1, [cam_x]
    SUB r0, r1                      ; dx, u8.8 signed
    LDB r1, [r6 + lamps + 1]
    SHL r1, 8
    ADD r1, 128
    LD r2, [cam_y]
    SUB r1, r2                      ; dy
    ; within 8 cells?
    MOV r2, r0
    ADD r2, 2048
    CMP r2, 4096
    JAE @next
    MOV r2, r1
    ADD r2, 2048
    CMP r2, 4096
    JAE @next
    PUSH r1
    PUSH r0
    ; depth z = dx cos + dy sin
    LD r1, [cam_c8]
    CALL smul8
    MOV r5, r0
    POP r0
    POP r1
    PUSH r1
    PUSH r0
    MOV r0, r1
    LD r1, [cam_s8]
    CALL smul8
    ADD r5, r0                      ; z
    CMP r5, 160                     ; nearer than 0.6 cells (or behind): skip
    JLT @drop
    ; lat = dy cos - dx sin
    POP r0
    LD r1, [cam_s8]
    CALL smul8
    MOV r6, r0
    POP r0
    LD r1, [cam_c8]
    CALL smul8
    SUB r0, r6                      ; lat
    ; h = F256 / z, x = 64 + lat * h / 256
    LDI r1, F256
    DIV r1, r5
    CMP r1, 255
    JLE @hok
    LDI r1, 255
@hok:
    ST [lp_h], r1
    CALL smul8
    ADD r0, 64
    ST [lp_x], r0
    ; colours: the zone's, dark when the lamp's flicker group is off
    LD r6, [lp_i]
    SHL r6, 2
    LDB r0, [r6 + lamps + 3]
    LDB r0, [r0 + group_lit]
    LD r1, [cam_zone]
    LDB r2, [r1 + pool_core]
    LDB r3, [r1 + pool_rim]
    CMP r0, 0
    JNE @lit
    LDI r2, 3
    LDI r3, 1
@lit:
    ST [lp_core], r2
    ST [lp_rim], r3
    ; ---- the pool: an ellipse of horizontal lines on every other row (half-width w = 0.55 h, half-height
    ; w h / 200), the rim colour on the outer half of each line and the core colour in the middle
    LD r5, [lp_h]
    MOV r4, r5
    MUL r4, 141
    SHR r4, 8
    ST [lp_w], r4
    MOV r3, r4
    MUL r3, r5
    DIV r3, 200
    ADD r3, 1
    CMP r3, 16
    JLE @hh
    LDI r3, 16
@hh:
    ST [lp_hh], r3
    LD r7, [hor]
    MOV r6, r5
    SHR r6, 1
    ADD r7, r6
    ST [lp_y], r7                   ; floor y under the lamp
    LD r0, [lp_hh]
    NEG r0
    LD r1, [tick]
    AND r1, 1
    ADD r0, r1                      ; rows alternate with the frame: the pool shimmers like a lamp
    ST [lp_r], r0
@row:
    LD r0, [lp_r]
    MOV r1, r0
    CMP r1, 0
    JGE @abs
    NEG r1
@abs:
    SHL r1, 5
    LD r2, [lp_hh]
    DIV r1, r2                      ; 0..32
    LDB r1, [r1 + ellipse_tab]
    LD r2, [lp_w]
    MUL r1, r2
    SHR r1, 8                       ; half-width of this row
    LD r2, [lp_x]
    MOV r0, r2
    SUB r0, r1
    ADD r2, r1
    LD r1, [lp_r]
    LD r3, [lp_y]
    ADD r1, r3
    MOV r3, r1
    LD r4, [lp_rim]
    PUSH r0
    PUSH r2
    SYS LINE
    POP r2
    POP r0
    SUB r2, r0                      ; core: the middle half
    SHR r2, 2
    ADD r0, r2
    SHL r2, 1
    ADD r2, r0
    LD r4, [lp_core]
    SYS LINE
    LD r0, [lp_r]
    LD r1, [lp_hh]
    ADD r0, 2
    CMP r1, 8
    JLE @step                       ; big (near) pools: every third row, the lines are long anyway
    ADD r0, 1
@step:
    ST [lp_r], r0
    CMP r0, r1
    JLE @row
    ; ---- the fixture on the ceiling: a bright bar in a rim-coloured frame
    LD r5, [lp_h]
    LD r7, [hor]
    MOV r6, r5
    SHR r6, 1
    SUB r7, r6                      ; ceiling y above the lamp
    MOV r4, r5
    SHR r4, 2
    ADD r4, 1                       ; half-width h / 4
    MOV r3, r5
    SHR r3, 5
    ADD r3, 1                       ; half-height
    LD r6, [lp_rim]
    CALL rect_c
    SHR r4, 1
    ADD r4, 1
    SHR r3, 1
    LD r6, [lp_core]
    CALL rect_c
    JMP @next
@drop:
    POP r0
    POP r1
@next:
    LD r0, [lp_i]
    ADD r0, 1
    ST [lp_i], r0
    CMP r0, NUM_LAMPS
    JLT @lamp
    RET

; r4 = half-width, r3 = half-height, r7 = centre y, r6 = colour, centre x = lp_x. Preserves r3-r7.
rect_c:
    LD r0, [lp_x]
    SUB r0, r4
    MOV r1, r7
    SUB r1, r3
    MOV r2, r4
    SHL r2, 1
    PUSH r3
    PUSH r4
    SHL r3, 1
    MOV r4, r6
    SYS RECTFILL
    POP r4
    POP r3
    RET

; r0 = a (signed, |a| < 64 cells in u8.8), r1 = b (|b| <= 256) -> r0 = a * b / 256 (signed). Clobbers r2, r3.
smul8:
    LDI r3, 0
    CMP r0, 0
    JGE @a
    NEG r0
    XOR r3, 1
@a:
    CMP r1, 0
    JGE @b
    NEG r1
    XOR r3, 1
@b:
    MULQ8 r2, r0, r1, r0
    MOV r0, r2
    CMP r3, 0
    JEQ @p
    NEG r0
@p:
    RET
