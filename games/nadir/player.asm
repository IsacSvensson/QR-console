; NADIR - the player (DESIGN §5): double tap side step, accelerating turns, walking with acceleration, movement
; with wall sliding against walls, masked walls and doors that are not fully open, head bob. The camera is the
; player's eye: cam_x, cam_y, cam_a. Control scheme S1 (B = strafe modifier, set by init) unless ctl_s1 is 0 (S2: B walks forward).
.code

player:
    LD r0, [dbg_pose]               ; test hook: jump to a named pose, at rest
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
    ST [walk_v], r0
    ST [dash_n], r0
@control:
    LD r4, [cam_y]                  ; the props near the player's cell (collision, pickups)
    SHR r4, 8
    SHL r4, 5
    LD r0, [cam_x]
    SHR r0, 8
    ADD r4, r0
    LDI r0, pnear
    LDI r5, 3
    CALL prop_set
    LD r7, [btn]
    ; ---- 1 double tap: LEFT (RIGHT) pressed this frame, no side step running, not B in S1
    LD r0, [dash_n]
    CMP r0, 0
    JNE @notap
    CALL @s1b
    JNZ @notap
    LD r6, [btnp]
    MOV r0, r6
    AND r0, BTN_LEFT
    JZ @tapr
    LDI r1, -1
    CALL @tap
    JMP @notap
@tapr:
    MOV r0, r6
    AND r0, BTN_RIGHT
    JZ @notap
    LDI r1, 1
    CALL @tap
@notap:
    ; ---- 2 turning: not during a side step, not with B in S1; LEFT wins over RIGHT
    LD r0, [dash_n]
    CMP r0, 0
    JNE @noturn
    CALL @s1b
    JNZ @noturn
    LDI r1, -1
    MOV r0, r7
    AND r0, BTN_LEFT
    JNZ @turn
    LDI r1, 1
    MOV r0, r7
    AND r0, BTN_RIGHT
    JZ @noturn
@turn:
    LD r2, [turn_dir]
    LD r3, [turn_k]
    CMP r2, r1
    JEQ @same
    LDI r3, 0
@same:
    CMP r3, 14                      ; k beyond 14 turns at TURN_MAX anyway: keep it from overflowing
    JGE @kset
    ADD r3, 1
@kset:
    ST [turn_k], r3
    ST [turn_dir], r1
    SUB r3, 1
    MUL r3, TURN_ACC
    ADD r3, TURN_MIN
    CMP r3, TURN_MAX
    JLE @tv
    LDI r3, TURN_MAX
@tv:
    MUL r3, r1
    LD r2, [cam_a]
    ADD r2, r3
    AND r2, 4095
    ST [cam_a], r2
    JMP @walk
@noturn:
    LDI r0, 0
    ST [turn_k], r0
    ST [turn_dir], r0
@walk:
    ; ---- 3 walking: the target speed, approached by WALK_ACC per frame
    LDI r1, WALK_MAX
    MOV r0, r7
    AND r0, BTN_UP
    JNZ @tgt
    LD r0, [ctl_s1]
    CMP r0, 0
    JNE @noB
    MOV r0, r7
    AND r0, BTN_B
    JNZ @tgt
@noB:
    LDI r1, -BACK_MAX
    MOV r0, r7
    AND r0, BTN_DOWN
    JNZ @tgt
    LDI r1, 0
@tgt:
    LD r0, [walk_v]
    CMP r0, r1
    JEQ @vset
    JLT @faster
    SUB r0, WALK_ACC
    CMP r0, r1
    JGE @vset
    MOV r0, r1
    JMP @vset
@faster:
    ADD r0, WALK_ACC
    CMP r0, r1
    JLE @vset
    MOV r0, r1
@vset:
    ST [walk_v], r0
    ; ---- 4 the side speed l: the side step, or B + LEFT/RIGHT in S1
    LDI r1, 0
    LD r0, [dash_n]
    CMP r0, 0
    JEQ @nodash
    SUB r0, 1
    ST [dash_n], r0
    LD r1, [dash_dir]
    MUL r1, DASH_V
    JMP @lat
@nodash:
    CALL @s1b
    JZ @lat
    LDI r1, -WALK_MAX
    MOV r0, r7
    AND r0, BTN_LEFT
    JNZ @lat
    LDI r1, WALK_MAX
    MOV r0, r7
    AND r0, BTN_RIGHT
    JNZ @lat
    LDI r1, 0
@lat:
    PUSH r1
    LD r0, [cam_a]
    CALL cos_a
    SAR r0, 6                       ; s.8
    MOV r3, r0
    LD r0, [cam_a]
    CALL sin_a
    SAR r0, 6
    MOV r4, r0
    ST [cam_c8], r3
    ST [cam_s8], r4
    POP r1
    LD r0, [walk_v]
    MOV r5, r0
    MUL r5, r3
    MOV r2, r1
    MUL r2, r4
    SUB r5, r2
    SAR r5, 8                       ; dx = (v cos - l sin) >> 8
    MOV r6, r0
    MUL r6, r4
    MOV r2, r1
    MUL r2, r3
    ADD r6, r2
    SAR r6, 8                       ; dy = (v sin + l cos) >> 8
    ; ---- 5 x then y, each only if the box stays in passable cells (wall sliding)
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
    JNZ @bob
    LD r1, [cam_y]
    ADD r1, r6
    ST [cam_y], r1
@bob:
    ; ---- 6 head bob: the phase advances by |v|; at rest it runs on to the next zero of the table
    LD r0, [walk_v]
    CMP r0, 0
    JGE @abs
    NEG r0
@abs:
    LD r1, [bob_ph]
    CMP r0, 0
    JNE @adv
    MOV r2, r1
    SHR r2, BOB_SHIFT
    AND r2, 7
    JZ @bobset
    LDI r0, 1 << BOB_SHIFT
@adv:
    MOV r2, r1
    ADD r1, r0
    ST [bob_ph], r1
    XOR r2, r1                      ; the phase passed a half period (index 0 or 8): a footstep while walking
    SHR r2, BOB_SHIFT + 3
    JZ @bobset
    LD r2, [walk_v]
    CMP r2, 0
    JEQ @bobset
    LDI r0, SFX_STEP
    CALL play_sfx
@bobset:
    LDI r0, 0
    LD r1, [opt_nobob]
    CMP r1, 0
    JNE @bobst
    LD r0, [bob_ph]
    SHR r0, BOB_SHIFT
    AND r0, 15
    SHL r0, 1
    LD r0, [r0 + bob_tab]
@bobst:
    ST [bob], r0
    RET
; Z clear (JNZ) when S1 is on and B is held (r7 = buttons). Clobbers r0.
@s1b:
    LD r0, [ctl_s1]
    CMP r0, 0
    JEQ @s1r
    MOV r0, r7
    AND r0, BTN_B
@s1r:
    RET
; r1 = tap direction: starts a side step if the last tap was the same direction at most DTAP_FRAMES ago,
; else registers this tap. Clobbers r0, r2.
@tap:
    LD r0, [tap_dir]
    CMP r0, r1
    JNE @reg
    LD r0, [tick]
    LD r2, [tap_tick]
    SUB r0, r2
    CMP r0, DTAP_FRAMES + 1
    JAE @reg
    LDI r0, DASH_FRAMES
    ST [dash_n], r0
    ST [dash_dir], r1
    LDI r0, 0
    ST [tap_dir], r0
    RET
@reg:
    ST [tap_dir], r1
    LD r0, [tick]
    ST [tap_tick], r0
    RET

; r0 = x, r1 = y (u8.8) -> Z clear (JNZ) if the player's box +-P_RAD around (x, y) touches a cell that is not
; passable, overlaps a blocking prop near the player's cell (DESIGN §3.12) or a living enemy's box (§6.3).
; Clobbers r0-r4.
blocked:
    PUSH r0
    PUSH r1
    LDI r2, P_RAD
    LDI r3, pnear
    CALL box_free
    POP r1
    POP r0
    JNZ @hit
    LDI r4, enemies                 ; |x - ex| < P_RAD + E_RAD and |y - ey| < P_RAD + E_RAD
@en:
    CMP r4, enemies + NUM_ENEMIES * E_SIZE
    JAE @free
    LDB r2, [r4 + E_ST]
    CMP r2, ST_DEAD
    JEQ @ne
    LD r2, [r4 + E_X]
    SUB r2, r0
    ADD r2, P_RAD + E_RAD - 1
    CMP r2, 2 * (P_RAD + E_RAD) - 1
    JAE @ne
    LD r2, [r4 + E_Y]
    SUB r2, r1
    ADD r2, P_RAD + E_RAD - 1
    CMP r2, 2 * (P_RAD + E_RAD) - 1
    JAE @ne
    CMP r4, 0                       ; blocked: Z clear
    RET
@ne:
    ADD r4, E_SIZE
    JMP @en
@free:
    CMP r4, r4
@hit:
    RET

; r0 = x, r1 = y (u8.8), r2 = half size, r3 = a 3-byte set of nearby props -> Z clear (JNZ) if the box +-r2
; around (x, y) touches a cell that is not passable or overlaps a blocking prop of the set. Clobbers r0-r4.
.var bk_r
.var bk_set
.var bk_p                           ; the props of the set's current byte
.var bk_k
.var bk_bits
.var bk_q
box_free:
    ST [bk_x], r0
    ST [bk_y], r1
    ST [bk_r], r2
    ST [bk_set], r3
    MOV r4, r2
    MOV r2, r0
    SUB r2, r4
    SHR r2, 8                       ; left column
    ADD r0, r4
    SHR r0, 8                       ; right column
    MOV r3, r1
    SUB r3, r4
    SHR r3, 8
    SHL r3, 5                       ; top row * 32
    ADD r1, r4
    SHR r1, 8
    SHL r1, 5                       ; bottom row * 32
    MOV r4, r3
    ADD r4, r2
    CALL passable
    JNZ @hit
    MOV r4, r3
    ADD r4, r0
    CALL passable
    JNZ @hit
    MOV r4, r1
    ADD r4, r2
    CALL passable
    JNZ @hit
    MOV r4, r1
    ADD r4, r0
    CALL passable
    JNZ @hit
    ; ---- blocking props: |x - px| < r + half and |y - py| < r + half (none near: nothing to test)
    LD r3, [bk_set]
    LDB r4, [r3]
    LDB r0, [r3 + 1]
    OR r4, r0
    LDB r0, [r3 + 2]
    OR r4, r0
    JZ @free
    LDI r4, props                   ; the set's bits, byte by byte: prop 8k + i is bit i of byte k
    ST [bk_p], r4
    LDI r0, 0
    ST [bk_k], r0
@byte:
    LD r0, [bk_k]
    CMP r0, 3
    JAE @free
    LD r3, [bk_set]
    ADD r3, r0
    LDB r0, [r3]
    LD r4, [bk_p]
@bit:
    CMP r0, 0
    JEQ @nextb
    MOV r1, r0
    AND r1, 1
    JZ @skip
    ST [bk_bits], r0
    ST [bk_q], r4
    LDB r2, [r4 + P_ALIVE]          ; a burst barrel no longer blocks (DESIGN §6.6)
    CMP r2, 0
    JEQ @np
    LDB r2, [r4 + P_TYPE]
    SHL r2, 4
    LD r2, [r2 + spr_type + 4]      ; half-size, 0 = not blocking
    CMP r2, 0
    JEQ @np
    LD r0, [bk_r]
    ADD r2, r0
    SUB r2, 1
    MOV r0, r2
    SHL r0, 1
    ADD r0, 1                       ; inside if d + reach - 1 < 2 reach - 1
    LD r3, [bk_x]
    LD r1, [r4 + P_X]
    SUB r3, r1
    ADD r3, r2
    CMP r3, r0
    JAE @np
    LD r3, [bk_y]
    LD r1, [r4 + P_Y]
    SUB r3, r1
    ADD r3, r2
    CMP r3, r0
    JAE @np
    CMP r4, 0                       ; blocked: Z clear
    RET
@np:
    LD r0, [bk_bits]
    LD r4, [bk_q]
@skip:
    SHR r0, 1
    ADD r4, PROP_SIZE
    JMP @bit
@nextb:
    LD r4, [bk_p]
    ADD r4, 8 * PROP_SIZE
    ST [bk_p], r4
    LD r0, [bk_k]
    ADD r0, 1
    ST [bk_k], r0
    JMP @byte
@free:
    CMP r4, r4                      ; free: Z set
@hit:
    RET

; r4 = cell -> Z set (JZ) if the player may be in it: floor, or a door that is fully open. Clobbers r4.
passable:
    LDB r4, [r4 + map]
    CMP r4, 0
    JEQ @yes
    CMP r4, 0x80
    JAE @no
    CMP r4, 0x40
    JB @no
    AND r4, 15
    SHL r4, 4
    LD r4, [r4 + doors + D_OPEN]
    CMP r4, 256
    RET
@no:
    CMP r4, 0
@yes:
    RET
