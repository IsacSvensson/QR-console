; BLACKBOX — the player: movement, collision, doorways, using things.
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

player_update:
    ; intended movement from the D-pad
    LDI r4, 0
    LDI r5, 0
    LD r0, [held]
    MOV r1, r0
    AND r1, BTN_LEFT
    JZ @no_l
    LDI r4, -1
@no_l:
    MOV r1, r0
    AND r1, BTN_RIGHT
    JZ @no_r
    LDI r4, 1
@no_r:
    MOV r1, r0
    AND r1, BTN_UP
    JZ @no_u
    LDI r5, -1
@no_u:
    MOV r1, r0
    AND r1, BTN_DOWN
    JZ @no_d
    LDI r5, 1
@no_d:
    ST [mdx], r4
    ST [mdy], r5
    ; facing: horizontal wins when both are pressed
    CMP r5, 0
    JEQ @face_h
    LDI r0, DIR_N
    CMP r5, 0
    JLT @set_v
    LDI r0, DIR_S
@set_v:
    ST [pdir], r0
@face_h:
    CMP r4, 0
    JEQ @faced
    LDI r0, DIR_W
    CMP r4, 0
    JLT @set_h
    LDI r0, DIR_E
@set_h:
    ST [pdir], r0
@faced:
    CALL move_x
    CALL move_y
    ; walking animation
    LD r0, [mdx]
    LD r1, [mdy]
    OR r0, r1
    JZ @still
    LD r0, [pstep]
    ADD r0, 1
    ST [pstep], r0
@still:
    ; doorways: beyond the room edge = leave through that side
    LD r0, [px]
    CMP r0, 0
    JGE @not_w
    LDI r0, SIDE_W
    CALL leave_room
    RET
@not_w:
    CMP r0, PX_MAX
    JLE @not_e
    LDI r0, SIDE_E
    CALL leave_room
    RET
@not_e:
    LD r0, [py]
    CMP r0, 0
    JGE @not_n
    LDI r0, SIDE_N
    CALL leave_room
    RET
@not_n:
    CMP r0, PY_MAX
    JLE @not_s
    LDI r0, SIDE_S
    CALL leave_room
    RET
@not_s:
    CALL fire_steps
    LD r0, [pressed]
    AND r0, BTN_A
    JZ @done
    CALL use_ahead
@done:
    RET

; Horizontal step with corner sliding: if blocked, but free NUDGE pixels up or down, slide 1 px that way.
move_x:
    LD r0, [mdx]
    CMP r0, 0
    JEQ @done
    LD r0, [px]
    LD r1, [mdx]
    ADD r0, r1
    LD r1, [py]
    CALL box_blocked
    CMP r0, 0
    JNE @blocked
    LD r0, [px]
    LD r1, [mdx]
    ADD r0, r1
    ST [px], r0
    RET
@blocked:
    LD r0, [mdy]
    CMP r0, 0
    JNE @done
    LD r0, [px]
    LD r1, [mdx]
    ADD r0, r1
    LD r1, [py]
    SUB r1, NUDGE
    CALL box_blocked
    CMP r0, 0
    JNE @try_down
    LD r0, [px]
    LD r1, [py]
    SUB r1, 1
    CALL box_blocked
    CMP r0, 0
    JNE @try_down
    LD r0, [py]
    SUB r0, 1
    ST [py], r0
    RET
@try_down:
    LD r0, [px]
    LD r1, [mdx]
    ADD r0, r1
    LD r1, [py]
    ADD r1, NUDGE
    CALL box_blocked
    CMP r0, 0
    JNE @done
    LD r0, [px]
    LD r1, [py]
    ADD r1, 1
    CALL box_blocked
    CMP r0, 0
    JNE @done
    LD r0, [py]
    ADD r0, 1
    ST [py], r0
@done:
    RET

move_y:
    LD r0, [mdy]
    CMP r0, 0
    JEQ @done
    LD r0, [px]
    LD r1, [py]
    LD r2, [mdy]
    ADD r1, r2
    CALL box_blocked
    CMP r0, 0
    JNE @blocked
    LD r0, [py]
    LD r1, [mdy]
    ADD r0, r1
    ST [py], r0
    RET
@blocked:
    LD r0, [mdx]
    CMP r0, 0
    JNE @done
    LD r0, [px]
    SUB r0, NUDGE
    LD r1, [py]
    LD r2, [mdy]
    ADD r1, r2
    CALL box_blocked
    CMP r0, 0
    JNE @try_right
    LD r0, [px]
    SUB r0, 1
    LD r1, [py]
    CALL box_blocked
    CMP r0, 0
    JNE @try_right
    LD r0, [px]
    SUB r0, 1
    ST [px], r0
    RET
@try_right:
    LD r0, [px]
    ADD r0, NUDGE
    LD r1, [py]
    LD r2, [mdy]
    ADD r1, r2
    CALL box_blocked
    CMP r0, 0
    JNE @done
    LD r0, [px]
    ADD r0, 1
    LD r1, [py]
    CALL box_blocked
    CMP r0, 0
    JNE @done
    LD r0, [px]
    ADD r0, 1
    ST [px], r0
@done:
    RET

; The cell in front of the player: r0 = x, r1 = y
cell_ahead:
    LD r2, [pdir]
    LD r0, [px]
    ADD r0, 4
    LDB r3, [r2 + ahead_dx]
    SHL r3, 8
    SAR r3, 8               ; sign-extend the byte
    ADD r0, r3
    SAR r0, 3
    LD r1, [py]
    ADD r1, 4
    LDB r3, [r2 + ahead_dy]
    SHL r3, 8
    SAR r3, 8
    ADD r1, r3
    SAR r1, 3
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

.data
ahead_dx: .byte 0, 8, 0, -8
ahead_dy: .byte -8, 0, 8, 0
