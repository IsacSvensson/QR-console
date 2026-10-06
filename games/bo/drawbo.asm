; Drawing Bo by his pose (DESIGN.md §0.1–0.2): an upper-body sprite, a legs sprite and the board drawn with
; RECTFILL. The poses are only drawing: they never move Bo or change his box.
; d_x, d_y = sprite top-left on screen; d_f = SPR flags (1 = facing left)

draw_bo:
    LD r5, [bo_x]
    SHR r5, 4
    SUB r5, 4
    LD r0, [cam_x]
    SUB r5, r0
    ST [d_x], r5
    LD r6, [bo_y]
    SAR r6, 4
    SUB r6, 16
    LD r0, [cam_y]
    SUB r6, r0
    ST [d_y], r6
    LDI r3, 0
    LD r0, [bo_dir]
    CMP r0, 0
    JGE @flip
    LDI r3, 1
@flip:
    ST [d_f], r3
    LD r0, [inv_t]                  ; Bo blinks while he is invulnerable
    CMP r0, 0
    JEQ @draw
    LD r0, [tick]
    AND r0, 4
    JNZ @draw
    RET
@draw:
    LD r0, [bo_pose]
    SHL r0, 1
    LD r0, [r0 + pose_draw]
    JMP r0

.data
pose_draw: .word pd_ride, pd_push, pd_fast, pd_brake, pd_pop, pd_balance, pd_look, pd_crouch
           .word pd_ride, pd_trick, pd_oj, pd_hurt, pd_brake, pd_grind
.code

; upper: the upper body at (d_x + r1, d_y + r2), flags r3 (apple helmet with stem and leaf)
upper:
    LD r4, [d_x]
    ADD r1, r4
    LDI r0, spr_bo_up
    LD r4, [helmet]
    CMP r4, 0
    JEQ @spr
    LDI r0, spr_bo_up_apple
@spr:
    LD r4, [d_y]
    ADD r2, r4
    SYS SPR
    LD r4, [helmet]
    CMP r4, 0
    JEQ @done
    MOV r0, r1                      ; stem and leaf on top of the helmet
    ADD r0, 3
    SUB r2, 1
    MOV r1, r2
    LDI r2, C_BROWN
    SYS PSET
    ADD r0, 1
    LDI r2, C_GREEN
    SYS PSET
    ADD r0, 1
    SUB r1, 1
    SYS PSET
@done:
    RET

; legs: sprite r0 at (d_x, d_y + r2)
legs:
    LD r1, [d_x]
    LD r4, [d_y]
    ADD r2, r4
    LD r3, [d_f]
    SYS SPR
    RET

; board: deck on row 14 + r2 (tails a row up), light wheels below; r1 = x offset
board:
    LD r0, [d_x]
    ADD r0, r1
    LD r1, [d_y]
    ADD r1, 14
    ADD r1, r2
    MOV r5, r0
    LD r4, [board_sel]
    LDB r4, [r4 + board_colors]
    MOV r6, r4
    LDI r2, 8
    LDI r3, 1
    SYS RECTFILL
    SUB r0, 1
    SUB r1, 1
    MOV r2, r6
    SYS PSET
    ADD r0, 9
    SYS PSET
    MOV r0, r5
    ADD r0, 1
    ADD r1, 2
    LDI r2, 2
    LDI r4, C_WHITE
    SYS RECTFILL
    ADD r0, 4
    SYS RECTFILL
    RET

; the board half-way through a kickflip (upside down: wheels on top, wooden underside, tails down)
board_flip:
    LD r0, [d_x]
    LD r1, [d_y]
    ADD r1, 14
    ADD r1, r2
    MOV r5, r0
    ADD r0, 1
    LDI r2, 2
    LDI r3, 1
    LDI r4, C_WHITE
    SYS RECTFILL
    ADD r0, 4
    SYS RECTFILL
    MOV r0, r5
    ADD r1, 1
    LDI r2, 8
    LDI r4, C_BROWN
    SYS RECTFILL
    RET

; shove-it: the board half turned, seen end-on (short)
board_short:
    LD r0, [d_x]
    ADD r0, 2
    LD r1, [d_y]
    ADD r1, 14
    ADD r1, r2
    LDI r2, 4
    LDI r3, 1
    LD r4, [board_sel]
    LDB r4, [r4 + board_colors]
    SYS RECTFILL
    ADD r0, 1
    ADD r1, 1
    LDI r2, 2
    LDI r4, C_WHITE
    SYS RECTFILL
    RET

pd_ride:
    LDI r1, 0
    LDI r2, 0
    LD r3, [d_f]
    CALL upper
pd_legs_board:
    LDI r0, spr_bo_lo
    LDI r2, 8
    CALL legs
    LDI r1, 0
    LDI r2, 0
    JMP board

pd_push:                            ; kicking with the back foot, in step with the push
    LDI r1, 0
    LDI r2, 0
    LD r3, [d_f]
    CALL upper
    LD r0, [bo_kick_t]
    AND r0, 8
    JZ pd_legs_board
    LDI r0, spr_bo_push
    LDI r2, 8
    CALL legs
    LD r5, [d_x]                    ; the back leg reaching the ground behind the board
    LD r6, [d_y]
    LD r3, [d_f]
    CMP r3, 0
    JNE @left
    MOV r0, r5
    ADD r0, 2
    MOV r2, r5
    SUB r2, 2
    MOV r7, r5
    SUB r7, 4
    JMP @leg
@left:
    MOV r0, r5
    ADD r0, 5
    MOV r2, r5
    ADD r2, 9
    MOV r7, r5
    ADD r7, 9
@leg:
    MOV r1, r6
    ADD r1, 10
    MOV r3, r6
    ADD r3, 14
    LDI r4, C_KHAKI
    SYS LINE
    MOV r0, r7
    MOV r1, r6
    ADD r1, 15
    LDI r2, 3
    LDI r3, 1
    LDI r4, C_LGREY
    SYS RECTFILL
    LDI r1, 0
    LDI r2, 0
    JMP board

pd_fast:                            ; leaning forward, speed lines behind
    LDI r1, 1
    LD r3, [d_f]
    CMP r3, 0
    JEQ @f
    LDI r1, -1
@f:
    LDI r2, 0
    CALL upper
    LD r0, [d_x]
    LD r3, [d_f]
    SUB r0, 9
    CMP r3, 0
    JEQ @lines
    ADD r0, 19
@lines:
    LD r1, [d_y]
    ADD r1, 5
    LDI r2, 6
    LDI r3, 1
    LDI r4, C_YELLOW
    SYS RECTFILL
    ADD r1, 4
    LDI r4, C_ORANGE
    SYS RECTFILL
    JMP pd_legs_board

pd_brake:                           ; leaning back, dust from the back wheel
    LDI r1, -1
    LD r3, [d_f]
    CMP r3, 0
    JEQ @b
    LDI r1, 1
@b:
    LDI r2, 0
    CALL upper
    LD r0, [d_x]
    LD r3, [d_f]
    SUB r0, 3
    CMP r3, 0
    JEQ @dust
    ADD r0, 13
@dust:
    LD r1, [d_y]
    ADD r1, 14
    LD r2, [tick]
    AND r2, 3
    SUB r1, r2
    LDI r2, 2
    LDI r3, 2
    LDI r4, C_LGREY
    SYS RECTFILL
    LDI r2, 0
    JMP pd_legs_board

pd_pop:                             ; the little trick on the spot: up and down again
    LD r0, [bo_idle_t]
    SUB r0, IDLE_POP
    LDB r7, [r0 + pop_arc]
    NEG r7
    LDI r1, 0
    MOV r2, r7
    LD r3, [d_f]
    CALL upper
    LDI r0, spr_bo_lo
    MOV r2, r7
    ADD r2, 8
    CALL legs
    LDI r1, 0
    MOV r2, r7
    ADD r2, 1
    JMP board

pd_balance:                         ; on the back wheels, arms out, wobbling
    LD r1, [tick]
    SHR r1, 4
    AND r1, 1
    LD r4, [d_x]
    ADD r1, r4
    LDI r0, spr_bo_up_bal
    LD r2, [d_y]
    LD r3, [d_f]
    SYS SPR
    LDI r0, spr_bo_lo_bal
    LDI r2, 8
    CALL legs
    LD r0, [d_x]                    ; the board tilted: back tail on the ground, nose up
    LD r1, [d_y]
    ADD r1, 15
    LD r3, [d_f]
    LDI r6, 1
    CMP r3, 0
    JEQ @r
    ADD r0, 8
    LDI r6, -1
@r:
    LDI r5, 0
@seg:
    LDI r2, 2
    LDI r3, 1
    LDI r4, C_BLACK
    SYS RECTFILL
    ADD r0, r6
    ADD r0, r6
    SUB r1, 1
    ADD r5, 1
    CMP r5, 4
    JLT @seg
    RET

pd_look:                            ; looking back after a big landing: the upper body mirrored
    LDI r1, 0
    LDI r2, 0
    LD r3, [d_f]
    XOR r3, 1
    CALL upper
    JMP pd_legs_board

pd_crouch:
    LDI r1, 0
    LDI r2, 4
    LD r3, [d_f]
    CALL upper
    LDI r0, spr_bo_crouch
    LDI r2, 8
    CALL legs
    LDI r1, 0
    LDI r2, 0
    JMP board

pd_oj:                              ; a wobble
    LD r1, [tick]
    SHR r1, 2
    AND r1, 1
    LDI r2, 0
    LD r3, [d_f]
    CALL upper
    JMP pd_legs_board

pd_hurt:                            ; fallen off: upside down, the board beside him
    LDI r1, 0
    LDI r2, 6
    LD r3, [d_f]
    OR r3, 2
    CALL upper
    LDI r1, 10
    LDI r2, 0
    JMP board

pd_grind:                           ; sparks under the board
    CALL pd_ride
    LD r0, [tick]
    AND r0, 2
    JZ @none
    LD r0, [d_x]
    LD r1, [d_y]
    ADD r1, 16
    LDI r2, C_YELLOW
    SYS PSET
    ADD r0, 7
    SUB r1, 1
    LDI r2, C_ORANGE
    SYS PSET
@none:
    RET

pd_trick:
    LD r0, [trick]
    CMP r0, TR_360
    JEQ @spin
    CMP r0, TR_SUPER
    JEQ @spin
    CMP r0, TR_GRAB
    JEQ @grab
    LDI r1, 0
    LDI r2, 0
    LD r3, [d_f]
    CALL upper
    LDI r0, spr_bo_lo
    LDI r2, 8
    CALL legs
    LD r0, [trick]
    LDB r2, [r0 + trick_frames]     ; the middle half of the trick
    LD r1, [trick_t]
    MOV r4, r2
    SHR r4, 2
    CMP r1, r4
    JLT @board
    SUB r2, r4
    CMP r1, r2
    JGE @board
    CMP r0, TR_SHOVEIT
    JEQ @shove
    CMP r0, TR_KICKFLIP
    JNE @sparkle
    LDI r2, 1
    JMP board_flip
@shove:
    LDI r2, 1
    JMP board_short
@sparkle:                           ; the godissnurr glitters
    LD r0, [d_x]
    LD r1, [tick]
    AND r1, 7
    ADD r0, r1
    LD r1, [d_y]
    SUB r1, 2
    LDI r2, C_PEACH
    SYS PSET
    ADD r0, 3
    ADD r1, 9
    LDI r2, C_YELLOW
    SYS PSET
@board:
    LDI r1, 0
    LDI r2, 1
    JMP board
@spin:                              ; 360: Bo and the board turn, shown by flipping every 5 frames
    LD r3, [d_f]
    LD r0, [trick_t]
    DIV r0, 5
    AND r0, 1
    XOR r3, r0
    ST [d_f], r3
    JMP pd_ride
@grab:
    LDI r1, 0
    LDI r2, 3
    LD r3, [d_f]
    CALL upper
    LDI r0, spr_bo_crouch
    LDI r2, 7
    CALL legs
    LDI r1, 0
    LDI r2, -1
    JMP board

.data
pop_arc: .byte 0, 2, 4, 5, 6, 7, 7, 8, 8, 8, 8, 7, 7, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0
board_colors: .byte C_BLACK, C_GREEN, C_BROWN, C_RED, C_CYAN, C_PEACH, C_YELLOW, C_DGREY
.code

; ---- foreground (sparse hedges hiding secrets, drawn over Bo; DESIGN.md §14.2) --------------------------
draw_fg:
    LDI r7, 0
@next:
    LD r0, [fg_n]
    CMP r7, r0
    JGE @done
    MOV r6, r7
    SHL r6, 2
    LD r1, [r6 + fg_list]           ; column
    LDB r2, [r6 + fg_list + 2]      ; bottom row
    LDB r0, [r6 + fg_list + 3]      ; prefab
    SHL r0, 1
    LD r4, [r0 + prefab_table]
    LDB r5, [r4]                    ; w
    LDB r3, [r4 + 1]                ; h
    SUB r2, r3
    ADD r2, 1
    SHL r1, 3
    LD r0, [cam_x]
    SUB r1, r0
    SHL r2, 3
    LD r0, [cam_y]
    SUB r2, r0
    ADD r4, 2
    PUSH r7
    MOV r0, r4                      ; MAP the pattern straight from the prefab table (w columns, h rows)
    MOV r4, r1
    PUSH r5
    MOV r5, r2
    POP r2
    LDI r1, tilebank
    SYS MAP
    POP r7
    ADD r7, 1
    JMP @next
@done:
    RET
