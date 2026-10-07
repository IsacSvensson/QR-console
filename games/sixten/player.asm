; Sixten top-down (DESIGN.md §2, §3.1): four directions, speed by the cell under his feet, collision by cell type
; (blocking = speed 0), sliding round corners, stamping controls, the step counter and "you are here" (§5).
.code

; one frame in play: B opens the map; otherwise walk, and slide to the next screen when the feet cross its edge
play_frame:
    SYS BTNP
    MOV r1, r0
    AND r0, BTN_B
    JZ @side
    CALL map_open
    RET
@side:
    AND r1, BTN_A                   ; A facing a side view's cell: into the side view
    JZ @walk
    CALL try_side
    LD r0, [mode]
    CMP r0, M_SIDE
    JNE @walk
    RET
@walk:
    CALL player_move
    CALL player_cell
    CALL whirl_update
    CALL player_hazard
    CALL whirl_sound
    LD r0, [mode]                   ; AJ! may have started the level again
    CMP r0, M_PLAY
    JNE @draw
    LD r0, [px]
    SHR r0, 11
    LD r1, [py]
    SHR r1, 4
    DIV r1, SCR_H
    LD r2, [scr_c]
    CMP r0, r2
    JNE @slide
    LD r2, [scr_r]
    CMP r1, r2
    JEQ @same
@slide:
    CALL slide_start
    JMP @draw
@same:
    CALL whirl_view
@draw:
    CALL draw_world
    RET

player_move:
    SYS BTN
    ST [btn], r0
    LDI r1, 0
    ST [moving], r1
    LD r1, [cell_i]
    LDB r1, [r1 + cells]
    AND r1, 31
    LDB r5, [r1 + cell_speed]       ; 1/16 px per frame
    MOV r1, r0
    AND r1, BTN_LEFT | BTN_RIGHT
    JZ @vertical
    AND r0, BTN_RIGHT
    JNZ @right
    NEG r5
    LDI r0, FACE_LT
    JMP @hface
@right:
    LDI r0, FACE_RT
@hface:
    ST [face], r0
    MOV r0, r5
    CALL try_x
    JMP @moved
@vertical:
    MOV r1, r0
    AND r1, BTN_UP | BTN_DOWN
    JZ @idle
    AND r0, BTN_DOWN
    JNZ @down
    NEG r5
    LDI r0, FACE_UP
    JMP @vface
@down:
    LDI r0, FACE_DN
@vface:
    ST [face], r0
    MOV r0, r5
    CALL try_y
@moved:
    LDI r0, 1
    ST [moving], r0
    LD r0, [walk_t]
    ADD r0, 1
    ST [walk_t], r0
@idle:
    RET

; r0 = x px, r1 = y px -> r0 = 1 if that point is outside the level or on a blocking cell
blocked:
    LD r2, [lv_w]
    SHL r2, 5
    CMP r0, r2
    JAE @yes                        ; unsigned: left of the level counts too
    LD r2, [lv_h]
    SHL r2, 5
    CMP r1, r2
    JAE @yes
    SHR r0, 5
    SHR r1, 5
    LD r2, [lv_w]
    MUL r1, r2
    ADD r0, r1
    LDB r0, [r0 + cells]
    AND r0, 31
    LDB r0, [r0 + cell_speed]
    CMP r0, 0
    JEQ @yes
    LDI r0, 0
    RET
@yes:
    LDI r0, 1
    RET

; r0 = x px, r1 = y px of the feet -> r0 = blocked corners of the box: 1 top-left, 2 top-right, 4 bottom-left,
; 8 bottom-right
box_blocked:
    ST [bx], r0
    ST [by], r1
    LDI r3, 0
    SUB r0, 3
    SUB r1, 3
    CALL blocked
    OR r3, r0
    LD r0, [bx]
    ADD r0, 2
    LD r1, [by]
    SUB r1, 3
    CALL blocked
    SHL r0, 1
    OR r3, r0
    LD r0, [bx]
    SUB r0, 3
    LD r1, [by]
    CALL blocked
    SHL r0, 2
    OR r3, r0
    LD r0, [bx]
    ADD r0, 2
    LD r1, [by]
    CALL blocked
    SHL r0, 3
    OR r3, r0
    MOV r0, r3
    RET

; r0 = dx (1/16 px): move if the box is free there; if only the upper (lower) corners hit, slide 1 px down (up)
try_x:
    LD r1, [px]
    ADD r1, r0
    ST [nx], r1
    MOV r0, r1
    SHR r0, 4
    LD r1, [py]
    SHR r1, 4
    CALL box_blocked
    CMP r0, 0
    JNE @hit
    LD r0, [nx]
    ST [px], r0
    RET
@hit:
    MOV r1, r0
    AND r1, 3
    AND r0, 12
    JNZ @lower
    LDI r0, 16                      ; only the upper corners: step down
    JMP @nudge
@lower:
    CMP r1, 0
    JNE @stop                       ; both: a wall
    LDI r0, -16                     ; only the lower corners: step up
@nudge:
    LD r1, [py]
    ADD r1, r0
    ST [ny], r1
    LD r0, [px]
    SHR r0, 4
    SHR r1, 4
    CALL box_blocked
    CMP r0, 0
    JNE @stop
    LD r0, [ny]
    ST [py], r0
@stop:
    RET

; r0 = dy (1/16 px): as try_x, sliding sideways round corners
try_y:
    LD r1, [py]
    ADD r1, r0
    ST [ny], r1
    LD r0, [px]
    SHR r0, 4
    SHR r1, 4
    CALL box_blocked
    CMP r0, 0
    JNE @hit
    LD r0, [ny]
    ST [py], r0
    RET
@hit:
    MOV r1, r0
    AND r1, 5                       ; left corners
    AND r0, 10                      ; right corners
    JNZ @right
    LDI r0, 16                      ; only the left corners: step right
    JMP @nudge
@right:
    CMP r1, 0
    JNE @stop
    LDI r0, -16
@nudge:
    LD r1, [px]
    ADD r1, r0
    ST [nx], r1
    MOV r0, r1
    SHR r0, 4
    LD r1, [py]
    SHR r1, 4
    CALL box_blocked
    CMP r0, 0
    JNE @stop
    LD r0, [nx]
    ST [px], r0
@stop:
    RET

; the cell under the feet: count steps, stamp a control, decide "you are here"
player_cell:
    LD r0, [px]
    SHR r0, 9
    LD r1, [py]
    SHR r1, 9
    LD r2, [lv_w]
    MUL r1, r2
    ADD r0, r1
    LD r1, [cell_i]
    CMP r0, r1
    JEQ @here
    ST [cell_i], r0
    LD r1, [course_set]
    CMP r1, 0
    JEQ @stamp
    LD r1, [steps]
    ADD r1, 1
    ST [steps], r1
@stamp:
    LDB r1, [r0 + cells]
    AND r1, 0xC0
    CMP r1, 0x80                    ; a control, not under leaves
    JNE @here
    CALL stamp
@here:
    LD r0, [cell_i]
    LDB r0, [r0 + cells]
    LDI r1, 1
    MOV r2, r0
    AND r2, 0xC0
    CMP r2, 0x80
    JEQ @set
    AND r0, 31
    CMP r0, CT_PATH_X
    JEQ @set
    CMP r0, CT_START
    JEQ @set
    LD r2, [pw]
    CMP r2, PW_CUCUMBER
    JEQ @set
    LDI r1, 0
@set:
    ST [you_here], r1
    RET

; r0 = cell index of a control: stamp it (once); AJ! comes back here; it may start a whirlwind
stamp:
    LDI r1, 0
    ST [stamp_k], r1
    MOV r5, r0
    LD r6, [lv_ptr]
    LDB r7, [r6 + LR_NCTRL]
    LD r6, [r6 + LR_CTRLS]
    LDI r4, 0
@k:
    LDB r1, [r6 + 1]
    LD r2, [lv_w]
    MUL r1, r2
    LDB r2, [r6]
    ADD r1, r2
    CMP r1, r5
    JNE @next
    LDI r1, 1
    SHL r1, r4
    LD r2, [stamped]
    MOV r3, r2
    AND r3, r1
    JNZ @next
    OR r2, r1
    ST [stamped], r2
    LD r2, [n_stamped]
    ADD r2, 1
    ST [n_stamped], r2
    ST [last_cell], r5
    MOV r0, r4
    ADD r0, 1
    ST [stamp_k], r0
    LDI r0, SFX_BIP
    SYS SFX
@next:
    ADD r6, 3
    ADD r4, 1
    CMP r4, r7
    JLT @k
    LD r4, [stamp_k]
    CMP r4, 0
    JEQ @done
    SUB r4, 1
    CALL whirl_trigger
@done:
    RET

; Sixten: head + body, the body alternates while he walks; facing left = facing right flipped. Inside the cabin he
; is not seen; in shelter he crouches; after AJ! he blinks; a falling branch's shadow grows over him.
draw_sixten:
    LD r0, [inv_t]
    AND r0, 4
    JNZ @gone
    LD r0, [cell_i]
    LDB r0, [r0 + cells]
    AND r0, 31
    CMP r0, CT_HOUSE
    JNE @shown
@gone:
    RET
@shown:
    LD r6, [face]
    LD r1, [px]
    SHR r1, 4
    LD r0, [camx]
    SUB r1, r0
    SUB r1, 4
    LD r2, [py]
    SHR r2, 4
    LD r0, [camy]
    SUB r2, r0
    ADD r2, PLAY_Y - 15
    LD r0, [branch_t]               ; the branch's shadow at his feet
    CMP r0, 0
    JEQ @noshadow
    PUSH r1
    PUSH r2
    LDI r0, spr_shadow
    ADD r2, 10
    LDI r3, 0
    SYS SPR
    POP r2
    POP r1
@noshadow:
    LD r0, [sheltered]
    CMP r0, 0
    JEQ @upright
    LD r0, [still_t]
    CMP r0, STILL_CROUCH
    JB @upright
    LDI r0, spr_crouch_head
    ADD r2, 4
    LDI r3, 0
    SYS SPR
    LDI r0, spr_crouch_body
    ADD r2, 8
    SYS SPR
    RET
@upright:
    LDI r3, 0
    CMP r6, FACE_LT
    JNE @flip
    LDI r3, 1
@flip:
    MOV r0, r6
    SHL r0, 1
    LD r0, [r0 + head_spr]
    SYS SPR
    LD r0, [moving]
    CMP r0, 0
    JEQ @frame
    LD r0, [walk_t]
    SHR r0, 3
    AND r0, 1
@frame:
    SHL r6, 2
    SHL r0, 1
    ADD r0, r6
    LD r0, [r0 + body_spr]
    ADD r2, 8
    SYS SPR
    RET

.data
head_spr:   .word spr_head_dn, spr_head_up, spr_head_rt, spr_head_rt
body_spr:   .word spr_body_dn0, spr_body_dn1, spr_body_up0, spr_body_up1, spr_body_rt0, spr_body_rt1, spr_body_rt0, spr_body_rt1
.code
