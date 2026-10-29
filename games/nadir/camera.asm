; NADIR - the M26 prototype camera: UP/DOWN walk, LEFT/RIGHT turn (accelerating), B + LEFT/RIGHT strafe, simple
; collision so the camera never enters a wall. Replaced by the player (player.asm) in M27.
.code

camera:
    LD r0, [dbg_pose]               ; test hook: jump to a named pose
    CMP r0, 0
    JEQ @control
    SUB r0, 1
    MUL r0, 6
    LD r1, [r0 + poses]
    ST [cam_x], r1
    LD r1, [r0 + poses + 2]
    ST [cam_y], r1
    LD r1, [r0 + poses + 4]
    ST [cam_a], r1
    LDI r0, 0
    ST [dbg_pose], r0
@control:
    LD r7, [btn]
    ; ---- turning (not while B is held: then LEFT/RIGHT strafe)
    MOV r0, r7
    AND r0, BTN_B
    JNZ @noturn
    MOV r0, r7
    AND r0, BTN_LEFT | BTN_RIGHT
    JZ @noturn
    LD r1, [turn_v]
    CMP r1, 0
    JNE @accel
    LDI r1, TURN_MIN - TURN_ACC
@accel:
    ADD r1, TURN_ACC
    CMP r1, TURN_MAX
    JLE @tv
    LDI r1, TURN_MAX
@tv:
    ST [turn_v], r1
    LD r2, [cam_a]
    MOV r0, r7
    AND r0, BTN_LEFT
    JZ @right
    SUB r2, r1
    JMP @setang
@right:
    ADD r2, r1
@setang:
    AND r2, 4095
    ST [cam_a], r2
    JMP @move
@noturn:
    LDI r0, 0
    ST [turn_v], r0
@move:
    ; ---- forward / back along (cos a, sin a), strafe along (-sin a, cos a); r5, r6 = dx, dy
    LDI r5, 0
    LDI r6, 0
    LD r0, [cam_a]
    CALL cos_a
    SAR r0, 6                       ; s.8
    MOV r3, r0                      ; cos
    LD r0, [cam_a]
    CALL sin_a
    SAR r0, 6
    MOV r4, r0                      ; sin
    ST [cam_c8], r3
    ST [cam_s8], r4
    MOV r0, r7
    AND r0, BTN_UP
    JZ @noup
    ADD r5, r3
    ADD r6, r4
@noup:
    MOV r0, r7
    AND r0, BTN_DOWN
    JZ @nodown
    SUB r5, r3
    SUB r6, r4
@nodown:
    MOV r0, r7
    AND r0, BTN_B
    JZ @scaled
    MOV r0, r7
    AND r0, BTN_RIGHT
    JZ @noright
    SUB r5, r4                      ; right = (-sin, cos)
    ADD r6, r3
@noright:
    MOV r0, r7
    AND r0, BTN_LEFT
    JZ @scaled
    ADD r5, r4
    SUB r6, r3
@scaled:
    MUL r5, MOVE                    ; (s.8 * MOVE) >> 8 = u8.8 step
    SAR r5, 8
    MUL r6, MOVE
    SAR r6, 8
    ; ---- x then y, each only if the camera box stays out of walls (wall sliding)
    LD r0, [cam_x]
    ADD r0, r5
    LD r1, [cam_y]
    CALL blocked
    JNZ @tryy
    LD r0, [cam_x]
    ADD r0, r5
    ST [cam_x], r0
@tryy:
    LD r0, [cam_x]
    LD r1, [cam_y]
    ADD r1, r6
    CALL blocked
    JNZ @done
    LD r1, [cam_y]
    ADD r1, r6
    ST [cam_y], r1
@done:
    RET

; r0 = x, r1 = y (u8.8) -> Z clear (JNZ) if the camera box around (x, y) touches a solid cell. Clobbers r0-r4.
blocked:
    MOV r2, r0
    SUB r2, RADIUS
    SHR r2, 8                       ; left column
    ADD r0, RADIUS
    SHR r0, 8                       ; right column
    MOV r3, r1
    SUB r3, RADIUS
    SHR r3, 8
    SHL r3, 5                       ; top row * 32
    ADD r1, RADIUS
    SHR r1, 8
    SHL r1, 5                       ; bottom row * 32
    MOV r4, r3
    ADD r4, r2
    LDB r4, [r4 + map]
    CMP r4, 0
    JNE @hit
    MOV r4, r3
    ADD r4, r0
    LDB r4, [r4 + map]
    CMP r4, 0
    JNE @hit
    MOV r4, r1
    ADD r4, r2
    LDB r4, [r4 + map]
    CMP r4, 0
    JNE @hit
    MOV r4, r1
    ADD r4, r0
    LDB r4, [r4 + map]
    CMP r4, 0
@hit:
    RET
