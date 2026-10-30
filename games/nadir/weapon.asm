; NADIR - the bolt shotgun (DESIGN §6.1-6.2): its state machine, the pellets and their hits, and drawing it.
.code

W_READY = 0
W_FIRE  = 1
W_PUMP  = 2
W_LOAD  = 3

.var w_state
.var w_t                            ; frames in the state (0 = the frame it began)
.var w_mag                          ; shells in the magazine
.var w_res                          ; shells in reserve
.var w_flash                        ; muzzle flash: frames left
.var shots                          ; shots fired
.var shots_hit                      ; shots with a pellet in an enemy (M31)
.var pel_hit, PELLETS               ; per pellet of the last shot: enemy index or 255
.var pel_dmg, PELLETS               ; and its damage
.var sh_los, MAX_ENEMIES            ; per enemy at the last shot: 1 if it could be hit (in reach, line of sight)
.var sh_bl, NUM_PROPS               ; per prop: 1 if it is a barrel that could be hit
.var sh_k                           ; pellet loop
.var sh_c                           ; its cos and sin, s.8
.var sh_s
.var sh_best
.var sh_bt
.var sh_i

; ---- per frame (not while dead) ---------------------------------------------------------------------------
weapon_frame:
    LD r0, [w_flash]
    CMP r0, 0
    JEQ @f0
    SUB r0, 1
    ST [w_flash], r0
@f0:
    LD r0, [w_t]
    ADD r0, 1
    ST [w_t], r0
    LD r1, [w_state]
    CMP r1, W_FIRE
    JEQ @fire
    CMP r1, W_PUMP
    JEQ @pump
    CMP r1, W_LOAD
    JEQ @load
    ; ---- ready
    LD r0, [btn]
    AND r0, BTN_A
    JZ @noa
    LD r0, [w_mag]
    CMP r0, 0
    JEQ @noa
    SUB r0, 1
    ST [w_mag], r0
    LDI r1, W_FIRE
    CALL @set
    LD r0, [shots]
    ADD r0, 1
    ST [shots], r0
    LDI r0, FLASH_FRAMES
    ST [w_flash], r0
    LDI r0, 1
    ST [noise], r0
    LDI r0, SFX_SHOT
    CALL play_sfx
    LDI r0, SFX_SHOTB
    CALL play_sfx
    JMP shoot
@noa:
    LD r0, [w_mag]
    CMP r0, 0
    JNE @ret
    LD r0, [w_res]
    CMP r0, 0
    JEQ @empty
    LDI r1, W_LOAD
    JMP @set
@empty:                             ; A pressed with no rounds at all: a click (DESIGN §8.1)
    LD r0, [btnp]
    AND r0, BTN_A
    JZ @ret
    LDI r0, SFX_EMPTY
    JMP play_sfx
@fire:
    CMP r0, FIRE_FRAMES
    JB @ret
    LDI r1, W_PUMP
    JMP @set
@pump:
    CMP r0, PUMP_FRAMES
    JB @ret
    LDI r1, W_READY
    JMP @set
@load:
    CMP r0, RELOAD_FRAMES
    JB @ret
    LDI r0, MAG                     ; n = min(MAG - mag, res)
    LD r1, [w_mag]
    SUB r0, r1
    LD r2, [w_res]
    CMP r0, r2
    JB @n
    MOV r0, r2
@n:
    ADD r1, r0
    ST [w_mag], r1
    SUB r2, r0
    ST [w_res], r2
    LDI r1, W_READY
@set:                               ; r1 = the new state; its effect (DESIGN §8.1)
    LDI r0, SFX_PUMP
    CMP r1, W_PUMP
    JEQ @snd
    LDI r0, SFX_RELOAD
    CMP r1, W_LOAD
    JEQ @snd
    LD r0, [w_state]
    CMP r0, W_LOAD
    JNE @st
    LDI r0, SFX_LOADED
@snd:
    CALL play_sfx
@st:
    ST [w_state], r1
    LDI r0, 0
    ST [w_t], r0
@ret:
    RET

; r0 = a (signed), r1 = b (signed, |b| <= 256) -> r0 = sgn(a b) ((|a| |b|) >> 8), the product truncated towards
; zero (DESIGN §6.2). Clobbers r1-r4.
mt8:
    LDI r4, 0
    CMP r0, 0
    JGE @a
    NEG r0
    XOR r4, 1
@a:
    CMP r1, 0
    JGE @b
    NEG r1
    XOR r4, 1
@b:
    MULQ8 r2, r0, r1, r3
    MOV r0, r2
    CMP r4, 0
    JEQ @c
    NEG r0
@c:
    RET

; ---- a shot (DESIGN §6.2): which enemies may be hit, then the pellets one by one, damage in order
shoot:
    LDI r0, 1
    ST [lg_heavy], r0               ; the image waits a frame (DESIGN §3.11)
    LDI r0, 0
    ST [sh_i], r0
@cand:
    LD r6, [sh_i]
    CMP r6, NUM_ENEMIES
    JAE @pellets
    LDI r0, 0
    STB [r6 + sh_los], r0
    MUL r6, E_SIZE
    ADD r6, enemies
    LDB r0, [r6 + E_ST]
    CMP r0, ST_DEAD
    JEQ @cnext
    LD r0, [r6 + E_X]               ; within RANGE + E_HIT on both axes (no pellet reaches farther)
    LD r1, [cam_x]
    SUB r0, r1
    ADD r0, RANGE + E_HIT
    CMP r0, 2 * (RANGE + E_HIT) + 1
    JAE @cnext
    LD r0, [r6 + E_Y]
    LD r1, [cam_y]
    SUB r0, r1
    ADD r0, RANGE + E_HIT
    CMP r0, 2 * (RANGE + E_HIT) + 1
    JAE @cnext
    LD r0, [cam_x]
    LD r1, [cam_y]
    LD r2, [r6 + E_X]
    LD r3, [r6 + E_Y]
    CALL los
    JNZ @cnext
    LD r6, [sh_i]
    LDI r0, 1
    STB [r6 + sh_los], r0
@cnext:
    LD r0, [sh_i]
    ADD r0, 1
    ST [sh_i], r0
    JMP @cand
@pellets:
    LDI r0, 0                       ; the barrels that may be hit (DESIGN §6.6): whole, in reach, in sight
    ST [sh_i], r0
@bc:
    LD r6, [sh_i]
    CMP r6, NUM_PROPS
    JAE @pel0
    LDI r0, 0
    STB [r6 + sh_bl], r0
    LDB r0, [r6 + bar_hp]
    CMP r0, 1
    JLT @bcn
    SHL r6, 3
    ADD r6, props
    LDB r0, [r6 + P_ALIVE]
    CMP r0, 0
    JEQ @bcn
    LD r0, [r6 + P_X]
    LD r1, [cam_x]
    SUB r0, r1
    ADD r0, RANGE + E_HIT
    CMP r0, 2 * (RANGE + E_HIT) + 1
    JAE @bcn
    LD r0, [r6 + P_Y]
    LD r1, [cam_y]
    SUB r0, r1
    ADD r0, RANGE + E_HIT
    CMP r0, 2 * (RANGE + E_HIT) + 1
    JAE @bcn
    LD r0, [cam_x]
    LD r1, [cam_y]
    LD r2, [r6 + P_X]
    LD r3, [r6 + P_Y]
    CALL los
    JNZ @bcn
    LD r6, [sh_i]
    LDI r0, 1
    STB [r6 + sh_bl], r0
@bcn:
    LD r0, [sh_i]
    ADD r0, 1
    ST [sh_i], r0
    JMP @bc
@pel0:
    LDI r0, 0
    ST [sh_k], r0
@pel:
    LD r0, [sh_k]
    CMP r0, PELLETS
    JAE @done
    SUB r0, PELLETS / 2
    MUL r0, SPREAD
    LD r1, [cam_a]
    ADD r0, r1
    PUSH r0
    CALL cos_a
    SAR r0, 6
    ST [sh_c], r0
    POP r0
    CALL sin_a
    SAR r0, 6
    ST [sh_s], r0
    LDI r0, 255
    ST [sh_best], r0
    LDI r0, RANGE + 1
    ST [sh_bt], r0
    LDI r0, 0
    ST [sh_i], r0
@en:
    LD r6, [sh_i]
    CMP r6, NUM_ENEMIES
    JAE @bars
    LDB r0, [r6 + sh_los]
    CMP r0, 0
    JEQ @enext
    MUL r6, E_SIZE
    ADD r6, enemies
    LDB r0, [r6 + E_ST]
    CMP r0, ST_DEAD                 ; killed by an earlier pellet of this shot
    JEQ @enext
    LD r0, [r6 + E_X]
    LD r1, [cam_x]
    SUB r0, r1
    LD r1, [sh_c]
    CALL mt8
    MOV r5, r0
    LD r0, [r6 + E_Y]
    LD r1, [cam_y]
    SUB r0, r1
    LD r1, [sh_s]
    CALL mt8
    ADD r5, r0                      ; t
    CMP r5, 1
    JLT @enext
    LD r0, [sh_bt]
    CMP r5, r0
    JGE @enext                      ; not nearer than the best so far (and t <= RANGE)
    LD r0, [r6 + E_Y]
    LD r1, [cam_y]
    SUB r0, r1
    LD r1, [sh_c]
    CALL mt8
    MOV r7, r0
    LD r0, [r6 + E_X]
    LD r1, [cam_x]
    SUB r0, r1
    LD r1, [sh_s]
    CALL mt8
    SUB r7, r0                      ; the pellet's lateral miss
    ADD r7, E_HIT
    CMP r7, 2 * E_HIT + 1
    JAE @enext
    ST [sh_bt], r5
    LD r0, [sh_i]
    ST [sh_best], r0
@enext:
    LD r0, [sh_i]
    ADD r0, 1
    ST [sh_i], r0
    JMP @en
@bars:
    LDI r0, 0                       ; the barrels: only a strictly nearer one beats an enemy
    ST [sh_i], r0
@bar:
    LD r6, [sh_i]
    CMP r6, NUM_PROPS
    JAE @apply
    LDB r0, [r6 + sh_bl]
    CMP r0, 0
    JEQ @barn
    LDB r0, [r6 + bar_hp]
    CMP r0, 1
    JLT @barn                       ; burst by an earlier pellet of this shot
    SHL r6, 3
    ADD r6, props
    LD r0, [r6 + P_X]
    LD r1, [r6 + P_Y]
    CALL @tl
    CMP r5, 1
    JLT @barn
    LD r0, [sh_bt]
    CMP r5, r0
    JGE @barn
    ADD r7, E_HIT
    CMP r7, 2 * E_HIT + 1
    JAE @barn
    ST [sh_bt], r5
    LD r0, [sh_i]
    ADD r0, 128
    ST [sh_best], r0
@barn:
    LD r0, [sh_i]
    ADD r0, 1
    ST [sh_i], r0
    JMP @bar
@apply:
    LD r7, [sh_k]
    LD r0, [sh_best]
    STB [r7 + pel_hit], r0
    LDI r1, 0
    CMP r0, 255
    JEQ @pd
    CMP r0, 128
    JB @pen
    SUB r0, 128                     ; a barrel: its health; at 0 it explodes next frame
    LD r1, [sh_bt]
    SHR r1, 9
    LDB r1, [r1 + dmg_tab]
    LDB r2, [r0 + bar_hp]
    SUB r2, r1
    CMP r2, 1
    JGE @bk
    LDI r2, 1
    STB [r0 + bar_boom], r2
    ST [boom_any], r2
    LDI r2, 0
@bk:
    STB [r0 + bar_hp], r2
    JMP @pd
@pen:
    MUL r0, E_SIZE
    ADD r0, enemies
    MOV r5, r0
    LD r1, [sh_bt]
    SHR r1, 9
    LDB r1, [r1 + dmg_tab]
    LD r0, [r5 + E_HP]
    SUB r0, r1
    ST [r5 + E_HP], r0
    LDI r2, SPARK_FRAMES
    STB [r5 + E_SPK], r2
    PUSH r1
    LDI r2, ST_PAIN
    CMP r0, 1
    JGE @hurt
    LDI r2, ST_DEAD
@hurt:
    MOV r0, r2
    CALL en_set
    POP r1
@pd:
    LD r7, [sh_k]
    STB [r7 + pel_dmg], r1
    ADD r7, 1
    ST [sh_k], r7
    JMP @pel
@done:                              ; M31: a shot with at least one pellet in an enemy counts as a hit
    LDI r0, 0
@h:
    CMP r0, PELLETS
    JAE @hn
    LDB r1, [r0 + pel_hit]
    ADD r0, 1
    CMP r1, 128
    JAE @h
    LD r1, [shots_hit]
    ADD r1, 1
    ST [shots_hit], r1
@hn:
    RET
; r0, r1 = a target (u8.8) -> r5 = t, r7 = lateral miss along the pellet (sh_c, sh_s). Clobbers r0-r4.
@tl:
    LD r2, [cam_x]
    SUB r0, r2
    LD r2, [cam_y]
    SUB r1, r2
    PUSH r0
    PUSH r1
    LD r1, [sh_c]
    CALL mt8
    MOV r5, r0
    POP r1
    PUSH r1
    MOV r0, r1
    LD r1, [sh_s]
    CALL mt8
    ADD r5, r0
    POP r1
    MOV r0, r1
    LD r1, [sh_c]
    CALL mt8
    MOV r7, r0
    POP r0
    LD r1, [sh_s]
    CALL mt8
    SUB r7, r0
    RET

; ---- drawing (after the 3D view): the weapon, its flash and the HUD ---------------------------------------
draw_weapon:
    LD r0, [dead]
    CMP r0, 0
    JNE @hud
    ; x: 32 + sway, y: 80 + |bob| + recoil / lowering
    LD r4, [tick]
    SHR r4, 3
    AND r4, 15
    LDB r4, [r4 + sway_tab]
    SHL r4, 8
    SAR r4, 8
    ADD r4, 32
    LD r5, [rbob]
    CMP r5, 0
    JGE @bp
    NEG r5
@bp:
    ADD r5, 80
    LDI r6, 0                       ; the pump's slide (px down)
    LD r0, [w_state]
    LD r1, [w_t]
    CMP r0, W_FIRE
    JNE @nf
    LDB r1, [r1 + recoil_tab]
    ADD r5, r1
    JMP @pos
@nf:
    CMP r0, W_PUMP
    JNE @np
    SHR r1, 1
    LDB r6, [r1 + pump_tab]
    JMP @pos
@np:
    CMP r0, W_LOAD
    JNE @pos
    SHR r1, 2
    LDB r1, [r1 + reload_tab]
    ADD r5, r1
@pos:
    PUSH r4
    PUSH r5
    PUSH r6
    LDI r0, wpn_body
    LDI r1, wpn_tiles
    LDI r2, WPN_BODY_W
    LDI r3, WPN_BODY_H
    SYS MAP
    POP r6
    POP r5
    POP r4
    PUSH r4
    PUSH r5
    ADD r5, 12                      ; the pump on the barrel
    ADD r5, r6
    ADD r4, 20
    LDI r0, wpn_pump
    LDI r1, wpn_tiles
    LDI r2, WPN_PUMP_W
    LDI r3, WPN_PUMP_H
    SYS MAP
    POP r5
    POP r4
    LD r0, [rflash]
    CMP r0, 0
    JEQ @nofl
    PUSH r4
    PUSH r5
    ADD r4, 24
    SUB r5, 12
    LDI r0, wpn_flash
    LDI r1, wpn_tiles
    LDI r2, WPN_FLASH_W
    LDI r3, WPN_FLASH_H
    SYS MAP
    POP r5
    POP r4
@nofl:
    LD r0, [w_mag]                  ; the magazine on the weapon's display (amber)
    MOV r1, r4
    ADD r1, 37
    MOV r2, r5
    ADD r2, 35
    LDI r3, 14
    SYS NUM
@hud:
    LDI r0, s_hp                    ; health, bottom left; the reserve, bottom right; the crosshair
    LDI r1, 2
    LDI r2, 121
    LDI r3, 12
    SYS TEXT
    LD r0, [hp]
    CMP r0, 0
    JGE @hpos
    LDI r0, 0
@hpos:
    PUSH r0
    LDI r1, 14
    LDI r2, 121
    LDI r3, 15
    SYS NUM
    LDI r0, 28                      ; M31: the health bar (25 px = HP_MAX), green, amber below 50, red below 25
    LDI r1, 122
    LDI r2, 25
    LDI r3, 3
    LDI r4, 1
    SYS RECTFILL
    POP r2
    SHR r2, 2
    JZ @hb
    LDI r4, 11
    CMP r2, 12
    JGE @hc
    LDI r4, 9
    CMP r2, 6
    JGE @hc
    LDI r4, 6
@hc:
    LDI r0, 28
    LDI r1, 122
    LDI r3, 3
    SYS RECTFILL
@hb:
    LD r0, [w_res]
    LDI r1, 112
    LDI r2, 121
    LDI r3, 9
    SYS NUM
    LDI r0, 63
    LDI r1, 62
    LDI r2, 2
    LDI r3, 4
    LDI r4, 15
    SYS RECTFILL
    LDI r0, 62
    LDI r1, 63
    LDI r2, 4
    LDI r3, 2
    LDI r4, 15
    SYS RECTFILL
    LD r0, [keys]
    CMP r0, 0
    JEQ @nokey
    LDI r0, 2                       ; the red key card, top left
    LDI r1, 2
    LDI r2, 6
    LDI r3, 4
    LDI r4, 6
    SYS RECTFILL
@nokey:
    RET

.data
s_hp:       .string "HP"
dmg_tab:    .byte 8, 6, 4, 2, 2         ; damage per pellet by t >> 9 (2 cells per step)
sway_tab:   .byte 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0
recoil_tab: .byte 6, 5, 4, 3, 2, 1, 1, 0, 0
pump_tab:   .byte 2, 4, 6, 6, 4, 2, 0
reload_tab: .byte 4, 10, 18, 26, 30, 30, 30, 26, 18, 10
.code
