; The player: turning, walking and strafing with collision, opening doors, firing (SPIKE.md §4).

player_tick:
    LD r7, [btn]
    ; ---- turn (not while B is held: then LEFT/RIGHT strafe) ----
    MOV r0, r7
    AND r0, BTN_B
    JNZ @move
    LD r1, [ang]
    MOV r0, r7
    AND r0, BTN_LEFT
    JZ @noleft
    SUB r1, TURN_SPEED
@noleft:
    MOV r0, r7
    AND r0, BTN_RIGHT
    JZ @noright
    ADD r1, TURN_SPEED
@noright:
    AND r1, 1023
    ST [ang], r1
@move:
    LDI r5, 0                       ; forward speed
    LDI r6, 0                       ; strafe speed (to the right)
    MOV r0, r7
    AND r0, BTN_UP
    JZ @noup
    LDI r5, MOVE_SPEED
@noup:
    MOV r0, r7
    AND r0, BTN_DOWN
    JZ @nodown
    LDI r5, -MOVE_SPEED
@nodown:
    MOV r0, r7
    AND r0, BTN_B
    JZ @nostrafe
    MOV r0, r7
    AND r0, BTN_LEFT
    JZ @nosl
    LDI r6, -MOVE_SPEED
@nosl:
    MOV r0, r7
    AND r0, BTN_RIGHT
    JZ @nostrafe
    LDI r6, MOVE_SPEED
@nostrafe:
    LD r1, [ang]
    SHL r1, 1
    LD r2, [r1 + sin_t]             ; sin
    LD r3, [r1 + sin_t + 512]       ; cos
    ; dx = (cos * f - sin * s) >> 8, dy = (sin * f + cos * s) >> 8
    MOV r0, r3
    MUL r0, r5
    MOV r4, r2
    MUL r4, r6
    SUB r0, r4
    SAR r0, 8
    MUL r2, r5
    MUL r3, r6
    ADD r2, r3
    SAR r2, 8
    MOV r1, r2
    CALL try_move
    ; ---- B pressed: open the door in front ----
    LD r0, [btnp]
    AND r0, BTN_B
    JZ @fire
    CALL use_door
@fire:
    LD r0, [fire_cd]
    CMP r0, 0
    JEQ @canfire
    SUB r0, 1
    ST [fire_cd], r0
    JMP @timers
@canfire:
    LD r0, [btn]
    AND r0, BTN_A
    JZ @timers
    LD r0, [ammo]
    CMP r0, 0
    JEQ @timers
    SUB r0, 1
    ST [ammo], r0
    LDI r0, FIRE_DELAY
    ST [fire_cd], r0
    LDI r0, FLASH_TIME
    ST [flash], r0
    LDI r0, S_SHOT
    SYS SFX
    CALL shoot
@timers:
    LD r0, [flash]
    CMP r0, 0
    JEQ @nf
    SUB r0, 1
    ST [flash], r0
@nf:
    LD r0, [hurt]
    CMP r0, 0
    JEQ @nh
    SUB r0, 1
    ST [hurt], r0
@nh:
    RET

; move the player by (r0, r1), each axis on its own, stopping at walls and closed doors
try_move:
    PUSH r1
    LD r4, [px]
    ADD r4, r0
    MOV r5, RADIUS                  ; the leading edge in x
    CMP r0, 0
    JGE @xr
    NEG r5
@xr:
    MOV r0, r4
    ADD r0, r5
    LD r1, [py]
    SUB r1, RADIUS
    CALL solid
    JNZ @noxmove
    MOV r0, r4
    ADD r0, r5
    LD r1, [py]
    ADD r1, RADIUS
    CALL solid
    JNZ @noxmove
    ST [px], r4
@noxmove:
    POP r1
    LD r4, [py]
    ADD r4, r1
    MOV r5, RADIUS
    CMP r1, 0
    JGE @yd
    NEG r5
@yd:
    LD r0, [px]
    SUB r0, RADIUS
    MOV r1, r4
    ADD r1, r5
    CALL solid
    JNZ @noymove
    LD r0, [px]
    ADD r0, RADIUS
    MOV r1, r4
    ADD r1, r5
    CALL solid
    JNZ @noymove
    ST [py], r4
@noymove:
    RET

; r0 = x, r1 = y (8.8) -> Z clear if the cell there blocks (r0 = 1), set if free (r0 = 0); r2, r3 clobbered
solid:
    SHR r1, 8
    SHL r1, 4
    SHR r0, 8
    ADD r1, r0
    LDB r2, [r1 + map]
    CMP r2, 0
    JEQ @free
    CMP r2, CELL_DOOR_V
    JB @block
    LDB r2, [r1 + dopen]
    CMP r2, DOOR_PASS
    JAE @free
@block:
    LDI r0, 1
    CMP r0, 0
    RET
@free:
    LDI r0, 0
    CMP r0, 0
    RET

; the map cell one cell in front of the player -> r0
cell_ahead:
    LD r1, [ang]
    SHL r1, 1
    LD r2, [r1 + sin_t]
    LD r3, [r1 + sin_t + 512]
    LD r0, [px]
    ADD r0, r3
    LD r1, [py]
    ADD r1, r2
    SHR r1, 8
    SHL r1, 4
    SHR r0, 8
    ADD r0, r1
    RET
