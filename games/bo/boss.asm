; Bosses (DESIGN.md §10). Stora Måsen (1-5 Skateparken): (0) flies to and fro high up, (1) SKRIII and blinking for
; 1 s, (2) dives at where Bo was, (3) lands and is dizzy for 2 s: then Bo lands on it, it drops a box of pommes and
; (4) flies up again. After three: it drops the whole bag. Nobody is hurt; the pattern gets a little faster.
BS_FLY   = 0
BS_WARN  = 1
BS_DIVE  = 2
BS_DIZZY = 3
BS_RISE  = 4
BOSS_HITS = 3

b_boss1:
    LD r0, [r7 + AC_SUB]
    SHL r0, 1
    LD r0, [r0 + @states]
    JMP r0
@states:
    .word @fly, @warn, @dive, @dizzy, @rise
@fly:                               ; to and fro between the ramps, a bit faster after every hit
    LD r1, [r7 + AC_VX]
    CMP r1, 0
    JNE @moving
    LD r1, [boss_hits]
    SHL r1, 2
    ADD r1, 20
    NEG r1
    ST [r7 + AC_VX], r1
@moving:
    CALL act_move
    CALL act_pos
    CMP r1, 24
    JLT @turn
    LD r0, [lv_wpx]
    SUB r0, 24
    CMP r1, r0
    JLT @flew
@turn:
    LD r0, [r7 + AC_X]
    LD r1, [r7 + AC_VX]
    SUB r0, r1
    ST [r7 + AC_X], r0
    NEG r1
    ST [r7 + AC_VX], r1
@flew:
    LD r0, [r7 + AC_T]
    ADD r0, 1
    ST [r7 + AC_T], r0
    CMP r0, 100
    JLT @done
    LD r0, [bo_state]               ; warn only when Bo is on the ground (he can see it coming)
    CMP r0, ST_GROUND
    JNE @done
    LDI r0, BS_WARN
    ST [r7 + AC_SUB], r0
    LDI r0, 0
    ST [r7 + AC_T], r0
    CALL feet                       ; the target: where Bo is now
    ST [boss_tx], r1
    ST [boss_ty], r2
    LDI r0, SFX_SKRII
    CALL play_sfx
    LDI r0, TX_SKRIII
    ST [joke_id], r0
    LDI r0, 50
    ST [joke_t], r0
    CALL act_pos
    ST [joke_x], r1
    ST [joke_y], r2
@done:
    RET
@warn:                              ; 1 s of blinking (drawn), then the dive
    LD r0, [r7 + AC_T]
    ADD r0, 1
    ST [r7 + AC_T], r0
    CMP r0, 60
    JLT @done
    LDI r0, BS_DIVE
    ST [r7 + AC_SUB], r0
    CALL act_pos                    ; velocity: straight at the target, 3 px per frame (+1 per hit)
    LD r3, [boss_tx]
    SUB r3, r1
    LD r4, [boss_ty]
    SUB r4, r2
    MOV r5, r3                      ; frames = max(|dx|, |dy|) / speed
    CMP r5, 0
    JGE @ax
    NEG r5
@ax:
    MOV r6, r4
    CMP r6, 0
    JGE @ay
    NEG r6
@ay:
    CMP r5, r6
    JGE @max
    MOV r5, r6
@max:
    LD r0, [boss_hits]
    ADD r0, 3
    DIV r5, r0
    ADD r5, 1
    ST [r7 + AC_T], r5
    SHL r3, 4
    DIV r3, r5
    ST [r7 + AC_VX], r3
    SHL r4, 4
    DIV r4, r5
    ST [r7 + AC_VY], r4
    RET
@dive:
    CALL act_move
    LD r0, [r7 + AC_T]
    SUB r0, 1
    ST [r7 + AC_T], r0
    JGT @done
    CALL act_pos                    ; landed: on the ground, dizzy
    MOV r3, r2
    ADD r3, 24
    SUB r2, 8
    LDI r6, 0
    CALL surface
    CMP r0, NONE
    JEQ @nofloor
    SHL r0, 4
    ST [r7 + AC_Y], r0
@nofloor:
    LDI r0, BS_DIZZY
    ST [r7 + AC_SUB], r0
    LD r0, [boss_hits]              ; 2 s, a little shorter after every hit
    MUL r0, 10
    NEG r0
    ADD r0, 120
    ST [r7 + AC_T], r0
    LDI r0, 0
    ST [r7 + AC_VX], r0
    ST [r7 + AC_VY], r0
    RET
@dizzy:
    LD r0, [r7 + AC_T]
    SUB r0, 1
    ST [r7 + AC_T], r0
    JGT @done
@up:
    LDI r0, BS_RISE
    ST [r7 + AC_SUB], r0
    RET
@rise:
    LD r0, [r7 + AC_Y]
    SUB r0, 24
    ST [r7 + AC_Y], r0
    SAR r0, 4
    LD r1, [r7 + AC_HY]
    CMP r0, r1
    JGT @done
    SHL r1, 4
    ST [r7 + AC_Y], r1
    LDI r0, BS_FLY
    ST [r7 + AC_SUB], r0
    LDI r0, 0
    ST [r7 + AC_T], r0
    ST [r7 + AC_VX], r0
    ST [r7 + AC_VY], r0
    RET

; boss1_contact: r7 = the boss overlapping Bo
boss1_contact:
    LD r0, [r7 + AC_SUB]
    CMP r0, BS_DIVE
    JEQ @dive
    CMP r0, BS_DIZZY
    JNE @none
    LD r0, [bo_state]               ; dizzy: landing on it counts, touching it does nothing
    CMP r0, ST_AIR
    JNE @none
    LD r0, [bo_vy]
    CMP r0, 0
    JLE @none
    LD r0, [bo_pfoot]
    LD r1, [t_atop]
    ADD r1, 4
    CMP r0, r1
    JGT @none
    LDI r0, EV_STOMP
    CALL event
    LDI r0, STOMP_V
    NEG r0
    ST [bo_vy], r0
    LDI r0, SFX_POFF
    CALL play_sfx
    LD r0, [boss_hits]
    ADD r0, 1
    ST [boss_hits], r0
    CMP r0, BOSS_HITS
    JGE @won
    CALL act_pos                    ; it drops a box of pommes
    SUB r2, 4
    MOV r6, r1
    SHR r6, 3
    PUSH r7
    MOV r7, r2
    SHR r7, 3
    MOV r1, r6
    SHL r1, 5
    ADD r1, r7
    LDB r0, [r1 + lvl]
    CMP r0, 0
    JNE @full
    LDI r0, T_POMMES
    CALL set_cell
@full:
    POP r7
    LDI r0, BS_RISE
    ST [r7 + AC_SUB], r0
@none:
    RET
@dive:
    LDI r0, EV_HIT
    CALL event
    JMP bo_hit
@won:                               ; the whole bag: MINA POMMES! -> POMMES POWER! -> (at the goal) JAG GJORDE DET!
    LDI r0, AS_JOKE
    ST [r7 + AC_ST], r0
    LDI r0, 80
    ST [r7 + AC_T], r0
    LDI r0, -24
    ST [r7 + AC_VY], r0
    LDI r0, 16
    ST [r7 + AC_VX], r0
    LD r1, [r7 + AC_EN]
    LDI r2, 2
    STB [r1 + en_st], r2
    LDI r0, TX_MINA_POMMES
    CALL say
    LDI r0, PW_POMMES
    ST [pw_kind], r0
    LDI r0, 600
    ST [pw_t], r0
    LDI r0, TX_POMMES_POWER
    ST [banner_id], r0
    LDI r0, 90
    ST [banner_t], r0
    LDI r0, 150
    ST [boss_win_t], r0
    RET

; ---- Jättekaninen (2-5 Kaninjakten, DESIGN §10.2) ------------------------------------------------------
; A chase level: the rabbit appears behind Bo and hops after him in big arcs, on average a little slower than
; Bo's top speed (each hop aims to land a little behind where Bo will be). Every landing shakes the ground: Bo on the ground wobbles and loses
; a quarter of his speed (no hit). If it catches Bo it is a hit, and after a lost life the chase starts again from the
; flag with the rabbit further back. At the brook it stops, sniffs and eats the carrots.
RB_SIT  = 0
RB_AIR  = 1
RB_EAT  = 2
RB_AIRTIME = 35                     ; frames of a hop (launch -52, gravity 3)
RB_BEHIND = 24                      ; px
CHASE_FIRST = 60                    ; frames before it appears at the start of the level
CHASE_AGAIN = 150                   ; ... and after a lost life (further back)

b_rabbit:
    LD r0, [r7 + AC_SUB]
    CMP r0, RB_AIR
    JEQ @air
    CMP r0, RB_EAT
    JEQ @eat
    LD r0, [r7 + AC_T]              ; sitting: a moment, then the next hop
    SUB r0, 1
    ST [r7 + AC_T], r0
    JGT @done
    CALL act_pos
    LD r0, [chase_stop]             ; at the brook: it stops and eats
    SUB r0, 12
    CMP r1, r0
    JLT @hop
    LDI r0, RB_EAT
    ST [r7 + AC_SUB], r0
    RET
@hop:
    CALL dir_to_bo                  ; r0 = direction, r3 = distance to Bo
    CMP r0, 0
    JLT @back
    LD r2, [bo_vx]                  ; aim at landing RB_BEHIND px behind where Bo will be (at his speed now):
    SUB r3, RB_BEHIND               ; vx = (distance - RB_BEHIND) * 16 / RB_AIRTIME + Bo's vx, within the table's
    SHL r3, 4                       ; two speeds; a Bo who stands still is reached on the next hop
    DIV r3, RB_AIRTIME
    ADD r3, r2
    CALL en_row_of
    LDB r0, [r1 + 3]
    CMP r3, r0
    JLT @set
    LDB r0, [r1 + 7]
    CMP r3, r0
    JGT @set
    MOV r0, r3
    JMP @set
@back:                              ; Bo is behind it: small hops back
    LDI r0, -12
@set:
    ST [r7 + AC_VX], r0
    LDI r0, -52
    ST [r7 + AC_VY], r0
    LDI r0, RB_AIR
    ST [r7 + AC_SUB], r0
@done:
    RET
@eat:
    LDI r0, 0
    ST [r7 + AC_VX], r0
    RET
@air:
    LD r0, [r7 + AC_X]
    LD r1, [r7 + AC_VX]
    ADD r0, r1
    LD r1, [chase_stop]             ; never past the brook's edge
    SUB r1, 12
    SHL r1, 4
    CMP r0, r1
    JLT @x
    MOV r0, r1
@x:
    ST [r7 + AC_X], r0
    CALL act_pos
    MOV r6, r2                      ; feet before
    LD r0, [r7 + AC_VY]
    ADD r0, 3
    CMP r0, 64
    JLE @v
    LDI r0, 64
@v:
    ST [r7 + AC_VY], r0
    LD r1, [r7 + AC_Y]
    ADD r1, r0
    ST [r7 + AC_Y], r1
    CMP r0, 0
    JLT @done
    CALL act_pos
    MOV r3, r2
    MOV r2, r6
    LDI r6, 0
    CALL surface
    CMP r0, NONE
    JEQ @nofloor
    SHL r0, 4                       ; landed: the ground shakes
    ST [r7 + AC_Y], r0
    LDI r0, RB_SIT
    ST [r7 + AC_SUB], r0
    LDI r0, 0
    ST [r7 + AC_VY], r0
    ST [r7 + AC_VX], r0
    LDI r0, 8
    ST [r7 + AC_T], r0
    LDI r0, SFX_BUMP
    CALL play_sfx
    LD r0, [bo_state]
    CMP r0, ST_GROUND
    JNE @done
    LD r0, [bo_sattr]               ; not on a kicker (it would ruin the jump over the brook)
    AND r0, 15
    CMP r0, C_RAMP
    JEQ @done
    LD r0, [bo_vx]                  ; a quarter of his speed is lost
    MOV r1, r0
    SAR r1, 2
    SUB r0, r1
    ST [bo_vx], r0
    LDI r0, BUMP_T
    ST [bo_bump], r0
    RET
@nofloor:
    CALL act_pos                    ; fell into a pit: it comes back from behind
    CMP r2, LV_ROWS * 8 + 16
    JLT @done
    LDI r0, 0
    ST [r7 + AC_TYPE], r0
    LDI r0, CHASE_FIRST
    ST [chase_t], r0
    RET

; rabbit_contact: r7 = the rabbit overlapping Bo: landing on it bounces Bo, otherwise it caught him (a hit)
rabbit_contact:
    LD r0, [r7 + AC_SUB]
    CMP r0, RB_EAT
    JEQ @none
    LD r0, [bo_state]
    CMP r0, ST_AIR
    JNE @caught
    LD r0, [bo_vy]
    CMP r0, 0
    JLE @caught
    LD r0, [bo_pfoot]
    LD r1, [t_atop]
    ADD r1, 4
    CMP r0, r1
    JGT @caught
    LDI r0, EV_BOUNCE
    CALL event
    LDI r0, STOMP_V
    NEG r0
    ST [bo_vy], r0
    RET
@caught:
    LDI r0, EV_HIT
    CALL event
    JMP bo_hit
@none:
    RET

; chase_step: brings the rabbit on behind Bo when its time comes (only in the chase level)
chase_step:
    LD r0, [chase_stop]
    CMP r0, 0
    JEQ @done
    LD r0, [chase_t]
    CMP r0, 0
    JEQ @done
    SUB r0, 1
    ST [chase_t], r0
    JNZ @done
    CALL act_free_slot
    CMP r7, 0
    JEQ @done
    LD r1, [cam_x]                  ; at the left edge of the screen, on the ground there
    ADD r1, 4
    CMP r1, 8
    JGE @x
    LDI r1, 8
@x:
    PUSH r1
    LDI r2, 0
    LDI r3, LV_ROWS * 8
    LDI r6, 0
    CALL surface
    POP r1
    CMP r0, NONE
    JEQ @done
    MOV r2, r0
    LDI r0, EN_RABBIT
    CALL act_init
    LDI r0, 255
    ST [r7 + AC_EN], r0
    LDI r0, 20
    ST [r7 + AC_T], r0
@done:
    RET

; boss_step: every frame: after the boss is won, the level ends like at a goal
boss_step:
    CALL chase_step
    LD r0, [boss_win_t]
    CMP r0, 0
    JEQ @done
    SUB r0, 1
    ST [boss_win_t], r0
    JNZ @done
    LDI r0, 1
    ST [goal_t], r0
@done:
    RET

.data
spr_rabbit:                         ; 16 x 16, facing right: sitting (4 sprites), then leaping (4 sprites)
.sprite
    ........
    ........
    ........
    ........
    ........
    ........
    ........
    ........
.sprite
    ..ff....
    .fcf.ff.
    .fcffcf.
    .fcfcf..
    ..fff...
    .ffffff.
    fffff0f.
    ffffffcf
.sprite
    ...fffff
    ..ffffff
    .fffffff
    .fffffff
    ffffffff
    afffffff
    .aa.ffa.
    ...fffaa
.sprite
    fffffff.
    ffffff..
    ffffaa..
    fffaa...
    fffa....
    ffaa....
    ffa.....
    fffa....
.sprite
    ........
    ........
    ........
    ........
    ........
    ...ffff.
    .fffffff
    ffffffff
.sprite
    ........
    ......f.
    ....fcf.
    ...fcf..
    ..fff...
    .fffff..
    fffff0f.
    fffffffc
.sprite
    afffffff
    .aafffff
    ...fffaa
    ..ffa...
    .ffa....
    ffa.....
    ........
    ........
.sprite
    ffffff..
    fffaa...
    aa......
    ........
    ........
    ........
    ........
    ........

spr_boss_gull:                      ; 16 x 16: top-left, top-right, bottom-left, bottom-right (facing right)
.sprite
    ........
    ........
    aa......
    .aaa....
    ..aaaa..
    ...aaaaf
    ....ffff
    ...fffff
.sprite
    ........
    ....fff.
    ...ffff1
    ..fffff9
    .ffffff9
    ffffff..
    fffff...
    ffff....
.sprite
    ..ffffff
    .fffffff
    .ffffff.
    ..fffff.
    ...fff..
    ....9...
    ...99...
    ........
.sprite
    fff.....
    ff......
    f.......
    ........
    ........
    ..9.....
    .99.....
    ........
.code
