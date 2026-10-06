; Enemies (DESIGN.md §9): nine behaviours, each enemy a behaviour plus a row of the enemy table. Nobody dies:
; landing on an enemy is a small joke and Bo bounces up; touching one from the side is a hit (§6).
; Actor fields (ACT_SIZE bytes, word each)
AC_TYPE = 0
AC_X    = 2                         ; centre x, 1/16 px
AC_Y    = 4                         ; bottom y, 1/16 px
AC_VX   = 6
AC_VY   = 8
AC_ST   = 10                        ; AS_*
AC_T    = 12
AC_EN   = 14                        ; index in the level's enemy list (255: a projectile)
AC_HX   = 16                        ; home, px
AC_HY   = 18
AC_SUB  = 20                        ; behaviour state
ACT_SIZE = 22
MAX_ACT  = 12
MAX_EN   = 40
AS_LIVE  = 0
AS_JOKE  = 1
AS_SLEEP = 2
; behaviours
B_WALK   = 0
B_DIVE   = 1
B_FLY    = 2
B_BOUNCE = 3
B_THROW  = 4
B_PROJ   = 5
B_ROLL   = 6
B_PIGEON = 7
B_BOSS1  = 8
B_PLAT   = 9                        ; a moving platform drifting back and forth (log)
B_BUS    = 10                       ; a moving platform that drives off when Bo stands on it (the bus)
B_RABBIT = 11                       ; Jättekaninen: hops after Bo (the chase of 2-5), spawned by boss_step
B_DOZER  = 12                       ; Bulldozern (3-5), dozer.asm
B_STILL  = 13                       ; does nothing (the bulldozer's sand piles)
B_LIFT   = 14                       ; a ski-lift chair: up the cable (45 degrees), then back at the bottom
; stomp outcomes
O_APPLE  = 0
O_AWAY   = 1
O_HIT    = 2
O_HOME   = 3
O_FLAT   = 4
O_SLEEP  = 5
O_RUN    = 6
O_FLAPS  = 7
O_PILE   = 8
O_JELLY  = 9
O_STAND  = 10
; flags
F_HARM  = 1                         ; the body hurts
F_TALL  = 2                         ; 8 x 16 (two sprites)
F_WIDE  = 4                         ; 16 x 8
F_RIGHT = 8                         ; the sprite faces right
F_BIG   = 16                        ; 16 x 16 (four sprites)
F_PLAT  = 32                        ; a moving platform: its top carries Bo, no contact (drawn from world tiles)
F_BOSS  = 64                        ; an arena boss: comes on at once and stays, wherever the camera is
; events (for the tests): what happened at a contact
EV_STOMP  = 1
EV_HIT    = 2
EV_HELMET = 3
EV_BOUNCE = 4
EV_POMMES = 5
EV_KNOCK  = 6
EV_SPIKY  = 7
EN_CONE = 14
EN_SNOWBALL = 15
EN_POPCORN = 16
JOKE_T = 40
LIFT_WAIT = 120                     ; frames a lift chair waits at the bottom station
PIGEON_NEAR = 48                    ; px: a pigeon flies up when Bo rolls this near

.data
; per type: behaviour, box w, box h, speed (throwers: projectile type), outcome, flags, joke text, 0
en_table:
    .byte 0, 0, 0, 0, 0, 0, 255, 0
    .byte B_WALK,   8, 6, 4, O_APPLE, F_HARM, TX_POFF, 0             ; 1 snail
    .byte B_DIVE,  14, 8, 0, O_AWAY,  F_HARM | F_WIDE | F_RIGHT, 255, 0 ; 2 gull
    .byte B_WALK,   8, 7, 6, O_HIT,   F_HARM | F_RIGHT, 255, 0      ; 3 hedgehog
    .byte B_FLY,    6, 6, 0, O_HOME,  F_HARM | F_RIGHT, TX_POFF, 0  ; 4 wasp
    .byte B_BOUNCE, 8, 8, 8, O_FLAT,  F_HARM, 255, 0               ; 5 ball
    .byte B_WALK,   8, 14, 4, O_SLEEP, F_HARM | F_TALL, TX_ZZZ, 0   ; 6 teddy
    .byte B_THROW,  8, 8, EN_CONE, O_RUN, 0, TX_POFF, 0             ; 7 squirrel
    .byte B_PIGEON, 8, 6, 4, O_FLAPS, F_HARM, TX_POFF, 0            ; 8 pigeon
    .byte B_THROW,  8, 15, EN_SNOWBALL, O_PILE, F_TALL, 255, 0      ; 9 snowman
    .byte B_ROLL,   8, 5, 20, O_HIT,  F_HARM, 255, 0               ; 10 sled
    .byte B_WALK,   8, 8, 4, O_JELLY, F_HARM, 255, 0               ; 11 jelly man
    .byte B_BOUNCE, 8, 7, 12, O_APPLE, F_HARM, TX_SPLAT, 0          ; 12 candy blob
    .byte B_THROW,  8, 8, EN_POPCORN, O_STAND, F_RIGHT, 255, 0      ; 13 popcorn cannon
    .byte B_PROJ,   4, 4, 0, O_HIT,   F_HARM, 255, 0               ; 14 cone
    .byte B_PROJ,   4, 4, 0, O_HIT,   F_HARM, 255, 0               ; 15 snowball
    .byte B_PROJ,   4, 4, 0, O_HIT,   F_HARM, 255, 0               ; 16 popcorn
    .byte B_BOSS1, 14, 12, 16, O_STAND, F_BIG | F_RIGHT, 255, 0     ; 17 Stora Måsen (boss of world 1)
    .byte B_PLAT,  24, 6, 6, O_STAND, F_PLAT, 255, 10               ; 18 log: back and forth over 10 columns
    .byte B_BUS,   48, 16, 16, O_STAND, F_PLAT, 255, 160            ; 19 bus: drives 160 columns once Bo is on
    .byte B_RABBIT, 14, 14, 8, O_STAND, F_BIG | F_RIGHT, 255, 36    ; 20 Jättekaninen: hop speed 8..36 (boss.asm)
    .byte B_DOZER, 32, 16, 0, O_STAND, F_RIGHT | F_BOSS, 255, 21             ; 21 Bulldozern: drives up to 21 columns left of home
    .byte B_STILL, 8, 5, 0, O_STAND, 0, 255, 0                      ; 22 sand pile (slows Bo)
    .byte B_LIFT,  16, 8, 8, O_STAND, F_PLAT, 255, 24               ; 23 ski-lift chair: 24 columns up the cable
    .byte B_PLAT,  24, 6, 6, O_STAND, F_PLAT, 255, 10               ; 24 marshmallow raft: like the log
    .byte B_BOSS1, 14, 12, 16, O_STAND, F_BIG | F_RIGHT | F_BOSS, 255, 0 ; 25 Stora Måsen in the final (5-5)
en_sprites:
    .word 0, spr_en_snail, spr_en_gull, spr_en_hedgehog, spr_en_wasp, spr_en_ball, spr_en_teddy, spr_en_squirrel
    .word spr_en_pigeon, spr_en_snowman, spr_en_sled, spr_en_jelly, spr_en_blob, spr_en_cannon, spr_en_cone
    .word spr_en_snowball, spr_en_popcorn, RA_BOSS_GULL, plat_log, plat_bus, RA_RABBIT, RA_DOZER, RA_SANDPILE, plat_chair, plat_raft, RA_BOSS_GULL5
behaviours: .word b_walk, b_dive, b_fly, b_bounce, b_throw, b_proj, b_roll, b_pigeon, b_boss1, b_plat, b_bus, b_rabbit
            .word b_dozer, b_still, b_lift
; platform pictures (instead of a sprite): columns, rows, rows above its top, then world tile codes row by row
plat_log:   .byte 3, 1, 0, TW_LOG_L, TW_LOG_M, TW_LOG_R
plat_raft:  .byte 3, 1, 0, TW_RAFT_L, TW_RAFT_M, TW_RAFT_R
plat_chair: .byte 2, 2, 1, TW_CHAIR_TL, TW_CHAIR_TR, TW_CHAIR, TW_CHAIR
plat_bus:   .byte 6, 2, 0, TW_BUS_R, TW_BUS_W, TW_BUS_W, TW_BUS_W, TW_BUS_W, TW_BUS_F
            .byte TW_BUS_WH, TW_BUS_B, TW_BUS_B, TW_BUS_B, TW_BUS_B, TW_BUS_WH
sine32:     .byte 0, 2, 5, 7, 8, 10, 11, 12, 12, 12, 11, 10, 8, 7, 5, 2, 0, 254, 251, 249, 248, 246, 245, 244
            .byte 244, 244, 245, 246, 248, 249, 251, 254
.code

; ---- the enemy list (from the level's objects) -------------------------------------------------------
os_enemy:                           ; stamping: r6 = column, r7 = bottom row, r5 = type
    CMP r5, EN_RABBIT               ; the chase: the rabbit's object is where it stops; boss_step brings it on
    JNE @list
    MOV r0, r6
    SHL r0, 3
    ST [chase_stop], r0
    LDI r0, CHASE_FIRST
    ST [chase_t], r0
    RET
@list:
    LD r1, [en_n]
    CMP r1, MAX_EN
    JGE @full
    STB [r1 + en_type], r5
    STB [r1 + en_row], r7
    LDI r0, 0
    STB [r1 + en_st], r0
    SHL r1, 1
    ST [r1 + en_col], r6
    SHR r1, 1
    ADD r1, 1
    ST [en_n], r1
@full:
    RET

; actors_reset: no actors; every enemy can come back (after a fall, DESIGN.md §6)
actors_reset:
    LDI r0, 0
    ST [boss_hits], r0              ; a boss fight starts again
    ST [boss_win_t], r0
    LDI r1, 0
@a:
    ST [r1 + actors], r0
    ADD r1, ACT_SIZE
    CMP r1, MAX_ACT * ACT_SIZE
    JLT @a
    LDI r1, 0
@e:
    STB [r1 + en_st], r0
    ADD r1, 1
    CMP r1, MAX_EN
    JLT @e
    RET

; en_byte: r7 = actor -> r1 = its type's row in en_table
en_row_of:
    LD r1, [r7 + AC_TYPE]
    SHL r1, 3
    ADD r1, en_table
    RET

; act_free_slot -> r7 = a free actor (0 if none)
act_free_slot:
    LDI r7, actors
@s:
    LD r0, [r7 + AC_TYPE]
    CMP r0, 0
    JEQ @found
    ADD r7, ACT_SIZE
    CMP r7, actors + MAX_ACT * ACT_SIZE
    JLT @s
    LDI r7, 0
@found:
    RET

; act_init: r7 = slot, r0 = type, r1 = x px, r2 = foot y px
act_init:
    ST [r7 + AC_TYPE], r0
    ST [r7 + AC_HX], r1
    ST [r7 + AC_HY], r2
    SHL r1, 4
    ST [r7 + AC_X], r1
    SHL r2, 4
    ST [r7 + AC_Y], r2
    LDI r0, 0
    ST [r7 + AC_VY], r0
    ST [r7 + AC_ST], r0
    ST [r7 + AC_T], r0
    ST [r7 + AC_SUB], r0
    CALL en_row_of                  ; walkers start walking left, towards Bo
    LDB r2, [r1]
    CMP r2, B_THROW
    JNE @first
    LDI r0, 90                      ; throwers wait a little before the first throw
    ST [r7 + AC_T], r0
@first:
    LDB r0, [r1 + 3]
    CMP r2, B_WALK
    JEQ @walk
    CMP r2, B_PIGEON
    JEQ @walk
    LDI r0, 0
@walk:
    NEG r0
    ST [r7 + AC_VX], r0
    RET

; ---- every frame ---------------------------------------------------------------------------------------
actors_update:
    ; spawn the enemies that come into view
    LDI r6, 0
@spawn:
    LD r0, [en_n]
    CMP r6, r0
    JGE @move
    LDB r0, [r6 + en_st]
    CMP r0, 0
    JNE @nexten
    MOV r1, r6
    SHL r1, 1
    LD r1, [r1 + en_col]
    SHL r1, 3
    ADD r1, 4
    LDB r0, [r6 + en_type]          ; an arena boss comes on at once
    SHL r0, 3
    LDB r0, [r0 + en_table + 5]
    AND r0, F_BOSS
    JNZ @boss
    LD r0, [cam_x]
    SUB r0, 8
    CMP r1, r0
    JLT @nexten
    ADD r0, 144
    CMP r1, r0
    JGT @nexten
@boss:
    CALL act_free_slot
    CMP r7, 0
    JEQ @move
    LDB r2, [r6 + en_row]
    ADD r2, 1
    SHL r2, 3
    LDB r0, [r6 + en_type]
    PUSH r6
    CALL act_init
    POP r6
    ST [r7 + AC_EN], r6
    LDI r0, 1
    STB [r6 + en_st], r0
@nexten:
    ADD r6, 1
    JMP @spawn
@move:
    LDI r0, 0
    ST [t_pn], r0
    LDI r7, actors
@act:
    LD r0, [r7 + AC_TYPE]
    CMP r0, 0
    JEQ @nextact
    PUSH r7
    CALL act_step
    POP r7
    LD r0, [r7 + AC_TYPE]           ; count the moving platforms (surface() looks at them only if any)
    SHL r0, 3
    LDB r0, [r0 + en_table + 5]
    AND r0, F_PLAT
    JZ @nextact
    LD r0, [t_pn]
    ADD r0, 1
    ST [t_pn], r0
@nextact:
    ADD r7, ACT_SIZE
    CMP r7, actors + MAX_ACT * ACT_SIZE
    JLT @act
    LD r0, [t_pn]
    ST [plat_n], r0
    RET

; act_step: r7 = actor: behave, leave when far away, touch Bo
act_step:
    LD r0, [r7 + AC_ST]
    CMP r0, AS_JOKE
    JEQ act_joke
    CMP r0, AS_SLEEP
    JEQ @far
    CALL en_row_of
    LDB r0, [r1]
    SHL r0, 1
    LD r0, [r0 + behaviours]
    CALL r0
    LD r0, [r7 + AC_TYPE]
    CMP r0, 0
    JEQ @done                       ; the behaviour removed it
@far:
    LD r0, [r7 + AC_TYPE]           ; the rabbit stays, however far behind; so do the arena bosses
    CMP r0, EN_RABBIT
    JEQ act_touch
    SHL r0, 3
    LDB r0, [r0 + en_table + 5]
    AND r0, F_BOSS
    JNZ act_touch
    LD r1, [r7 + AC_X]
    SHR r1, 4
    LD r0, [cam_x]
    SUB r0, 40
    CMP r1, r0
    JLT act_free
    ADD r0, 208
    CMP r1, r0
    JGT act_free
    LD r0, [r7 + AC_Y]
    SAR r0, 4
    CMP r0, LV_ROWS * 8 + 16
    JGT act_free
    JMP act_touch
@done:
    RET

; act_free: the actor leaves; its enemy can come back when it comes into view again (unless defeated)
act_free:
    LDI r0, 0
    ST [r7 + AC_TYPE], r0
    LD r1, [bo_plat]                ; a platform leaving takes nobody with it
    CMP r1, r7
    JNE @kept
    ST [bo_plat], r0
@kept:
    LD r1, [r7 + AC_EN]
    CMP r1, MAX_EN
    JGE @done
    LDB r0, [r1 + en_st]
    CMP r0, 1
    JNE @done
    LDI r0, 0
    STB [r1 + en_st], r0
@done:
    RET

act_joke:                           ; the joke after a landing: drifts away, then gone
    LD r0, [r7 + AC_X]
    LD r1, [r7 + AC_VX]
    ADD r0, r1
    ST [r7 + AC_X], r0
    LD r0, [r7 + AC_Y]
    LD r1, [r7 + AC_VY]
    ADD r0, r1
    ST [r7 + AC_Y], r0
    LD r0, [r7 + AC_T]
    SUB r0, 1
    ST [r7 + AC_T], r0
    JNZ @done
    LDI r0, 0
    ST [r7 + AC_TYPE], r0
@done:
    RET

; act_pos: r7 -> r1 = x px, r2 = foot y px
act_pos:
    LD r1, [r7 + AC_X]
    SHR r1, 4
    LD r2, [r7 + AC_Y]
    SAR r2, 4
    RET

; dir_to_bo: r7 -> r0 = +1 if Bo is to the right of the actor, else -1; r3 = |distance| px
dir_to_bo:
    LD r3, [bo_x]
    SHR r3, 4
    LD r0, [r7 + AC_X]
    SHR r0, 4
    SUB r3, r0
    LDI r0, 1
    CMP r3, 0
    JGE @r
    LDI r0, -1
    NEG r3
@r:
    RET

; ---- behaviours (r7 = actor) -----------------------------------------------------------------------------
b_still:
    RET

; plat_move: r7 = platform, r0 = dx this frame (1/16 px): move it, and Bo with it if he stands on it
plat_move:
    LDI r1, 0
; plat_move_xy: the same with r1 = dy
plat_move_xy:
    ST [r7 + AC_VX], r0
    ST [r7 + AC_VY], r1
    LD r2, [r7 + AC_X]
    ADD r2, r0
    ST [r7 + AC_X], r2
    LD r2, [r7 + AC_Y]
    ADD r2, r1
    ST [r7 + AC_Y], r2
    LD r2, [bo_state]
    CMP r2, ST_GROUND
    JNE @off
    LD r2, [bo_plat]
    CMP r2, r7
    JNE @off
    LD r2, [bo_x]
    ADD r2, r0
    ST [bo_x], r2
    LD r2, [bo_y]
    ADD r2, r1
    ST [bo_y], r2
@off:
    RET

b_lift:                             ; waits 2 s at the bottom station, rides up the cable; at the end of its range
    LD r0, [r7 + AC_SUB]            ; back at the bottom (it leaves Bo)
    CMP r0, 0
    JNE @going
    LD r0, [r7 + AC_T]
    ADD r0, 1
    ST [r7 + AC_T], r0
    CMP r0, LIFT_WAIT
    JLT @waiting
    LDI r0, 1
    ST [r7 + AC_SUB], r0
@waiting:
    LDI r0, 0
    LDI r1, 0
    JMP plat_move_xy
@going:
    CALL en_row_of
    LDB r2, [r1 + 7]                ; range in columns
    SHL r2, 3
    LD r3, [r7 + AC_HX]
    ADD r2, r3
    LD r3, [r7 + AC_X]
    SHR r3, 4
    CMP r3, r2
    JLT @ride
    LD r0, [r7 + AC_HX]             ; at the top: back to the bottom station
    SHL r0, 4
    ST [r7 + AC_X], r0
    LD r0, [r7 + AC_HY]
    SHL r0, 4
    ST [r7 + AC_Y], r0
    LDI r0, 0                       ; and waits there again
    ST [r7 + AC_SUB], r0
    ST [r7 + AC_T], r0
    LD r0, [bo_plat]
    CMP r0, r7
    JNE @gone
    LDI r0, 0
    ST [bo_plat], r0
@gone:
    RET
@ride:
    LDB r0, [r1 + 3]                ; right and up at the same speed (45 degrees)
    MOV r1, r0
    NEG r1
    JMP plat_move_xy

; plat_on: r7 = platform -> Z clear if Bo stands on it
plat_on:
    LDI r0, 0
    LD r1, [bo_state]
    CMP r1, ST_GROUND
    JNE @no
    LD r1, [bo_plat]
    CMP r1, r7
    JNE @no
    LDI r0, 1
@no:
    CMP r0, 0
    RET

b_plat:                             ; drifts right over its range, then back to its home, and again
    CALL en_row_of
    LDB r2, [r1 + 7]                ; range in columns
    SHL r2, 3
    LD r3, [r7 + AC_HX]
    ADD r2, r3                      ; the far end, px
    LDB r0, [r1 + 3]                ; speed
    LD r4, [r7 + AC_SUB]            ; 0 = going right, 1 = going back
    CMP r4, 0
    JEQ @right
    NEG r0
@right:
    PUSH r2
    PUSH r3
    CALL plat_move
    POP r3
    POP r2
    LD r1, [r7 + AC_X]
    SHR r1, 4
    LD r4, [r7 + AC_SUB]
    CMP r4, 0
    JNE @back
    CMP r1, r2
    JLT @done
    LDI r4, 1
    ST [r7 + AC_SUB], r4
    RET
@back:
    CMP r1, r3
    JGT @done
    LDI r4, 0
    ST [r7 + AC_SUB], r4
@done:
    RET

b_bus:                              ; waits; once Bo stands on it, drives right until the end of its range
    LD r0, [r7 + AC_SUB]
    CMP r0, 0
    JNE @driving
    CALL plat_on
    JZ @stand
    LDI r0, 1
    ST [r7 + AC_SUB], r0
@driving:
    CALL en_row_of
    LDB r2, [r1 + 7]
    SHL r2, 3
    LD r3, [r7 + AC_HX]
    ADD r2, r3
    LD r3, [r7 + AC_X]
    SHR r3, 4
    CMP r3, r2
    JGE @stand                      ; arrived: stands still
    LDB r0, [r1 + 3]
    JMP plat_move
@stand:
    LDI r0, 0
    JMP plat_move

b_walk:                             ; walks and turns at walls and edges
    LD r0, [r7 + AC_X]
    LD r1, [r7 + AC_VX]
    ADD r0, r1
    ST [r7 + AC_X], r0
    CALL act_pos
    MOV r5, r1
    ADD r1, 3
    LD r0, [r7 + AC_VX]
    CMP r0, 0
    JGE @front
    SUB r1, 7
@front:                             ; r1 = the x just ahead
    PUSH r2
    SUB r2, 4
    CALL cell_attr
    POP r2
    AND r0, 15
    LDB r0, [r0 + class_flags]
    AND r0, CF_WALL
    JNZ act_turn
    MOV r3, r2
    ADD r3, 6
    SUB r2, 6
    MOV r6, r2
    CALL surface                    ; ground ahead?
    CMP r0, NONE
    JEQ act_turn
    MOV r1, r5                      ; follow the ground under the middle
    CALL surface
    CMP r0, NONE
    JEQ @done
    SHL r0, 4
    ST [r7 + AC_Y], r0
@done:
    RET

act_turn:                           ; step back and turn round
    LD r0, [r7 + AC_X]
    LD r1, [r7 + AC_VX]
    SUB r0, r1
    ST [r7 + AC_X], r0
    NEG r1
    ST [r7 + AC_VX], r1
    RET

b_pigeon:                           ; walks; startled by Bo rolling near (not jumping), it flaps and flies away
    LD r0, [r7 + AC_SUB]
    CMP r0, 1
    JEQ @startled
    CMP r0, 2
    JEQ @fly
    LD r0, [bo_state]
    CMP r0, ST_GROUND
    JNE b_walk
    LD r0, [bo_vx]                  ; rolling (standing still does not scare it)
    CMP r0, 0
    JEQ b_walk
    CALL dir_to_bo
    CMP r3, PIGEON_NEAR             ; far enough that Bo riding at push speed finds it gone (DESIGN 9)
    JGT b_walk
    LDI r1, 1
    ST [r7 + AC_SUB], r1
    LDI r1, 12
    ST [r7 + AC_T], r1
    NEG r0
    MUL r0, 24
    ST [r7 + AC_VX], r0
    RET
@startled:                          ; flapping on the spot for 12 frames
    LD r0, [r7 + AC_T]
    SUB r0, 1
    ST [r7 + AC_T], r0
    JNZ @wait
    LDI r0, 2
    ST [r7 + AC_SUB], r0
    LDI r0, -20
    ST [r7 + AC_VY], r0
@wait:
    RET
@fly:
    CALL act_move
    LD r0, [r7 + AC_Y]
    CMP r0, 0
    JLT act_free
    RET

b_fly:                              ; small loops around home
    LD r0, [r7 + AC_T]
    ADD r0, 1
    ST [r7 + AC_T], r0
    MOV r1, r0
    SHR r1, 1
    AND r1, 31
    LDB r1, [r1 + sine32]
    CMP r1, 128
    JLT @x
    SUB r1, 256
@x:
    LD r2, [r7 + AC_HX]
    ADD r1, r2
    SHL r1, 4
    ST [r7 + AC_X], r1
    ADD r0, 8
    AND r0, 31
    LDB r1, [r0 + sine32]
    CMP r1, 128
    JLT @y
    SUB r1, 256
@y:
    SAR r1, 1
    LD r2, [r7 + AC_HY]
    ADD r1, r2
    SHL r1, 4
    ST [r7 + AC_Y], r1
    RET

b_bounce:                           ; hops in arcs (the candy blob towards Bo)
    LD r0, [r7 + AC_SUB]
    CMP r0, 0
    JNE @air
    LD r0, [r7 + AC_T]
    SUB r0, 1
    ST [r7 + AC_T], r0
    JGT @wait
    LDI r0, 1
    ST [r7 + AC_SUB], r0
    LDI r0, -40
    LD r1, [r7 + AC_TYPE]
    CMP r1, 12
    JNE @hop
    LDI r0, -32
    CALL dir_to_bo
    CALL en_row_of
    LDB r1, [r1 + 3]
    MUL r0, r1
    ST [r7 + AC_VX], r0
    LDI r0, -32
@hop:
    ST [r7 + AC_VY], r0
    LD r0, [r7 + AC_VX]
    CMP r0, 0
    JNE @wait
    CALL en_row_of                  ; the ball: hops to the left first
    LDB r0, [r1 + 3]
    NEG r0
    ST [r7 + AC_VX], r0
@wait:
    RET
@air:
    LD r0, [r7 + AC_X]
    LD r1, [r7 + AC_VX]
    ADD r0, r1
    ST [r7 + AC_X], r0
    CALL act_pos
    PUSH r2
    SUB r2, 4
    CALL cell_attr
    POP r2
    AND r0, 15
    LDB r0, [r0 + class_flags]
    AND r0, CF_WALL
    JZ @fall
    CALL act_turn
@fall:
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
    JLT @up
    CALL act_pos
    MOV r3, r2
    MOV r2, r6
    CALL surface
    CMP r0, NONE
    JEQ @up
    SHL r0, 4
    ST [r7 + AC_Y], r0
    LDI r0, 0
    ST [r7 + AC_SUB], r0
    ST [r7 + AC_VY], r0
    LDI r0, 20
    ST [r7 + AC_T], r0
@up:
    RET

b_dive:                             ; the seagull: hovers, warns (SKRIII), dives at where Bo was, rises again
    LD r0, [r7 + AC_SUB]
    SHL r0, 1
    LD r0, [r0 + @subs]
    JMP r0
@subs:
    .word @hover, @warn, @dive, @rise
@hover:
    LD r0, [r7 + AC_T]
    ADD r0, 1
    ST [r7 + AC_T], r0
    MOV r1, r0
    SHR r1, 2
    AND r1, 31
    LDB r1, [r1 + sine32]
    CMP r1, 128
    JLT @hx
    SUB r1, 256
@hx:
    LD r2, [r7 + AC_HX]
    ADD r1, r2
    SHL r1, 4
    ST [r7 + AC_X], r1
    CMP r0, 60
    JLT @done
    CALL dir_to_bo
    CMP r3, 48
    JGT @done
    LDI r0, 1
    ST [r7 + AC_SUB], r0
    LDI r0, 0
    ST [r7 + AC_T], r0
    CALL feet                       ; the target: where Bo is now
    ST [r7 + AC_VX], r1
    SUB r2, 4
    ST [r7 + AC_VY], r2
    LDI r0, SFX_SKRII
    CALL play_sfx
@done:
    RET
@warn:
    LD r0, [r7 + AC_T]
    ADD r0, 1
    ST [r7 + AC_T], r0
    CMP r0, 40
    JLT @done
    LDI r0, 2
    ST [r7 + AC_SUB], r0
    LDI r0, 24
    ST [r7 + AC_T], r0
    CALL act_pos                    ; velocity to the target in 24 frames
    LD r0, [r7 + AC_VX]
    SUB r0, r1
    SHL r0, 4
    DIV r0, 24
    ST [r7 + AC_VX], r0
    LD r0, [r7 + AC_VY]
    SUB r0, r2
    SHL r0, 4
    DIV r0, 24
    ST [r7 + AC_VY], r0
    RET
@dive:
    CALL act_move
    LD r0, [r7 + AC_T]
    SUB r0, 1
    ST [r7 + AC_T], r0
    JNZ @done
    LDI r0, 3
    ST [r7 + AC_SUB], r0
    LDI r0, -24
    ST [r7 + AC_VY], r0
    RET
@rise:                              ; back up to its home
    LD r0, [r7 + AC_HX]
    SHL r0, 4
    LD r1, [r7 + AC_X]
    SUB r0, r1
    SAR r0, 3
    ADD r1, r0
    ST [r7 + AC_X], r1
    LD r0, [r7 + AC_Y]
    SUB r0, 24
    ST [r7 + AC_Y], r0
    CALL act_pos
    LD r0, [r7 + AC_HY]
    CMP r2, r0
    JGT @done
    LDI r0, 0
    ST [r7 + AC_SUB], r0
    ST [r7 + AC_T], r0
    ST [r7 + AC_VX], r0
    RET

; act_move: x += vx, y += vy
act_move:
    LD r0, [r7 + AC_X]
    LD r1, [r7 + AC_VX]
    ADD r0, r1
    ST [r7 + AC_X], r0
    LD r0, [r7 + AC_Y]
    LD r1, [r7 + AC_VY]
    ADD r0, r1
    ST [r7 + AC_Y], r0
    RET

b_throw:                            ; stands still and throws (cones, snowballs, popcorn) when Bo is near
    LD r0, [r7 + AC_T]
    SUB r0, 1
    ST [r7 + AC_T], r0
    JGT @done
    CALL dir_to_bo
    CMP r3, 48
    JGT @done
    CMP r3, 12
    JLT @done
    LDI r1, 120
    ST [r7 + AC_T], r1
    MUL r0, r3                      ; aimed: it lands where Bo is (about 28 frames in the air)
    SHL r0, 4
    DIV r0, 28
    PUSH r0
    PUSH r7
    CALL en_row_of
    LDB r6, [r1 + 3]                ; projectile type
    CALL act_pos
    SUB r2, 8
    MOV r5, r7
    CALL act_free_slot
    CMP r7, 0
    JEQ @none
    MOV r0, r6
    CALL act_init
    LDI r0, 255
    ST [r7 + AC_EN], r0
    LDI r0, -40
    ST [r7 + AC_VY], r0
    POP r5
    POP r0
    ST [r7 + AC_VX], r0
    MOV r7, r5
    LDI r0, SFX_THROW
    JMP play_sfx
@none:
    POP r7
    POP r0
@done:
    RET

b_proj:                             ; a projectile: an arc with gravity until it hits something
    LD r0, [r7 + AC_VY]
    ADD r0, 3
    ST [r7 + AC_VY], r0
    CALL act_move
    LD r0, [r7 + AC_T]
    ADD r0, 1
    ST [r7 + AC_T], r0
    CMP r0, 150
    JGT act_free
    LD r0, [r7 + AC_VY]
    CMP r0, 0
    JLT @flying
    CALL act_pos
    SUB r2, 1
    CALL cell_attr
    AND r0, 15
    LDB r0, [r0 + class_flags]
    AND r0, CF_SURF
    JNZ act_free
@flying:
    RET

b_roll:                             ; a sled: starts sliding at Bo when he is near, follows the ground, falls off edges
    LD r0, [r7 + AC_SUB]
    CMP r0, 0
    JNE @slide
    CALL dir_to_bo
    CMP r3, 56
    JGT @done
    CALL en_row_of
    LDB r1, [r1 + 3]
    MUL r0, r1
    ST [r7 + AC_VX], r0
    LDI r0, 1
    ST [r7 + AC_SUB], r0
@slide:
    LD r0, [r7 + AC_X]
    LD r1, [r7 + AC_VX]
    ADD r0, r1
    ST [r7 + AC_X], r0
    CALL act_pos
    PUSH r2
    SUB r2, 4
    CALL cell_attr
    POP r2
    AND r0, 15
    LDB r0, [r0 + class_flags]
    AND r0, CF_WALL
    JZ @ground
    CALL act_turn                   ; hit a wall: stops
    LDI r0, 0
    ST [r7 + AC_VX], r0
@ground:
    CALL act_pos
    MOV r6, r2
    MOV r3, r2
    ADD r3, 8
    SUB r2, 6
    CALL surface
    CMP r0, NONE
    JEQ @fall
    SHL r0, 4
    ST [r7 + AC_Y], r0
    LDI r0, 0
    ST [r7 + AC_VY], r0
@done:
    RET
@fall:
    LD r0, [r7 + AC_VY]
    ADD r0, 3
    ST [r7 + AC_VY], r0
    LD r1, [r7 + AC_Y]
    ADD r1, r0
    ST [r7 + AC_Y], r1
    RET

; ---- contact with Bo ---------------------------------------------------------------------------------
; act_box: r7 -> r4..r7 = x, y, w, h of the actor's box (r7 is lost: kept in t_act)
act_touch:
    CALL en_row_of                  ; moving platforms never touch Bo
    LDB r0, [r1 + 5]
    AND r0, F_PLAT
    JNZ @no
    LD r0, [bo_state]
    CMP r0, ST_DEAD
    JGE @no
    LD r0, [goal_t]
    CMP r0, 0
    JNE @no
    LD r0, [r7 + AC_ST]             ; sleeping or a joke: harmless
    CMP r0, AS_LIVE
    JNE @no
    LD r0, [r7 + AC_TYPE]
    CMP r0, 8                       ; a flying pigeon is harmless
    JNE @box
    LD r0, [r7 + AC_SUB]
    CMP r0, 2
    JEQ @no
@box:
    ST [t_act], r7
    CALL en_row_of
    LDB r6, [r1 + 1]                ; w
    LDB r3, [r1 + 2]                ; h
    CALL act_pos
    MOV r4, r1
    MOV r0, r6
    SHR r0, 1
    SUB r4, r0                      ; x
    MOV r5, r2
    SUB r5, r3                      ; y (top)
    ST [t_atop], r5
    MOV r7, r3                      ; h
    CALL feet                       ; Bo's box
    MOV r0, r1
    SUB r0, BOX_W_L
    MOV r1, r2
    SUB r1, BOX_TOP
    LDI r2, BOX_W_L + BOX_W_R + 1
    LDI r3, BOX_TOP                 ; the board counts: enemies touch Bo down to his wheels
    SYS OVERLAP
    LD r7, [t_act]
    CMP r0, 0
    JEQ @no
    LD r0, [inv_t]                  ; blinking after losing the helmet: nothing touches Bo
    CMP r0, 0
    JNE @no
    JMP contact
@no:
    RET

; contact: r7 = actor overlapping Bo
contact:
    CALL en_row_of
    MOV r6, r1                      ; r6 = the type's row
    LD r0, [r7 + AC_TYPE]
    CMP r0, EN_BOSS1
    JEQ boss1_contact
    CMP r0, EN_BOSS5
    JEQ boss1_contact
    CMP r0, EN_RABBIT
    JEQ rabbit_contact
    CMP r0, EN_DOZER
    JEQ dozer_contact
    CMP r0, EN_SAND
    JEQ sand_contact
    LD r0, [r7 + AC_TYPE]
    CMP r0, 2                       ; a seagull takes the pommes, no damage (§5)
    JNE @godis
    LD r0, [pw_kind]
    CMP r0, PW_POMMES
    JNE @godis
    LDI r0, 0
    ST [pw_kind], r0
    ST [pw_t], r0
    LDI r0, TX_NEJ_MINA_POMMES
    CALL say
    LDI r0, EV_POMMES
    CALL event
    JMP defeat_away
@godis:
    LD r0, [trick]                  ; the godissnurr: enemies Bo touches bounce away
    CMP r0, TR_GODIS
    JNE @stomp
    LDI r0, EV_KNOCK
    CALL event
    JMP defeat_away
@stomp:
    LD r0, [bo_state]
    CMP r0, ST_AIR
    JNE @side
    LD r0, [bo_vy]
    CMP r0, 0
    JLE @side
    LD r0, [bo_pfoot]               ; came from above
    LD r1, [t_atop]
    ADD r1, 4
    CMP r0, r1
    JGT @side
    LDB r0, [r6 + 4]                ; the outcome
    CMP r0, O_HIT
    JEQ @spiky
    CMP r0, O_JELLY
    JEQ @jelly
    CMP r0, O_STAND
    JEQ @stand
    LDI r0, EV_STOMP
    CALL event
    JMP defeat
@spiky:
    LDI r0, EV_SPIKY
    CALL event
    JMP bo_hit
@jelly:
    LDI r0, EV_BOUNCE
    CALL event
    LD r0, [PH_BOUNCE_V]
    NEG r0
    ST [bo_vy], r0
    LDI r0, SFX_BOING
    JMP play_sfx
@stand:
    LDI r0, EV_BOUNCE
    CALL event
    LDI r0, STOMP_V
    NEG r0
    ST [bo_vy], r0
    RET
@side:
    LDB r0, [r6 + 5]
    AND r0, F_HARM
    JZ @harmless
    LDI r0, EV_HIT
    CALL event
    JMP bo_hit
@harmless:
    RET

; event: r0 = kind (for the tests: what happened, with which enemy type)
event:
    ST [ev_kind], r0
    LD r0, [r7 + AC_TYPE]
    ST [ev_type], r0
    LD r0, [ev_n]
    ADD r0, 1
    ST [ev_n], r0
    RET

; bo_hit: the apple helmet absorbs one hit (2 s invulnerable); otherwise a life (DESIGN.md §6)
bo_hit:
    LD r0, [helmet]
    CMP r0, 0
    JEQ @life
    LDI r0, 0
    ST [helmet], r0
    LDI r0, 120
    ST [inv_t], r0
    LD r0, [ev_kind]                ; a side hit taken by the helmet (a spiky landing stays spiky)
    CMP r0, EV_HIT
    JNE @kind
    LDI r0, EV_HELMET
    ST [ev_kind], r0
@kind:
    LDI r0, TX_AJ
    CALL say
    LDI r0, SFX_AJ
    JMP play_sfx
@life:
    JMP bo_die

; defeat: Bo landed on it: the joke; Bo bounces up (the ball: high)
defeat:
    LDB r0, [r6 + 4]
    LDI r1, STOMP_V
    CMP r0, O_FLAT
    JNE @v
    LD r1, [PH_BOUNCE_V]
@v:
    NEG r1
    ST [bo_vy], r1
    LDI r1, 0
    ST [bo_jheld], r1
    LDB r1, [r6 + 6]                ; the joke's word above it
    CMP r1, 255
    JEQ @noword
    ST [joke_id], r1
    LDI r1, JOKE_T
    ST [joke_t], r1
    CALL act_pos
    ST [joke_x], r1
    ST [joke_y], r2
@noword:
    LD r1, [r7 + AC_EN]             ; defeated until Bo falls
    CMP r1, MAX_EN
    JGE @nolist
    LDI r2, 2
    STB [r1 + en_st], r2
@nolist:
    LDI r0, SFX_POFF
    CALL play_sfx
    LDB r0, [r6 + 4]
    CMP r0, O_SLEEP
    JEQ @sleep
    CMP r0, O_PILE
    JEQ @sleep
    CMP r0, O_APPLE
    JNE @joke
    CALL act_pos                    ; it turns into an apple (or a candy)
    SUB r2, 4
    MOV r6, r1
    SHR r6, 3
    MOV r0, r2
    SHR r0, 3
    PUSH r7
    MOV r7, r0
    MOV r1, r6
    SHL r1, 5
    ADD r1, r7
    LDB r0, [r1 + lvl]
    CMP r0, 0
    JNE @occupied
    LDI r0, T_APPLE
    CALL set_cell
@occupied:
    POP r7
@joke:
    LDI r0, AS_JOKE
    ST [r7 + AC_ST], r0
    LDI r0, JOKE_T
    ST [r7 + AC_T], r0
    LDI r0, 0                       ; drifts up and away
    ST [r7 + AC_VX], r0
    LDI r0, -12
    ST [r7 + AC_VY], r0
    RET
@sleep:
    LDI r0, AS_SLEEP
    ST [r7 + AC_ST], r0
    RET

defeat_away:                        ; knocked away / off with the pommes: flies off, defeated
    LD r1, [r7 + AC_EN]
    CMP r1, MAX_EN
    JGE @j
    LDI r2, 2
    STB [r1 + en_st], r2
@j:
    LDI r0, AS_JOKE
    ST [r7 + AC_ST], r0
    LDI r0, JOKE_T
    ST [r7 + AC_T], r0
    CALL dir_to_bo
    NEG r0
    MUL r0, 32
    ST [r7 + AC_VX], r0
    LDI r0, -24
    ST [r7 + AC_VY], r0
    RET

; ---- drawing ---------------------------------------------------------------------------------------------
draw_actors:
    LDI r7, actors
@act:
    LD r0, [r7 + AC_TYPE]
    CMP r0, 0
    JEQ @next
    PUSH r7
    CALL draw_actor
    POP r7
@next:
    ADD r7, ACT_SIZE
    CMP r7, actors + MAX_ACT * ACT_SIZE
    JLT @act
    LD r0, [joke_t]                 ; the joke's word (POFF, ZZZ, SPLAT)
    CMP r0, 0
    JEQ @done
    SUB r0, 1
    ST [joke_t], r0
    LD r0, [joke_id]
    SHL r0, 1
    LD r0, [r0 + text_table]
    LD r1, [joke_x]
    LD r2, [cam_x]
    SUB r1, r2
    SUB r1, 10
    LD r2, [joke_y]
    LD r3, [cam_y]
    SUB r2, r3
    SUB r2, 22
    LD r3, [joke_t]
    SHR r3, 2
    SUB r2, r3
    CALL draw_text
@done:
    RET

draw_actor:                         ; r7 = actor
    LD r0, [r7 + AC_TYPE]
    CMP r0, EN_DOZER
    JEQ draw_dozer
    CALL en_row_of
    MOV r6, r1
    LDB r0, [r6 + 5]
    AND r0, F_PLAT
    JNZ draw_plat
    LD r5, [r7 + AC_TYPE]
    SHL r5, 1
    LD r0, [r5 + en_sprites]
    LD r1, [r7 + AC_ST]             ; jokes with their own picture
    CMP r1, AS_LIVE
    JEQ @sprite
    LDB r1, [r6 + 4]
    CMP r1, O_FLAT
    JNE @pile
    LDI r0, spr_en_flat
@pile:
    CMP r1, O_PILE
    JNE @poff
    LDI r0, spr_en_pile
@poff:
    CMP r1, O_APPLE
    JNE @sprite
    LDI r0, spr_poff
@sprite:
    PUSH r0
    CALL act_pos
    LD r0, [cam_x]
    SUB r1, r0
    SUB r1, 4
    LD r0, [cam_y]
    SUB r2, r0
    SUB r2, 8
    ; flip: the sprite's facing against the direction of travel (or towards Bo)
    LD r3, [r7 + AC_VX]
    CMP r3, 0
    JNE @dir
    PUSH r1
    PUSH r2
    CALL dir_to_bo
    POP r2
    POP r1
    MOV r3, r0
@dir:
    LDI r4, 0
    CMP r3, 0
    JGE @right
    LDI r4, 1
@right:                             ; r4 = 1 if moving left
    LDB r3, [r6 + 5]
    AND r3, F_RIGHT
    JNZ @facer
    XOR r4, 1
@facer:
    MOV r3, r4
    LD r4, [r7 + AC_SUB]            ; the seagulls blink while they warn
    LD r5, [r7 + AC_TYPE]
    CMP r5, 2
    JEQ @gull
    CMP r5, EN_BOSS1
    JEQ @gull
    CMP r5, EN_BOSS5
    JNE @draw
@gull:
    CMP r4, 1
    JNE @draw
    LD r4, [tick]
    AND r4, 4
    JZ @draw
    POP r0
    RET
@draw:
    POP r0
    LD r4, [r7 + AC_TYPE]           ; the rabbit in the air: the leaping picture
    CMP r4, EN_RABBIT
    JNE @live
    LD r4, [r7 + AC_SUB]
    CMP r4, RB_AIR
    JNE @live
    ADD r0, 128
@live:
    LD r4, [r7 + AC_ST]
    CMP r4, AS_LIVE
    JNE @single
    LDB r4, [r6 + 5]
    MOV r5, r4
    AND r5, F_BIG
    JNZ @big
    MOV r5, r4
    AND r5, F_TALL
    JNZ @tall
    AND r4, F_WIDE
    JNZ @wide
@single:
    SYS SPR
    JMP @zzz
@tall:
    SUB r2, 8
    SYS SPR
    ADD r0, 32
    ADD r2, 8
    SYS SPR
    JMP @zzz
@big:                               ; 2 x 2 sprites (the order mirrored when flipped)
    SUB r1, 4
    SUB r2, 8
    MOV r4, r0
    CMP r3, 0
    JEQ @b1
    ADD r0, 32
@b1:
    SYS SPR
    ADD r1, 8
    MOV r0, r4
    CMP r3, 0
    JNE @b2
    ADD r0, 32
@b2:
    SYS SPR
    ADD r2, 8
    MOV r0, r4
    ADD r0, 64
    CMP r3, 0
    JNE @b3
    ADD r0, 32
@b3:
    SYS SPR
    SUB r1, 8
    MOV r0, r4
    ADD r0, 64
    CMP r3, 0
    JEQ @b4
    ADD r0, 32
@b4:
    SYS SPR
    JMP @zzz
@wide:
    SUB r1, 4
    MOV r4, r0
    CMP r3, 0
    JEQ @w
    ADD r0, 32
@w:
    SYS SPR
    ADD r1, 8
    MOV r0, r4
    CMP r3, 0
    JNE @w2
    ADD r0, 32
@w2:
    SYS SPR
@zzz:
    LD r4, [r7 + AC_TYPE]           ; the dizzy boss: stars round its head
    CMP r4, EN_BOSS1
    JEQ @boss
    CMP r4, EN_BOSS5
    JNE @sleep
@boss:
    LD r4, [r7 + AC_SUB]
    CMP r4, 3
    JNE @end
    LD r0, [tick]
    SHR r0, 2
    AND r0, 7
    LDB r0, [r0 + dizzy_dx]
    ADD r0, r1
    SUB r2, 3
    MOV r1, r2
    LDI r2, C_YELLOW
    SYS PSET
    ADD r0, 6
    SYS PSET
    RET
@sleep:
    LD r4, [r7 + AC_ST]
    CMP r4, AS_SLEEP
    JNE @end
    LDB r4, [r6 + 4]
    CMP r4, O_SLEEP
    JNE @end
    MOV r6, r1                      ; a sleeping teddy: ZZZ
    ADD r6, 6
    MOV r1, r6
    SUB r2, 16
    LD r0, [tick]
    SHR r0, 4
    AND r0, 3
    SUB r2, r0
    LDI r0, s_zzz
    LDI r3, C_WHITE
    SYS TEXT
@end:
    RET

.data
; draw_plat: r7 = platform, r6 = its type's row: its picture of world tiles, top-left at (x - w/2, top)
draw_plat:
    LD r5, [r7 + AC_TYPE]
    SHL r5, 1
    LD r0, [r5 + en_sprites]        ; the picture: columns, rows, rows above the top, codes
    LDB r3, [r0 + 2]                ; rows above the top, in px
    SHL r3, 3
    PUSH r3
    CALL act_pos
    MOV r4, r1                      ; x: centre - width / 2 (r6 = the type's row)
    LDB r1, [r6 + 1]
    SHR r1, 1
    SUB r4, r1
    LD r1, [cam_x]
    SUB r4, r1
    MOV r5, r2                      ; y: top - rows above
    LD r2, [cam_y]
    SUB r5, r2
    POP r3
    SUB r5, r3
    LDB r2, [r0]                    ; columns
    LDB r3, [r0 + 1]                ; rows
    ADD r0, 3
    LDI r1, tilebank
    SYS MAP
    RET

dizzy_dx: .byte 0, 1, 2, 3, 4, 3, 2, 1
s_zzz: .string "Z Z"
.code
