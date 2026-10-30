; NADIR - the enemies (DESIGN §6.3-6.4): Kryp's states, line of sight, movement with collision, the leap and the
; animation. Once per frame after the player. Every enemy is also a prop entry (NUM_PROPS + i) so that the sprite
; code draws it: its position and its animation frame as the sprite type.
.code

E_X     = 0                         ; u8.8
E_Y     = 2
E_ST    = 4                         ; state (DESIGN §6.3), byte
E_T     = 5                         ; frames in the state, byte
E_HP    = 6                         ; word, signed
E_TX    = 8                         ; target: the last known position of the player
E_TY    = 10
E_LOS   = 12                        ; the last line-of-sight result, byte
E_AN    = 13                        ; animation: index into the state's list (pairs), byte
E_AT    = 14                        ; frames shown of that entry, byte
E_SPK   = 15                        ; sparks: frames left, byte
E_VX    = 16                        ; step per frame (chase is recomputed every frame; the leap keeps its own)
E_VY    = 18
E_LOSN  = 20                        ; line-of-sight checks made (tests), word
E_SIZE  = 24

ST_IDLE = 0
ST_ALERT = 1
ST_CHASE = 2
ST_WINDUP = 3
ST_LEAP = 4
ST_RECOVER = 5
ST_PAIN = 6
ST_DEAD = 7

.var enemies, MAX_ENEMIES * E_SIZE
.var noise                          ; 1: a shot was fired last frame (enemies hear it this frame)
.var en_i                           ; loop: index, address
.var en_p
.var en_dist                        ; octagonal distance to the player
.var en_blk                         ; 1 if a move was stopped on an axis
.var e_near, 3                      ; the props near the enemy's cell (blocking props)
.var ls_n                           ; line of sight: samples, step, remainder accumulators
.var ls_k
.var ls_qx
.var ls_rx
.var ls_ax
.var ls_sx
.var ls_qy
.var ls_ry
.var ls_ay
.var ls_sy
.var ls_x0
.var ls_y0

; Once and at a restart: the enemy table from ROM (map.gen.asm), all idle, full health, standing still.
enemies_init:
    LDI r6, 0
@e:
    CMP r6, NUM_ENEMIES
    JAE @done
    MOV r5, r6
    MUL r5, E_SIZE
    ADD r5, enemies
    LDI r0, 0
    LDI r1, 0
@z:
    MOV r2, r5
    ADD r2, r1
    ST [r2], r0
    ADD r1, 2
    CMP r1, E_SIZE
    JLT @z
    MOV r1, r6
    SHL r1, 2
    LD r0, [r1 + enemy_init]
    ST [r5 + E_X], r0
    ST [r5 + E_TX], r0
    LD r0, [r1 + enemy_init + 2]
    ST [r5 + E_Y], r0
    ST [r5 + E_TY], r0
    LDI r0, KRYP_HP
    ST [r5 + E_HP], r0
    CALL en_prop
    ADD r6, 1
    JMP @e
@done:
    RET

; r5 = enemy, r6 = its index: writes its prop entry (position, the current animation frame, alive). Clobbers r0-r2.
en_prop:
    MOV r1, r6
    ADD r1, NUM_PROPS
    SHL r1, 3
    ADD r1, props
    LD r0, [r5 + E_X]
    ST [r1 + P_X], r0
    LD r0, [r5 + E_Y]
    ST [r1 + P_Y], r0
    LDB r0, [r5 + E_ST]
    SHL r0, 1
    LD r0, [r0 + anim_tab]
    LDB r2, [r5 + E_AN]
    SHL r2, 1
    ADD r0, r2
    LDB r0, [r0]
    STB [r1 + P_TYPE], r0
    LDI r0, 1
    STB [r1 + P_ALIVE], r0
    RET

; r5 = enemy, r0 = new state: enters it (timer and animation from the start). Clobbers r0.
en_set:
    STB [r5 + E_ST], r0
    LDI r0, 0
    STB [r5 + E_T], r0
    STB [r5 + E_AN], r0
    STB [r5 + E_AT], r0
    RET

; r0 = dx, r1 = dy -> r0 = max(|dx|, |dy|) + min(|dx|, |dy|) / 2 (DESIGN §6.3). Clobbers r1.
octnorm:
    CMP r0, 0
    JGE @a
    NEG r0
@a:
    CMP r1, 0
    JGE @b
    NEG r1
@b:
    CMP r0, r1
    JAE @c
    PUSH r0
    MOV r0, r1
    POP r1
@c:
    SHR r1, 1
    ADD r0, r1
    RET

; ---- per frame --------------------------------------------------------------------------------------------
enemies_frame:
    LDI r0, 0
    ST [en_i], r0
@e:
    LD r6, [en_i]
    CMP r6, NUM_ENEMIES
    JAE @done
    MUL r6, E_SIZE
    ADD r6, enemies
    ST [en_p], r6
    MOV r5, r6
    CALL en_step
    LD r5, [en_p]
    CALL en_anim
    LD r5, [en_p]
    LD r6, [en_i]
    CALL en_prop
    LD r0, [en_i]
    ADD r0, 1
    ST [en_i], r0
    JMP @e
@done:
    LDI r0, 0
    ST [noise], r0
    RET

; r5 = enemy: the animation advances one frame, unless the state began this frame (DESIGN §6.3). Clobbers r0-r2.
en_anim:
    LDB r0, [r5 + E_T]
    CMP r0, 0
    JEQ @new
    LDB r0, [r5 + E_ST]
    SHL r0, 1
    LD r0, [r0 + anim_tab]
    LDB r1, [r5 + E_AN]
    SHL r1, 1
    ADD r0, r1
    LDB r2, [r0 + 1]                ; frames of this entry, 0 = held
    CMP r2, 0
    JEQ @new
    LDB r1, [r5 + E_AT]
    ADD r1, 1
    CMP r1, r2
    JB @keep
    LDI r1, 0
    LDB r2, [r5 + E_AN]
    ADD r2, 1
    LDB r0, [r0 + 2]                ; the next entry: 255 ends the list, start again
    CMP r0, 255
    JNE @adv
    LDI r2, 0
@adv:
    STB [r5 + E_AN], r2
@keep:
    STB [r5 + E_AT], r1
@new:
    RET

; r5 = enemy: one frame of its state machine (DESIGN §6.3).
en_step:
    LDB r0, [r5 + E_SPK]
    CMP r0, 0
    JEQ @s0
    SUB r0, 1
    STB [r5 + E_SPK], r0
@s0:
    LDB r0, [r5 + E_T]              ; frames in the state (saturating)
    CMP r0, 255
    JEQ @t
    ADD r0, 1
    STB [r5 + E_T], r0
@t:
    LDB r0, [r5 + E_ST]
    CMP r0, ST_DEAD
    JNE @alive
    RET
@alive:
    ; ---- distance and line of sight
    LD r0, [cam_x]
    LD r1, [r5 + E_X]
    SUB r0, r1
    LD r1, [cam_y]
    LD r2, [r5 + E_Y]
    SUB r1, r2
    CALL octnorm
    ST [en_dist], r0
    CMP r0, SIGHT + 1
    JB @near
    LDI r0, 0
    STB [r5 + E_LOS], r0
    JMP @st
@near:
    LD r0, [tick]
    LD r1, [en_i]
    ADD r0, r1
    AND r0, 3
    JNZ @los
    LD r0, [r5 + E_LOSN]
    ADD r0, 1
    ST [r5 + E_LOSN], r0
    LD r0, [r5 + E_X]
    LD r1, [r5 + E_Y]
    LD r2, [cam_x]
    LD r3, [cam_y]
    CALL los
    LDI r0, 0
    JNZ @nolos
    LDI r0, 1
@nolos:
    LD r5, [en_p]
    STB [r5 + E_LOS], r0
@los:
    LDB r0, [r5 + E_LOS]
    CMP r0, 0
    JEQ @st
    LD r0, [cam_x]
    ST [r5 + E_TX], r0
    LD r0, [cam_y]
    ST [r5 + E_TY], r0
@st:
    LDB r0, [r5 + E_ST]
    CMP r0, ST_IDLE
    JEQ @idle
    CMP r0, ST_ALERT
    JEQ @alert
    CMP r0, ST_CHASE
    JEQ @chase
    CMP r0, ST_WINDUP
    JEQ @windup
    CMP r0, ST_LEAP
    JEQ @leap
    CMP r0, ST_RECOVER
    JEQ @recover
    ; ---- PAIN
    LDB r0, [r5 + E_T]
    CMP r0, PAIN_FRAMES
    JB @ret
    JMP @tochase
@idle:
    LDB r0, [r5 + E_LOS]
    CMP r0, 0
    JNE @wake
    LD r0, [noise]
    CMP r0, 0
    JEQ @ret
    LD r0, [en_dist]
    CMP r0, HEAR + 1
    JAE @ret
    LD r0, [cam_x]                  ; heard: the shot gives away where the player is
    ST [r5 + E_TX], r0
    LD r0, [cam_y]
    ST [r5 + E_TY], r0
@wake:
    LDI r0, ST_ALERT
    JMP en_set
@alert:
    LDB r0, [r5 + E_T]
    CMP r0, ALERT_FRAMES
    JB @ret
@tochase:
    LDI r0, ST_CHASE
    JMP en_set
@recover:
    LDB r0, [r5 + E_T]
    CMP r0, RECOVER_FRAMES
    JB @ret
    JMP @tochase
@windup:
    LDB r0, [r5 + E_T]
    CMP r0, WINDUP_FRAMES
    JB @ret
    LD r0, [cam_x]                  ; the leap's direction: at the player, now
    LD r1, [cam_y]
    LDI r2, LEAP_V
    CALL en_vel
    LDI r0, ST_LEAP
    JMP en_set
@leap:
    CALL en_move
    LD r5, [en_p]
    LD r0, [cam_x]                  ; a hit: both boxes within E_RAD + P_RAD + LEAP_REACH on both axes
    LD r1, [r5 + E_X]
    SUB r0, r1
    ADD r0, E_RAD + P_RAD + LEAP_REACH - 1
    CMP r0, 2 * (E_RAD + P_RAD + LEAP_REACH) - 1
    JAE @lmiss
    LD r0, [cam_y]
    LD r1, [r5 + E_Y]
    SUB r0, r1
    ADD r0, E_RAD + P_RAD + LEAP_REACH - 1
    CMP r0, 2 * (E_RAD + P_RAD + LEAP_REACH) - 1
    JAE @lmiss
    LD r0, [hp]
    SUB r0, KRYP_DMG
    ST [hp], r0
    LD r0, [hits_taken]
    ADD r0, 1
    ST [hits_taken], r0
    JMP @torec
@lmiss:
    LD r0, [en_blk]
    CMP r0, 0
    JNE @torec
    LDB r0, [r5 + E_T]
    CMP r0, LEAP_FRAMES
    JB @ret
@torec:
    LDI r0, ST_RECOVER
    JMP en_set
@chase:
    LDB r0, [r5 + E_LOS]
    CMP r0, 0
    JEQ @blind
    LD r0, [en_dist]
    CMP r0, LEAP_DIST
    JAE @walk
    LDI r0, ST_WINDUP
    JMP en_set
@blind:                             ; no line of sight: the target reached -> idle
    LD r0, [r5 + E_TX]
    LD r1, [r5 + E_X]
    SUB r0, r1
    ADD r0, E_RAD - 1
    CMP r0, 2 * E_RAD - 1
    JAE @walk
    LD r0, [r5 + E_TY]
    LD r1, [r5 + E_Y]
    SUB r0, r1
    ADD r0, E_RAD - 1
    CMP r0, 2 * E_RAD - 1
    JAE @walk
    LDI r0, ST_IDLE
    JMP en_set
@walk:
    LD r0, [r5 + E_TX]
    LD r1, [r5 + E_TY]
    LDI r2, KRYP_V
    CALL en_vel
    LD r5, [en_p]
    CALL en_move
@ret:
    RET

; r5 = enemy, r0, r1 = a point, r2 = speed: E_VX, E_VY = (d (V 256 / L)) >> 8 with L the octagonal length of
; d = point - position (0 if L = 0). Clobbers r0-r4.
en_vel:
    LD r3, [r5 + E_X]
    SUB r0, r3
    LD r3, [r5 + E_Y]
    SUB r1, r3
    PUSH r0
    PUSH r1
    CALL octnorm
    MOV r3, r0
    POP r1
    POP r0
    CMP r3, 0
    JNE @l
    ST [r5 + E_VX], r3
    ST [r5 + E_VY], r3
    RET
@l:
    SHL r2, 8
    DIV r2, r3                      ; f = V 256 / L
    MUL r0, r2
    SAR r0, 8
    ST [r5 + E_VX], r0
    MUL r1, r2
    SAR r1, 8
    ST [r5 + E_VY], r1
    RET

; r5 = enemy: moves it by its step, x then y, each only if its box stays free (DESIGN §6.3); en_blk = 1 if an
; axis was stopped (a step of 0 is never stopped).
en_move:
    LDI r0, 0
    ST [en_blk], r0
    LDI r0, e_near                  ; the props near its cell
    LD r4, [r5 + E_Y]
    SHR r4, 8
    SHL r4, 5
    LD r1, [r5 + E_X]
    SHR r1, 8
    ADD r4, r1
    LDI r5, 3
    CALL prop_set
    LD r5, [en_p]
    LD r0, [r5 + E_VX]
    CMP r0, 0
    JEQ @y
    LD r1, [r5 + E_X]
    ADD r0, r1
    LD r1, [r5 + E_Y]
    CALL en_blocked
    LD r5, [en_p]
    JNZ @xb
    LD r0, [r5 + E_X]
    LD r1, [r5 + E_VX]
    ADD r0, r1
    ST [r5 + E_X], r0
    JMP @y
@xb:
    LDI r0, 1
    ST [en_blk], r0
@y:
    LD r0, [r5 + E_VY]
    CMP r0, 0
    JEQ @done
    LD r1, [r5 + E_Y]
    ADD r1, r0
    LD r0, [r5 + E_X]
    CALL en_blocked
    LD r5, [en_p]
    JNZ @yb
    LD r0, [r5 + E_Y]
    LD r1, [r5 + E_VY]
    ADD r0, r1
    ST [r5 + E_Y], r0
    RET
@yb:
    LDI r0, 1
    ST [en_blk], r0
@done:
    RET

; r0 = x, r1 = y -> Z clear (JNZ) if an enemy's box there touches a cell that is not passable, a blocking prop
; near its cell, or the player's box. Clobbers r0-r4.
en_blocked:
    PUSH r0
    PUSH r1
    LDI r2, E_RAD
    LDI r3, e_near
    CALL box_free
    POP r1
    POP r0
    JNZ @hit
    LD r2, [cam_x]                  ; the player: |dx| < E_RAD + P_RAD and |dy| < E_RAD + P_RAD
    SUB r2, r0
    ADD r2, E_RAD + P_RAD - 1
    CMP r2, 2 * (E_RAD + P_RAD) - 1
    JAE @free
    LD r2, [cam_y]
    SUB r2, r1
    ADD r2, E_RAD + P_RAD - 1
    CMP r2, 2 * (E_RAD + P_RAD) - 1
    JAE @free
    CMP r2, 0x7FFF                  ; blocked: Z clear (r2 < 0x7FFF here)
    RET
@free:
    CMP r2, r2
@hit:
    RET

; r0, r1 = A, r2, r3 = B (u8.8) -> Z set (JZ) if the line of sight from A to B is free (DESIGN §6.4): the
; points A + sgn(d) floor(|d| k / N), k = 1 .. N - 1, N = (max(|dx|, |dy|) >> 7) + 1, lie in floor, masked cells
; or doors open >= 128. Clobbers r0-r7.
los:
    ST [ls_x0], r0
    ST [ls_y0], r1
    SUB r2, r0
    SUB r3, r1
    LDI r4, 1
    CMP r2, 0
    JGE @px
    NEG r2
    LDI r4, -1
@px:
    ST [ls_sx], r4
    LDI r4, 1
    CMP r3, 0
    JGE @py
    NEG r3
    LDI r4, -1
@py:
    ST [ls_sy], r4
    MOV r0, r2
    CMP r0, r3
    JAE @m
    MOV r0, r3
@m:
    SHR r0, 7
    ADD r0, 1
    ST [ls_n], r0                   ; N
    MOV r1, r2
    DIV r1, r0
    ST [ls_qx], r1
    MOD r2, r0
    ST [ls_rx], r2
    MOV r1, r3
    DIV r1, r0
    ST [ls_qy], r1
    MOD r3, r0
    ST [ls_ry], r3
    LDI r6, 0                       ; floor(|dx| k / N) and its remainder, the same for y
    LDI r7, 0
    LDI r2, 0
    LDI r3, 0
    LDI r1, 1
@k:
    LD r0, [ls_n]
    CMP r1, r0
    JAE @free
    LD r4, [ls_qx]
    ADD r6, r4
    LD r4, [ls_rx]
    ADD r2, r4
    CMP r2, r0
    JB @nx
    SUB r2, r0
    ADD r6, 1
@nx:
    LD r4, [ls_qy]
    ADD r7, r4
    LD r4, [ls_ry]
    ADD r3, r4
    CMP r3, r0
    JB @ny
    SUB r3, r0
    ADD r7, 1
@ny:
    MOV r4, r7                      ; y = y0 + sy qy
    LD r5, [ls_sy]
    CMP r5, 0
    JGT @yp
    NEG r4
@yp:
    LD r5, [ls_y0]
    ADD r4, r5
    SHR r4, 8
    SHL r4, 5
    MOV r5, r6
    LD r0, [ls_sx]
    CMP r0, 0
    JGT @xp
    NEG r5
@xp:
    LD r0, [ls_x0]
    ADD r5, r0
    SHR r5, 8
    ADD r4, r5
    LDB r4, [r4 + map]
    CMP r4, 0
    JEQ @ok
    CMP r4, 0x80
    JAE @ok                         ; a masked cell: see-through
    CMP r4, 0x40
    JB @blocked                     ; a solid wall
    AND r4, 15
    SHL r4, 4
    LD r4, [r4 + doors + D_OPEN]
    CMP r4, 128
    JB @blocked
@ok:
    ADD r1, 1
    JMP @k
@blocked:
    CMP r4, 0x7FFF                  ; Z clear (r4 < 0x7FFF)
    RET
@free:
    CMP r0, r0
    RET

.data
; per state: the animation (sprite type, frames shown; 255 ends the list and it starts again; 0 frames = held)
anim_tab:
    .word an_idle, an_alert, an_chase, an_windup, an_leap, an_recover, an_pain, an_dead
an_idle:    .byte SPR_KRYP_I0, 16, SPR_KRYP_I1, 16, 255
an_alert:   .byte SPR_KRYP_A, 8, 255
an_chase:   .byte SPR_KRYP_W0, 6, SPR_KRYP_W1, 6, SPR_KRYP_W2, 6, SPR_KRYP_W3, 6, 255
an_windup:  .byte SPR_KRYP_A, 8, 255
an_leap:    .byte SPR_KRYP_L, 8, 255
an_recover: .byte SPR_KRYP_I0, 16, 255
an_pain:    .byte SPR_KRYP_P, 8, 255
an_dead:    .byte SPR_KRYP_D0, 6, SPR_KRYP_D1, 6, SPR_KRYP_D2, 0, 255
.code
