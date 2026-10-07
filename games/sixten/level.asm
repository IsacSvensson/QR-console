; Levels and screens (DESIGN.md §3.1, §4): the cell map in RAM, one screen = 4 x 3 cells expanded into the
; column-major tile buffer, one MAP call per column, and the slide to the next screen.
.code

; r0 = level index: unpack its cell map, put Sixten on the start, reset the counters
level_start:
    ST [level], r0
    MUL r0, LV_REC
    ADD r0, level_table
    ST [lv_ptr], r0
    MOV r6, r0
    LD r1, [r6 + LR_HI]
    LD r2, [r6 + LR_LO]
    LDI r0, cells
    SYS UNPACK
    LDB r0, [r6 + LR_W]
    ST [lv_w], r0
    LDB r0, [r6 + LR_H]
    ST [lv_h], r0
    LDI r0, 0
    ST [stamped], r0
    ST [n_stamped], r0
    ST [course_set], r0
    ST [steps], r0
    ST [pw], r0
    ST [wood], r0
    ST [face], r0
    ST [walk_t], r0
    ST [wh_state], r0
    ST [wh_pending], r0
    ST [wh_started], r0
    ST [wh_dirty], r0
    ST [bend_on], r0
    ST [bend_prev], r0
    ST [inv_t], r0
    ST [expo], r0
    ST [branch_t], r0
    ST [still_t], r0
    LDI r0, HEARTS
    ST [hearts], r0
    CALL objs_reset
    CALL events_reset
    LD r6, [lv_ptr]
    LDB r1, [r6 + LR_SR]            ; the start cell
    LD r0, [lv_w]
    MUL r1, r0
    LDB r0, [r6 + LR_SC]
    ADD r0, r1
    ST [last_cell], r0
    CALL place_on_cell
    RET

; r0 = cell index: Sixten stands on it (feet at its centre, FEET_DY down); the view moves to his screen
place_on_cell:
    MOV r1, r0
    LD r2, [lv_w]
    DIV r1, r2                      ; row
    MOV r3, r1
    MUL r3, r2
    SUB r0, r3                      ; column
    SHL r0, 5
    ADD r0, 16
    SHL r0, 4
    ST [px], r0
    SHL r1, 5
    ADD r1, FEET_DY
    SHL r1, 4
    ST [py], r1
    LDI r0, 0xFFFF
    ST [cell_i], r0
    CALL player_cell
    CALL view_reset
    LDI r0, M_PLAY
    ST [mode], r0
    RET

; the screen under Sixten's feet becomes the view: the buffer and the camera there, the screen expanded
view_reset:
    LD r0, [px]
    SHR r0, 11                      ; px / 16 / 128
    ST [scr_c], r0
    LD r1, [py]
    SHR r1, 4
    DIV r1, SCR_H
    ST [scr_r], r1
    MOV r2, r0
    SHL r2, 7
    ST [camx], r2
    ST [bufx], r2
    MOV r3, r1
    MUL r3, SCR_H
    ST [camy], r3
    ST [bufy], r3
    LDI r2, 0
    LDI r3, 0
    CALL expand
    RET

; r0, r1 = the new screen: put the old and the new screen side by side (or stacked) in the buffer and start the
; slide (8 px per frame)
slide_start:
    PUSH r0
    PUSH r1
    LD r2, [scr_c]
    CMP r0, r2
    JGT @right
    JLT @left
    LD r2, [scr_r]
    CMP r1, r2
    JGT @down
@up:                                ; new screen above: new at rows 0-11, old at rows 12-23
    MOV r2, r1
    MUL r2, SCR_H
    ST [bufy], r2
    LDI r2, 0
    LDI r3, 0
    CALL expand
    LD r0, [scr_c]
    LD r1, [scr_r]
    LDI r2, 0
    LDI r3, SCR_TR
    CALL expand
    LDI r0, 0
    LDI r1, 0 - SLIDE_STEP
    LDI r2, SCR_H / SLIDE_STEP
    JMP @go
@down:
    LD r0, [scr_c]
    LD r1, [scr_r]
    LDI r2, 0
    LDI r3, 0
    CALL expand
    POP r1
    POP r0
    PUSH r0
    PUSH r1
    LDI r2, 0
    LDI r3, SCR_TR
    CALL expand
    LDI r0, 0
    LDI r1, SLIDE_STEP
    LDI r2, SCR_H / SLIDE_STEP
    JMP @go
@right:                             ; new screen to the right: old at columns 0-15, new at 16-31
    LD r0, [scr_c]
    LD r1, [scr_r]
    LDI r2, 0
    LDI r3, 0
    CALL expand
    POP r1
    POP r0
    PUSH r0
    PUSH r1
    LDI r2, SCR_TC
    LDI r3, 0
    CALL expand
    LDI r0, SLIDE_STEP
    LDI r1, 0
    LDI r2, SCR_W / SLIDE_STEP
    JMP @go
@left:
    MOV r2, r0
    SHL r2, 7
    ST [bufx], r2
    LDI r2, 0
    LDI r3, 0
    CALL expand
    LD r0, [scr_c]
    LD r1, [scr_r]
    LDI r2, SCR_TC
    LDI r3, 0
    CALL expand
    LDI r0, 0 - SLIDE_STEP
    LDI r1, 0
    LDI r2, SCR_W / SLIDE_STEP
@go:
    ST [slide_dx], r0
    ST [slide_dy], r1
    ST [slide_n], r2
    POP r1
    POP r0
    ST [scr_c], r0
    ST [scr_r], r1
    LDI r0, M_SLIDE
    ST [mode], r0
    RET

; one frame of the slide: the camera moves, Sixten waits on the edge he crossed
slide_frame:
    LD r0, [camx]
    LD r1, [slide_dx]
    ADD r0, r1
    ST [camx], r0
    LD r0, [camy]
    LD r1, [slide_dy]
    ADD r0, r1
    ST [camy], r0
    LD r0, [slide_n]
    SUB r0, 1
    ST [slide_n], r0
    JNZ @draw
    CALL view_reset
    LDI r0, M_PLAY
    ST [mode], r0
@draw:
    CALL whirl_update               ; the weather does not wait for the slide
    CALL events_update
    CALL whirl_sound
    CALL draw_world
    RET

; r0, r1 = screen column/row, r2, r3 = destination column/row in the tile buffer: the 4 x 3 cells of the screen
; become 16 x 12 tiles (DESIGN §4.1: the type's pattern, its upper and lower halves swapped for the variant bit,
; leaves on the tile at (1, 1))
expand:
    SHL r0, 2
    ST [ex_c0], r0
    MUL r1, 3
    ST [ex_r0], r1
    ST [ex_dc], r2
    ST [ex_dr], r3
    LDI r6, 0                       ; cell row in the screen
@cy:
    LDI r5, 0                       ; cell column in the screen
@cx:
    LD r0, [ex_r0]
    ADD r0, r6
    LD r1, [lv_w]
    MUL r0, r1
    LD r1, [ex_c0]
    ADD r0, r1
    ADD r0, r5
    LDB r0, [r0 + cells]
    ST [ex_cell], r0
    AND r0, 31
    SHL r0, 4
    ADD r0, patterns
    ST [ex_pat], r0
    LDI r4, 0                       ; tile row in the cell
@ty:
    LDI r3, 0                       ; tile column in the cell
@tx:
    MOV r1, r4                      ; pattern row: the halves swap for the variant bit
    LD r2, [ex_cell]
    AND r2, 0x20
    JZ @plain
    XOR r1, 2
@plain:
    SHL r1, 2
    ADD r1, r3
    LD r2, [ex_pat]
    ADD r1, r2
    LDB r1, [r1]                    ; the tile
    LD r2, [ex_cell]
    AND r2, 0x40
    JZ @store
    CMP r3, 1
    JNE @store
    CMP r4, 1
    JNE @store
    LDI r1, T_LEAVES
@store:
    CMP r1, T_TUFT                  ; grass near the whirlwind bends towards it
    JNE @put
    MOV r0, r5
    SHL r0, 2
    ADD r0, r3
    MOV r2, r6
    SHL r2, 2
    ADD r2, r4
    CALL bend_tuft
@put:
    MOV r0, r5
    SHL r0, 2
    ADD r0, r3
    LD r2, [ex_dc]
    ADD r0, r2
    MUL r0, TB_ROWS
    MOV r2, r6
    SHL r2, 2
    ADD r2, r4
    ADD r0, r2
    LD r2, [ex_dr]
    ADD r0, r2
    STB [r0 + tbuf], r1
    ADD r3, 1
    CMP r3, 4
    JLT @tx
    ADD r4, 1
    CMP r4, 4
    JLT @ty
    ADD r5, 1
    CMP r5, 4
    JLT @cx
    ADD r6, 1
    CMP r6, 3
    JLT @cy
    RET

; the view: 16 columns, each one MAP call of 1 x 12 tiles from the buffer, offset by the camera
draw_view:
    LD r0, [camx]
    LD r1, [bufx]
    SUB r0, r1
    SHR r0, 3
    MUL r0, TB_ROWS
    LD r1, [camy]
    LD r2, [bufy]
    SUB r1, r2
    SHR r1, 3
    ADD r0, r1
    ADD r0, tbuf
    MOV r7, r0
    LDI r6, 0
@col:
    MOV r0, r7
    LDI r1, tiles_top
    LDI r2, 1
    LDI r3, SCR_TR
    MOV r4, r6
    SHL r4, 3
    LDI r5, PLAY_Y
    SYS MAP
    ADD r7, TB_ROWS
    ADD r6, 1
    CMP r6, SCR_TC
    JLT @col
    RET

; the control flags that are not under leaves (SPR clips; the HUD is drawn over anything above the view)
draw_flags:
    LD r6, [lv_ptr]
    LDB r7, [r6 + LR_NCTRL]
    LD r6, [r6 + LR_CTRLS]
@next:
    LDB r1, [r6]                    ; column
    LDB r2, [r6 + 1]                ; row
    MOV r0, r2
    LD r3, [lv_w]
    MUL r0, r3
    ADD r0, r1
    LDB r0, [r0 + cells]
    AND r0, 0x40
    JNZ @skip
    SHL r1, 5
    ADD r1, 20
    LD r3, [camx]
    SUB r1, r3
    SHL r2, 5
    ADD r2, 6 + PLAY_Y
    LD r3, [camy]
    SUB r2, r3
    LDI r0, spr_flag
    LDI r3, 0
    SYS SPR
@skip:
    ADD r6, 3
    SUB r7, 1
    JNZ @next
    RET

; the whole play screen
draw_world:
    LD r0, [lv_ptr]                 ; each world's ground has its own colour
    LDB r0, [r0 + LR_WORLD]
    LDB r0, [r0 + world_ground]
    SYS CLS
    CALL draw_view
    CALL draw_events
    CALL draw_flags
    CALL draw_objs
    CALL draw_sixten
    CALL draw_whirl
    CALL draw_rain
    CALL draw_hud
    RET

.data
world_ground: .byte 11, 11, 7, 5, 10, 11   ; (index = world): green, khaki after the storm, wet green, grey fell, green
.code
