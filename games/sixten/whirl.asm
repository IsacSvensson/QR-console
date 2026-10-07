; The whirlwind (DESIGN.md §6): weather, not an enemy. It starts when its control is stamped, warns for WARN_FRAMES
; (clouds, wind, leaves), grows one strength step per STEP_FRAMES, follows its waypoints leg by leg (the legs are
; exact integer steps from the generator: no frame moves more than its speed), changes cells at waypoints, and dies
; down. It never reads Sixten's position and never uses RND. The wind turns TURN_FRAMES before the whirlwind does.
.code

; ---- triggers ----------------------------------------------------------------------------------
; r4 = index of the control just stamped: mark the whirlwinds it starts
whirl_trigger:
    LD r6, [lv_ptr]
    LDB r7, [r6 + LR_NWHIRL]
    LD r6, [r6 + LR_WHIRLS]
    LDI r5, 0
@k:
    CMP r5, r7
    JGE @done
    LDB r0, [r6 + WR_TRIG]
    CMP r0, r4
    JNE @next
    LDI r1, 1
    SHL r1, r5
    LD r0, [wh_started]
    AND r0, r1
    JNZ @next
    LD r0, [wh_pending]
    OR r0, r1
    ST [wh_pending], r0
@next:
    ADD r6, 8
    ADD r5, 1
    JMP @k
@done:
    RET

; r0 = whirlwind index: it starts its warning at its first waypoint
whirl_start:
    ST [wh_idx], r0
    LDI r1, 1
    SHL r1, r0
    LD r2, [wh_started]
    OR r2, r1
    ST [wh_started], r2
    LD r2, [wh_pending]
    XOR r1, 0xFFFF
    AND r2, r1
    ST [wh_pending], r2
    SHL r0, 3
    LD r6, [lv_ptr]
    LD r6, [r6 + LR_WHIRLS]
    ADD r6, r0
    LD r0, [r6 + WR_WPS]
    ST [wh_wps], r0
    LD r1, [r6 + WR_CHG]
    ST [wh_chg], r1
    LDB r1, [r6 + WR_NCHG]
    ST [wh_nchg], r1
    LD r1, [r0 + WP_X]
    ST [wh_x], r1
    LD r1, [r0 + WP_Y]
    ST [wh_y], r1
    LD r1, [r0 + WP_WAIT]
    ST [wh_wait], r1
    LDB r1, [r0 + WP_DIR]
    ST [wh_wind], r1
    LDI r1, 0
    ST [wh_s], r1
    ST [wh_st], r1
    ST [wh_wp], r1
    ST [wh_leg], r1
    ST [wh_t], r1
    LDI r1, WH_WARN
    ST [wh_state], r1
    RET

; ---- one frame (play and slide frames; the map pauses it) ------------------------------------------
whirl_update:
    LD r0, [wh_state]
    CMP r0, WH_NONE
    JNE @run
    LD r1, [wh_pending]
    CMP r1, 0
    JEQ @ret
    LDI r0, 0                       ; the lowest pending one
@low:
    MOV r2, r1
    SHR r2, r0
    AND r2, 1
    JNZ @start
    ADD r0, 1
    JMP @low
@start:
    CALL whirl_start
@ret:
    RET
@run:
    LD r1, [wh_t]
    ADD r1, 1
    ST [wh_t], r1
    CMP r0, WH_WARN
    JNE @active
    CMP r1, WARN_FRAMES
    JB @ret
    LDI r0, WH_ACTIVE
    ST [wh_state], r0
    RET
@active:
    CMP r0, WH_DYING
    JEQ @dying
    CALL wh_strength
    LD r0, [wh_leg]
    CMP r0, 0
    JNE @move
    LD r0, [wh_wait]                ; waiting at a waypoint
    CMP r0, 0
    JEQ @depart
    SUB r0, 1
    ST [wh_wait], r0
    CALL wh_wind_turn
    RET
@depart:
    CALL wh_wp_ptr
    LD r0, [r6 + WP_N]
    CMP r0, 0
    JNE @leg
    LDI r0, WH_DYING                ; the last waypoint: it dies down
    ST [wh_state], r0
    LDI r0, 0
    ST [wh_st], r0
    RET
@leg:
    ST [wh_leg], r0
    LDI r0, 0
    ST [wh_ex], r0
    ST [wh_ey], r0
@move:
    CALL wh_wp_ptr
    LD r5, [r6 + WP_N]
    LD r0, [wh_x]                   ; x += q; the remainder adds one more 1/16 px when it fills n
    LD r1, [r6 + WP_QX]
    ADD r0, r1
    LD r1, [wh_ex]
    LD r2, [r6 + WP_RX]
    ADD r1, r2
    CMP r1, r5
    JB @xok
    SUB r1, r5
    LDB r2, [r6 + WP_SX]
    SHL r2, 8
    SAR r2, 8
    ADD r0, r2
@xok:
    ST [wh_x], r0
    ST [wh_ex], r1
    LD r0, [wh_y]
    LD r1, [r6 + WP_QY]
    ADD r0, r1
    LD r1, [wh_ey]
    LD r2, [r6 + WP_RY]
    ADD r1, r2
    CMP r1, r5
    JB @yok
    SUB r1, r5
    LDB r2, [r6 + WP_SY]
    SHL r2, 8
    SAR r2, 8
    ADD r0, r2
@yok:
    ST [wh_y], r0
    ST [wh_ey], r1
    LD r0, [wh_leg]
    SUB r0, 1
    ST [wh_leg], r0
    JNZ @turn
    LD r0, [wh_wp]                  ; arrived: the next waypoint (exact), its changes, its wait
    ADD r0, 1
    ST [wh_wp], r0
    CALL wh_wp_ptr
    LD r0, [r6 + WP_X]
    ST [wh_x], r0
    LD r0, [r6 + WP_Y]
    ST [wh_y], r0
    LD r0, [r6 + WP_WAIT]
    ST [wh_wait], r0
    CALL wh_changes
@turn:
    CALL wh_wind_turn
    RET
@dying:
    LD r0, [wh_st]
    ADD r0, 1
    ST [wh_st], r0
    CMP r0, STEP_FRAMES
    JB @ret2
    LDI r0, 0
    ST [wh_st], r0
    LD r0, [wh_s]
    CMP r0, 0
    JEQ @gone
    SUB r0, 1
    ST [wh_s], r0
    JNZ @ret2
@gone:
    LDI r0, WH_NONE
    ST [wh_state], r0
@ret2:
    RET

; r6 = the current waypoint's record
wh_wp_ptr:
    LD r6, [wh_wp]
    MUL r6, WP_REC
    LD r0, [wh_wps]
    ADD r6, r0
    RET

; one strength step per STEP_FRAMES towards the waypoint it waits at, or the one it goes to
wh_strength:
    LD r0, [wh_st]
    ADD r0, 1
    ST [wh_st], r0
    CMP r0, STEP_FRAMES
    JB @done
    LDI r0, 0
    ST [wh_st], r0
    CALL wh_wp_ptr
    LD r0, [wh_leg]
    CMP r0, 0
    JEQ @here
    ADD r6, WP_REC
@here:
    LDB r1, [r6 + WP_S]
    LD r0, [wh_s]
    CMP r0, r1
    JEQ @done
    JLT @up
    SUB r0, 2
@up:
    ADD r0, 1
    ST [wh_s], r0
@done:
    RET

; the wind turns to the next leg's direction when that leg starts in TURN_FRAMES frames or less
wh_wind_turn:
    CALL wh_wp_ptr
    LD r0, [wh_leg]
    CMP r0, 0
    JEQ @waiting
    ADD r6, WP_REC                  ; moving: the next leg leaves the next waypoint after its wait
    LD r1, [r6 + WP_WAIT]
    ADD r0, r1
    JMP @check
@waiting:
    LD r0, [wh_wait]
@check:
    CMP r0, TURN_FRAMES
    JGT @done
    LDB r1, [r6 + WP_DIR]
    CMP r1, 255
    JEQ @done
    ST [wh_wind], r1
@done:
    RET

; the changes listed for the waypoint just reached (cells within its radius, checked by the generator)
wh_changes:
    LD r6, [wh_chg]
    LD r7, [wh_nchg]
@c:
    CMP r7, 0
    JEQ @done
    LDB r0, [r6]
    LD r1, [wh_wp]
    CMP r0, r1
    JNE @next
    LD r0, [r6 + 2]
    LDB r1, [r6 + 1]
    STB [r0 + cells], r1
    LDI r0, 1
    ST [wh_dirty], r0
    LDI r0, SFX_CHANGE
    SYS SFX
@next:
    ADD r6, 4
    SUB r7, 1
    JMP @c
@done:
    RET

; ---- Sixten and the whirlwind (DESIGN §6.5) ------------------------------------------------------
; shelter: standing still in a ditch, a hollow or the cabin. Inside the radius at strength >= 3 without shelter
; for EXPO_FRAMES: AJ!. In forest near it at wind >= 3, a branch's shadow shows for BRANCH_FRAMES, then AJ!.
player_hazard:
    LD r0, [inv_t]
    CMP r0, 0
    JEQ @inv
    SUB r0, 1
    ST [inv_t], r0
@inv:
    LD r0, [moving]                 ; standing still
    CMP r0, 0
    JEQ @still
    LDI r0, 0
    JMP @st
@still:
    LD r0, [still_t]
    CMP r0, 1000
    JAE @st0
    ADD r0, 1
@st:
    ST [still_t], r0
@st0:
    LD r1, [cell_i]                 ; shelter
    LDB r1, [r1 + cells]
    AND r1, 31
    LDI r2, 0
    LD r0, [moving]
    CMP r0, 0
    JNE @shel
    CMP r1, CT_DITCH
    JEQ @yes
    CMP r1, CT_HOLLOW
    JEQ @yes
    CMP r1, CT_HOUSE
    JNE @shel
@yes:
    LDI r2, 1
@shel:
    ST [sheltered], r2
    ST [tmp0], r1                   ; the cell type, for the branch
    LDI r0, 0                       ; danger
    ST [danger], r0
    LD r0, [wh_state]
    CMP r0, WH_ACTIVE
    JB @nodanger
    LD r3, [wh_s]
    CMP r3, DANGER_S
    JLT @nodanger
    MUL r3, 8
    ADD r3, 24                      ; radius
    CALL wh_dist                    ; r0 = |dx|, r1 = |dy| (px)
    ST [nx], r0
    ST [ny], r1
    CMP r0, r3
    JGT @branch
    CMP r1, r3
    JGT @branch
    MUL r0, r0
    MUL r1, r1
    ADD r0, r1
    MOV r1, r3
    MUL r1, r3
    CMP r0, r1
    JGT @branch
    LDI r0, 1
    ST [danger], r0
@branch:
    LD r0, [tmp0]                   ; forest near it (radius + 64): a branch falls
    CMP r0, CT_FOREST
    JEQ @forest
    CMP r0, CT_DENSE
    JNE @nobranch
@forest:
    ADD r3, 64
    LD r0, [nx]
    CMP r0, r3
    JGT @nobranch
    LD r0, [ny]
    CMP r0, r3
    JGT @nobranch
    LD r0, [branch_t]
    ADD r0, 1
    ST [branch_t], r0
    CMP r0, BRANCH_FRAMES
    JB @expo
    CALL aj
    RET
@nodanger:
@nobranch:
    LDI r0, 0
    ST [branch_t], r0
@expo:
    LD r0, [danger]
    CMP r0, 0
    JEQ @safe
    LD r0, [sheltered]
    CMP r0, 0
    JNE @safe
    LD r0, [expo]
    ADD r0, 1
    ST [expo], r0
    CMP r0, EXPO_FRAMES
    JB @done
    CALL aj
    RET
@safe:
    LDI r0, 0
    ST [expo], r0
@done:
    RET

; r0 = |dx|, r1 = |dy| in px between Sixten's feet and the whirlwind's foot
wh_dist:
    LD r0, [wh_x]
    SHR r0, 4
    LD r1, [px]
    SHR r1, 4
    SUB r0, r1
    JGE @x
    NEG r0
@x:
    LD r1, [wh_y]
    SHR r1, 4
    LD r2, [py]
    SHR r2, 4
    SUB r1, r2
    JGE @y
    NEG r1
@y:
    RET

; AJ!: one heart, back to the last stamped control; no hearts left: the level starts again
aj:
    LD r0, [inv_t]
    CMP r0, 0
    JNE @done
    LDI r0, SFX_AJ
    SYS SFX
    LD r0, [n_aj]
    ADD r0, 1
    ST [n_aj], r0
    LDI r0, 0
    ST [expo], r0
    ST [branch_t], r0
    LDI r0, INV_FRAMES
    ST [inv_t], r0
    LD r0, [hearts]
    SUB r0, 1
    ST [hearts], r0
    JNZ @back
    LD r0, [level]
    CALL level_start
    RET
@back:
    LD r0, [last_cell]
    CALL place_on_cell
@done:
    RET

; ---- what it looks and sounds like ---------------------------------------------------------------
; the grass bends towards it (strength >= 2): the view is expanded again every 8 frames while it is near
whirl_view:
    LDI r1, 0
    LD r0, [wh_state]
    CMP r0, WH_ACTIVE
    JB @set
    LD r0, [wh_s]
    CMP r0, 2
    JLT @set
    CALL wh_dist_view
    CMP r0, 0
    JEQ @set
    LDI r1, 1
@set:
    ST [bend_on], r1
    LD r0, [wh_dirty]
    CMP r0, 0
    JNE @expand
    LD r0, [bend_prev]
    CMP r0, r1
    JNE @expand                     ; it just came or went: straighten or bend at once
    CMP r1, 0
    JEQ @done
    LD r0, [tick]
    AND r0, 7
    JNZ @done
@expand:
    LD r0, [bend_on]
    ST [bend_prev], r0
    LDI r0, 0
    ST [wh_dirty], r0
    LD r0, [mode]
    CMP r0, M_PLAY
    JNE @done
    CALL view_reset
@done:
    RET

; r0 = 1 if the whirlwind's influence (2 x radius) reaches the view
wh_dist_view:
    LD r3, [wh_s]
    MUL r3, 16
    ADD r3, 48 + 64                 ; 2 x radius + half the view
    LD r0, [wh_x]
    SHR r0, 4
    LD r1, [camx]
    ADD r1, 64
    SUB r0, r1
    JGE @x
    NEG r0
@x:
    CMP r0, r3
    JGT @no
    LD r0, [wh_y]
    SHR r0, 4
    LD r1, [camy]
    ADD r1, 48
    SUB r0, r1
    JGE @y
    NEG r0
@y:
    ADD r3, 16
    CMP r0, r3
    JGT @no
    LDI r0, 1
    RET
@no:
    LDI r0, 0
    RET

; r1 = a tuft tile, r0/r2 = the tile's column/row in the screen being expanded -> r1 = the tuft bent towards the
; whirlwind when it is within 2 x radius (keeps r0, r2-r6)
bend_tuft:
    LD r7, [bend_on]
    CMP r7, 0
    JEQ @done
    PUSH r0
    PUSH r2
    LD r7, [ex_c0]                  ; world x of the tile's centre
    SHL r7, 5
    SHL r0, 3
    ADD r0, r7
    ADD r0, 4
    LD r7, [ex_r0]
    SHL r7, 5
    SHL r2, 3
    ADD r2, r7
    ADD r2, 4
    LD r7, [wh_y]
    SHR r7, 4
    SUB r2, r7
    JGE @ya
    NEG r2
@ya:
    LD r7, [wh_s]
    SHL r7, 4
    ADD r7, 48                      ; 2 x radius
    CMP r2, r7
    JGT @straight
    LD r2, [wh_x]
    SHR r2, 4
    SUB r2, r0                      ; > 0: the whirlwind is to the right
    MOV r0, r2
    JGE @xa
    NEG r0
@xa:
    CMP r0, r7
    JGT @straight
    LDI r1, T_TUFT_R
    CMP r2, 0
    JGE @straight
    LDI r1, T_TUFT_L
@straight:
    POP r2
    POP r0
@done:
    RET

; the whirlwind on screen (if it shows), then the wind particles
draw_whirl:
    LD r0, [wh_state]
    CMP r0, WH_NONE
    JEQ @done
    LD r2, [wh_s]
    CMP r2, 0
    JEQ @wind
    LD r0, [wh_x]
    SHR r0, 4
    LD r1, [camx]
    SUB r0, r1
    LD r1, [wh_y]
    SHR r1, 4
    LD r3, [camy]
    SUB r1, r3
    ADD r1, PLAY_Y
    CALL draw_tromb
@wind:
    CALL particles
@done:
    RET

; r0 = x, r1 = foot y, r2 = strength 1-5. The visual language of DESIGN §6.3: 3 + 2 x strength layers 4 px apart,
; half-width 1 + i*i/12, a dark band turning round it, a dust ring, 3 x strength pieces of debris (leaves; sticks
; from 3, twigs from 4, planks at 5). (From the mockup.)
draw_tromb:
    ST [dt_x], r0
    ST [dt_y], r1
    ST [dt_s], r2
    SHL r2, 1
    ADD r2, 3
    ST [dt_l], r2
    LDI r6, 0
@dust:
    LD r0, [tick]
    SHR r0, 1
    ADD r0, r6
    ADD r0, r6
    AND r0, 15
    SHL r0, 1
    LD r1, [r0 + cos_t]
    LD r2, [r0 + sin_t]
    LD r3, [dt_s]
    SHL r3, 1
    ADD r3, 6
    MUL r1, r3
    SAR r1, 6
    MUL r2, r3
    SAR r2, 8
    LD r0, [dt_x]
    ADD r0, r1
    LD r1, [dt_y]
    ADD r1, r2
    LDI r2, C_KHAKI
    SYS PSET
    ADD r6, 1
    CMP r6, 8
    JLT @dust
    LDI r6, 0
@layer:
    MOV r5, r6
    MUL r5, r6
    DIV r5, 12
    ADD r5, 1
    LD r1, [dt_y]
    MOV r0, r6
    SHL r0, 2
    SUB r1, r0
    LD r0, [dt_x]
    SUB r0, r5
    LD r2, [dt_x]
    ADD r2, r5
    MOV r3, r1
    LDI r4, C_LGREY
    SYS LINE
    SUB r1, 2
    MOV r3, r1
    SYS LINE
    LD r0, [tick]
    SHR r0, 1
    ADD r0, r6
    ADD r0, r6
    AND r0, 15
    SHL r0, 1
    LD r2, [r0 + cos_t]
    MUL r2, r5
    SAR r2, 6
    LD r0, [dt_x]
    ADD r0, r2
    LDI r2, C_DGREY
    SYS PSET
    ADD r1, 1
    SYS PSET
    ADD r1, 1
    SYS PSET
    ADD r6, 1
    LD r0, [dt_l]
    CMP r6, r0
    JLT @layer
    LD r0, [dt_l]
    SUB r0, 1
    MOV r5, r0
    MUL r5, r0
    DIV r5, 12
    ADD r5, 7
    LD r1, [dt_l]
    SHL r1, 2
    LD r2, [dt_y]
    SUB r2, r1
    SUB r2, 5
    MOV r1, r2
    LD r0, [dt_x]
    SUB r0, r5
    MOV r2, r5
    SHL r2, 1
    LDI r3, 5
    LDI r4, C_DGREY
    SYS RECTFILL
    ADD r0, 3
    SUB r1, 2
    SUB r2, 6
    LDI r3, 2
    SYS RECTFILL
    LDI r6, 0
@deb:
    MOV r5, r6
    MUL r5, 7
    LD r0, [dt_l]
    MOD r5, r0
    MOV r4, r5
    MUL r4, r5
    DIV r4, 12
    ADD r4, 4
    MOV r0, r6
    AND r0, 3
    ADD r4, r0
    LD r0, [tick]
    SHR r0, 1
    MOV r3, r6
    MUL r3, 5
    ADD r0, r3
    AND r0, 15
    SHL r0, 1
    LD r1, [r0 + cos_t]
    LD r2, [r0 + sin_t]
    MUL r1, r4
    SAR r1, 6
    MUL r2, r4
    SAR r2, 8
    LD r0, [dt_x]
    ADD r0, r1
    SHL r5, 2
    LD r1, [dt_y]
    SUB r1, r5
    ADD r1, r2
    MOV r2, r6
    LD r3, [dt_s]
    MOD r2, r3
    SHL r2, 1
    LD r2, [r2 + debris]
    CALL r2
    ADD r6, 1
    LD r0, [dt_s]
    MUL r0, 3
    CMP r6, r0
    JLT @deb
    RET

deb_leaf_o:
    LDI r2, C_ORANGE
    SYS PSET
    ADD r0, 1
    SYS PSET
    RET
deb_leaf_y:
    LDI r2, C_YELLOW
    SYS PSET
    ADD r1, 1
    SYS PSET
    RET
deb_stick:
    MOV r2, r0
    ADD r2, 3
    MOV r3, r1
    SUB r3, 1
    LDI r4, C_BROWN
    SYS LINE
    RET
deb_twig:
    MOV r2, r0
    ADD r2, 2
    MOV r3, r1
    ADD r3, 2
    LDI r4, C_DGREEN
    SYS LINE
    RET
deb_plank:
    LDI r2, 5
    LDI r3, 2
    LDI r4, C_KHAKI
    SYS RECTFILL
    RET

; wind particles: 4 + 4 x strength of them drift with the wind (2 + strength px per frame); streaks and leaves.
; They show where the wind blows, and so where the whirlwind is going (DESIGN §6.2).
particles:
    LD r0, [wh_wind]
    SHL r0, 1
    LD r4, [r0 + cos_t]
    LD r5, [r0 + sin_t]
    LD r0, [wh_s]
    ADD r0, 2
    MUL r4, r0
    SAR r4, 6                       ; vx
    MUL r5, r0
    SAR r5, 6
    NEG r5                          ; vy (screen y grows south)
    ST [nx], r4
    ST [ny], r5
    LD r7, [wh_s]
    SHL r7, 2
    ADD r7, 4                       ; how many
    LDI r6, 0
@p:
    CMP r6, r7
    JGE @done
    MOV r3, r6
    SHL r3, 1
    LD r0, [r3 + part_x]
    LD r1, [r3 + part_y]
    LD r4, [nx]
    LD r5, [ny]
    ADD r0, r4
    ADD r1, r5
    CMP r0, 128                     ; off the playfield: back in on the upwind side
    JAE @respawn
    CMP r1, PLAY_Y
    JLT @respawn
    CMP r1, 128
    JLT @keep
@respawn:
    LD r0, [tick]
    MOV r2, r6
    MUL r2, 37
    ADD r0, r2
    MOV r1, r0
    AND r0, 127
    MOD r1, 96
    ADD r1, PLAY_Y
    LD r4, [nx]
    LD r5, [ny]
    MOV r2, r4                      ; |vx| >= |vy|: enter from the left or right edge, else the top or bottom
    CMP r2, 0
    JGE @ax
    NEG r2
@ax:
    MOV r3, r5
    CMP r3, 0
    JGE @ay
    NEG r3
@ay:
    CMP r2, r3
    JLT @vert
    LDI r0, 0
    CMP r4, 0
    JGE @keep
    LDI r0, 127
    JMP @keep
@vert:
    LDI r1, PLAY_Y
    CMP r5, 0
    JGE @keep
    LDI r1, 127
@keep:
    MOV r3, r6
    SHL r3, 1
    ST [r3 + part_x], r0
    ST [r3 + part_y], r1
    MOV r3, r6
    AND r3, 1
    JNZ @leaf
    LD r2, [nx]
    SHL r2, 1
    NEG r2
    ADD r2, r0
    LD r3, [ny]
    SHL r3, 1
    NEG r3
    ADD r3, r1
    LDI r4, C_WHITE
    SYS LINE
    JMP @next
@leaf:
    LDI r2, C_ORANGE
    MOV r3, r6
    AND r3, 2
    JZ @lc
    LDI r2, C_YELLOW
@lc:
    SYS PSET
    ADD r0, 1
    SYS PSET
@next:
    ADD r6, 1
    JMP @p
@done:
    RET

; its sound: noise on the noise channel, louder with strength, dull in shelter (every 16 frames)
whirl_sound:
    LD r0, [wh_state]
    CMP r0, WH_NONE
    JEQ @done
    LD r0, [tick]
    AND r0, 15
    JNZ @done
    LD r3, [wh_s]
    MUL r3, 2
    ADD r3, 3
    LD r0, [sheltered]
    CMP r0, 0
    JEQ @loud
    SHR r3, 1
@loud:
    LDI r0, 2
    LD r1, [wh_s]
    MUL r1, 60
    ADD r1, 180
    LDI r2, 18
    SYS SOUND
@done:
    RET

.data
debris:     .word deb_leaf_o, deb_leaf_y, deb_stick, deb_twig, deb_plank
.code
