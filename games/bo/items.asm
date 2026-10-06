; Things Bo touches: apples, stars, parts, power-ups, hazards (DESIGN.md §5–7); breakables; checkpoints and the
; goal (§6, §8.1).

; touch: every cell the body box overlaps
touch:
    CALL feet
    MOV r6, r2
    SUB r6, BOX_TOP
    LD r0, [bo_crouch]
    CMP r0, 0
    JEQ @tall
    ADD r6, BOX_TOP - BOX_TOP_C
@tall:                              ; r6 = top y
    MOV r4, r1
    SUB r4, BOX_W_L                 ; r4 = x
    ADD r1, BOX_W_R
    ST [t_hit], r1                  ; right edge
    ST [t_foot], r2
@col:
    MOV r3, r6
@row:
    PUSH r3
    PUSH r4
    PUSH r6
    MOV r1, r4
    MOV r2, r3
    CALL cell_attr
    AND r0, 15
    SHL r0, 1
    LD r0, [r0 + touch_class]
    CMP r0, 0
    JEQ @skip
    CALL r0                         ; r4 = x, r3 = y of the touched cell
@skip:
    POP r6
    POP r4
    POP r3
    LD r0, [bo_state]
    CMP r0, ST_DEAD
    JGE @done
    LD r0, [t_foot]
    SUB r0, BOX_BOT
    AND r3, -8
    ADD r3, 8
    CMP r3, r0
    JLE @row
    LD r0, [t_hit]
    AND r4, -8
    ADD r4, 8
    CMP r4, r0
    JLE @col
@done:
    RET

.data
touch_class: .word 0, 0, 0, 0, 0, 0, t_hazard, 0, 0, 0, 0, 0, 0, t_apple, t_star, t_pickup
.code

; clear_touched: empties the cell at (r4, r3) px; r1 = its address in lvl
clear_touched:
    MOV r1, r4
    SHR r1, 3
    SHL r1, 5
    MOV r0, r3
    SHR r0, 3
    ADD r1, r0
    ADD r1, lvl
    LDI r0, 0
    STB [r1], r0
    RET

t_hazard:
    JMP bo_die

t_apple:
    CALL clear_touched
    LD r0, [apples]
    ADD r0, 1
    ST [apples], r0
    LD r1, [apples_life]            ; 100 apples: one more life (at most 9)
    ADD r1, 1
    CMP r1, 100
    JLT @nolife
    LDI r1, 0
    LD r0, [lives]
    CMP r0, 9
    JGE @nolife
    ADD r0, 1
    ST [lives], r0
    PUSH r1
    LDI r0, TX_ETT_LIV_TILL
    CALL say
    POP r1
@nolife:
    ST [apples_life], r1
    ; a pling that rises with every apple of a row
    LD r0, [apple_chain]
    LD r1, [apple_chain_t]
    CMP r1, 0
    JNE @chain
    LDI r0, 0
@chain:
    ADD r0, 1
    CMP r0, 12
    JLE @c
    LDI r0, 12
@c:
    ST [apple_chain], r0
    LDI r1, 40
    ST [apple_chain_t], r1
    SHL r0, 1
    LD r1, [r0 + apple_notes]
    JMP apple_pling

t_star:
    PUSH r3
    MOV r1, r4
    MOV r2, r3
    CALL cell_attr
    POP r3
    SHR r0, 4                       ; star number 0..2
    LDI r1, 1
    SHL r1, r0
    LD r0, [lv_stars]
    OR r0, r1
    ST [lv_stars], r0
    CALL clear_touched
    LDI r0, TX_EN_STJARNA
    CALL say
    LDI r0, SFX_STAR
    CALL play_sfx
    RET

t_pickup:
    PUSH r3
    MOV r1, r4
    MOV r2, r3
    CALL cell_attr
    POP r3
    SHR r0, 4
    PUSH r0
    CALL clear_touched
    POP r0
    SHL r0, 1
    LD r0, [r0 + pickup_handlers]
    JMP r0

.data
pickup_handlers: .word got_pommes, got_godis, got_apple_helmet, got_part
apple_notes: .word 0, 523, 587, 659, 698, 784, 880, 988, 1047, 1175, 1319, 1397, 1568
.code

got_part:
    LDI r0, 1
    ST [lv_part], r0
    LD r1, [level]                  ; the part of the level: wheel, trucks, design, sticker (by level number)
    AND r1, 3
    LDB r0, [r1 + part_lines]
    CALL say
    LDI r0, SFX_STAR
    CALL play_sfx
    RET

got_pommes:
    LDI r0, PW_POMMES
    LDI r1, 600
    LDI r2, TX_POMMES
    JMP power_on
got_godis:
    LDI r0, PW_GODIS
    LDI r1, 900
    LDI r2, TX_GODIS
power_on:                           ; r0 = kind, r1 = frames, r2 = line (the newest replaces the other, §5)
    ST [pw_kind], r0
    ST [pw_t], r1
    MOV r0, r2
    CALL say
    LDI r0, SFX_POWER
    CALL play_sfx
    RET
got_apple_helmet:
    LDI r0, 1
    ST [helmet], r0
    LDI r0, TX_APPELHJALM
    CALL say
    LDI r0, SFX_POWER
    CALL play_sfx
    RET

; godis_jump: the GODISSNURR is a new ollie in mid-air, once per airtime
godis_jump:
    LD r0, [PH_JUMP_V]
    NEG r0
    ST [bo_vy], r0
    LDI r0, 1
    ST [godis_used], r0
    RET

.data
part_lines: .byte TX_ETT_HJUL, TX_TRUCKAR, TX_EN_DESIGN, TX_ETT_MARKE
.code

; ---- breakables (DESIGN.md §3.7) -------------------------------------------------------------------------
; break_at: r0 = column, r1 = row of a WEAK or BOX cell Bo landed on. Finds its object and clears exactly
; its cells; a box leaves its content where it was.
break_at:
    MOV r6, r0
    MOV r7, r1
    LD r4, [lv_obj]
@next:
    LDB r0, [r4]
    LDB r1, [r4 + 1]
    MOV r2, r0
    AND r2, r1
    CMP r2, 255
    JEQ @none
    MOV r2, r1
    AND r2, 1
    SHL r2, 8
    OR r0, r2                       ; r0 = column
    SHR r1, 1                       ; r1 = type
    LDB r2, [r4 + 2]                ; row (bottom)
    LDB r3, [r4 + 3]                ; param
    CMP r1, OT_BOX
    JEQ @box
    CMP r1, OT_TILE
    JEQ @tile
    CMP r1, OT_RECT
    JEQ @rect
@skip:
    CALL obj_len                    ; r5 = length of this record
    ADD r4, r5
    JMP @next
@box:
    CMP r0, r6
    JNE @skip
    CMP r2, r7
    JNE @skip
    MOV r5, r3                      ; content
    LDI r0, 0
    CALL set_cell                   ; r6, r7 = the box cell
    LDI r0, SFX_BREAK
    CALL play_sfx
    SHL r5, 1
    LD r5, [r5 + box_content]
    JMP r5
@tile:
    CMP r3, T_WEAK
    JNE @skip
    LDI r5, 0                       ; a 1x1 weak block
    JMP @inside
@rect:
    CMP r3, T_WEAK
    JNE @skip
    LDB r5, [r4 + 4]
@inside:                            ; r0 = column, r2 = bottom row, r5 = (w-1) | (h-1) << 4
    CMP r6, r0
    JLT @skip
    MOV r3, r5
    AND r3, 15
    ADD r3, r0
    CMP r6, r3
    JGT @skip
    CMP r7, r2
    JGT @skip
    MOV r3, r5
    SHR r3, 4
    NEG r3
    ADD r3, r2
    CMP r7, r3
    JLT @skip
    ; clear the rectangle
    MOV r6, r0
    MOV r7, r2
    MOV r3, r5
    SHR r3, 4
    ADD r3, 1                       ; h
    AND r5, 15
    ADD r5, 1                       ; w
    LDI r0, 0
@crow:
    PUSH r6
    PUSH r5
@ccell:
    CALL set_cell
    ADD r6, 1
    SUB r5, 1
    JNZ @ccell
    POP r5
    POP r6
    SUB r7, 1
    SUB r3, 1
    JNZ @crow
    LDI r0, SFX_BREAK
    CALL play_sfx
@none:
    RET

; box contents: r6, r7 = the cell the box was in
bc_apples:                          ; five apples upwards (into empty cells)
    LDI r5, 5
@a:
    CMP r7, 0
    JLT @done
    MOV r1, r6
    SHL r1, 5
    ADD r1, r7
    LDB r0, [r1 + lvl]
    CMP r0, 0
    JNE @n
    LDI r0, T_APPLE
    CALL set_cell
@n:
    SUB r7, 1
    SUB r5, 1
    JNZ @a
@done:
    RET
bc_big:
    LDI r0, T_BIGAPPLE
    JMP set_cell
bc_pommes:
    LDI r0, T_POMMES
    JMP set_cell
bc_godis:
    LDI r0, T_GODIS
    JMP set_cell

.data
box_content: .word bc_apples, bc_big, bc_pommes, bc_godis
; extra bytes after the 4-byte record, per object type (APPLES: param - 1)
obj_extra: .byte 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
.code

; obj_len: r4 = record -> r5 = its length in bytes (r0-r3 kept)
obj_len:
    PUSH r0
    LDB r0, [r4 + 1]
    SHR r0, 1
    LDB r5, [r0 + obj_extra]
    CMP r0, OT_APPLES
    JNE @n
    LDB r5, [r4 + 3]
    SUB r5, 1
@n:
    ADD r5, 4
    POP r0
    RET

; ---- checkpoints and the goal --------------------------------------------------------------------------
checkpoints:
    CALL feet
    LD r0, [cp_next]
    LD r2, [cp_n]
    CMP r0, r2
    JGE @goal
    SHL r0, 1
    LD r2, [r0 + cp_cols]
    SHL r2, 3
    ADD r2, 4
    CMP r1, r2
    JB @goal
    LD r2, [r0 + cp_cols]           ; passed a flag: the new respawn point, the flag turns green
    ST [cp_col], r2
    LD r3, [r0 + cp_rows]
    SHR r0, 1
    ADD r0, 1
    ST [cp_next], r0
    MOV r6, r2
    MOV r7, r3
    SUB r7, 1
    LDI r0, T_FLAG_DONE
    CALL set_cell
    LDI r0, SFX_FLAG
    CALL play_sfx
    CALL feet
@goal:
    LD r0, [goal_t]
    CMP r0, 0
    JNE @counting
    LD r2, [goal_col]
    SHL r2, 3
    CMP r1, r2
    JB @done
    LDI r0, 1                       ; at the goal: Bo brakes in by himself
    ST [goal_t], r0
    LDI r0, SFX_FLAG
    CALL play_sfx
@done:
    RET
@counting:
    ADD r0, 1
    ST [goal_t], r0
    LD r1, [bo_vx]                  ; standing still: JAG GJORDE DET!
    CMP r1, 0
    JNE @rolling
    LD r1, [goal_said]
    CMP r1, 0
    JNE @rolling
    LDI r1, 1
    ST [goal_said], r1
    LDI r0, TX_JAG_GJORDE_DET
    CALL say
    LD r0, [goal_t]
@rolling:
    CMP r0, GOAL_T
    JLT @done
    JMP level_done
