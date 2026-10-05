; Bo: skateboard physics (DESIGN.md §3). Order per frame in the air: vy += G; y += vy; x += vx (§3.3).
; Positions and speeds in 1/16 px. Bo's point is the centre of his feet: x = centre, y = the first pixel row
; of the ground under him (when grounded, exactly the surface height).

; ---- bo_spawn: stand at the level's start column ---------------------------------------------------
bo_spawn:
    LD r1, [lv_start]
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

; slope_info: r0 = attribute -> r1 = downhill direction (+1 right, -1 left, 0 flat or not a slope/ramp),
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

; feet: r2 = feet y px (from bo_y), r1 = centre x px (from bo_x)
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

; ---- bo_update ------------------------------------------------------------------------------------
bo_update:
    LD r0, [bo_state]
    CMP r0, ST_AIR
    JEQ bo_air

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
    ; push
    ST [bo_dir], r4
    LD r0, [t_s]
    LD r1, [PH_PUSH_MAX]
    CMP r0, r1
    JGT @coast                      ; faster than the push speed (downhill): rolls out
    LD r2, [PH_PUSH_ACC]
    ADD r0, r2
    CMP r0, r1
    JLE @pushed
    MOV r0, r1
@pushed:
    ST [t_s], r0
    LDI r0, 0
    ST [bo_fric_t], r0
    JMP @slope
@brake:
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
    JEQ @slope
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
    LD r1, [PH_SPEED_CAP]
    CMP r0, r1
    JLE @notfast
    MOV r0, r1
@notfast:
    NEG r1
    CMP r0, r1
    JGE @notfastl
    MOV r0, r1
@notfastl:
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
    LDI r0, ST_AIR
    ST [bo_state], r0
    LDI r0, 0
    ST [bo_air_t], r0
    ST [bo_crouch], r0
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
    NEG r7
    ST [bo_vy], r7
    LDI r0, 0
    ST [bo_jheld], r0
    ST [bo_air_t], r0
    ST [bo_crouch], r0
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
    RET
@wall:
    LD r0, [t_old]
    ST [bo_x], r0
    LDI r0, 0
    ST [bo_vx], r0
    RET

; ---- in the air -------------------------------------------------------------------------------------
bo_air:
    LD r0, [bo_jheld]
    CMP r0, 0
    JEQ @steer
    LD r0, [btn]
    AND r0, BTN_A
    JNZ @steer
    LDI r0, 0
    ST [bo_jheld], r0
    LD r0, [PH_JUMP_CUT]
    NEG r0
    LD r1, [bo_vy]
    CMP r1, r0
    JGE @steer
    ST [bo_vy], r0
@steer:
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
    MOV r3, r2
    LD r6, [t_foot]
    MOV r2, r6
    SUB r2, STEP_UP
    CALL surface
    CMP r0, NONE
    JNE land
    MOV r2, r6                      ; edge sensors: flat tops crossed this frame
    SUB r1, BOX_W_L
    CALL surface
    CMP r0, NONE
    JNE land
    ADD r1, BOX_W_L + BOX_W_R
    CALL surface
    CMP r0, NONE
    JNE land
@out:
    ; fell out of the level: back to the start (lives come in M20)
    CALL feet
    CMP r2, LV_ROWS * 8 + 32
    JLT @alive
    CALL bo_spawn
@alive:
    RET

; land: r0 = surface y, r5 = attribute
land:
    SHL r0, 4
    ST [bo_y], r0
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
    LD r1, [PH_SPEED_CAP]
    CMP r0, r1
    JLE @c1
    MOV r0, r1
@c1:
    NEG r1
    CMP r0, r1
    JGE @c2
    MOV r0, r1
@c2:
    ST [bo_vx], r0
@flat:
    LDI r0, 0
    ST [bo_vy], r0
    ST [bo_jheld], r0
    ST [bo_fric_t], r0
    LDI r0, ST_GROUND
    ST [bo_state], r0
    RET

.data
; per shape (height map index): downhill direction (255 = -1) and steepness (1 = 22.5°, 2 = 45°)
shape_down:  .byte 0, 255, 1, 255, 255, 1, 1, 0
shape_steep: .byte 0, 2, 2, 1, 1, 1, 1, 0
.code
