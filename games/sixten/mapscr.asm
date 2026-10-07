; The map screen (DESIGN.md §4.1, §5): drawn from the same cell bytes as the world, 5 px per cell, in five parts
; (one per frame): fills, frame, north lines + symbols, the course in red, the legend. Then B closes it; when
; Sixten knows where he is (you_here), a blinking ring shows him, ←/→ choose a control and A sets the course.
.code

map_open:
    LD r0, [mode]
    ST [map_ret], r0
    LDI r0, M_MAP
    ST [mode], r0
    LDI r0, 0
    ST [map_t], r0
    LD r0, [lv_w]
    MUL r0, MAP_CELL
    LDI r1, 128
    SUB r1, r0
    SHR r1, 1
    ST [map_x0], r1
    LDI r0, 0                       ; select the first control not yet stamped (and not hidden)
    ST [map_sel], r0
@find:
    LD r0, [map_sel]
    CALL ctrl_visible
    CMP r0, 0
    JEQ @next
    LDI r1, 1
    LD r2, [map_sel]
    SHL r1, r2
    LD r2, [stamped]
    AND r2, r1
    JZ @found
@next:
    LD r0, [map_sel]
    ADD r0, 1
    ST [map_sel], r0
    LD r1, [lv_ptr]
    LDB r1, [r1 + LR_NCTRL]
    CMP r0, r1
    JLT @find
    LDI r0, 0
    ST [map_sel], r0
@found:
    LDI r0, SFX_MAP
    SYS SFX
    CALL map_frame
    RET

; back to where the map was opened from (the top-down view is drawn at once; a side view draws its next frame)
map_close:
    LD r0, [map_ret]
    ST [mode], r0
    CMP r0, M_PLAY
    JNE @done
    CALL draw_world
@done:
    RET

; r0 = control index -> r0 = 1 if that control is on the map (its cell is not under leaves)
ctrl_visible:
    MUL r0, 3
    LD r1, [lv_ptr]
    LD r1, [r1 + LR_CTRLS]
    ADD r1, r0
    LDB r0, [r1 + 1]
    LD r2, [lv_w]
    MUL r0, r2
    LDB r2, [r1]
    ADD r0, r2
    LDB r0, [r0 + cells]
    AND r0, 0x40
    JZ @yes
    LDI r0, 0
    RET
@yes:
    LDI r0, 1
    RET

map_frame:
    LD r0, [map_t]
    CMP r0, 5
    JAE @ready
    MOV r1, r0
    ADD r1, 1
    ST [map_t], r1
    SHL r0, 1
    LD r0, [r0 + map_parts]
    CALL r0
    RET
@ready:
    SYS BTNP
    MOV r7, r0
    AND r0, BTN_B
    JZ @keep
    CALL map_close
    RET
@keep:
    LD r0, [you_here]
    CMP r0, 0
    JEQ @done
    MOV r0, r7
    AND r0, BTN_A
    JZ @choose
    CALL set_course
    CALL map_close
    RET
@choose:
    MOV r0, r7
    AND r0, BTN_LEFT | BTN_RIGHT
    JZ @blink
    AND r7, BTN_RIGHT
    LD r6, [lv_ptr]
    LDB r6, [r6 + LR_NCTRL]         ; tries left
@step:
    LD r0, [map_sel]
    CMP r7, 0
    JEQ @back
    ADD r0, 1
    LD r1, [lv_ptr]
    LDB r1, [r1 + LR_NCTRL]
    CMP r0, r1
    JLT @stored
    LDI r0, 0
    JMP @stored
@back:
    SUB r0, 1
    JGE @stored
    LD r0, [lv_ptr]
    LDB r0, [r0 + LR_NCTRL]
    SUB r0, 1
@stored:
    ST [map_sel], r0
    CALL ctrl_visible
    CMP r0, 0
    JNE @redraw
    SUB r6, 1
    JNZ @step
@redraw:
    LDI r0, 0                       ; draw the map again with the new selection
    ST [map_t], r0
    RET
@blink:
    LD r0, [tick]                   ; Sixten: a ring alternating black and white
    AND r0, 16
    LDI r1, C_BLACK
    JZ @col
    LDI r1, C_WHITE
@col:
    ST [circ_col], r1
    LD r0, [px]
    SHR r0, 4
    MUL r0, MAP_CELL
    SHR r0, 5
    LD r1, [map_x0]
    ADD r0, r1
    LD r1, [py]
    SHR r1, 4
    MUL r1, MAP_CELL
    SHR r1, 5
    ADD r1, MAP_Y
    LDI r2, 2
    CALL circle
    LD r0, [tick]                   ; the selected control: a ring alternating black and red
    AND r0, 16
    LDI r1, C_RED
    JZ @col2
    LDI r1, C_BLACK
@col2:
    ST [circ_col], r1
    LD r0, [map_sel]
    MUL r0, 3
    LD r1, [lv_ptr]
    LD r1, [r1 + LR_CTRLS]
    ADD r1, r0
    LDB r0, [r1]
    LDB r1, [r1 + 1]
    CALL map_xy
    LDI r2, 5
    CALL circle
@done:
    RET

; the course from Sixten (he knows where he is) to the selected control: the nearest of 16 directions
set_course:
    LD r0, [map_sel]
    MUL r0, 3
    LD r1, [lv_ptr]
    LD r1, [r1 + LR_CTRLS]
    ADD r1, r0
    LDB r4, [r1]                    ; column
    LDB r5, [r1 + 1]                ; row
    SHL r4, 5
    ADD r4, 16
    LD r0, [px]
    SHR r0, 4
    SUB r4, r0
    SAR r4, 3                       ; dx / 8 (east positive)
    SHL r5, 5
    ADD r5, 16
    LD r0, [py]
    SHR r0, 4
    SUB r0, r5
    MOV r5, r0
    SAR r5, 3                       ; dy / 8 (north positive)
    LDI r6, 0                       ; direction
    LDI r7, -32768                  ; best dot product
    LDI r3, 0                       ; best direction
@dir:
    MOV r0, r6
    SHL r0, 1
    LD r1, [r0 + cos_t]
    MUL r1, r4
    LD r2, [r0 + sin_t]
    MUL r2, r5
    ADD r1, r2
    CMP r1, r7
    JLE @worse
    MOV r7, r1
    MOV r3, r6
@worse:
    ADD r6, 1
    CMP r6, 16
    JLT @dir
    ST [course_dir], r3
    LD r0, [map_sel]
    ST [course_ctrl], r0
    LDI r0, 1
    ST [course_set], r0
    LDI r0, 0
    ST [steps], r0
    LDI r0, SFX_COURSE
    SYS SFX
    RET

; r0 = column, r1 = row -> r0, r1 = the cell's centre on the map
map_xy:
    MUL r0, MAP_CELL
    LD r2, [map_x0]
    ADD r0, r2
    ADD r0, 2
    MUL r1, MAP_CELL
    ADD r1, MAP_Y + 2
    RET

map_part0:
    LDI r0, C_WHITE
    SYS CLS
    LD r0, [lv_ptr]                 ; title: the level's name, or what Sixten can do now
    LD r0, [r0 + LR_NAME]
    LD r1, [you_here]
    CMP r1, 0
    JEQ @title
    LDI r0, t_here
@title:
    LDI r1, 4
    LDI r2, 4
    LDI r3, font_d
    CALL draw_text
    LDI r0, 121                     ; north arrow
    LDI r1, 16
    LDI r2, 121
    LDI r3, 8
    LDI r4, C_BLACK
    SYS LINE
    LDI r0, 119
    LDI r1, 10
    LDI r2, 121
    LDI r3, 8
    SYS LINE
    LDI r0, 123
    SYS LINE
    LDI r0, s_n
    LDI r1, 120
    LDI r2, 1
    LDI r3, C_BLACK
    SYS TEXT
    LDI r0, 0
    LDI r1, 8
    CALL map_fill_rows
    RET

map_part1:
    LDI r0, 8
    LD r1, [lv_h]
    CALL map_fill_rows
    LD r0, [map_x0]
    SUB r0, 1
    LDI r1, MAP_Y - 1
    LD r2, [lv_w]
    MUL r2, MAP_CELL
    ADD r2, 2
    LD r3, [lv_h]
    MUL r3, MAP_CELL
    ADD r3, 2
    LDI r4, C_BLACK
    SYS RECT
    RET

; r0 = first row, r1 = end row: one RECTFILL per cell in its map colour
map_fill_rows:
    MOV r7, r0
    ST [tmp0], r1
@row:
    LD r0, [tmp0]
    CMP r7, r0
    JGE @done
    LDI r6, 0
@col:
    MOV r0, r7
    LD r1, [lv_w]
    MUL r0, r1
    ADD r0, r6
    LDB r4, [r0 + cells]
    AND r4, 31
    LDB r4, [r4 + map_fill]
    MOV r0, r6
    MUL r0, MAP_CELL
    LD r1, [map_x0]
    ADD r0, r1
    MOV r1, r7
    MUL r1, MAP_CELL
    ADD r1, MAP_Y
    LDI r2, MAP_CELL
    LDI r3, MAP_CELL
    SYS RECTFILL
    ADD r6, 1
    LD r0, [lv_w]
    CMP r6, r0
    JLT @col
    ADD r7, 1
    JMP @row
@done:
    RET

; north lines (blue, dotted every 3 px, every 30 px from x0 + 12), then every cell's symbol
map_part2:
    LD r6, [map_x0]
    ADD r6, 12
@nline:
    LDI r1, MAP_Y
@dot:
    MOV r0, r6
    LDI r2, C_BLUE
    SYS PSET
    ADD r1, 3
    LD r2, [lv_h]
    MUL r2, MAP_CELL
    ADD r2, MAP_Y
    CMP r1, r2
    JLT @dot
    ADD r6, 30
    LD r0, [lv_w]
    MUL r0, MAP_CELL
    LD r1, [map_x0]
    ADD r0, r1
    CMP r6, r0
    JLT @nline
    LDI r7, 0
@row:
    LDI r6, 0
@col:
    MOV r0, r7
    LD r1, [lv_w]
    MUL r0, r1
    ADD r0, r6
    LDB r2, [r0 + cells]
    AND r2, 31
    LDB r2, [r2 + map_sym]
    CMP r2, 0
    JEQ @next
    SHL r2, 1
    LD r2, [r2 + sym_routines]
    MOV r0, r6
    MUL r0, MAP_CELL
    LD r1, [map_x0]
    ADD r0, r1
    MOV r1, r7
    MUL r1, MAP_CELL
    ADD r1, MAP_Y
    CALL r2
@next:
    ADD r6, 1
    LD r0, [lv_w]
    CMP r6, r0
    JLT @col
    ADD r7, 1
    LD r0, [lv_h]
    CMP r7, r0
    JLT @row
    RET

; map symbols: r0, r1 = the cell's top-left on the map (5 x 5); they keep r6 and r7
sym_path_ew:
    ADD r1, 2
    LDI r2, C_BLACK
    SYS PSET
    ADD r0, 2
    SYS PSET
    ADD r0, 2
    SYS PSET
    RET
sym_path_ns:
    ADD r0, 2
    LDI r2, C_BLACK
    SYS PSET
    ADD r1, 2
    SYS PSET
    ADD r1, 2
    SYS PSET
    RET
sym_path_x:
    PUSH r0
    PUSH r1
    CALL sym_path_ew
    POP r1
    POP r0
    CALL sym_path_ns
    RET
sym_marsh:
    ADD r1, 1
    MOV r2, r0
    ADD r2, 2
    MOV r3, r1
    LDI r4, C_BLUE
    SYS LINE
    ADD r0, 2
    ADD r1, 2
    ADD r2, 2
    ADD r3, 2
    SYS LINE
    RET
sym_contours:
    ADD r1, 1
    MOV r2, r0
    ADD r2, 4
    MOV r3, r1
    LDI r4, C_BROWN
    SYS LINE
    ADD r1, 2
    ADD r3, 2
    SYS LINE
    RET
sym_ditch:
    ADD r1, 2
    MOV r2, r0
    ADD r2, 4
    MOV r3, r1
    LDI r4, C_BLUE
    SYS LINE
    RET
sym_hollow:
    LDI r2, C_BROWN
    ADD r0, 1
    ADD r1, 1
    SYS PSET
    ADD r1, 1
    SYS PSET
    ADD r0, 1
    ADD r1, 1
    SYS PSET
    ADD r0, 1
    SUB r1, 1
    SYS PSET
    SUB r1, 1
    SYS PSET
    RET
sym_house:
    ADD r0, 1
    ADD r1, 1
    LDI r2, 3
    LDI r3, 3
    LDI r4, C_BLACK
    SYS RECTFILL
    RET
sym_boulder:
    ADD r0, 2
    ADD r1, 2
    LDI r2, 2
    LDI r3, 2
    LDI r4, C_BLACK
    SYS RECTFILL
    RET
sym_fallen:
    ADD r0, 1
    ADD r1, 1
    MOV r2, r0
    ADD r2, 2
    MOV r3, r1
    ADD r3, 2
    LDI r4, C_BLACK
    SYS LINE
    ADD r1, 2
    SUB r3, 2
    SYS LINE
    RET
sym_bridge:
    ADD r1, 1
    MOV r2, r0
    ADD r2, 4
    MOV r3, r1
    LDI r4, C_BLACK
    SYS LINE
    ADD r1, 2
    ADD r3, 2
    SYS LINE
    RET
sym_cave:
    ADD r0, 1
    ADD r1, 1
    MOV r2, r0
    ADD r2, 1
    MOV r3, r1
    ADD r3, 2
    LDI r4, C_BLACK
    SYS LINE
    ADD r0, 2
    SYS LINE
    RET
sym_lone_tree:
    ADD r0, 1
    ADD r1, 1
    LDI r2, 3
    LDI r3, 3
    LDI r4, C_GREEN
    SYS RECTFILL
    RET
sym_build:
    ADD r0, 1
    ADD r1, 1
    LDI r2, 3
    LDI r3, 3
    LDI r4, C_PURPLE
    SYS RECT
    RET

sym_stream:
    ADD r0, 1
    ADD r1, 1
    MOV r2, r0
    ADD r2, 2
    MOV r3, r1
    LDI r4, C_WHITE
    SYS LINE
    ADD r1, 2
    ADD r3, 2
    ADD r0, 1
    ADD r2, 1
    SYS LINE
    RET
sym_rubble:
    LDI r2, C_BROWN
    ADD r0, 1
    ADD r1, 1
    SYS PSET
    ADD r0, 2
    SYS PSET
    SUB r0, 1
    ADD r1, 2
    SYS PSET
    RET

; the course in red: start, the controls not under leaves, goal; legs, a triangle, circles with numbers, the
; finish double circle
map_part3:
    LDI r0, 0
    ST [npts], r0
    LD r6, [lv_ptr]
    LDB r0, [r6 + LR_SC]
    LDB r1, [r6 + LR_SR]
    LDI r2, 0
    CALL pt_push
    LDI r0, 0
    ST [map_k], r0
@ctrl:
    LD r0, [map_k]
    CALL ctrl_visible
    CMP r0, 0
    JEQ @nextc
    LD r0, [map_k]
    MUL r0, 3
    LD r1, [lv_ptr]
    LD r1, [r1 + LR_CTRLS]
    ADD r1, r0
    LDB r0, [r1]
    LDB r1, [r1 + 1]
    LD r2, [map_k]
    ADD r2, 1
    CALL pt_push
@nextc:
    LD r0, [map_k]
    ADD r0, 1
    ST [map_k], r0
    LD r1, [lv_ptr]
    LDB r1, [r1 + LR_NCTRL]
    CMP r0, r1
    JLT @ctrl
    LD r6, [lv_ptr]
    LDB r0, [r6 + LR_GC]
    LDB r1, [r6 + LR_GR]
    LDI r2, 255
    CALL pt_push
    LDI r6, 0                       ; legs
@leg:
    MOV r5, r6
    SHL r5, 1
    LD r0, [r5 + pts_x]
    LD r1, [r5 + pts_y]
    LD r2, [r5 + pts_x + 2]
    LD r3, [r5 + pts_y + 2]
    LDI r4, C_RED
    SYS LINE
    ADD r6, 1
    LD r0, [npts]
    SUB r0, 1
    CMP r6, r0
    JLT @leg
    LDI r0, C_RED
    ST [circ_col], r0
    LD r0, [pts_x]                  ; start: a triangle
    LD r1, [pts_y]
    MOV r2, r0
    MOV r3, r1
    SUB r1, 3
    ADD r2, 3
    ADD r3, 2
    LDI r4, C_RED
    SYS LINE
    MOV r2, r0
    SUB r2, 3
    SYS LINE
    MOV r0, r2
    MOV r1, r3
    ADD r2, 6
    SYS LINE
    LDI r6, 1                       ; controls and the finish
@mark:
    MOV r5, r6
    SHL r5, 1
    LD r0, [r5 + pts_x]
    LD r1, [r5 + pts_y]
    LDI r2, 3
    CALL circle
    LDB r2, [r6 + pts_n]
    CMP r2, 255
    JEQ @finish
    MOV r3, r1                      ; the control's number
    SUB r3, 7
    MOV r1, r0
    ADD r1, 3
    MOV r0, r2
    MOV r2, r3
    LDI r3, C_RED
    SYS NUM
    JMP @nextm
@finish:
    LDI r2, 2
    CALL circle
@nextm:
    ADD r6, 1
    LD r0, [npts]
    CMP r6, r0
    JLT @mark
    RET

; r0 = column, r1 = row, r2 = number (0 start, 255 finish): append a course point (map pixels)
pt_push:
    PUSH r2
    CALL map_xy
    POP r2
    LD r3, [npts]
    STB [r3 + pts_n], r2
    SHL r3, 1
    ST [r3 + pts_x], r0
    ST [r3 + pts_y], r1
    LD r3, [npts]
    ADD r3, 1
    ST [npts], r3
    RET

; the legend: three columns of two (below the map)
map_part4:
    LDI r6, 0
@entry:
    MOV r5, r6
    SHL r5, 1
    LD r0, [r5 + legend_x]
    LD r1, [r5 + legend_y]
    LDI r2, 6
    LDI r3, 6
    LDB r4, [r6 + legend_fill]
    SYS RECTFILL
    LDI r4, C_DGREY
    SYS RECT
    LD r2, [r5 + legend_sym]
    CMP r2, 0
    JEQ @label
    PUSH r5
    PUSH r6
    CALL r2
    POP r6
    POP r5
@label:
    PUSH r6
    LD r0, [r5 + legend_txt]
    LD r1, [r5 + legend_x]
    ADD r1, 9
    LD r2, [r5 + legend_y]
    SUB r2, 2
    LDI r3, font_d
    CALL draw_text
    POP r6
    ADD r6, 1
    CMP r6, 6
    JLT @entry
    RET

.data
map_parts:  .word map_part0, map_part1, map_part2, map_part3, map_part4
sym_routines: .word 0, sym_path_ew, sym_path_ns, sym_path_x, sym_marsh, sym_contours, sym_ditch, sym_hollow
            .word sym_house, sym_boulder, sym_fallen, sym_bridge, sym_cave, sym_lone_tree, sym_build, sym_stream, sym_rubble
legend_x:   .word 2, 39, 82, 2, 39, 82
legend_y:   .word 104, 104, 104, 116, 116, 116
legend_fill: .byte 15, 14, 8, 15, 15, 15
legend_sym: .word 0, 0, 0, sym_contours, sym_path_ew, sym_marsh
legend_txt: .word t_lg_forest, t_lg_open, t_lg_water, t_lg_hill, t_lg_path, t_lg_marsh
s_n:        .string "N"
.code
