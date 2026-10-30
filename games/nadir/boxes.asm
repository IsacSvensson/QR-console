; NADIR - 3D boxes (DESIGN §3.12): crates and consoles are axis-aligned boxes. Their corners are transformed into
; the image's camera space when the sprites are chosen (box_frame); when drawn (draw_box) every visible side is
; clipped to the near plane, projected, and filled column by column (h is linear in screen x on a plane: exact at
; the first and last column, stepped in between), one flat colour per side (lit by the light rule, W/E sides a
; level darker), then the lid as horizontal lines and line details (frame, cross brace, screen) on top.
.code

SR_C = 24                           ; corners 0..3 in the sprite record: z, lat (1/1024 cell), 4 bytes each
SR_P = 40                           ; and projected (when all four are in front of the near plane): x16, h8
SR_HMAX = 56                        ; the largest corner h (px; 999 when a corner is behind the near plane)

.var bx_cz                          ; box_frame: the centre in camera space
.var bx_cl
.var bx_beh                         ; a corner is behind the near plane
.var bx_ac                          ; half size times cos and sin (1/1024 cell)
.var bx_as
.var bx_rec                         ; draw_box state
.var bx_prop
.var bx_type
.var bx_a                           ; half size, u8.8
.var bx_hk                          ; height * 256 / 100
.var bx_hq                          ; 128 - bx_hk: the top edge lies h bx_hq / 256 below the horizon
.var bx_lvl                         ; the light rule's index into clamp_tab (before the side offset)
.var bx_row                         ; the shade row of the side being drawn
.var bx_lvo                         ; the side's light offset (span base, W/E one darker) and shade set + face colour
.var bx_rowf
.var bx_vl                          ; visible pixel span of the whole box (lid)
.var bx_vr
.var bx_fl                          ; visible pixel span of the side being drawn (details)
.var bx_fr
.var bx_side
.var bx_fid                         ; face id: prop index * 4 + side
.var bx_clip                        ; 1 if the side was clipped to the near plane
.var bx_pa                          ; the record + 4 corner of its end points
.var bx_pb
.var bx_az                          ; side end points in camera space (1/1024 cell)
.var bx_al
.var bx_bz
.var bx_bl
.var bx_xa                          ; projected end points: x (1/16 px), h (1/8 px)
.var bx_ha
.var bx_xb
.var bx_hb
.var bx_v0                          ; fill: the band of the box height (1/256 of it, from the floor)
.var bx_v1
.var bx_col                         ; fill: colour; bx_recf: 1 = record the columns for the tests
.var bx_recf
.var bx_c                           ; fill loop
.var bx_ce
.var bx_h8
.var bx_lx, 8                       ; lid corners on the screen
.var bx_ly, 8
.var bx_y
.var bx_x0
.var bx_x1
.var col_bface, 2 * COLS            ; per column, the nearest box side drawn there (tests): face id, h, top y
.var col_bh, 2 * COLS
.var col_btop, 2 * COLS
.var col_blvl, 2 * COLS

; ---- choosing: r6 = prop, r7 = centre z, r1 = centre lat (1/1024 cell) -> r0 = 1 if the box was recorded ------
box_frame:
    ST [bx_cz], r7
    ST [bx_cl], r1
    LD r0, [spr_cn]
    MUL r0, SR_SIZE
    ADD r0, spr_cand
    MOV r5, r0
    ST [r5 + SR_PROP], r6
    LDB r2, [r6 + P_TYPE]
    SHL r2, 4
    ADD r2, spr_type
    ST [r5 + SR_TYPE], r2
    LDI r0, 0
    ST [r5 + SR_LOD], r0
    ST [r5 + SR_S], r0
    LD r0, [r6 + P_Y]
    SHR r0, 8
    SHL r0, 5
    LD r1, [r6 + P_X]
    SHR r1, 8
    ADD r0, r1
    ST [r5 + SR_CELL], r0
    LD r0, [r2 + 4]                 ; half size
    PUSH r0
    LD r1, [rcam_c12]
    CALL smul12
    ST [bx_ac], r0
    POP r0
    LD r1, [rcam_s12]
    CALL smul12
    ST [bx_as], r0
    ; ---- corners (DESIGN §3.12 order: (-a, -a), (+a, -a), (+a, +a), (-a, +a))
    LDI r4, 0
@corner:
    LD r0, [r4 + box_sgn]           ; sx
    LD r1, [r4 + box_sgn + 2]       ; sy
    LD r2, [bx_ac]
    MUL r2, r0
    LD r3, [bx_as]
    MUL r3, r1
    ADD r2, r3
    LD r3, [bx_cz]
    ADD r2, r3                      ; z = cz + sx a cos + sy a sin
    MOV r7, r5
    ADD r7, r4
    ST [r7 + SR_C], r2
    LD r2, [bx_ac]
    MUL r2, r1
    LD r3, [bx_as]
    MUL r3, r0
    SUB r2, r3
    LD r3, [bx_cl]
    ADD r2, r3                      ; lat = cl + sy a cos - sx a sin
    ST [r7 + SR_C + 2], r2
    ADD r4, 4
    CMP r4, 16
    JLT @corner
    ; ---- the screen box: the corners in front of the near plane; any behind it: the whole screen
    LDI r0, 200
    ST [bx_vl], r0                  ; (reused here as left / top minima and maxima)
    ST [bx_fl], r0
    LDI r0, -200
    ST [bx_vr], r0
    ST [bx_fr], r0
    LDI r4, 0
    ST [r5 + SR_HMAX], r4
    ST [bx_beh], r4
@bb:
    MOV r7, r5
    ADD r7, r4
    LD r0, [r7 + SR_C]
    CMP r0, 4 * SPR_NEAR
    JGE @front
    LDI r0, 1                       ; behind the near plane (the others are still projected: box_side uses them)
    ST [bx_beh], r0
    JMP @b4
@front:
    LD r1, [r7 + SR_C + 2]
    PUSH r4
    CALL proj
    POP r4
    ST [r7 + SR_P], r0
    ST [r7 + SR_P + 2], r1
    LD r2, [r5 + SR_HMAX]
    CMP r1, r2
    JLE @hm
    ST [r5 + SR_HMAX], r1
@hm:
    ADD r0, 15
    SAR r0, 5
    SHL r0, 1                       ; x of the first column whose sample (2c + 1 px) lies right of the corner
    LD r2, [bx_vl]
    CMP r0, r2
    JGE @b1
    ST [bx_vl], r0
@b1:
    LD r2, [bx_vr]
    CMP r0, r2
    JLE @b2
    ST [bx_vr], r0
@b2:
    ADD r1, 4
    SHR r1, 3                       ; h
    MOV r2, r1
    SHR r2, 1
    LD r0, [hor]
    SUB r0, r2
    ADD r0, r1                      ; floor line
    LD r2, [bx_fr]
    CMP r0, r2
    JLE @b3
    ST [bx_fr], r0
@b3:
    LD r3, [r5 + SR_TYPE]
    LDB r3, [r3 + 2]
    SUB r3, 128
    NEG r3
    MUL r1, r3
    ADD r1, 128
    SHR r1, 8
    LD r0, [hor]
    ADD r0, r1                      ; lid
    LD r2, [bx_fl]
    CMP r0, r2
    JGE @b4
    ST [bx_fl], r0
@b4:
    ADD r4, 4
    CMP r4, 16
    JLT @bb
    LD r0, [bx_beh]
    CMP r0, 0
    JEQ @span
@whole:
    LDI r0, 999 * 8
    ST [r5 + SR_HMAX], r0
    LDI r0, 0
    ST [bx_vl], r0
    ST [bx_fl], r0
    LDI r0, 128
    ST [bx_vr], r0
    LDI r0, 127
    ST [bx_fr], r0
@span:                              ; the columns [vl, vr) in px
    LD r0, [bx_vl]
    LD r1, [bx_vr]
    CMP r0, 127
    JGT @reject
    CMP r1, 0
    JLE @reject
    CMP r1, r0
    JLE @reject                     ; between two samples: no column
    ST [r5 + SR_LEFT], r0
    SUB r1, r0
    ST [r5 + SR_WID], r1
    PUSH r1                         ; its cost in rectangles (the budget and the pacing estimate, §3.11): 4 + wid / 6,
    DIV r1, 6                       ; a console (its screens: a second fill) 4 + 2 (wid / 6)
    LD r2, [r5 + SR_TYPE]
    LDB r2, [r2 + 7]
    CMP r2, 1
    JNE @cc
    SHL r1, 1
@cc:
    ADD r1, 4
    ST [r5 + SR_S], r1
    POP r1
    SHR r1, 1
    ADD r0, r1
    ST [r5 + SR_CX], r0
    LD r0, [bx_fl]
    ST [r5 + SR_TOP], r0
    LD r1, [bx_fr]
    SUB r1, r0
    ADD r1, 1
    ST [r5 + SR_HGT], r1
    LD r0, [r5 + SR_HMAX]
    ADD r0, 7
    SHR r0, 3
    ST [r5 + SR_HMAX], r0
    ; the centre's depth and h (sorting, spr_hc)
    LD r0, [bx_cz]
    ADD r0, 2
    SAR r0, 2
    ST [r5 + SR_Z], r0
    CMP r0, SPR_NEAR
    JGE @zok
    LDI r0, SPR_NEAR
@zok:
    LDI r1, F256
    DIV r1, r0
    ST [r5 + SR_H], r1
    LDI r0, 1
    RET
@reject:
    LDI r0, 0
    RET

; r0 = z, r1 = lat (1/1024 cell, z >= 4 SPR_NEAR) -> r0 = screen x (1/16 px), r1 = h8 = 8 F256 / z (h with three
; rounded fraction bits). Far off to a side (|lat| >= 8 z, beyond 83 degrees) x is pinned 256 px off the screen
; (box_side clips its sides before that). Clobbers r2-r4.
proj:
    MOV r4, r0
    ADD r0, 2
    SHR r0, 2                       ; z, u8.8
    MOV r2, r0
    LDI r0, F256
    DIV r0, r2                      ; h
    LDI r3, F256
    MOD r3, r2
    SHL r3, 3
    PUSH r2
    SHR r2, 1
    ADD r3, r2
    POP r2
    DIV r3, r2                      ; f, eighths
    SHL r0, 3
    ADD r0, r3                      ; h8
    PUSH r0
    MOV r3, r1
    CMP r3, 0
    JGE @pos
    NEG r3
@pos:
    SHR r3, 3
    CMP r3, r4
    JB @in                          ; |lat| < 8 z
    LDI r0, 1024 + 4096
    CMP r1, 0
    JGE @out
    LDI r0, 1024 - 4096
@out:
    POP r1
    RET
@in:
    MOV r3, r0
    MOV r0, r1
    MOV r1, r3
    CALL mulh16                     ; lat h8 / 512: x offset in 1/16 px
    ADD r0, 1024
    POP r1
    RET

; r0 = a (signed), r1 = b (0 .. 32767) -> r0 = a b / 512 rounded (magnitude); the same byte products as @mulh in
; sprites.asm (T = a b / 256 must stay below 16 bits: |lat| < 8 z keeps it below 16 384). Clobbers r1-r4.
mulh16:
    LDI r4, 0
    CMP r0, 0
    JGE @mp
    NEG r0
    LDI r4, 1
@mp:
    MOV r2, r0
    SHR r2, 8
    MUL r2, r1                      ; ah b
    AND r0, 255
    MOV r3, r1
    SHR r3, 8
    MUL r3, r0                      ; al bh
    ADD r2, r3
    AND r1, 255
    MUL r0, r1
    ADD r0, 128
    SHR r0, 8                       ; (al bl + 128) / 256
    ADD r0, r2
    ADD r0, 1
    SHR r0, 1
    CMP r4, 0
    JEQ @mq
    NEG r0
@mq:
    RET

; r0 = a (signed, |a| < 32768), r1 = b (0 .. 32767), r2 = c (1 .. 32767) -> r0 = a b / c, truncated towards zero
; (|a b / c| < 32768). The product in two words from byte products, then a shift-and-subtract division.
; Clobbers r1-r4.
muldiv:
    PUSH r5
    PUSH r6
    LDI r6, 0
    CMP r0, 0
    JGE @ap
    NEG r0
    LDI r6, 1
@ap:
    MOV r3, r0
    SHR r3, 8                       ; ah
    AND r0, 255                     ; al
    MOV r4, r1
    SHR r4, 8                       ; bh
    AND r1, 255                     ; bl
    MOV r5, r3
    MUL r5, r4                      ; hi = ah bh
    MUL r3, r1                      ; ah bl
    MUL r4, r0                      ; al bh
    ADD r3, r4                      ; mid (< 2^16: a < 2^15, b < 2^15)
    MUL r0, r1                      ; lo = al bl
    MOV r4, r3
    SHR r4, 8
    ADD r5, r4                      ; hi += mid >> 8
    SHL r3, 8                       ; (mid & 255) << 8
    ADD r0, r3
    JAE @nc
    ADD r5, 1
@nc:                                ; product = r5 : r0; divide by r2
    CMP r5, 0
    JNE @long
    CMP r0, 0
    JLT @long
    DIV r0, r2                      ; below 2^15: one DIV
    JMP @sgn
@long:
    LDI r1, 0                       ; quotient
    LDI r4, 16
@d:
    SHL r1, 1
    SHL r5, 1
    MOV r3, r0
    SHR r3, 15
    OR r5, r3
    SHL r0, 1
    CMP r5, r2
    JB @ds
    SUB r5, r2
    OR r1, 1
@ds:
    SUB r4, 1
    JNZ @d
    MOV r0, r1
@sgn:
    CMP r6, 0
    JEQ @q
    NEG r0
@q:
    POP r6
    POP r5
    RET

; ---- drawing: r5 = record ------------------------------------------------------------------------------
draw_box:
    ST [bx_rec], r5
    LD r1, [r5 + SR_LEFT]           ; hidden behind walls in every column of its screen box: nothing to draw
    LD r2, [r5 + SR_WID]
    ADD r2, r1
    SUB r2, 1
    SAR r1, 1
    CMP r1, 0
    JGE @h0
    LDI r1, 0
@h0:
    SAR r2, 1
    CMP r2, COLS - 1
    JLE @h1
    LDI r2, COLS - 1
@h1:
    SHL r1, 1
    SHL r2, 1
    LD r0, [r5 + SR_HMAX]
@hs:
    CMP r1, r2
    JGT @hidden
    LD r3, [r1 + col_h]
    ADD r1, 2
    CMP r0, r3
    JLE @hs
    JMP @shown
@hidden:
    RET
@shown:
    LD r6, [r5 + SR_PROP]
    ST [bx_prop], r6
    LD r2, [r5 + SR_TYPE]
    ST [bx_type], r2
    LD r0, [r2 + 4]
    ST [bx_a], r0
    LDB r0, [r2 + 2]
    ST [bx_hk], r0
    SUB r0, 128
    NEG r0
    ST [bx_hq], r0
    ; ---- light (DESIGN §3.12): the cell's span light and the fog of the centre column at the centre's h
    LD r2, [r5 + SR_CELL]
    CALL span_light
    LD r5, [bx_rec]
    LD r0, [r5 + SR_CX]
    SAR r0, 1
    CMP r0, 0
    JGE @c0
    LDI r0, 0
@c0:
    CMP r0, COLS - 1
    JLE @c1
    LDI r0, COLS - 1
@c1:
    SHL r0, 1
    LD r1, [r0 + colfog]
    LD r0, [r5 + SR_H]
    CMP r0, 512
    JB @hk
    LDI r0, 512
@hk:
    ADD r1, r0
    LDB r1, [r1]
    LD r0, [sp_base]
    ADD r1, r0
    ST [bx_lvl], r1
    LDI r0, 200
    ST [bx_vl], r0
    LDI r0, -200
    ST [bx_vr], r0
    ; ---- the sides that face the camera (DESIGN §3.12)
    LD r6, [bx_prop]
    LD r2, [bx_a]
    LD r0, [rcam_x]
    LD r1, [r6 + P_X]
    SUB r1, r2
    CMP r0, r1
    JAE @nw
    LDI r0, 0                       ; west side: corners 0 -> 3
    LDI r1, 3
    LDI r2, 0
    CALL box_side
@nw:
    LD r6, [bx_prop]
    LD r2, [bx_a]
    LD r0, [rcam_x]
    LD r1, [r6 + P_X]
    ADD r1, r2
    CMP r1, r0
    JAE @ne
    LDI r0, 1                       ; east side: corners 1 -> 2
    LDI r1, 2
    LDI r2, 1
    CALL box_side
@ne:
    LD r6, [bx_prop]
    LD r2, [bx_a]
    LD r0, [rcam_y]
    LD r1, [r6 + P_Y]
    SUB r1, r2
    CMP r0, r1
    JAE @nn
    LDI r0, 0                       ; north side: corners 0 -> 1
    LDI r1, 1
    LDI r2, 2
    CALL box_side
@nn:
    LD r6, [bx_prop]
    LD r2, [bx_a]
    LD r0, [rcam_y]
    LD r1, [r6 + P_Y]
    ADD r1, r2
    CMP r1, r0
    JAE @ns
    LDI r0, 3                       ; south side: corners 3 -> 2
    LDI r1, 2
    LDI r2, 3
    CALL box_side
@ns:
    JMP box_lid

; r0 = corner A, r1 = corner B, r2 = side (0 W, 1 E, 2 N, 3 S): clips, fills and details one side.
box_side:
    ST [bx_side], r2
    LD r3, [bx_prop]
    SUB r3, props
    SHR r3, 1                       ; prop index * 4
    ADD r3, r2
    ST [bx_fid], r3
    LD r5, [bx_rec]
    SHL r0, 2
    ADD r0, r5
    ST [bx_pa], r0
    LD r3, [r0 + SR_C]
    ST [bx_az], r3
    LD r3, [r0 + SR_C + 2]
    ST [bx_al], r3
    SHL r1, 2
    ADD r1, r5
    ST [bx_pb], r1
    LD r3, [r1 + SR_C]
    ST [bx_bz], r3
    LD r3, [r1 + SR_C + 2]
    ST [bx_bl], r3
    ; ---- the near plane
    LDI r0, 0
    ST [bx_clip], r0
    LD r0, [bx_az]
    CMP r0, 4 * SPR_NEAR
    JGE @aok
    LD r1, [bx_bz]
    CMP r1, 4 * SPR_NEAR
    JGE @ca
    RET                             ; wholly behind
@ca:
    LDI r0, bx_az
    LDI r1, bx_bz
    CALL box_clip
@aok:
    LD r0, [bx_bz]
    CMP r0, 4 * SPR_NEAR
    JGE @bok
    LDI r0, bx_bz
    LDI r1, bx_az
    CALL box_clip
@bok:
    LDI r0, bx_az                   ; and the lines 83 degrees off the view axis
    LDI r1, bx_bz
    CALL box_clipk
    CMP r0, 0
    JNE @done
    LDI r0, bx_bz
    LDI r1, bx_az
    CALL box_clipk
    CMP r0, 0
    JNE @done
    ; ---- its colour: W and E sides one level darker; per column in box_fill, here for the details (the centre's)
    LD r1, [bx_lvl]
    LD r2, [sp_base]
    LD r0, [bx_side]
    CMP r0, 2
    JAE @lv
    ADD r1, 1
    ADD r2, 1
@lv:
    ST [bx_lvo], r2
    LD r0, [sp_set]
    LD r2, [bx_type]
    LDB r2, [r2]
    ADD r0, r2
    ST [bx_rowf], r0
    LDB r1, [r1 + clamp_tab]
    SHL r1, 5
    LD r0, [sp_set]
    ADD r1, r0
    ST [bx_row], r1
    LD r2, [bx_type]
    LDB r2, [r2]
    ADD r2, r1
    LDB r2, [r2]
    ST [bx_col], r2
    LDI r0, 0
    ST [bx_v0], r0
    LDI r0, 256
    ST [bx_v1], r0
    LDI r0, 1
    ST [bx_recf], r0
    LDI r0, 200
    ST [bx_fl], r0
    LDI r0, -200
    ST [bx_fr], r0
    LD r0, [bx_clip]
    CMP r0, 0
    JEQ @cached
    CALL box_fill
    JMP @filled
@cached:                            ; not clipped: the corners projected in box_frame
    LD r0, [bx_pa]
    LD r1, [r0 + SR_P]
    ST [bx_xa], r1
    LD r1, [r0 + SR_P + 2]
    ST [bx_ha], r1
    LD r0, [bx_pb]
    LD r1, [r0 + SR_P]
    ST [bx_xb], r1
    LD r1, [r0 + SR_P + 2]
    ST [bx_hb], r1
    CALL box_fillp
@filled:
    LD r0, [bx_clip]
    CMP r0, 0
    JNE @done                       ; clipped: no details
    LD r0, [bx_rec]
    LD r0, [r0 + SR_HMAX]
    CMP r0, BOX_DETAIL
    JB @done                        ; far: no details
    LD r2, [bx_type]
    LDB r0, [r2 + 7]
    CMP r0, 1
    JEQ @console
    ; ---- a crate: the frame (top and both ends) and the cross brace, in the line colour
    CALL box_ends                   ; bx_x0/bx_x1 and the corner y values on the stack-free vars
    LDI r6, 0
    CALL box_line                   ; r6 = which line (0 top, 1 left end, 2 right end, 3, 4 braces)
    LDI r6, 1
    CALL box_line
    LDI r6, 2
    CALL box_line
    LDI r6, 3
    CALL box_line
    LDI r6, 4
    CALL box_line
@done:
    RET
@console:                           ; ---- a console: an emissive screen inset on the side, and its top edge
    LD r0, [bx_bz]
    LD r1, [bx_az]
    SUB r0, r1
    SAR r0, 2
    MOV r2, r0
    MUL r0, 13
    SAR r0, 4                       ; (B - A) 0.2 (= 51 / 256 = 13 / 64 of a quarter)
    MUL r2, 51
    SAR r2, 4                       ; (B - A) 0.8
    ADD r0, r1
    ADD r2, r1
    ST [bx_az], r0
    ST [bx_bz], r2
    LD r0, [bx_bl]
    LD r1, [bx_al]
    SUB r0, r1
    SAR r0, 2
    MOV r2, r0
    MUL r0, 13
    SAR r0, 4
    MUL r2, 51
    SAR r2, 4
    ADD r0, r1
    ADD r2, r1
    ST [bx_al], r0
    ST [bx_bl], r2
    LD r1, [bx_row]
    LDB r1, [r1 + 29]               ; colour 13, emissive
    ST [bx_col], r1
    LDI r0, 115
    ST [bx_v0], r0
    LDI r0, 218
    ST [bx_v1], r0
    LDI r0, 0
    ST [bx_recf], r0
    CALL box_fill
    RET

; r0, r1 = addresses of the z of end point P and of the other end Q (lat follows z): moves P along the side to
; z = 4 SPR_NEAR. Clobbers r2-r4.
box_clip:
    LDI r2, 1
    ST [bx_clip], r2
    LD r2, [r0]
    LD r3, [r1]
    SUB r3, r2                      ; zQ - zP
    LDI r4, 4 * SPR_NEAR
    SUB r4, r2
    SHL r4, 4
    DIV r4, r3                      ; t, sixteenths
    LD r2, [r1 + 2]
    LD r3, [r0 + 2]
    SUB r2, r3
    MUL r2, r4
    SAR r2, 4
    ADD r3, r2
    ST [r0 + 2], r3
    LDI r2, 4 * SPR_NEAR
    ST [r0], r2
    RET

; ---- fills the band [bx_v0, bx_v1] of the side between bx_az/al and bx_bz/bl, colour bx_col --------------
box_fill:
    LD r0, [bx_az]
    LD r1, [bx_al]
    CALL proj
    ST [bx_xa], r0
    ST [bx_ha], r1
    LD r0, [bx_bz]
    LD r1, [bx_bl]
    CALL proj
    ST [bx_xb], r0
    ST [bx_hb], r1
; (entry with bx_xa/ha/xb/hb already projected)
box_fillp:
    LD r0, [bx_xb]
    LD r1, [bx_hb]
    LD r2, [bx_xa]
    CMP r0, r2
    JGE @ord
    ST [bx_xa], r0                  ; left to right
    ST [bx_xb], r2
    LD r2, [bx_ha]
    ST [bx_ha], r1
    ST [bx_hb], r2
@ord:
    ; columns whose sample (x = 32 c + 16, 1/16 px) lies in [xa, xb)
    LD r0, [bx_xa]
    ADD r0, 15
    SAR r0, 5
    CMP r0, 0
    JGE @l0
    LDI r0, 0
@l0:
    ST [bx_c], r0
    LD r1, [bx_xb]
    ADD r1, 15
    SAR r1, 5
    SUB r1, 1
    CMP r1, COLS - 1
    JLE @r0
    LDI r1, COLS - 1
@r0:
    ST [bx_ce], r1
    CMP r0, r1
    JLE @go
    RET
@go:
    ; exact h8 at the first and the last column, stepped in between
    CALL @hat
    ST [bx_h8], r0
    LD r0, [bx_c]
    PUSH r0
    LD r1, [bx_ce]
    ST [bx_c], r1
    CALL @hat                       ; r0 = h8 at the last column
    POP r1
    ST [bx_c], r1
    LD r2, [bx_ce]
    SUB r2, r1                      ; n = columns - 1
    SHL r0, 3                       ; h in 1/64 px (< 32 768: the near plane keeps h <= F256 / SPR_NEAR = 394)
    LD r6, [bx_h8]
    SHL r6, 3
    LDI r5, 0
    CMP r2, 0
    JEQ @q0
    SUB r0, r6                      ; the step per column, rounded: (d +- n / 2) / n
    MOV r1, r2
    SHR r1, 1
    CMP r0, 0
    JGE @qp
    NEG r1
@qp:
    ADD r0, r1
    DIV r0, r2
    MOV r5, r0
@q0:
    LD r7, [bx_c]
    SHL r7, 1
    LD r0, [bx_ce]
    SHL r0, 1
    ST [bx_ce], r0                  ; r7 = 2c, r6 = h (1/64 px), r5 = its step
    LD r0, [bx_recf]
    CMP r0, 0
    JEQ @band
@col:                               ; ---- a whole side: per column its light, recorded for the tests
    MOV r4, r6
    ADD r4, 32
    SHR r4, 6                       ; h
    LD r0, [r7 + col_h]
    CMP r4, r0
    JLE @step                       ; the wall is nearer
    MOV r1, r4
    SHR r1, 1
    LD r0, [hor]
    SUB r0, r1
    ADD r0, r4                      ; the floor at this depth
    LD r1, [bx_hq]
    MUL r1, r4
    ADD r1, 128
    SHR r1, 8
    LD r3, [hor]
    ADD r1, r3                      ; its top: hor + h (1/2 - height), one rounding
    MOV r3, r0
    SUB r3, r1                      ; the box's height in px
    LD r0, [r7 + colfog]            ; this column's light (DESIGN §3.12, as the walls: fog and cone at h <= 394)
    ADD r0, r4
    LDB r0, [r0]
    LD r2, [bx_lvo]
    ADD r0, r2
    LDB r0, [r0 + clamp_tab]        ; the level
    LD r2, [r7 + col_bh]            ; the nearest box side in this column, for the tests
    CMP r4, r2
    JLE @nr
    ST [r7 + col_bh], r4
    LD r2, [bx_fid]
    ST [r7 + col_bface], r2
    ST [r7 + col_btop], r1
    ST [r7 + col_blvl], r0
@nr:
    SHL r0, 5
    LD r2, [bx_rowf]
    ADD r0, r2
    LDB r4, [r0]
    CMP r3, 0
    JLE @nf
    MOV r0, r7                      ; x = 2c
    LDI r2, COL_W
    SYS RECTFILL
@nf:
    ST [bx_fr], r7                  ; the visible columns (first and last)
    LD r0, [bx_fl]
    CMP r0, 200
    JNE @step
    ST [bx_fl], r7
@step:
    ADD r6, r5
    ADD r7, 2
    LD r0, [bx_ce]
    CMP r7, r0
    JLE @col
    LD r0, [bx_fl]                  ; the side's visible pixels [fl, fr) and the box's [vl, vr)
    CMP r0, 200
    JEQ @nv
    LD r1, [bx_fr]
    ADD r1, COL_W
    ST [bx_fr], r1
    LD r2, [bx_vl]
    CMP r0, r2
    JGE @v1
    ST [bx_vl], r0
@v1:
    LD r2, [bx_vr]
    CMP r1, r2
    JLE @nv
    ST [bx_vr], r1
@nv:
    RET
@band:                              ; ---- a band of the side's height [v0, v1], flat colour (the console's screen)
    MOV r4, r6
    ADD r4, 32
    SHR r4, 6                       ; h
    LD r0, [r7 + col_h]
    CMP r4, r0
    JLE @bstep
    MOV r1, r4
    SHR r1, 1
    LD r0, [hor]
    SUB r0, r1
    ADD r0, r4                      ; the floor at this depth
    LD r2, [bx_hk]
    MUL r2, r4
    ADD r2, 128
    SHR r2, 8                       ; the box's height in px
    LD r3, [bx_v1]
    MUL r3, r2
    SHR r3, 8
    MOV r1, r0
    SUB r1, r3                      ; band top
    LD r3, [bx_v0]
    MUL r3, r2
    SHR r3, 8
    SUB r0, r3                      ; band bottom
    MOV r3, r0
    SUB r3, r1
    JLE @bstep
    MOV r0, r7
    LDI r2, COL_W
    LD r4, [bx_col]
    SYS RECTFILL
@bstep:
    ADD r6, r5
    ADD r7, 2
    LD r0, [bx_ce]
    CMP r7, r0
    JLE @band
    RET
; h8 at column bx_c: ha + (hb - ha) (32 c + 16 - xa) / (xb - xa) -> r0 (exact: h is linear in screen x on a plane).
; Clobbers r1-r4.
@hat:
    LD r2, [bx_xb]
    LD r3, [bx_xa]
    SUB r2, r3
    LD r1, [bx_c]
    SHL r1, 5
    ADD r1, 16
    SUB r1, r3
    LD r0, [bx_hb]
    LD r3, [bx_ha]
    SUB r0, r3
    PUSH r3
    CALL muldiv
    POP r3
    ADD r0, r3
    RET

; r0, r1 = addresses of the z of end point P (lat follows) and of the other end Q: if P lies beyond the lines
; |lat| = 7.5 z (83 degrees off the view axis), moves it along the side onto that line, so that proj never pins an
; end point and h stays linear. r0 = 1 if the whole side lies beyond (then it is not drawn). Clobbers r2-r6.
box_clipk:
    LD r2, [r0]                     ; z
    LD r3, [r0 + 2]                 ; lat
    LDI r6, 1
    CMP r3, 0
    JGE @sp
    LDI r6, -1
    NEG r3
@sp:
    SHR r3, 3                       ; |lat| / 8 >= 15 z / 16 ?
    MOV r4, r2
    SHR r4, 4
    SUB r2, r4
    CMP r3, r2
    JGE @out
    LDI r0, 0
    RET
@out:
    LDI r2, 1
    ST [bx_clip], r2
    ; g(X) = 2 lat - s 15 z (zero on the line; P and Q are close to the camera here, so it fits in 16 bits)
    PUSH r1
    PUSH r0
    CALL @g
    MOV r5, r2                      ; gP
    POP r0
    POP r1
    PUSH r0
    PUSH r1
    MOV r0, r1
    CALL @g                         ; gQ
    POP r1
    POP r0
    MOV r3, r5
    XOR r3, r2
    CMP r3, 0
    JLT @cross                      ; opposite signs: the side crosses the line
    LDI r0, 1
    RET
@cross:
    MOV r3, r5
    SUB r3, r2                      ; gP - gQ
    PUSH r0
    PUSH r1
    MOV r0, r5
    CMP r3, 0
    JGT @den
    NEG r0
    NEG r3
@den:
    MOV r2, r3
    LDI r1, 16
    CALL muldiv                     ; t = gP / (gP - gQ), sixteenths
    MOV r3, r0
    POP r1
    POP r0
    LD r2, [r1]
    LD r4, [r0]
    SUB r2, r4
    MUL r2, r3
    SAR r2, 4
    ADD r4, r2
    ST [r0], r4
    LD r2, [r1 + 2]
    LD r4, [r0 + 2]
    SUB r2, r4
    MUL r2, r3
    SAR r2, 4
    ADD r4, r2
    ST [r0 + 2], r4
    LDI r0, 0
    RET
@g:                                 ; r0 = address of a point, r6 = s -> r2 = 2 lat - s 15 z. Clobbers r3.
    LD r2, [r0 + 2]
    SHL r2, 1
    LD r3, [r0]
    MUL r3, 15
    MUL r3, r6
    SUB r2, r3
    RET

; the side's end points on the screen (after box_fill, left and right): bx_x0/x1 and the y of their tops and floors
.var bx_y0t
.var bx_y0b
.var bx_y1t
.var bx_y1b
box_ends:
    LD r0, [bx_xa]
    ADD r0, 8
    SAR r0, 4
    ST [bx_x0], r0
    LD r0, [bx_xb]
    ADD r0, 8
    SAR r0, 4
    ST [bx_x1], r0
    LD r0, [bx_ha]
    CALL box_y
    ST [bx_y0b], r0
    ST [bx_y0t], r1
    LD r0, [bx_hb]
    CALL box_y
    ST [bx_y1b], r0
    ST [bx_y1t], r1
    RET
; r0 = h8 -> r0 = the floor's y at that depth, r1 = the box top's y. Clobbers r2.
box_y:
    ADD r0, 4
    SHR r0, 3
    MOV r1, r0
    SHR r1, 1
    LD r2, [hor]
    SUB r2, r1
    ADD r2, r0
    LD r1, [bx_hq]
    MUL r1, r0
    ADD r1, 128
    SHR r1, 8
    LD r0, [hor]
    ADD r1, r0
    MOV r0, r2
    RET

; r6 = line 0 top edge, 1 left end, 2 right end, 3 and 4 the cross brace: drawn in the line colour, clipped to the
; side's visible pixels [bx_fl, bx_fr).
box_line:
    LD r0, [bx_x0]
    LD r2, [bx_x1]
    CMP r6, 0
    JNE @l1
    LD r1, [bx_y0t]
    LD r3, [bx_y1t]
    JMP @clip
@l1:
    CMP r6, 1
    JNE @l2
    MOV r2, r0
    LD r1, [bx_y0t]
    LD r3, [bx_y0b]
    JMP @vert
@l2:
    CMP r6, 2
    JNE @l3
    MOV r0, r2
    LD r1, [bx_y1t]
    LD r3, [bx_y1b]
    JMP @vert
@l3:
    CMP r6, 3
    JNE @l4
    LD r1, [bx_y0b]
    LD r3, [bx_y1t]
    JMP @clip
@l4:
    LD r1, [bx_y0t]
    LD r3, [bx_y1b]
@clip:
    LD r4, [bx_fr]
    SUB r4, 1
    LD r5, [bx_fl]
    CMP r0, r4
    JGT @none
    CMP r2, r5
    JLT @none
    CMP r2, r0
    JLE @draw
    CMP r0, r5
    JGE @c1
    PUSH r2                         ; x0 < fl: y0 += (y1 - y0) (fl - x0) / (x1 - x0)
    PUSH r3
    PUSH r1
    MOV r6, r1
    MOV r0, r3
    SUB r0, r1
    MOV r1, r5
    LD r3, [bx_x0]
    SUB r1, r3
    SUB r2, r3
    CALL muldiv
    POP r1
    ADD r1, r0
    POP r3
    POP r2
    LD r0, [bx_fl]
@c1:
    LD r4, [bx_fr]
    SUB r4, 1
    CMP r2, r4
    JLE @draw
    PUSH r0                         ; x1 > fr - 1: y1 -= (y1 - y0) (x1 - fr + 1) / (x1 - x0)
    PUSH r1
    PUSH r3
    MOV r5, r2
    SUB r5, r4                      ; x1 - (fr - 1)
    MOV r6, r2
    SUB r6, r0                      ; x1 - x0
    MOV r0, r3
    SUB r0, r1
    MOV r1, r5
    MOV r2, r6
    CALL muldiv
    POP r3
    SUB r3, r0
    POP r1
    POP r0
    LD r2, [bx_fr]
    SUB r2, 1
    JMP @draw
@vert:
    LD r4, [bx_fl]
    CMP r0, r4
    JLT @none
    LD r4, [bx_fr]
    CMP r0, r4
    JGE @none
@draw:
    LD r4, [bx_type]
    LDB r4, [r4 + 6]
    LD r5, [bx_row]
    ADD r4, r5
    LDB r4, [r4]
    SYS LINE
@none:
    RET

; ---- the lid (DESIGN §3.12): the four top corners on the screen; each edge widens the x spans of the rows it
; crosses (x stepped in 1/16 px from its upper end), then every row is one LINE, clipped to the box's visible pixels
; [vl, vr); skipped when a corner is behind the near plane or far off to a side, and for far boxes (LOD)
.var bx_rl, 2 * 128                 ; per screen row: the lid's x span
.var bx_rr, 2 * 128
box_lid:
    LD r0, [bx_vl]
    LD r1, [bx_vr]
    CMP r0, r1
    JGE @no                         ; no side visible
    LD r5, [bx_rec]
    LD r0, [r5 + SR_HMAX]
    CMP r0, 999
    JEQ @no                         ; a corner behind the near plane
    CMP r0, BOX_DETAIL
    JB @no                          ; far: the lid is under a pixel thick
    LDI r6, 0
@cor:
    LD r5, [bx_rec]
    ADD r5, r6
    ADD r5, r6
    LD r0, [r5 + SR_P]
    LD r1, [r5 + SR_P + 2]
    CMP r0, 1024 + 4096
    JEQ @no
    CMP r0, 1024 - 4096
    JEQ @no
    ADD r0, 8
    SAR r0, 4
    ST [r6 + bx_lx], r0
    MOV r0, r1
    CALL box_y
    ST [r6 + bx_ly], r1
    ADD r6, 2
    CMP r6, 8
    JLT @cor
    ; the rows: [ymin, ymax] clipped to the screen, each row's x span initially empty
    LDI r2, 200
    LDI r3, -200
    LDI r6, 0
@ym:
    LD r0, [r6 + bx_ly]
    CMP r0, r2
    JGE @ym1
    MOV r2, r0
@ym1:
    CMP r0, r3
    JLE @ym2
    MOV r3, r0
@ym2:
    ADD r6, 2
    CMP r6, 8
    JLT @ym
    CMP r2, 0
    JGE @ya
    LDI r2, 0
@ya:
    CMP r3, 127
    JLE @yb
    LDI r3, 127
@yb:
    CMP r2, r3
    JGT @no
    ST [bx_y], r2
    ST [bx_x1], r3
    SHL r2, 1
    SHL r3, 1
    LDI r0, 200
    LDI r1, -200
@init:
    ST [r2 + bx_rl], r0
    ST [r2 + bx_rr], r1
    ADD r2, 2
    CMP r2, r3
    JLE @init
    ; every edge (not horizontal ones: their ends lie on the neighbours) widens the spans of the rows it crosses,
    ; x stepped in 1/16 px from its upper end
    LDI r6, 0
@edge:
    MOV r5, r6
    ADD r5, 2
    AND r5, 6
    LD r2, [r6 + bx_ly]
    LD r3, [r5 + bx_ly]
    LD r0, [r6 + bx_lx]
    LD r1, [r5 + bx_lx]
    CMP r2, r3
    JEQ @enext
    JLT @up
    MOV r4, r2                      ; upper end first
    MOV r2, r3
    MOV r3, r4
    MOV r4, r0
    MOV r0, r1
    MOV r1, r4
@up:
    SUB r1, r0
    SHL r1, 4
    MOV r4, r3
    SUB r4, r2
    DIV r1, r4                      ; slope, 1/16 px per row
    SHL r0, 4
    ADD r0, 8                       ; x at the upper end, 1/16 px (rounded below)
    LD r4, [bx_y]
    CMP r2, r4
    JGE @top
    SUB r4, r2                      ; starts above the screen: skip rows
    PUSH r1
    MUL r1, r4
    ADD r0, r1
    POP r1
    LD r2, [bx_y]
@top:
    LD r4, [bx_x1]
    CMP r3, r4
    JLE @bot
    MOV r3, r4
@bot:
    SHL r2, 1
    SHL r3, 1
@er:
    MOV r4, r0
    SAR r4, 4
    LD r7, [r2 + bx_rl]
    CMP r4, r7
    JGE @e1
    ST [r2 + bx_rl], r4
@e1:
    LD r7, [r2 + bx_rr]
    CMP r4, r7
    JLE @e2
    ST [r2 + bx_rr], r4
@e2:
    ADD r0, r1
    ADD r2, 2
    CMP r2, r3
    JLE @er
@enext:
    ADD r6, 2
    CMP r6, 8
    JLT @edge
    ; the lid's colour: one level lighter
    LD r1, [bx_lvl]
    SUB r1, 1
    LDB r1, [r1 + clamp_tab]
    SHL r1, 5
    LD r0, [sp_set]
    ADD r1, r0
    LD r2, [bx_type]
    LDB r2, [r2 + 1]
    ADD r1, r2
    LDB r1, [r1]
    ST [bx_col], r1
    LD r7, [bx_y]
@row:                               ; each row's span, clipped to the box's visible pixels [vl, vr)
    MOV r6, r7
    SHL r6, 1
    LD r0, [r6 + bx_rl]
    LD r2, [r6 + bx_rr]
    LD r4, [bx_vl]
    CMP r0, r4
    JGE @x0
    MOV r0, r4
@x0:
    LD r4, [bx_vr]
    SUB r4, 1
    CMP r2, r4
    JLE @x1
    MOV r2, r4
@x1:
    CMP r0, r2
    JGT @nextrow
    MOV r1, r7
    MOV r3, r7
    LD r4, [bx_col]
    SYS LINE
@nextrow:
    ADD r7, 1
    LD r0, [bx_x1]
    CMP r7, r0
    JLE @row
@no:
    RET

.data
box_sgn:                            ; corner signs (sx, sy): (-a, -a), (+a, -a), (+a, +a), (-a, +a)
    .word -1, -1, 1, -1, 1, 1, -1, 1
.code
