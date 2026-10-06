; Levels: loading (terrain + objects into the column-major RAM buffer, DESIGN.md §14.1), tile unpacking
; (2 bits per pixel -> 4, §14.4) and the queries physics uses (surface, walls).

; ---- level_start: r0 = level index. Copies the header and starts the loader (mode M_LOAD). --------
level_start:
    ST [level], r0
    MUL r0, LV_REC
    ADD r0, level_table
    LD r1, [r0]
    ST [lv_ter], r1
    ST [ld_ptr], r1
    LD r1, [r0 + 2]
    ST [lv_obj], r1
    LD r1, [r0 + 4]
    ST [lv_w], r1
    SHL r1, 3
    ST [lv_wpx], r1
    LDB r1, [r0 + 6]
    ST [lv_h0], r1
    ST [ld_h], r1
    LDB r1, [r0 + 7]
    ST [lv_rows], r1
    LDB r1, [r0 + 8]
    ST [lv_world], r1
    LDB r1, [r0 + 9]
    ST [lv_start], r1
    LDB r1, [r0 + 10]
    ST [lv_music], r1
    LDI r1, 0
    ST [ld_phase], r1
    ST [ld_col], r1
    ST [ld_left], r1
    LDI r1, T_TOP
    ST [ld_top], r1
    LDI r1, T_FILL
    ST [ld_fill], r1
    LDI r1, T_WATER_TOP
    ST [ld_ltop], r1
    LDI r1, T_WATER
    ST [ld_liq], r1
    LDI r1, M_LOAD
    ST [mode], r1
    ; per-level state
    LDI r1, 0
    ST [cp_n], r1
    ST [fg_n], r1
    ST [en_n], r1
    ST [cp_next], r1
    ST [goal_t], r1
    ST [goal_said], r1
    ST [wheel_d], r1
    ST [combo_show_t], r1
    ST [lv_stars], r1
    ST [lv_part], r1
    ST [lv_apples], r1
    ST [bub_t], r1
    ST [banner_t], r1
    LDI r1, 4095
    ST [goal_col], r1
    LD r1, [lv_start]
    ST [cp_col], r1
    RET

; ---- load_step: one frame of loading -------------------------------------------------------------
load_step:
    LD r0, [ld_phase]
    SHL r0, 1
    LD r0, [r0 + ld_phases]
    CALL r0
    RET

.data
ld_phases: .word ld_terrain, ld_objects, ld_tiles, ld_tiles2, ld_finish
.code

ld_terrain:
    LDI r7, LOAD_COLS
@col:
    LD r0, [ld_col]
    LD r1, [lv_w]
    CMP r0, r1
    JAE @done
    CALL ter_column
    SUB r7, 1
    JNZ @col
    RET
@done:
    LDI r0, 1
    ST [ld_phase], r0
    RET

ld_objects:
    CALL stamp_objects
    LDI r0, 2
    ST [ld_phase], r0
    RET

ld_tiles:                           ; the world's structural tiles (one frame), then its own tiles (another)
    LDI r0, 4
    ST [ld_phase], r0
    LD r0, [lv_world]
    LD r1, [cur_world]
    CMP r0, r1
    JEQ @have
    LDI r0, 3
    ST [ld_phase], r0
    LD r6, [lv_world]
    SUB r6, 1
    SHL r6, 1
    LD r4, [r6 + ts_worlds]
    LDI r5, 1
    LDI r7, NUM_STRUCT
    CALL unpack_tiles
@have:
    RET

ld_tiles2:
    LD r0, [lv_world]
    ST [cur_world], r0
    CALL load_world_tiles
    LDI r0, 4
    ST [ld_phase], r0
    RET

ld_finish:
    CALL actors_reset
    LD r0, [ld_after]
    CMP r0, TITLE_LOAD
    JNE @play
    LDI r0, 0                       ; the title over 1-1's street
    ST [ld_after], r0
    ST [title_t], r0
    ST [cam_x], r0
    LDI r0, (LV_ROWS - 16) * 8
    ST [cam_y], r0
    LDI r0, M_TITLE
    ST [mode], r0
    LDI r0, MUS_HEMMA
    JMP set_music
@play:
    JMP play_loaded

; ---- terrain: emit the next column -----------------------------------------------------------------
ter_column:
@next:
    LD r0, [ld_left]
    CMP r0, 0
    JNE @emit
    LD r1, [ld_ptr]                 ; read a segment byte
    LDB r2, [r1]
    ADD r1, 1
    ST [ld_ptr], r1
    MOV r3, r2
    SHR r3, 5                       ; type
    AND r2, 31
    CMP r3, 7
    JEQ @special
    ST [ld_type], r3
    ADD r2, 1                       ; length
    CMP r3, 1
    JEQ @double
    CMP r3, 2
    JNE @len
@double:
    SHL r2, 1                       ; 22.5° segments: 2 columns per step
@len:
    ST [ld_left], r2
    LDI r0, 0
    ST [ld_i], r0
    JMP @next
@special:
    CMP r2, 16
    JLT @step
    CMP r2, SP_END
    JEQ @end
    SUB r2, 16
    CMP r2, 4
    JGE @liquid
    SHL r2, 1                       ; materials: top and fill codes
    LDB r0, [r2 + mat_codes]
    ST [ld_top], r0
    LDB r0, [r2 + mat_codes + 1]
    ST [ld_fill], r0
    JMP @next
@liquid:
    SUB r2, 4
    SHL r2, 1
    LDB r0, [r2 + liq_codes]
    ST [ld_ltop], r0
    LDB r0, [r2 + liq_codes + 1]
    ST [ld_liq], r0
    JMP @next
@step:
    SUB r2, 8
    LD r0, [ld_h]
    ADD r0, r2
    ST [ld_h], r0
    JMP @next
@end:                               ; should not happen before the width is reached: emit sky
    LDI r0, 5
    ST [ld_type], r0
    LDI r0, 1
    ST [ld_left], r0
@emit:
    SUB r0, 1
    ST [ld_left], r0
    LD r1, [ld_type]
    SHL r1, 1
    LD r1, [r1 + seg_emit]
    CALL r1
    LD r0, [ld_i]
    ADD r0, 1
    ST [ld_i], r0
    LD r0, [ld_col]
    ADD r0, 1
    ST [ld_col], r0
    RET

.data
seg_emit: .word se_flat, se_up22, se_down22, se_up45, se_down45, se_gap, se_liquid
.code

; r2 = row of the top tile, r3 = its code; fill below with ld_fill, empty above
se_flat:
    LDI r2, LV_ROWS
    LD r0, [ld_h]
    SUB r2, r0
    LD r3, [ld_top]
    JMP write_col
se_up45:
    LDI r2, LV_ROWS - 1
    LD r0, [ld_h]
    SUB r2, r0
    ADD r0, 1
    ST [ld_h], r0
    LDI r3, T_S45U
    JMP write_col
se_down45:
    LDI r2, LV_ROWS
    LD r0, [ld_h]
    SUB r2, r0
    SUB r0, 1
    ST [ld_h], r0
    LDI r3, T_S45D
    JMP write_col
se_up22:
    LDI r2, LV_ROWS - 1
    LD r0, [ld_h]
    SUB r2, r0
    LDI r3, T_S22U_LO
    LD r1, [ld_i]
    AND r1, 1
    JZ write_col
    ADD r0, 1
    ST [ld_h], r0
    LDI r3, T_S22U_HI
    JMP write_col
se_down22:
    LDI r2, LV_ROWS
    LD r0, [ld_h]
    SUB r2, r0
    LDI r3, T_S22D_HI
    LD r1, [ld_i]
    AND r1, 1
    JZ write_col
    SUB r0, 1
    ST [ld_h], r0
    LDI r3, T_S22D_LO
    JMP write_col
se_gap:
    LDI r2, LV_ROWS                 ; no top tile: the whole column is empty
    LDI r3, 0
    JMP write_col
se_liquid:
    LDI r2, LV_ROWS + 1
    LD r0, [ld_h]
    SUB r2, r0
    LD r3, [ld_ltop]
    LD r0, [ld_fill]
    PUSH r0
    LD r0, [ld_liq]
    ST [ld_fill], r0
    CALL write_col
    POP r0
    ST [ld_fill], r0
    RET

; write_col: column ld_col; rows 0..r2-1 empty, row r2 = r3, rows below = ld_fill
write_col:
    LD r1, [ld_col]
    SHL r1, 5
    ADD r1, lvl                     ; r1 = column base
    LDI r4, 0                       ; row
    LDI r0, 0
@sky:
    CMP r4, r2
    JGE @top
    STB [r1], r0
    ADD r1, 1
    ADD r4, 1
    JMP @sky
@top:
    CMP r4, LV_ROWS
    JGE @done
    STB [r1], r3
    ADD r1, 1
    ADD r4, 1
    LD r0, [ld_fill]
@fill:
    CMP r4, LV_ROWS
    JGE @done
    STB [r1], r0
    ADD r1, 1
    ADD r4, 1
    JMP @fill
@done:
    RET

; ---- objects: stamp every object of the level into the buffer ------------------------------------
; register use inside the handlers: r6 = column, r7 = row, r5 = param, [ld_ptr] = next byte
stamp_objects:
    LD r0, [lv_obj]
    ST [ld_ptr], r0
@next:
    LD r4, [ld_ptr]
    LDB r6, [r4]
    LDB r1, [r4 + 1]
    MOV r0, r6
    AND r0, r1
    CMP r0, 255
    JEQ @done
    MOV r0, r1
    AND r0, 1
    SHL r0, 8
    OR r6, r0                       ; column
    SHR r1, 1                       ; type
    LDB r7, [r4 + 2]                ; row
    LDB r5, [r4 + 3]                ; param
    ADD r4, 4
    ST [ld_ptr], r4
    SHL r1, 1
    LD r1, [r1 + obj_stamp]
    CALL r1
    JMP @next
@done:
    RET

.data
obj_stamp: .word os_none, os_tile, os_rect, os_apples, os_box, os_star, os_part, os_flag, os_goal
           .word os_enemy, os_fg, os_ramp, os_raild, os_platform, os_sign, os_tile, os_prefab
.code

; set_cell: r6 = column, r7 = row, r0 = code (registers preserved)
set_cell:
    PUSH r1
    MOV r1, r6
    SHL r1, 5
    ADD r1, r7
    STB [r1 + lvl], r0
    POP r1
    RET

os_none:
    RET
os_fg:                              ; foreground: remembered, drawn over Bo
    LD r1, [fg_n]
    CMP r1, MAX_FG
    JGE @full
    SHL r1, 2
    ST [r1 + fg_list], r6
    STB [r1 + fg_list + 2], r7
    STB [r1 + fg_list + 3], r5
    SHR r1, 2
    ADD r1, 1
    ST [fg_n], r1
@full:
    RET
os_tile:
    MOV r0, r5
    JMP set_cell
os_box:
    LDI r0, T_BOX
    JMP set_cell
os_star:
    MOV r0, r5
    ADD r0, T_STAR1
    JMP set_cell
os_part:
    LDI r0, T_PART
    JMP set_cell
os_flag:                            ; a checkpoint: remembered for respawning
    LD r1, [cp_n]
    CMP r1, MAX_CP
    JGE @full
    SHL r1, 1
    ST [r1 + cp_cols], r6
    ST [r1 + cp_rows], r7
    SHR r1, 1
    ADD r1, 1
    ST [cp_n], r1
@full:
    LDI r0, T_POLE
    CALL set_cell
    SUB r7, 1
    LDI r0, T_FLAG_TOP
    JMP set_cell
os_goal:
    ST [goal_col], r6
    LDI r0, T_POLE
    CALL set_cell
    SUB r7, 1
    LDI r0, T_GOAL_TOP
    JMP set_cell
os_sign:
    LDI r0, T_SIGNPOST
    CALL set_cell
    SUB r7, 1
    MOV r0, r5
    ADD r0, T_SIGN_R
    JMP set_cell

os_rect:                            ; extra byte: (w - 1) | (h - 1) << 4
    LD r4, [ld_ptr]
    LDB r3, [r4]
    ADD r4, 1
    ST [ld_ptr], r4
    MOV r2, r3
    AND r2, 15
    ADD r2, 1                       ; w
    SHR r3, 4
    ADD r3, 1                       ; h
    MOV r0, r5
@row:
    PUSH r6
    PUSH r2
@cell:
    CALL set_cell
    ADD r6, 1
    SUB r2, 1
    JNZ @cell
    POP r2
    POP r6
    SUB r7, 1
    SUB r3, 1
    JNZ @row
    RET

os_apples:                          ; param = count; extra bytes: dx << 4 | dy (signed nibble)
    LDI r0, T_APPLE
    CALL set_cell
    LD r4, [ld_ptr]
@next:
    SUB r5, 1
    JZ @done
    LDB r1, [r4]
    ADD r4, 1
    MOV r2, r1
    SHR r2, 4
    ADD r6, r2
    AND r1, 15
    CMP r1, 8
    JLT @pos
    SUB r1, 16
@pos:
    ADD r7, r1
    CALL set_cell
    JMP @next
@done:
    ST [ld_ptr], r4
    RET

os_platform:                        ; param = width
    LDI r0, T_PLAT_L
    CALL set_cell
@mid:
    ADD r6, 1
    SUB r5, 1
    CMP r5, 1
    JLE @end
    LDI r0, T_PLAT_M
    CALL set_cell
    JMP @mid
@end:
    LDI r0, T_PLAT_R
    JMP set_cell

os_raild:                           ; param = (n - 1) | down << 7
    LDI r0, T_RAILU
    LDI r2, -1
    MOV r1, r5
    AND r1, 128
    JZ @dir
    LDI r0, T_RAILD
    LDI r2, 1
@dir:
    AND r5, 127
    ADD r5, 1
@cell:
    CALL set_cell
    ADD r6, 1
    ADD r7, r2
    SUB r5, 1
    JNZ @cell
    RET

; ramp: param = (n - 1) | kind << 4 (0 45 up, 1 45 down, 2 22 up, 3 22 down); row = the bottom row
os_ramp:
    MOV r4, r5
    SHR r4, 4                       ; kind
    AND r5, 15
    ADD r5, 1                       ; n
    MOV r3, r5                      ; columns
    CMP r4, 2
    JLT @cols
    SHL r3, 1
@cols:
    LDI r2, 0                       ; i
@col:
    ; step = number of tiles under the ramp tile in this column
    MOV r1, r2
    CMP r4, 2
    JLT @h45
    SHR r1, 1
@h45:
    MOV r0, r4
    AND r0, 1
    JZ @up
    NEG r1                          ; facing left: step = n - 1 - k
    ADD r1, r5
    SUB r1, 1
@up:
    ; code: kind 0 R45U, 1 R45D, 2 R22U_LO/HI, 3 R22D_HI/LO
    MOV r0, r4
    SHL r0, 1
    PUSH r2
    AND r2, 1
    ADD r0, r2
    POP r2
    LDB r0, [r0 + ramp_codes]
    PUSH r7
    SUB r7, r1
    CALL set_cell                   ; the ramp tile on top
    POP r7
    LDI r0, T_RAMPFILL
    PUSH r7
@fill:
    CMP r1, 0
    JEQ @filled
    CALL set_cell
    SUB r7, 1
    SUB r1, 1
    JMP @fill
@filled:
    POP r7
    ADD r6, 1
    ADD r2, 1
    CMP r2, r3
    JLT @col
    RET

os_prefab:                          ; param = prefab id; (r6, r7) = bottom-left
    SHL r5, 1
    LD r4, [r5 + prefab_table]
    LDB r2, [r4]                    ; w
    LDB r3, [r4 + 1]                ; h
    ADD r4, 2
    SUB r7, r3
    ADD r7, 1                       ; top row
@row:
    PUSH r6
    PUSH r2
@cell:
    LDB r0, [r4]
    ADD r4, 1
    CMP r0, 0
    JEQ @skip
    CALL set_cell
@skip:
    ADD r6, 1
    SUB r2, 1
    JNZ @cell
    POP r2
    POP r6
    ADD r7, 1
    SUB r3, 1
    JNZ @row
    RET

; ---- tiles: unpack the world's tiles and attributes -----------------------------------------------
; load_world_tiles: the world codes 64..95 and the attribute table of cur_world (the structural codes are
; unpacked by ld_tiles the frame before)
load_world_tiles:
    LD r6, [cur_world]
    SUB r6, 1
    SHL r6, 1
    LD r4, [r6 + ts_worlds]         ; entries: struct codes 1..26, then world codes 64..95
    ADD r4, NUM_STRUCT * 3
    LDI r5, T_W0
    LDI r7, NUM_WTILES
    CALL unpack_tiles
    ; attributes: 0..63 fixed, 64..95 from the world
    LDI r1, 0
@fixed:
    LDB r0, [r1 + attr_fixed]
    STB [r1 + attr_tab], r0
    ADD r1, 1
    CMP r1, 64
    JLT @fixed
    LD r6, [cur_world]
    SUB r6, 1
    SHL r6, 1
    LD r2, [r6 + attr_worlds]
    LDI r1, 0
@world:
    LDB r0, [r2]
    STB [r1 + attr_tab + 64], r0
    ADD r2, 1
    ADD r1, 1
    CMP r1, NUM_WTILES
    JLT @world
    RET

; unpack_tiles: r4 = entries (3 bytes each: pattern, palette hi, palette lo), r5 = first code, r7 = count
unpack_tiles:
@tile:
    LDB r0, [r4 + 1]                ; palette: 4 nibbles
    MOV r1, r0
    SHR r1, 4
    STB [pal4], r1
    SHL r1, 4
    STB [pal4h], r1
    AND r0, 15
    STB [pal4 + 1], r0
    SHL r0, 4
    STB [pal4h + 1], r0
    LDB r0, [r4 + 2]
    MOV r1, r0
    SHR r1, 4
    STB [pal4 + 2], r1
    SHL r1, 4
    STB [pal4h + 2], r1
    AND r0, 15
    STB [pal4 + 3], r0
    SHL r0, 4
    STB [pal4h + 3], r0
    LDB r1, [r4]                    ; pattern
    SHL r1, 4
    ADD r1, patterns
    MOV r2, r5
    SHL r2, 5
    ADD r2, tilebank                ; destination
    LDI r6, 16
@byte:
    LDB r3, [r1]
    ADD r1, 1
    MOV r0, r3                      ; pixels 0, 1
    SHR r0, 6
    LDB r0, [r0 + pal4h]
    PUSH r0
    MOV r0, r3
    SHR r0, 4
    AND r0, 3
    LDB r0, [r0 + pal4]
    POP r3
    OR r0, r3
    STB [r2], r0
    LDB r3, [r1 - 1]
    MOV r0, r3                      ; pixels 2, 3
    SHR r0, 2
    AND r0, 3
    LDB r0, [r0 + pal4h]
    AND r3, 3
    LDB r3, [r3 + pal4]
    OR r0, r3
    STB [r2 + 1], r0
    ADD r2, 2
    SUB r6, 1
    JNZ @byte
    ADD r4, 3
    ADD r5, 1
    SUB r7, 1
    JNZ @tile
    RET

; ---- queries ---------------------------------------------------------------------------------------
; cell_attr: r1 = x px, r2 = y px -> r0 = attribute (outside the level: left/right walls, sky above/below)
cell_attr:
    CMP r2, 0
    JLT @sky
    CMP r2, LV_ROWS * 8
    JGE @sky
    LD r0, [lv_wpx]
    CMP r1, r0
    JAE @wall                       ; also x < 0 (unsigned)
    MOV r0, r1
    SHR r0, 3
    SHL r0, 5
    PUSH r2
    SHR r2, 3
    ADD r0, r2
    POP r2
    LDB r0, [r0 + lvl]
    LDB r0, [r0 + attr_tab]
    RET
@sky:
    LDI r0, 0
    RET
@wall:
    LDI r0, C_SOLID
    RET

; surface: r1 = x px, r2 = ya, r3 = yb, r6 = lowest allowed y for one-way surfaces
; -> r0 = y of the first surface in [ya, yb] scanning down (NONE if none), r5 = its attribute. r1-r3, r6, r7 kept.
surface:
    PUSH r4
    PUSH r7
    LD r0, [lv_wpx]
    CMP r1, r0
    JAE @none
    MOV r4, r2                      ; r4 = row
    SAR r4, 3
    CMP r4, 0
    JGE @row
    LDI r4, 0
@row:
    CMP r4, LV_ROWS
    JGE @none
    MOV r7, r4
    SHL r7, 3                       ; r7 = row * 8
    CMP r7, r3
    JGT @none                       ; the cell starts below yb
    MOV r0, r1
    SHR r0, 3
    SHL r0, 5
    ADD r0, r4
    LDB r0, [r0 + lvl]
    LDB r5, [r0 + attr_tab]
    MOV r0, r5
    AND r0, 15
    LDB r0, [r0 + class_flags]
    ST [t_fl], r0
    AND r0, CF_SURF
    JZ @skip
    LD r0, [t_fl]
    AND r0, CF_HMAP
    JZ @flat
    MOV r0, r5                      ; height map: y = row * 8 + 8 - h[shape][x & 7]
    SHR r0, 4
    SHL r0, 3
    PUSH r1
    AND r1, 7
    ADD r0, r1
    POP r1
    LDB r0, [r0 + heightmaps]
    ADD r7, 8
    SUB r7, r0
@flat:
    CMP r7, r2
    JLT @skip
    CMP r7, r3
    JGT @skip
    LD r0, [t_fl]
    AND r0, CF_ONEWAY
    JZ @found
    CMP r7, r6
    JLT @skip
@found:
    MOV r0, r7
    POP r7
    POP r4
    RET
@skip:
    ADD r4, 1
    JMP @row
@none:
    LDI r0, NONE
    POP r7
    POP r4
    RET

; box_hit: r1 = centre x px, r2 = feet y px -> r0 = 0 if Bo's body box is free, else 1 + column of the
; blocking cell (r1, r2 kept). The box is cx-3..cx+2 by feet-16..feet-3 (crouching: feet-11..feet-3).
box_hit:
    PUSH r3
    PUSH r4
    PUSH r5
    PUSH r6
    PUSH r7
    MOV r6, r2
    SUB r6, BOX_TOP
    LD r0, [bo_crouch]
    CMP r0, 0
    JEQ @tall
    ADD r6, BOX_TOP - BOX_TOP_C
@tall:                              ; r6 = box top
    MOV r4, r1
    SUB r4, BOX_W_L                 ; x of the left edge
    MOV r7, r1
    ADD r7, BOX_W_R                 ; x of the right edge
@colloop:
    LD r0, [lv_wpx]
    CMP r4, r0
    JAE @hit                        ; outside the level (left or right)
    MOV r3, r6                      ; y
@rowloop:
    PUSH r1
    PUSH r2
    MOV r1, r4
    MOV r2, r3
    CALL cell_attr
    POP r2
    POP r1
    AND r0, 15
    LDB r0, [r0 + class_flags]
    MOV r5, r0
    AND r0, CF_WALL
    JZ @free
    AND r5, CF_BAR
    JZ @hit
    MOV r0, r3                      ; a bar: solid only in its upper half
    AND r0, -8
    ADD r0, 4
    CMP r6, r0
    JLT @hit
@free:
    MOV r0, r2
    SUB r0, BOX_BOT
    AND r3, -8
    ADD r3, 8                       ; next cell row
    CMP r3, r0
    JLE @rowloop
    MOV r0, r7                      ; next column (the right edge last)
    AND r4, -8
    ADD r4, 8
    CMP r4, r0
    JLE @colloop
    LDI r0, 0
    JMP @out
@hit:
    MOV r0, r4
    SHR r0, 3
    ADD r0, 1
@out:
    POP r7
    POP r6
    POP r5
    POP r4
    POP r3
    RET

.data
class_flags:        ; per class: EMPTY SOLID SLOPE RAMP ONEWAY RAIL HAZARD WEAK BOX BOUNCE BAR SAND ICE APPLE STAR PICKUP
    .byte 0, CF_SURF | CF_WALL, CF_SURF | CF_HMAP | CF_DECEL, CF_SURF | CF_HMAP, CF_SURF | CF_ONEWAY
    .byte CF_SURF | CF_ONEWAY | CF_HMAP, 0, CF_SURF | CF_WALL, CF_SURF | CF_WALL, CF_SURF | CF_WALL
    .byte CF_SURF | CF_WALL | CF_BAR, CF_SURF | CF_WALL, CF_SURF | CF_WALL, 0, 0, 0
mat_codes:          ; top, fill: normal, sand, ice, alt
    .byte T_TOP, T_FILL, T_SAND, T_FILL, T_ICE, T_FILL, TW_GRASS, TW_DIRT
liq_codes:          ; top, body: water, chocolate
    .byte T_WATER_TOP, T_WATER, T_CHOC_TOP, T_CHOC
ramp_codes:
    .byte T_R45U, T_R45U, T_R45D, T_R45D, T_R22U_LO, T_R22U_HI, T_R22D_HI, T_R22D_LO
.code
