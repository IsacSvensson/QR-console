; Side views, the resident part (DESIGN.md §3.2-3.3): A facing a linked cell starts its side view — the side-view
; engine (sideovl.asm, a code overlay) is copied from xdata to OVL_RAM, the side view's tiles are unpacked into sbuf —
; and leaving it at an edge puts Sixten back top-down on that edge's cell.
.code

; top-down, A: the cell Sixten faces; if a side link starts there, enter it
try_side:
    LD r0, [cell_i]
    LD r1, [face]
    CMP r1, FACE_DN
    JNE @up
    LD r2, [lv_w]
    ADD r0, r2
    JMP @look
@up:
    CMP r1, FACE_UP
    JNE @rt
    LD r2, [lv_w]
    SUB r0, r2
    JMP @look
@rt:
    CMP r1, FACE_RT
    JNE @lt
    ADD r0, 1
    JMP @look
@lt:
    SUB r0, 1
@look:
    LD r6, [lv_ptr]
    LDB r7, [r6 + LR_NLINK]
    LD r6, [r6 + LR_LINKS]
@k:
    CMP r7, 0
    JEQ @none
    LD r1, [r6 + SL_CELL]
    CMP r1, r0
    JEQ @enter
    ADD r6, 8
    SUB r7, 1
    JMP @k
@enter:
    MOV r0, r6
    CALL side_enter
@none:
    RET

; r0 = side link: load the side-view overlay and the side view; Sixten at its start, facing right
side_enter:
    ST [sd_link], r0
    LDB r0, [r0 + SL_SIDE]
    SHL r0, 4
    ADD r0, side_table
    ST [sd_rec], r0
    LD r0, [ovl_loaded]             ; the overlay, unless it is already there
    CMP r0, 1
    JEQ @loaded
    LDI r0, OVL_RAM
    LDI r1, ovl_side >> 16
    LDI r2, ovl_side & 0xFFFF
    LDI r3, ovl_side_end - ovl_side
    SYS COPY
    LDI r0, 1
    ST [ovl_loaded], r0
@loaded:
    LD r6, [sd_rec]
    LDI r0, sbuf
    LD r1, [r6 + SR_HI]
    LD r2, [r6 + SR_LO]
    SYS UNPACK
    LDB r0, [r6 + SR_COLS]
    ST [sd_cols], r0
    LDB r0, [r6 + SR_RIGHT]
    ST [sd_right], r0
    LD r0, [r6 + SR_WIND]
    ST [sd_wind], r0
    LD r0, [r6 + SR_SX]
    ST [sd_x], r0
    LD r0, [r6 + SR_SY]
    ST [sd_y], r0
    LDI r0, 0
    ST [sd_vy], r0
    ST [sd_face], r0
    ST [sd_climb], r0
    ST [sd_crouch], r0
    ST [sd_lee], r0
    ST [sd_dx], r0
    LDI r0, 1
    ST [sd_ground], r0
    LDI r6, 0                       ; the wind's streaks spread over the screen
@part:
    MOV r7, r6
    SHL r7, 1
    MOV r0, r6
    MUL r0, 37
    AND r0, 127
    ST [r7 + part_x], r0
    MOV r0, r6
    MUL r0, 13
    MOD r0, 56
    ADD r0, SIDE_Y + 8
    ST [r7 + part_y], r0
    ADD r6, 1
    CMP r6, 12
    JLT @part
    LDI r0, M_SIDE
    ST [mode], r0
    LDI r0, SFX_MAP
    SYS SFX
    RET

; r0 = the cell to come out on: back to the top-down view
side_exit:
    CALL place_on_cell
    CALL draw_world
    RET

.data
walk_bodies:  .word spr_body_rt0, spr_body_rt1
climb_bodies: .word spr_body_up0, spr_body_up1
dir_letters:  .word t_dir_e, t_dir_n, t_dir_w, t_dir_s   ; by direction / 4: east, north, west, south
.code
