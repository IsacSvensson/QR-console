; Bo: skateboard physics (DESIGN.md §3). Order per frame in the air: vy += G; y += vy; x += vx (§3.3).
; Positions and speeds in 1/16 px. Bo's point is the centre of his feet: x = centre, y = the first pixel row
; of the ground under him (when grounded, exactly the surface height).

; ---- bo_spawn: stand at column r1 (on the topmost surface there) ------------------------------------
bo_spawn_start:
    LD r1, [lv_start]
bo_spawn:
    SHL r1, 3
    ADD r1, 4
    MOV r0, r1
    SHL r0, 4
    ST [bo_x], r0
    LDI r2, 0
    LDI r3, LV_ROWS * 8 - 1
    LDI r6, 0
    CALL surface
    ST [bo_sattr], r5
    SHL r0, 4
    ST [bo_y], r0
    LDI r0, 0
    ST [bo_vx], r0
    ST [bo_vy], r0
    ST [bo_state], r0
    ST [bo_crouch], r0
    ST [bo_jheld], r0
    ST [bo_fric_t], r0
    ST [bo_air_t], r0
    ST [bo_bump], r0
    ST [bo_idle_t], r0
    ST [bo_look_t], r0
    ST [bo_lip_t], r0
    ST [trick], r0
    CALL combo_reset
    LDI r0, 1
    ST [bo_dir], r0
    RET

; ---- helpers ---------------------------------------------------------------------------------------
; input_dir: r4 = +1 (RIGHT held), -1 (LEFT held) or 0
input_dir:
    LD r0, [btn]
    MOV r4, r0
    AND r4, BTN_RIGHT
    JZ @left
    LDI r4, 1
    RET
@left:
    AND r0, BTN_LEFT
    JZ @none
    LDI r4, -1
    RET
@none:
    LDI r4, 0
    RET

; speed_split: t_s = |bo_vx|, t_sg = sign (bo_dir when 0)
speed_split:
    LD r0, [bo_vx]
    CMP r0, 0
    JGT @pos
    JLT @neg
    LD r1, [bo_dir]
    ST [t_sg], r1
    ST [t_s], r0
    RET
@pos:
    ST [t_s], r0
    LDI r1, 1
    ST [t_sg], r1
    RET
@neg:
    NEG r0
    ST [t_s], r0
    LDI r1, -1
    ST [t_sg], r1
    RET

; slope_info: r0 = attribute -> r1 = downhill direction (+1 right, -1 left, 0 flat or not height-mapped),
; r2 = 1 for 22.5°, 2 for 45° (0 if flat)
slope_info:
    MOV r1, r0
    AND r1, 15
    LDB r1, [r1 + class_flags]
    AND r1, CF_HMAP
    JZ @flat
    MOV r1, r0
    SHR r1, 4
    LDB r2, [r1 + shape_steep]
    LDB r1, [r1 + shape_down]
    CMP r1, 128
    JLT @ok
    SUB r1, 256
@ok:
    RET
@flat:
    LDI r1, 0
    LDI r2, 0
    RET

; feet: r1 = centre x px, r2 = feet y px
feet:
    LD r1, [bo_x]
    SHR r1, 4
    LD r2, [bo_y]
    SAR r2, 4
    RET

; move_x: bo_x += bo_vx, kept inside the level (3 px from the edges). Old x in t_old.
move_x:
    LD r0, [bo_x]
    ST [t_old], r0
    LD r1, [bo_vx]
    ADD r0, r1
    MOV r1, r0
    SHR r1, 4
    CMP r1, 3
    JB @stop
    LD r2, [lv_wpx]
    SUB r2, 4
    CMP r2, r1
    JB @stop
    ST [bo_x], r0
    RET
@stop:
    LDI r0, 0
    ST [bo_vx], r0
    RET

; cap_speed: clamp r0 (signed speed) to ± the speed cap (pommes: POMMES_CAP)
cap_speed:
    LD r1, [PH_SPEED_CAP]
    LD r2, [pw_kind]
    CMP r2, PW_POMMES
    JNE @cap
    LD r1, [PH_POMMES_CAP]
@cap:
    CMP r0, r1
    JLE @hi
    MOV r0, r1
@hi:
    NEG r1
    CMP r0, r1
    JGE @lo
    MOV r0, r1
@lo:
    RET

; ---- bo_update ------------------------------------------------------------------------------------
bo_update:
    CALL feet
    ST [bo_pfoot], r2
    LDI r0, 0
    ST [f_push], r0
    ST [f_brake], r0
    LD r0, [goal_t]                 ; after the goal flag Bo brakes by himself
    CMP r0, 0
    JEQ @state
    LD r1, [bo_vx]
    LDI r0, 0
    CMP r1, 0
    JEQ @gbtn
    LDI r0, BTN_LEFT
    JGT @gbtn
    LDI r0, BTN_RIGHT
@gbtn:
    ST [btn], r0
    LDI r0, 0
    ST [btnp], r0
@state:
    LD r0, [bo_state]
    SHL r0, 1
    LD r0, [r0 + bo_states]
    CALL r0
    LD r0, [bo_state]
    CMP r0, ST_DEAD
    JGE @posed
    CALL touch
    CALL checkpoints
@posed:
    CALL pose_update
    RET

.data
bo_states: .word bo_ground, bo_air, bo_grind, bo_dead, bo_over
.code

bo_ground:
    ; crouch (stand up only where there is room)
    LD r0, [btn]
    AND r0, BTN_DOWN
    JZ @stand
    LDI r0, 1
    ST [bo_crouch], r0
    JMP @crouched
@stand:
    LD r0, [bo_crouch]
    CMP r0, 0
    JEQ @crouched
    LDI r0, 0
    ST [bo_crouch], r0
    CALL feet
    CALL box_hit
    CMP r0, 0
    JEQ @crouched
    LDI r0, 1
    ST [bo_crouch], r0
@crouched:
    CALL speed_split
    CALL input_dir
    LD r0, [bo_crouch]
    CMP r0, 0
    JNE @coast
    CMP r4, 0
    JEQ @coast
    LD r0, [bo_vx]
    CMP r0, 0
    JNE @moving
    ST [t_sg], r4
@moving:
    LD r0, [t_sg]
    CMP r0, r4
    JNE @brake
    ; push (pommes: faster and harder, §5)
    ST [bo_dir], r4
    LD r1, [PH_PUSH_MAX]
    LD r2, [PH_PUSH_ACC]
    LD r0, [pw_kind]
    CMP r0, PW_POMMES
    JNE @normal
    LD r1, [PH_POMMES_MAX]
    LD r2, [PH_POMMES_ACC]
@normal:
    LD r0, [t_s]
    CMP r0, r1
    JGT @coast                      ; faster than the push speed (downhill): rolls out
    ADD r0, r2
    CMP r0, r1
    JLE @pushed
    MOV r0, r1
@pushed:
    ST [t_s], r0
    LDI r0, 0
    ST [bo_fric_t], r0
    LDI r0, 1
    ST [f_push], r0
    JMP @slope
@brake:
    LDI r0, 1
    ST [f_brake], r0
    LD r0, [bo_sattr]
    AND r0, 15
    CMP r0, C_ICE
    JNE @hard
    LD r0, [bo_fric_t]
    ADD r0, 1
    ST [bo_fric_t], r0
    LD r1, [PH_ICE_BRAKE]
    CMP r0, r1
    JLT @slope
    LDI r0, 0
    ST [bo_fric_t], r0
    LDI r1, 1
    JMP @sub
@hard:
    LD r1, [PH_BRAKE]
@sub:
    LD r0, [t_s]
    SUB r0, r1
    JGE @braked
    LDI r0, 0
@braked:
    ST [t_s], r0
    CMP r0, 0
    JNE @slope
    ST [bo_vx], r0                  ; braked to a stop: the brake holds Bo still, even on a slope
    JMP @capped
@coast:
    ; friction period by surface: none on slopes and ramps, ice, sand, crouching, normal
    LD r0, [bo_sattr]
    MOV r1, r0
    AND r1, 15
    LDB r1, [r1 + class_flags]
    AND r1, CF_HMAP
    JNZ @slope
    AND r0, 15
    LD r1, [PH_ICE_FRIC]
    CMP r0, C_ICE
    JEQ @period
    LD r1, [PH_SAND_FRIC]
    CMP r0, C_SAND
    JEQ @period
    LD r1, [PH_CROUCH_FRIC]
    LD r0, [bo_crouch]
    CMP r0, 0
    JNE @period
    LD r1, [PH_ROLL_FRIC]
@period:
    CMP r1, 0
    JNE @fric
    ST [bo_fric_t], r1              ; no friction (ice): the brake starts afresh
    JMP @slope
@fric:
    LD r0, [bo_fric_t]
    ADD r0, 1
    ST [bo_fric_t], r0
    CMP r0, r1
    JLT @slope
    LDI r0, 0
    ST [bo_fric_t], r0
    LD r0, [t_s]
    CMP r0, 0
    JEQ @slope
    SUB r0, 1
    ST [t_s], r0
@slope:
    LD r0, [t_s]
    LD r1, [t_sg]
    MUL r0, r1
    ST [bo_vx], r0
    LD r0, [bo_sattr]
    MOV r1, r0
    AND r1, 15
    LDB r1, [r1 + class_flags]
    AND r1, CF_DECEL
    JZ @capped
    CALL slope_info                 ; r1 = downhill dir, r2 = 1 or 2
    LD r3, [PH_SLOPE_22]
    CMP r2, 1
    JEQ @acc
    LD r3, [PH_SLOPE_45]
@acc:
    MUL r3, r1
    LD r0, [bo_vx]
    ADD r0, r3
    CALL cap_speed
    ST [bo_vx], r0
@capped:
    ; ollie (on an up-slope or a ramp the launch is added, DESIGN.md §3.5)
    LD r0, [btnp]
    AND r0, BTN_A
    JZ @roll
    CALL speed_split
    LD r7, [PH_JUMP_V]
    LD r0, [bo_sattr]
    CALL slope_info
    LD r0, [t_sg]
    ADD r1, r0                      ; downhill dir = -sign: rolling uphill
    JNZ @jump
    LD r0, [t_s]
    CMP r2, 2
    JEQ @steep
    SHR r0, 1
@steep:
    CMP r2, 0
    JEQ @jump
    ADD r7, r0
@jump:
    LD r0, [PH_LAUNCH_MAX]
    CMP r7, r0
    JLE @jv
    MOV r7, r0
@jv:
    NEG r7
    ST [bo_vy], r7
    LDI r0, 1
    ST [bo_jheld], r0
    ST [bo_ollied], r0
    LDI r0, ST_AIR
    ST [bo_state], r0
    LDI r0, 0
    ST [bo_air_t], r0
    ST [bo_crouch], r0
    ST [bo_lip_t], r0
    LDI r0, SFX_POP
    CALL play_sfx
    JMP air_frame
@roll:
    ; move along the ground
    CALL feet
    ST [t_foot], r2
    ST [t_cx], r1
    CALL move_x
    CALL feet
    MOV r3, r1                      ; r3 = |dx| in px + 1 = how far the ground may drop
    LD r0, [t_cx]
    SUB r3, r0
    JGE @dxpos
    NEG r3
@dxpos:
    ADD r3, 1
    ADD r3, r2
    MOV r6, r2                      ; one-way surfaces: not above the feet
    SUB r2, STEP_UP
    CALL surface
    CMP r0, NONE
    JNE @ground
    LD r2, [t_foot]                 ; edge sensors: a flat top exactly at the feet
    MOV r3, r2
    MOV r6, r2
    SUB r1, BOX_W_L
    CALL surface
    CMP r0, NONE
    JNE @edge
    ADD r1, BOX_W_L + BOX_W_R
    CALL surface
    CMP r0, NONE
    JNE @edge
    ; no ground: leave it (a launch if rolling up a slope or a ramp, §3.5)
    CALL feet
    LD r2, [t_foot]
    CALL box_hit
    CMP r0, 0
    JNE @wall
    CALL speed_split
    LDI r7, 0
    LD r0, [bo_sattr]
    CALL slope_info
    LD r0, [t_sg]
    ADD r1, r0
    JNZ @launch
    LD r7, [t_s]
    CMP r2, 2
    JEQ @launch
    SHR r7, 1
    CMP r2, 0
    JNE @launch
    LDI r7, 0
@launch:
    LDI r0, 0
    CMP r7, 0
    JEQ @nolip
    LDI r0, LIP_GRACE               ; A in the next frames still adds the ollie
@nolip:
    ST [bo_lip_t], r0
    NEG r7
    ST [bo_vy], r7
    LDI r0, 0
    ST [bo_jheld], r0
    ST [bo_air_t], r0
    ST [bo_crouch], r0
    ST [bo_ollied], r0
    LDI r0, ST_AIR
    ST [bo_state], r0
    JMP air_vert
@edge:
    LD r0, [t_foot]
@ground:                            ; r0 = new feet y, r5 = attribute: check the body box there
    MOV r7, r0
    CALL feet
    MOV r2, r7
    CALL box_hit
    CMP r0, 0
    JNE @wall
    ST [bo_sattr], r5
    SHL r7, 4
    ST [bo_y], r7
    MOV r0, r5
    AND r0, 15
    CMP r0, C_RAIL                  ; rolled onto a rail (from a slope or a platform): grind
    JNE @rolled
    CALL grind_start
@rolled:
    JMP wheel_roll
@wall:
    LD r0, [t_old]
    ST [bo_x], r0
    CALL speed_split                ; bumped into a wall: stops softly, a wobble at speed
    LDI r0, 0
    ST [bo_vx], r0
    LD r0, [t_s]
    CMP r0, BUMP_MIN
    JLT @soft
    LDI r0, BUMP_T
    ST [bo_bump], r0
    LDI r0, TX_OJ
    CALL say
    LDI r0, SFX_BUMP
    CALL play_sfx
@soft:
    RET

; wheel_roll: the wheels click every 16 px rolled on the ground (not on ice), DESIGN.md §15
wheel_roll:
    LD r0, [bo_sattr]
    AND r0, 15
    CMP r0, C_ICE
    JEQ @done
    LD r0, [bo_x]
    LD r1, [t_old]
    SUB r0, r1
    JGE @pos
    NEG r0
@pos:
    LD r1, [wheel_d]
    ADD r1, r0
    CMP r1, WHEEL_STEP
    JLT @store
    SUB r1, WHEEL_STEP
    PUSH r1
    LDI r0, SFX_CLICK
    CALL play_sfx
    POP r1
@store:
    ST [wheel_d], r1
@done:
    RET

; ---- in the air -------------------------------------------------------------------------------------
bo_air:
    LD r0, [bo_jheld]
    CMP r0, 0
    JEQ @lip
    LD r0, [btn]
    AND r0, BTN_A
    JNZ @lip
    LDI r0, 0
    ST [bo_jheld], r0
    LD r0, [PH_JUMP_CUT]
    NEG r0
    LD r1, [bo_vy]
    CMP r1, r0
    JGE @lip
    ST [bo_vy], r0
@lip:
    ; A just after leaving a ramp still adds the ollie (forgiving "A at the lip")
    LD r0, [bo_lip_t]
    CMP r0, 0
    JEQ @steer
    SUB r0, 1
    ST [bo_lip_t], r0
    LD r0, [btnp]
    AND r0, BTN_A
    JZ @steer
    LD r0, [bo_vy]
    LD r1, [PH_JUMP_V]
    SUB r0, r1
    LD r1, [PH_LAUNCH_MAX]
    NEG r1
    CMP r0, r1
    JGE @lipv
    MOV r0, r1
@lipv:
    ST [bo_vy], r0
    LDI r0, 1
    ST [bo_jheld], r0
    ST [bo_ollied], r0
    LDI r0, 0
    ST [bo_lip_t], r0
    LDI r0, SFX_POP
    CALL play_sfx
@steer:
    CALL trick_air
    CALL input_dir
    CMP r4, 0
    JEQ air_frame
    LD r0, [bo_fric_t]
    ADD r0, 1
    ST [bo_fric_t], r0
    LD r1, [PH_AIR_ACC]
    CMP r0, r1
    JLT air_frame
    LDI r0, 0
    ST [bo_fric_t], r0
    CALL speed_split
    LD r0, [bo_vx]
    CMP r0, 0
    JEQ @push
    LD r0, [t_sg]
    CMP r0, r4
    JNE @push                       ; steering against the motion always works
    LD r0, [t_s]
    LD r1, [PH_PUSH_MAX]
    CMP r0, r1
    JGE air_frame                   ; steering never speeds Bo up beyond the push speed
@push:
    LD r0, [bo_vx]
    ADD r0, r4
    ST [bo_vx], r0

air_frame:
    CALL move_x
    CALL feet
    CALL box_hit
    CMP r0, 0
    JEQ air_vert
    LD r0, [t_old]
    ST [bo_x], r0
    LDI r0, 0
    ST [bo_vx], r0

air_vert:
    LD r0, [bo_air_t]
    ADD r0, 1
    ST [bo_air_t], r0
    LD r0, [bo_vy]
    LD r1, [PH_G]
    ADD r0, r1
    LD r1, [PH_MAX_FALL]
    CMP r0, r1
    JLE @fall
    MOV r0, r1
@fall:
    ST [bo_vy], r0
    CALL feet
    ST [t_foot], r2                 ; feet before the move
    LD r1, [bo_y]
    LD r0, [bo_vy]
    ADD r1, r0
    ST [bo_y], r1
    LD r0, [bo_vy]
    CMP r0, 0
    JGE @down
    ; going up: the head hits a wall cell -> stop under it
    CALL feet
    MOV r7, r2
    SUB r7, BOX_TOP                 ; y of the head
    MOV r6, r1
    SUB r1, BOX_W_L
    MOV r2, r7
    CALL cell_attr
    AND r0, 15
    LDB r0, [r0 + class_flags]
    AND r0, CF_WALL
    JNZ @head
    MOV r1, r6
    ADD r1, BOX_W_R
    MOV r2, r7
    CALL cell_attr
    AND r0, 15
    LDB r0, [r0 + class_flags]
    AND r0, CF_WALL
    JZ @out
@head:
    AND r7, -8
    ADD r7, 8 + BOX_TOP
    SHL r7, 4
    ST [bo_y], r7
    LDI r0, 0
    ST [bo_vy], r0
    JMP @out
@down:
    ; falling: land on the first surface crossed this frame
    CALL feet
    ST [t_scol], r1
    MOV r3, r2
    LD r6, [t_foot]
    MOV r2, r6
    SUB r2, STEP_UP
    CALL surface
    CMP r0, NONE
    JNE land
    MOV r2, r6                      ; edge sensors: flat tops crossed this frame
    SUB r1, BOX_W_L
    ST [t_scol], r1
    CALL surface
    CMP r0, NONE
    JNE land
    ADD r1, BOX_W_L + BOX_W_R
    ST [t_scol], r1
    CALL surface
    CMP r0, NONE
    JNE land
@out:
    ; fell out of the level
    CALL feet
    CMP r2, LV_ROWS * 8 + 24
    JLT @alive
    CALL bo_die
@alive:
    RET

; land: r0 = surface y, r5 = attribute, t_scol = x of the sensor that found it
land:
    MOV r7, r0
    MOV r0, r5
    AND r0, 15
    CMP r0, C_BOUNCE
    JEQ land_bounce
    CMP r0, C_WEAK
    JEQ land_break
    CMP r0, C_BOX
    JEQ land_break
    SHL r7, 4
    ST [bo_y], r7
    ST [bo_sattr], r5
    ; landing in a down-slope in the direction of travel: the fall becomes speed (vx += vy / 4, §3.5)
    MOV r0, r5
    CALL slope_info
    MOV r7, r1
    CMP r7, 0
    JEQ @flat
    CALL speed_split
    LD r0, [bo_vx]
    CMP r0, 0
    JEQ @flat
    LD r0, [t_sg]
    CMP r0, r7
    JNE @flat
    LD r0, [bo_vy]
    SAR r0, 2
    MUL r0, r7
    LD r1, [bo_vx]
    ADD r0, r1
    CALL cap_speed
    ST [bo_vx], r0
@flat:
    LDI r0, 0
    ST [bo_vy], r0
    ST [bo_jheld], r0
    ST [bo_fric_t], r0
    ST [bo_lip_t], r0
    LDI r0, ST_GROUND
    ST [bo_state], r0
    LD r0, [bo_sattr]
    AND r0, 15
    CMP r0, C_RAIL
    JNE @ground
    CALL trick_land_rail
    JMP grind_start
@ground:
    LDI r0, SFX_LAND
    CALL play_sfx
    LD r0, [bo_air_t]               ; a big landing: Bo looks back (signature)
    CMP r0, LOOK_AIR
    JLT @tricks
    LDI r0, LOOK_T
    ST [bo_look_t], r0
@tricks:
    JMP trick_land

; a trampoline (or jelly): straight back up with BOUNCE_V
land_bounce:
    LD r0, [PH_BOUNCE_V]
    NEG r0
    ST [bo_vy], r0
    LDI r0, 0
    ST [bo_jheld], r0
    LDI r0, SFX_BOING
    CALL play_sfx
    RET

; a weak obstacle or a box: it breaks (exactly its cells), Bo bounces up a little (DESIGN.md §3.7)
land_break:
    MOV r1, r7                      ; the cell under the sensor
    SHR r1, 3
    LD r0, [t_scol]
    SHR r0, 3
    CALL break_at
    LDI r0, STOMP_V
    NEG r0
    ST [bo_vy], r0
    LDI r0, 0
    ST [bo_jheld], r0
    RET

; ---- grind (DESIGN.md §3.6) ---------------------------------------------------------------------------
grind_start:
    LDI r0, ST_GRIND
    ST [bo_state], r0
    LDI r0, 0
    ST [grind_t], r0
    LDI r0, TR_GRIND
    LDI r1, 0
    CALL combo_add
    LDI r0, SFX_GRIND
    CALL play_sfx
    RET

; grind_end: a long enough grind says WIII! (at most every 5 s)
grind_end:
    LD r0, [grind_t]
    CMP r0, GRIND_WIII
    JLT @done
    LD r0, [wiii_t]
    CMP r0, 0
    JNE @done
    LDI r0, WIII_GAP
    ST [wiii_t], r0
    LDI r0, TX_WIII
    CALL say
@done:
    RET

bo_grind:
    LD r0, [btnp]
    AND r0, BTN_A
    JZ @ride
    CALL grind_end                  ; A: ollie off the rail (tricks can follow)
    LD r0, [PH_JUMP_V]
    NEG r0
    ST [bo_vy], r0
    LDI r0, 1
    ST [bo_jheld], r0
    LDI r0, ST_AIR
    ST [bo_state], r0
    LDI r0, 0
    ST [bo_air_t], r0
    ST [bo_ollied], r0
    LDI r0, SFX_POP
    CALL play_sfx
    JMP air_frame
@ride:
    LD r0, [grind_t]                ; 10 points per 8 frames
    ADD r0, 1
    ST [grind_t], r0
    AND r0, 7
    JNZ @speed
    LD r0, [combo_pts]
    ADD r0, 10
    ST [combo_pts], r0
    LD r0, [grind_t]
    AND r0, 31
    JNZ @speed
    LDI r0, SFX_GRIND
    CALL play_sfx
@speed:
    LD r0, [bo_sattr]               ; no friction on a flat rail; a diagonal one accelerates like a 45° slope
    CALL slope_info
    CMP r1, 0
    JEQ @move
    LD r3, [PH_SLOPE_45]
    MUL r3, r1
    LD r0, [bo_vx]
    ADD r0, r3
    CALL cap_speed
    ST [bo_vx], r0
@move:
    CALL feet
    ST [t_foot], r2
    ST [t_cx], r1
    CALL move_x
    CALL feet
    MOV r3, r1
    LD r0, [t_cx]
    SUB r3, r0
    JGE @dx
    NEG r3
@dx:
    ADD r3, 1
    ADD r3, r2
    SUB r2, STEP_UP
    MOV r6, r2
    CALL surface
    CMP r0, NONE
    JEQ @off
    MOV r7, r0
    CALL feet
    MOV r2, r7
    CALL box_hit
    CMP r0, 0
    JNE @blocked
    SHL r7, 4
    ST [bo_y], r7
    ST [bo_sattr], r5
    MOV r0, r5
    AND r0, 15
    CMP r0, C_RAIL
    JEQ @done
    CALL grind_end                  ; the rail ended on the ground
    LDI r0, ST_GROUND
    ST [bo_state], r0
    JMP trick_land
@blocked:
    LD r0, [t_old]
    ST [bo_x], r0
    LDI r0, 0
    ST [bo_vx], r0
@done:
    RET
@off:
    ; the end of the rail: on through the air with the same velocity
    CALL grind_end
    CALL speed_split
    LD r0, [bo_sattr]
    CALL slope_info
    LD r0, [t_s]
    CMP r2, 0
    JNE @diag
    LDI r0, 0
@diag:
    LD r2, [t_sg]
    CMP r1, r2
    JEQ @downhill
    NEG r0                          ; leaving an up-rail: upwards
@downhill:
    ST [bo_vy], r0
    LDI r0, ST_AIR
    ST [bo_state], r0
    LDI r0, 0
    ST [bo_air_t], r0
    ST [bo_jheld], r0
    JMP air_vert

; ---- lives ---------------------------------------------------------------------------------------------
bo_die:
    LDI r0, ST_DEAD
    ST [bo_state], r0
    LDI r0, DEAD_T
    ST [dead_t], r0
    LDI r0, 0
    ST [trick], r0
    ST [bo_vx], r0
    ST [pw_kind], r0                ; pommes and godis are lost with the life
    ST [pw_t], r0
    CALL combo_reset
    LDI r0, TX_AJ
    CALL say
    LDI r0, SFX_AJ
    CALL play_sfx
    RET

bo_dead:
    LD r0, [dead_t]
    SUB r0, 1
    ST [dead_t], r0
    JNZ @wait
    LD r0, [lives]
    SUB r0, 1
    ST [lives], r0
    JZ @over
    CALL actors_reset               ; the enemies come back
    LD r1, [cp_col]                 ; back to the last checkpoint
    CALL bo_spawn
    CALL camera_snap
    RET
@over:
    LDI r0, ST_OVER
    ST [bo_state], r0
    LDI r0, OVER_T
    ST [dead_t], r0
    LDI r0, TX_FORSOK_IGEN
    ST [banner_id], r0
    LDI r0, OVER_T
    ST [banner_t], r0
@wait:
    RET

bo_over:                            ; game over: the level starts again from the beginning with 5 lives
    LD r0, [dead_t]
    SUB r0, 1
    ST [dead_t], r0
    JNZ @wait
    LDI r0, 5
    ST [lives], r0
    LD r0, [level]
    CALL level_start
@wait:
    RET

; ---- the pose (signature, DESIGN.md §0.2): only what is drawn ------------------------------------------
pose_update:
    LD r0, [btn]                    ; any button cancels the idle tricks at once
    CMP r0, 0
    JNE @noidle
    LD r0, [bo_vx]
    CMP r0, 0
    JNE @noidle
    LD r0, [bo_state]
    CMP r0, ST_GROUND
    JNE @noidle
    LD r0, [bo_idle_t]
    CMP r0, IDLE_BAL
    JGE @idled
    ADD r0, 1
    ST [bo_idle_t], r0
    JMP @idled
@noidle:
    LDI r0, 0
    ST [bo_idle_t], r0
@idled:
    LD r0, [bo_look_t]
    CMP r0, 0
    JEQ @nolook
    SUB r0, 1
    ST [bo_look_t], r0
@nolook:
    LD r0, [bo_bump]
    CMP r0, 0
    JEQ @nobump
    SUB r0, 1
    ST [bo_bump], r0
@nobump:
    LD r0, [bo_state]
    LDI r1, P_GRIND
    CMP r0, ST_GRIND
    JEQ @set
    LDI r1, P_HURT
    CMP r0, ST_DEAD
    JGE @set
    CMP r0, ST_AIR
    JNE @ground
    LDI r1, P_AIR
    LD r0, [trick]
    CMP r0, 0
    JEQ @set
    LDI r1, P_TRICK
    JMP @set
@ground:
    LDI r1, P_OJ
    LD r0, [bo_bump]
    CMP r0, 0
    JNE @set
    LDI r1, P_GOAL
    LD r0, [goal_t]
    CMP r0, 0
    JNE @set
    LDI r1, P_LOOK
    LD r0, [bo_look_t]
    CMP r0, 0
    JNE @set
    LDI r1, P_CROUCH
    LD r0, [bo_crouch]
    CMP r0, 0
    JNE @set
    LDI r1, P_BRAKE
    LD r0, [f_brake]
    CMP r0, 0
    JNE @set
    LDI r1, P_PUSH
    LD r0, [f_push]
    CMP r0, 0
    JNE @set
    LDI r1, P_BALANCE
    LD r0, [bo_idle_t]
    CMP r0, IDLE_BAL
    JGE @set
    LDI r1, P_POP
    CMP r0, IDLE_POP
    JLT @fast
    CMP r0, IDLE_POP + POP_T
    JLT @set
@fast:
    CALL speed_split
    LDI r1, P_FAST
    LD r0, [t_s]
    CMP r0, 32
    JGT @set
    LDI r1, P_RIDE
@set:
    ST [bo_pose], r1
    LD r0, [f_push]                 ; the push kick, in step with the acceleration (faster with pommes)
    CMP r0, 0
    JEQ @nokick
    LD r0, [bo_kick_t]
    ADD r0, 1
    LD r2, [pw_kind]
    CMP r2, PW_POMMES
    JNE @k
    ADD r0, 1
@k:
    ST [bo_kick_t], r0
@nokick:
    RET

.data
; per shape (height map index): downhill direction (255 = -1) and steepness (1 = 22.5°, 2 = 45°)
shape_down:  .byte 0, 255, 1, 255, 255, 1, 1, 0
shape_steep: .byte 0, 2, 2, 1, 1, 1, 1, 0
.code
