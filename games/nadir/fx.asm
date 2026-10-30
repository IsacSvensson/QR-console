; NADIR - effects (DESIGN §6.6-6.10): explosive barrels, damage to the player (flash, direction, shake), the
; dynamic lights, particles and the Spottare's acid balls, and drawing them.
.code

PT_X    = 0                         ; particle: x, y (u8.8), height z (1/256 cell above the floor), vz
PT_Y    = 2
PT_Z    = 4
PT_VZ   = 6
PT_VX   = 8                         ; bytes, signed
PT_VY   = 9
PT_LIFE = 10                        ; 0 = free
PT_COL  = 11
PT_SIZE = 12

AC_X    = 0                         ; acid ball: x, y (u8.8), step, life (0 = free)
AC_Y    = 2
AC_VX   = 4
AC_VY   = 6
AC_LIFE = 8
AC_SIZE = 10

.var bar_hp, NUM_PROPS              ; per prop: a barrel's health (DESIGN §6.6), byte, signed
.var bar_boom, NUM_PROPS            ; 1: explodes next frame
.var parts, PART_MAX * PT_SIZE
.var acids, ACID_MAX * AC_SIZE
.var dl_cell, 4                     ; dynamic lights (DESIGN §6.7): cell, strength; the image's copy
.var dl_i, 4
.var rdl_cell, 4
.var rdl_i, 4
.var rdl_any                        ; nonzero if the image has a dynamic light
.var expl_t                         ; frames since the last explosion (its light)
.var expl_cell
.var dmg_t                          ; damage flash: frames left
.var dmg_dir                        ; 0 front, 1 right, 2 back, 3 left
.var dmg_taken                      ; damage taken in total (tests)
.var shake
.var shk_off                        ; this frame's horizon offset
.var booms                          ; explosions (tests)
.var boom_any                       ; a barrel waits to explode
.var n_fx                           ; particles and acid balls alive (0: nothing to move or draw)
.var fx_i
.var fx_p
.var fx_x                           ; an explosion's or splash's centre
.var fx_y
.var np_live                        ; living particles (pacing)

; ---- the start state ----------------------------------------------------------------------------------------
fx_reset:
    LDI r0, parts
    LDI r1, 0
    LDI r2, PART_MAX * PT_SIZE + ACID_MAX * AC_SIZE
    SYS FILL                        ; parts and acids are adjacent
    LDI r0, bar_boom
    LDI r1, 0
    LDI r2, NUM_PROPS
    SYS FILL
    LDI r6, 0
@b:
    CMP r6, NUM_PROPS
    JAE @l
    MOV r1, r6
    SHL r1, 3
    LDB r1, [r1 + props + P_TYPE]
    LDI r0, 0
    CMP r1, SPR_BARREL
    JNE @nb
    LDI r0, BARREL_HP
@nb:
    STB [r6 + bar_hp], r0
    ADD r6, 1
    JMP @b
@l:
    LDI r0, 0
    ST [dl_i], r0
    ST [dl_i + 2], r0
    ST [dmg_t], r0
    ST [dmg_taken], r0
    ST [shake], r0
    ST [shk_off], r0
    ST [booms], r0
    ST [np_live], r0
    ST [boom_any], r0
    ST [n_fx], r0
    LDI r0, 255
    ST [expl_t], r0
    RET

; ---- the timers, first in the frame: damage flash, shake and its offset -----------------------------------------
fx_timers:
    LD r0, [dmg_t]
    CMP r0, 0
    JEQ @d
    SUB r0, 1
    ST [dmg_t], r0
@d:
    LDI r1, 0
    LD r0, [shake]
    CMP r0, 0
    JEQ @s
    LDI r1, -2
    AND r0, 2
    JZ @neg
    LDI r1, 2
@neg:
    LD r0, [shake]
    SUB r0, 1
    ST [shake], r0
@s:
    ST [shk_off], r1
    LD r0, [expl_t]
    CMP r0, 255
    JEQ @e
    ADD r0, 1
    ST [expl_t], r0
@e:
    RET

; r0 = damage, r1, r2 = where it came from (u8.8): the player's health, the flash, its direction, the shake.
; Clobbers r0-r6.
hurt:
    PUSH r0
    LDI r0, SFX_HURT
    CALL play_sfx
    POP r0
    LD r3, [hp]
    SUB r3, r0
    ST [hp], r3
    LD r3, [dmg_taken]
    ADD r3, r0
    ST [dmg_taken], r3
    LDI r0, DMG_FRAMES
    ST [dmg_t], r0
    LD r0, [shake]
    CMP r0, SHAKE_HIT
    JGE @sk
    LDI r0, SHAKE_HIT
    ST [shake], r0
@sk:
    LD r0, [cam_x]                  ; z and lat of the source as the pellets compute them (DESIGN §6.8)
    SUB r1, r0
    LD r0, [cam_y]
    SUB r2, r0
    PUSH r1
    PUSH r2
    MOV r0, r1
    LD r1, [cam_c8]
    CALL mt8
    MOV r5, r0
    POP r2
    PUSH r2
    MOV r0, r2
    LD r1, [cam_s8]
    CALL mt8
    ADD r5, r0                      ; z
    POP r2
    POP r1
    PUSH r1
    MOV r0, r2
    LD r1, [cam_c8]
    CALL mt8
    MOV r6, r0
    POP r1
    MOV r0, r1
    LD r1, [cam_s8]
    CALL mt8
    SUB r6, r0                      ; lat
    MOV r0, r5
    CMP r0, 0
    JGE @za
    NEG r0
@za:
    MOV r1, r6
    CMP r1, 0
    JGE @la
    NEG r1
@la:
    CMP r1, r0
    JLE @fb
    LDI r0, 1                       ; right
    CMP r6, 0
    JGT @dir
    LDI r0, 3                       ; left
    JMP @dir
@fb:
    LDI r0, 0                       ; front
    CMP r5, 0
    JGE @dir
    LDI r0, 2                       ; back
@dir:
    ST [dmg_dir], r0
    RET

; ---- barrels that explode this frame (DESIGN §6.6), after the player, before the enemies ----------------------
fx_booms:
    LD r0, [boom_any]
    CMP r0, 0
    JNE @go
    RET
@go:
    LDI r0, 0
    ST [boom_any], r0
    ST [fx_i], r0
@b:
    LD r6, [fx_i]
    CMP r6, NUM_PROPS
    JAE @done
    LDB r0, [r6 + bar_boom]
    CMP r0, 1
    JNE @nb
    LDI r0, 0
    STB [r6 + bar_boom], r0
    SHL r6, 3
    ADD r6, props
    STB [r6 + P_ALIVE], r0
    LD r0, [r6 + P_X]
    ST [fx_x], r0
    LD r1, [r6 + P_Y]
    ST [fx_y], r1
    CALL explode
@nb:
    LD r0, [fx_i]
    ADD r0, 1
    ST [fx_i], r0
    JMP @b
@done:
    LDI r6, 0                       ; the chain: pending barrels explode next frame
@ch:
    CMP r6, NUM_PROPS
    JAE @chd
    LDB r0, [r6 + bar_boom]
    CMP r0, 2
    JNE @chn
    LDI r0, 1
    STB [r6 + bar_boom], r0
@chn:
    ADD r6, 1
    JMP @ch
@chd:
    RET

; r0 = d -> r0 = floor(EXPL_DMG (EXPL_R - d) / EXPL_R), 0 if d > EXPL_R. Clobbers r1.
expl_dmg:
    CMP r0, EXPL_R + 1
    JB @in
    LDI r0, 0
    RET
@in:
    LDI r1, EXPL_R
    SUB r1, r0
    MOV r0, r1
    MUL r0, EXPL_DMG                ; < 384 60 = 23 040
    LDI r1, EXPL_R
    DIV r0, r1
    RET

; fx_x, fx_y: an explosion: damage to enemies, the player and other barrels in reach and sight; light, shake,
; particles. Clobbers r0-r7.
.var ex_k
explode:
    LDI r0, 1
    ST [lg_heavy], r0               ; the image waits a frame (DESIGN §3.11)
    LDI r0, SFX_BOOM
    CALL play_sfx
    LD r0, [booms]
    ADD r0, 1
    ST [booms], r0
    LDI r0, 0
    ST [expl_t], r0
    LD r0, [fx_y]
    SHR r0, 8
    SHL r0, 5
    LD r1, [fx_x]
    SHR r1, 8
    ADD r0, r1
    ST [expl_cell], r0
    LD r0, [shake]
    CMP r0, SHAKE_EXPL
    JGE @sk
    LDI r0, SHAKE_EXPL
    ST [shake], r0
@sk:
    ; ---- enemies
    LDI r0, 0
    ST [ex_k], r0
@en:
    LD r6, [ex_k]
    CMP r6, NUM_ENEMIES
    JAE @pl
    MUL r6, E_SIZE
    ADD r6, enemies
    LDB r0, [r6 + E_ST]
    CMP r0, ST_DEAD
    JEQ @enx
    LD r2, [r6 + E_X]
    LD r3, [r6 + E_Y]
    CALL @hit                       ; r0 = damage (0: none)
    CMP r0, 0
    JEQ @enx
    LD r6, [ex_k]
    MUL r6, E_SIZE
    ADD r6, enemies
    MOV r5, r6
    LD r1, [r5 + E_HP]
    SUB r1, r0
    ST [r5 + E_HP], r1
    LDI r0, ST_PAIN
    CMP r1, 1
    JGE @ep
    LDI r0, ST_DEAD
@ep:
    CALL en_set
@enx:
    LD r0, [ex_k]
    ADD r0, 1
    ST [ex_k], r0
    JMP @en
@pl:
    LD r2, [cam_x]                  ; the player
    LD r3, [cam_y]
    CALL @hit
    CMP r0, 0
    JEQ @bar
    LD r1, [fx_x]
    LD r2, [fx_y]
    CALL hurt
@bar:
    LDI r0, 0                       ; other barrels: a chain reaction next frame
    ST [ex_k], r0
@br:
    LD r6, [ex_k]
    CMP r6, NUM_PROPS
    JAE @fx
    LDB r0, [r6 + bar_hp]
    CMP r0, 0
    JEQ @brx                        ; not a barrel, or already gone
    SHL r6, 3
    ADD r6, props
    LDB r0, [r6 + P_ALIVE]
    CMP r0, 0
    JEQ @brx
    LD r2, [r6 + P_X]
    LD r3, [r6 + P_Y]
    CALL @hit
    CMP r0, 0
    JEQ @brx
    LD r6, [ex_k]
    LDB r1, [r6 + bar_hp]
    SUB r1, r0
    CMP r1, 1
    JGE @bh
    LDI r1, 0
    LDI r0, 2                       ; pending: explodes next frame, not later in this frame's loop
    STB [r6 + bar_boom], r0
    ST [boom_any], r0
@bh:
    STB [r6 + bar_hp], r1
@brx:
    LD r0, [ex_k]
    ADD r0, 1
    ST [ex_k], r0
    JMP @br
@fx:
    LDI r7, 0                       ; 12 particles in 12 directions
@pt:
    MOV r0, r7
    SHL r0, 1
    LDB r1, [r0 + part_dir]
    LDB r2, [r0 + part_dir + 1]
    LDI r3, PART_VZ
    LDI r4, 24
    LDI r5, 9                       ; orange, every third yellow
    MOV r0, r7
    MOD r0, 3
    JNZ @c
    LDI r5, 14
@c:
    PUSH r7
    CALL spawn_part
    POP r7
    ADD r7, 1
    CMP r7, 12
    JLT @pt
    RET
; r2, r3 = a target -> r0 = its damage (0: out of reach or no line of sight). Clobbers r0-r7.
@hit:
    LD r0, [fx_x]
    SUB r0, r2
    LD r1, [fx_y]
    SUB r1, r3
    PUSH r2
    PUSH r3
    CALL octnorm
    CALL expl_dmg
    POP r3
    POP r2
    CMP r0, 0
    JEQ @h0
    PUSH r0
    LD r0, [fx_x]
    LD r1, [fx_y]
    CALL los
    POP r0
    JZ @h0r
    LDI r0, 0
@h0r:
    RET
@h0:
    RET

; r1, r2 = vx, vy (bytes, signed), r3 = vz, r4 = life, r5 = colour; at fx_x, fx_y, height 0: the first free slot.
; Clobbers r0, r6.
spawn_part:
    LDI r6, parts
@f:
    CMP r6, parts + PART_MAX * PT_SIZE
    JAE @full
    LDB r0, [r6 + PT_LIFE]
    CMP r0, 0
    JEQ @put
    ADD r6, PT_SIZE
    JMP @f
@put:
    LD r0, [fx_x]
    ST [r6 + PT_X], r0
    LD r0, [fx_y]
    ST [r6 + PT_Y], r0
    LDI r0, 0
    ST [r6 + PT_Z], r0
    ST [r6 + PT_VZ], r3
    STB [r6 + PT_VX], r1
    STB [r6 + PT_VY], r2
    STB [r6 + PT_LIFE], r4
    STB [r6 + PT_COL], r5
    LD r0, [n_fx]
    ADD r0, 1
    ST [n_fx], r0
@full:
    RET

; fx_x, fx_y: an acid splash: 6 green particles. Clobbers r0-r7.
splash:
    LDI r7, 0
@s:
    MOV r0, r7
    SHL r0, 2                       ; every other direction
    LDB r1, [r0 + part_dir]
    SHL r1, 8
    SAR r1, 9                       ; half speed (sign-extended)
    LDB r2, [r0 + part_dir + 1]
    SHL r2, 8
    SAR r2, 9
    LDI r3, PART_VZ / 2
    LDI r4, 16
    LDI r5, 11
    PUSH r7
    CALL spawn_part
    POP r7
    ADD r7, 1
    CMP r7, 6
    JLT @s
    RET

; ---- after the enemies: acid balls, particles and the lights (DESIGN §6.7, 6.9, 6.10) -------------------------
fx_frame:
    LD r0, [n_fx]
    CMP r0, 0
    JNE @go
    ST [np_live], r0
    JMP @lights
@go:
    LDI r0, 0
    ST [fx_i], r0
@ac:
    LD r6, [fx_i]
    CMP r6, ACID_MAX
    JAE @parts
    MUL r6, AC_SIZE
    ADD r6, acids
    ST [fx_p], r6
    LDB r0, [r6 + AC_LIFE]
    CMP r0, 0
    JEQ @acx
    SUB r0, 1
    STB [r6 + AC_LIFE], r0
    LD r0, [r6 + AC_X]
    LD r1, [r6 + AC_VX]
    ADD r0, r1
    ST [r6 + AC_X], r0
    ST [fx_x], r0
    LD r1, [r6 + AC_Y]
    LD r2, [r6 + AC_VY]
    ADD r1, r2
    ST [r6 + AC_Y], r1
    ST [fx_y], r1
    LD r2, [cam_x]                  ; the player: both boxes overlap
    SUB r2, r0
    ADD r2, ACID_R + P_RAD - 1
    CMP r2, 2 * (ACID_R + P_RAD) - 1
    JAE @wall
    LD r2, [cam_y]
    SUB r2, r1
    ADD r2, ACID_R + P_RAD - 1
    CMP r2, 2 * (ACID_R + P_RAD) - 1
    JAE @wall
    LDI r0, ACID_DMG
    LD r1, [fx_x]
    LD r2, [fx_y]
    CALL hurt
    JMP @gone
@wall:
    LD r4, [fx_y]
    SHR r4, 8
    SHL r4, 5
    LD r0, [fx_x]
    SHR r0, 8
    ADD r4, r0
    CALL passable
    JZ @acl
    LD r0, [cam_x]                  ; a splash: the player within SPLASH_R
    LD r1, [fx_x]
    SUB r0, r1
    LD r1, [cam_y]
    LD r2, [fx_y]
    SUB r1, r2
    CALL octnorm
    CMP r0, SPLASH_R + 1
    JAE @gone
    LDI r0, ACID_SPLASH
    LD r1, [fx_x]
    LD r2, [fx_y]
    CALL hurt
@gone:
    LD r6, [fx_p]
    LDI r0, 0
    STB [r6 + AC_LIFE], r0
    LDI r0, SFX_SPLASH
    CALL play_sfx
    CALL splash
    JMP @acx
@acl:
@acx:
    LD r0, [fx_i]
    ADD r0, 1
    ST [fx_i], r0
    JMP @ac
@parts:
    LDI r7, 0                       ; living particles
    LDI r6, parts
@p:
    CMP r6, parts + PART_MAX * PT_SIZE
    JAE @pd
    LDB r0, [r6 + PT_LIFE]
    CMP r0, 0
    JEQ @px
    SUB r0, 1
    STB [r6 + PT_LIFE], r0
    LDB r1, [r6 + PT_VX]
    SHL r1, 8
    SAR r1, 8
    LD r2, [r6 + PT_X]
    ADD r2, r1
    ST [r6 + PT_X], r2
    LDB r1, [r6 + PT_VY]
    SHL r1, 8
    SAR r1, 8
    LD r2, [r6 + PT_Y]
    ADD r2, r1
    ST [r6 + PT_Y], r2
    LD r1, [r6 + PT_VZ]
    LD r2, [r6 + PT_Z]
    ADD r2, r1
    ST [r6 + PT_Z], r2
    SUB r1, PART_G
    ST [r6 + PT_VZ], r1
    CMP r2, 0
    JGE @alive
    LDI r0, 0
    STB [r6 + PT_LIFE], r0
@alive:
    CMP r0, 0
    JEQ @px
    ADD r7, 1
@px:
    ADD r6, PT_SIZE
    JMP @p
@pd:
    ST [np_live], r7
    LDI r6, acids                   ; n_fx: particles and acid balls still alive
@na:
    CMP r6, acids + ACID_MAX * AC_SIZE
    JAE @nd
    LDB r0, [r6 + AC_LIFE]
    CMP r0, 0
    JEQ @nn
    ADD r7, 1
@nn:
    ADD r6, AC_SIZE
    JMP @na
@nd:
    ST [n_fx], r7
@lights:
    LDI r0, 0                       ; light 0: the last explosion, EXPL_LIGHT - t / 4
    LD r1, [expl_t]
    CMP r1, EXPL_LIGHT * 4
    JAE @l0
    SHR r1, 2
    LDI r0, EXPL_LIGHT
    SUB r0, r1
@l0:
    ST [dl_i], r0
    LD r1, [expl_cell]
    ST [dl_cell], r1
    LDI r0, 0                       ; light 1: the first acid ball in flight
    LDI r6, acids
@l1:
    CMP r6, acids + ACID_MAX * AC_SIZE
    JAE @l1d
    LDB r1, [r6 + AC_LIFE]
    CMP r1, 0
    JNE @l1f
    ADD r6, AC_SIZE
    JMP @l1
@l1f:
    LD r1, [r6 + AC_Y]
    SHR r1, 8
    SHL r1, 5
    LD r2, [r6 + AC_X]
    SHR r2, 8
    ADD r1, r2
    ST [dl_cell + 2], r1
    LDI r0, ACID_LIGHT
@l1d:
    ST [dl_i + 2], r0
    RET

; r5 = enemy (a Spottare): an acid ball from it at the player's position now (DESIGN §6.10), the first free slot.
; Clobbers r0-r4, r6.
spit:
    LDI r0, SFX_SPIT
    CALL play_sfx
    LDI r6, acids
@f:
    CMP r6, acids + ACID_MAX * AC_SIZE
    JAE @full
    LDB r0, [r6 + AC_LIFE]
    CMP r0, 0
    JEQ @put
    ADD r6, AC_SIZE
    JMP @f
@put:
    PUSH r6
    LD r0, [cam_x]
    LD r1, [cam_y]
    LDI r2, ACID_V
    CALL en_vel                     ; the step into E_VX, E_VY (the Spottare stands while it aims)
    POP r6
    LD r0, [r5 + E_X]
    ST [r6 + AC_X], r0
    LD r0, [r5 + E_Y]
    ST [r6 + AC_Y], r0
    LD r0, [r5 + E_VX]
    ST [r6 + AC_VX], r0
    LD r0, [r5 + E_VY]
    ST [r6 + AC_VY], r0
    LDI r0, ACID_LIFE
    STB [r6 + AC_LIFE], r0
    LD r0, [n_fx]
    ADD r0, 1
    ST [n_fx], r0
@full:
    RET

; r2 = map cell -> r0 = its dynamic light (DESIGN §6.7): max over the image's lights of I - Chebyshev distance.
; Clobbers r0, r1, r3, r4.
dyn_light:
    LDI r0, 0
    LDI r4, 0
@l:
    LD r3, [r4 + rdl_i]
    CMP r3, 0
    JEQ @n
    LD r1, [r4 + rdl_cell]
    PUSH r0
    MOV r0, r1                      ; |dx| in cells
    AND r0, 31
    MOV r3, r2
    AND r3, 31
    SUB r0, r3
    JGE @x
    NEG r0
@x:
    SHR r1, 5                       ; |dy|
    MOV r3, r2
    SHR r3, 5
    SUB r1, r3
    JGE @y
    NEG r1
@y:
    CMP r1, r0
    JGE @m
    MOV r1, r0
@m:
    LD r3, [r4 + rdl_i]
    SUB r3, r1
    POP r0
    CMP r3, r0
    JLE @n
    MOV r0, r3
@n:
    ADD r4, 2
    CMP r4, 4
    JLT @l
    RET

; ---- drawing, after the masked planes and before the weapon: particles, acid balls, the vignette ---------------
.var pd_h                           ; a point's height, colour, size
.var pd_c
.var pd_s
draw_fx:
    LD r0, [n_fx]
    CMP r0, 0
    JEQ @vig
    LDI r6, parts
@p:
    CMP r6, parts + PART_MAX * PT_SIZE
    JAE @a
    LDB r0, [r6 + PT_LIFE]
    CMP r0, 0
    JEQ @pn
    LD r0, [r6 + PT_Z]
    ST [pd_h], r0
    LDB r0, [r6 + PT_COL]
    ST [pd_c], r0
    LDI r0, 2
    ST [pd_s], r0
    LD r0, [r6 + PT_X]
    LD r1, [r6 + PT_Y]
    PUSH r6
    CALL pt_draw
    POP r6
@pn:
    ADD r6, PT_SIZE
    JMP @p
@a:
    LDI r6, acids
@ac:
    CMP r6, acids + ACID_MAX * AC_SIZE
    JAE @vig
    LDB r0, [r6 + AC_LIFE]
    CMP r0, 0
    JEQ @an
    LDI r0, 128
    ST [pd_h], r0
    LDI r0, 11
    ST [pd_c], r0
    LDI r0, 3
    ST [pd_s], r0
    LD r0, [r6 + AC_X]
    LD r1, [r6 + AC_Y]
    PUSH r6
    CALL pt_draw
    POP r6
@an:
    ADD r6, AC_SIZE
    JMP @ac
@vig:
    LDI r6, 0                       ; the vignette: per corner a 2 x 2 tile map (DESIGN §6.8)
@v:
    LDB r4, [r6 + vig_pos]
    LDB r5, [r6 + vig_pos + 1]
    MOV r0, r6
    ADD r0, vig_maps
    LDI r1, vig_tiles
    LDI r2, 2
    LDI r3, 2
    SYS MAP
    ADD r6, 4
    CMP r6, 16
    JLT @v
    RET

; r0, r1 = a point (u8.8), pd_h its height (1/256 cell), pd_c colour, pd_s size: a square projected like a sprite's
; centre (z in u8.8 from the products of §6.2), drawn if it is on the screen and nearer than the wall in its column.
; Clobbers r0-r7.
pt_draw:
    LD r2, [rcam_x]
    SUB r0, r2
    LD r2, [rcam_y]
    SUB r1, r2
    MOV r2, r0
    ADD r2, 2047
    CMP r2, 4095
    JAE @no
    MOV r2, r1
    ADD r2, 2047
    CMP r2, 4095
    JAE @no
    PUSH r0
    PUSH r1
    LD r1, [rcam_c8]
    CALL mt8
    MOV r5, r0
    POP r1
    PUSH r1
    MOV r0, r1
    LD r1, [rcam_s8]
    CALL mt8
    ADD r5, r0                      ; z
    POP r1
    POP r0
    CMP r5, SPR_NEAR
    JLT @no
    PUSH r0
    MOV r0, r1
    LD r1, [rcam_c8]
    CALL mt8
    MOV r6, r0
    POP r0
    LD r1, [rcam_s8]
    CALL mt8
    SUB r6, r0                      ; lat
    MOV r0, r6
    CMP r0, 0
    JGE @la
    NEG r0
@la:
    CMP r0, r5
    JGE @no                         ; outside the view (|lat| >= z)
    LDI r7, F256
    DIV r7, r5                      ; h
    MOV r0, r6
    MUL r0, r7                      ; |lat h| < F256
    SAR r0, 8
    ADD r0, 64                      ; x
    CMP r0, 0
    JLT @no
    CMP r0, 127
    JGT @no
    MOV r1, r0
    SHR r1, 1
    SHL r1, 1
    LD r1, [r1 + col_h]
    CMP r7, r1
    JLE @no                         ; the wall is nearer
    LD r1, [pd_h]
    MUL r1, r7
    SHR r1, 8
    MOV r2, r7
    SHR r2, 1
    LD r3, [hor]
    ADD r2, r3
    SUB r2, r1                      ; y
    MOV r1, r2
    LD r2, [pd_s]
    CMP r7, 25
    JAE @big
    LDI r2, 1                       ; beyond 4 cells: one pixel
@big:
    MOV r3, r2
    SHR r3, 1
    SUB r0, r3
    SUB r1, r3
    MOV r3, r2
    LD r4, [pd_c]
    SYS RECTFILL
@no:
    RET

; ---- after the weapon: the damage flash (DESIGN §6.8) -------------------------------------------------------
draw_dmg:
    LD r0, [dmg_t]
    CMP r0, 0
    JEQ @no
    LDI r0, 0
    LDI r1, 0
    LDI r2, 128
    LDI r3, 128
    LDI r4, 6
    SYS RECT
    LDI r0, 1
    LDI r1, 1
    LDI r2, 126
    LDI r3, 126
    LDI r4, 6
    SYS RECT
    LD r5, [dmg_dir]
    SHL r5, 3
    LD r0, [r5 + dmg_bar]
    LD r1, [r5 + dmg_bar + 2]
    LD r2, [r5 + dmg_bar + 4]
    LD r3, [r5 + dmg_bar + 6]
    LDI r4, 6
    SYS RECTFILL
@no:
    RET

.data
; 12 directions (DESIGN §6.9): round(PART_V cos), round(PART_V sin) of 30 k degrees
part_dir:
    .byte 20, 0, 17, 10, 10, 17, 0, 20, 246, 17, 239, 10, 236, 0, 239, 246, 246, 239, 0, 236, 10, 239, 17, 246
; the vignette (DESIGN §6.8): per corner x, y and its 2 x 2 map (4 bytes each; tile 0 empty)
vig_pos:
    .byte 0, 0, 0, 0, 112, 0, 0, 0, 0, 112, 0, 0, 112, 112, 0, 0
vig_maps:
    .byte 1, 2, 3, 4
    .byte 5, 6, 7, 8
    .byte 9, 10, 11, 12
    .byte 13, 14, 15, 16
; in xdata, copied to RAM by init (DESIGN §9 cut list)
VIG_BYTES = 544
.var vig_tiles, VIG_BYTES
.xdata
vig_tiles_x:
    .byte 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    .byte 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    .byte 17, 17, 17, 16, 17, 17, 17, 1, 17, 17, 16, 16, 1, 1, 1, 1
    .byte 17, 17, 17, 16, 1, 1, 1, 1, 16, 17, 16, 16, 1, 1, 1, 1
    .byte 16, 16, 16, 0, 1, 0, 0, 0, 16, 16, 16, 16, 0, 0, 0, 0
    .byte 16, 16, 16, 0, 1, 0, 0, 0, 16, 16, 0, 0, 0, 0, 0, 0
    .byte 17, 16, 16, 16, 1, 1, 1, 0, 16, 16, 16, 16, 0, 0, 0, 0
    .byte 16, 16, 16, 16, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0
    .byte 16, 16, 16, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0
    .byte 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    .byte 0, 1, 1, 1, 0, 0, 0, 16, 1, 1, 1, 1, 0, 0, 0, 0
    .byte 0, 1, 1, 1, 0, 0, 0, 16, 0, 0, 1, 1, 0, 0, 0, 0
    .byte 1, 17, 17, 17, 16, 17, 17, 17, 1, 1, 17, 17, 16, 16, 16, 16
    .byte 1, 17, 17, 17, 16, 16, 16, 16, 1, 1, 17, 1, 16, 16, 16, 16
    .byte 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0
    .byte 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    .byte 1, 1, 1, 17, 0, 16, 16, 16, 1, 1, 1, 1, 0, 0, 0, 0
    .byte 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0
    .byte 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 16, 16, 16, 16
    .byte 0, 0, 0, 0, 16, 16, 16, 16, 1, 1, 1, 0, 17, 16, 16, 16
    .byte 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0
    .byte 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 16, 16, 16, 0
    .byte 1, 1, 1, 1, 16, 17, 16, 16, 1, 1, 1, 1, 17, 17, 17, 16
    .byte 1, 1, 1, 1, 17, 17, 16, 16, 17, 17, 17, 1, 17, 17, 17, 16
    .byte 0, 0, 0, 0, 16, 16, 0, 0, 1, 0, 0, 0, 16, 16, 16, 0
    .byte 0, 0, 0, 0, 16, 16, 16, 16, 1, 0, 0, 0, 16, 16, 16, 0
    .byte 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
    .byte 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1
    .byte 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1
    .byte 0, 0, 0, 0, 1, 1, 1, 1, 0, 16, 16, 16, 1, 1, 1, 17
    .byte 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 16, 0, 1, 1, 1
    .byte 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 16, 0, 1, 1, 1
    .byte 16, 16, 16, 16, 1, 1, 17, 1, 16, 16, 16, 16, 1, 17, 17, 17
    .byte 16, 16, 16, 16, 1, 1, 17, 17, 16, 17, 17, 17, 1, 17, 17, 17
.data
; the damage direction's bar: x, y, w, h (front = top, right, back = bottom, left)
dmg_bar:
    .word 32, 0, 64, 4, 124, 32, 4, 64, 32, 124, 64, 4, 0, 32, 4, 64
.code
