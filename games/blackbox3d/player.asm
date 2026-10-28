; BLACKBOX 3D — the player: BLACKBOX's player.asm (collision, using things, steps) with movement in 3D.
.code

; r0 = x, r1 = y (sprite top-left, room pixels) -> r0 = 1 if the collision box touches a solid tile
box_blocked:
    MOV r4, r0
    ADD r4, PBOX_X
    SAR r4, 3               ; x0
    MOV r5, r0
    ADD r5, PBOX_X + PBOX_W - 1
    SAR r5, 3               ; x1
    MOV r6, r1
    ADD r6, PBOX_Y
    SAR r6, 3               ; y0
    MOV r7, r1
    ADD r7, PBOX_Y + PBOX_H - 1
    SAR r7, 3               ; y1
    MOV r0, r4
    MOV r1, r6
    CALL attr_at
    AND r0, A_SOLID
    JNZ @yes
    MOV r0, r5
    MOV r1, r6
    CALL attr_at
    AND r0, A_SOLID
    JNZ @yes
    MOV r0, r4
    MOV r1, r7
    CALL attr_at
    AND r0, A_SOLID
    JNZ @yes
    MOV r0, r5
    MOV r1, r7
    CALL attr_at
    AND r0, A_SOLID
    JNZ @yes
    LDI r0, 0
    RET
@yes:
    LDI r0, 1
    RET

; The player in 3D (DESIGN.md §3.6): turn and walk with sub-pixel steps in 8.8 (pfx, pfy), while px, py (the
; BLACKBOX sprite position the rest of the game reads) follow it and collide exactly as in BLACKBOX.
player_update:
    CALL sync_pos
    LD r7, [held]
    ; ---- B: held with a direction = strafe; a short tap without one = EMP --------------------------
    MOV r0, r7
    AND r0, BTN_B
    JZ @b_up
    LD r0, [bhold]
    CMP r0, 0
    JNE @count
    LD r0, [pressed]                ; B still held from a dialogue answer: not ours
    AND r0, BTN_B
    JZ @turn
    LDI r0, 0
@count:
    ADD r0, 1
    ST [bhold], r0
    MOV r0, r7
    AND r0, BTN_LEFT | BTN_RIGHT | BTN_UP | BTN_DOWN
    JZ @turn
    LDI r0, 1
    ST [bdir], r0
    JMP @turn
@b_up:
    LD r0, [bhold]
    CMP r0, 0
    JEQ @turn
    LD r1, [bdir]
    LDI r2, 0
    ST [bhold], r2
    ST [bdir], r2
    CMP r1, 0
    JNE @turn
    CMP r0, B_TAP
    JGT @turn
    CALL use_emp
    LD r7, [held]
@turn:
    MOV r0, r7
    AND r0, BTN_B
    JNZ @walk
    LD r1, [ang]
    MOV r0, r7
    AND r0, BTN_LEFT
    JZ @no_l
    SUB r1, TURN_SPEED
@no_l:
    MOV r0, r7
    AND r0, BTN_RIGHT
    JZ @no_r
    ADD r1, TURN_SPEED
@no_r:
    AND r1, 1023
    ST [ang], r1
@walk:
    LDI r5, 0                       ; forward speed
    LDI r6, 0                       ; strafe speed (to the right)
    MOV r0, r7
    AND r0, BTN_UP
    JZ @no_u
    LDI r5, WALK_SPEED
@no_u:
    MOV r0, r7
    AND r0, BTN_DOWN
    JZ @no_d
    LDI r5, -WALK_SPEED
@no_d:
    MOV r0, r7
    AND r0, BTN_B
    JZ @moved
    MOV r0, r7
    AND r0, BTN_LEFT
    JZ @no_sl
    LDI r6, -WALK_SPEED
@no_sl:
    MOV r0, r7
    AND r0, BTN_RIGHT
    JZ @moved
    LDI r6, WALK_SPEED
@moved:
    LD r0, [ang]
    CALL sincos
    MOV r0, r3                      ; dx = (cos * f - sin * s) >> 8
    MUL r0, r5
    MOV r4, r2
    MUL r4, r6
    SUB r0, r4
    SAR r0, 8
    MUL r2, r5                      ; dy = (sin * f + cos * s) >> 8
    MUL r3, r6
    ADD r2, r3
    SAR r2, 8
    ST [mdx], r0
    ST [mdy], r2
    CALL move_axis_x
    LD r2, [mdy]
    CALL move_axis_y
    ; mdx, mdy as BLACKBOX has them (-1, 0, 1): the ORACLE agent aims ahead of the player with them
    LD r0, [mdx]
    CALL sign0
    ST [mdx], r0
    LD r0, [mdy]
    CALL sign0
    ST [mdy], r0
    LD r1, [mdx]
    OR r0, r1
    JZ @still
    LD r0, [pstep]
    ADD r0, 1
    ST [pstep], r0
@still:
    LD r0, [ang]                    ; facing: the nearest of the four directions
    ADD r0, 128
    SHR r0, 8
    ADD r0, 1
    AND r0, 3
    ST [pdir], r0
    ; a border cell is a doorway or a vent: leave through that side
    LD r0, [px]
    ADD r0, 4
    SAR r0, 3
    CMP r0, 0
    JNE @not_w
    LDI r0, SIDE_W
    JMP leave_room
@not_w:
    CMP r0, 15
    JNE @not_e
    LDI r0, SIDE_E
    JMP leave_room
@not_e:
    LD r0, [py]
    ADD r0, 4
    SAR r0, 3
    CMP r0, 0
    JNE @not_n
    LDI r0, SIDE_N
    JMP leave_room
@not_n:
    CMP r0, 14
    JNE @not_s
    LDI r0, SIDE_S
    JMP leave_room
@not_s:
    CALL fire_steps
    LD r0, [pressed]
    AND r0, BTN_A
    JZ @done
    CALL use_ahead
@done:
    RET

; px, py were moved by the game (a new room, a warp, a restart): put the 3D position in that pixel's middle
sync_pos:
    LD r0, [px]
    LD r1, [plx]
    CMP r0, r1
    JNE @sync
    LD r0, [py]
    LD r1, [ply]
    CMP r0, r1
    JEQ @done
@sync:
    LD r0, [px]
    ST [plx], r0
    ADD r0, 4
    SHL r0, 5
    ADD r0, 16
    ST [pfx], r0
    LD r0, [py]
    ST [ply], r0
    ADD r0, 4
    SHL r0, 5
    ADD r0, 16
    ST [pfy], r0
@done:
    RET

; r0 = step in x (8.8): move if BLACKBOX's collision box allows the pixel position it leads to
move_axis_x:
    LD r1, [pfx]
    ADD r1, r0
    PUSH r1
    MOV r0, r1
    SAR r0, 5
    SUB r0, 4
    PUSH r0
    LD r1, [py]
    CALL box_blocked
    POP r1
    POP r2
    CMP r0, 0
    JNE @no
    ST [pfx], r2
    ST [px], r1
    ST [plx], r1
@no:
    RET

; r2 = step in y (8.8)
move_axis_y:
    LD r1, [pfy]
    ADD r1, r2
    PUSH r1
    SAR r1, 5
    SUB r1, 4
    PUSH r1
    LD r0, [px]
    CALL box_blocked
    POP r1
    POP r2
    CMP r0, 0
    JNE @no
    ST [pfy], r2
    ST [py], r1
    ST [ply], r1
@no:
    RET

sign0:
    CMP r0, 0
    JEQ @done
    JLT @neg
    LDI r0, 1
    RET
@neg:
    LDI r0, -1
@done:
    RET

; The cell one cell in front of the player's centre, along the view: r0 = x, r1 = y
cell_ahead:
    LD r0, [ang]
    CALL sincos
    LD r0, [pfx]
    ADD r0, r3
    SAR r0, 8
    LD r1, [pfy]
    ADD r1, r2
    SAR r1, 8
    RET

; A pressed: USE trigger on the cell ahead, else the room's lift
use_ahead:
    CALL cell_ahead
    PUSH r0
    PUSH r1
    MOV r2, r1
    MOV r1, r0
    LDI r0, TK_USE
    CALL fire_trigger
    POP r2                  ; r1 = cell x, r2 = cell y
    POP r1
    CMP r0, 0
    JNE @done               ; a script handled it
    PUSH r1
    PUSH r2
    CALL actor_at           ; somebody to talk to?
    POP r2
    POP r1
    CMP r0, 0
    JLT @tile
    MOV r1, r0
    LDI r0, TK_TALK
    LDI r2, 0
    CALL fire_trigger
    RET
@tile:
    MOV r0, r1
    MOV r1, r2
    CALL tile_at
    CMP r0, T_LIFT
    JNE @not_lift
    CALL use_warp
    RET
@not_lift:
    CMP r0, T_CHARGER
    JNE @done
    CALL recharge
@done:
    RET

; r1 = cell x, r2 = cell y -> r0 = index of the NPC or boss standing there, or -1
actor_at:
    LDI r6, actors
    LDI r7, 0
@loop:
    LD r0, [n_actors]
    CMP r7, r0
    JGE @none
    LD r0, [r6 + AC_TYPE]
    CMP r0, O_NPC
    JNE @next
    LD r0, [r6 + AC_X]
    ADD r0, 4
    SAR r0, 3
    CMP r0, r1
    JNE @next
    LD r0, [r6 + AC_Y]
    ADD r0, 4
    SAR r0, 3
    CMP r0, r2
    JNE @next
    MOV r0, r7
    RET
@next:
    ADD r6, ACT_SIZE
    ADD r7, 1
    JMP @loop
@none:
    LDI r0, -1
    RET

; STEP triggers: fire once per visit when the player's centre cell matches (255 = any row/column)
fire_steps:
    LD r0, [px]
    ADD r0, 4
    SAR r0, 3
    LD r1, [py]
    ADD r1, 4
    SAR r1, 3
    MOV r2, r1
    MOV r1, r0
    LDI r0, TK_STEP
    CALL fire_trigger
    RET

