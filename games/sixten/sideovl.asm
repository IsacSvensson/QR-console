; The side-view engine (DESIGN.md §3.2): a code overlay. It is assembled into xdata and copied to OVL_RAM by
; side_enter; every jump and call inside it is written with OV (the target's offset in the overlay, at OVL_RAM —
; D-040), calls into ROM are ordinary. Walk, a jump whose height follows how long A is held, climb on roots and
; holds, crouch (↓), a horizontal wind that pushes unless Sixten is in the lee, has chocolate or climbs; out at the
; left or right edge.

.macro OV op, target
    op OVL_RAM + (target - ovl_side)
.endm

.xdata
ovl_side:                           ; = OVL_RAM: one frame of the side view (mode_table calls it)
    SYS BTNP
    ST [sd_btnp], r0
    AND r0, BTN_B
    OV JZ, @play
    CALL map_open                   ; the map pauses the side view too
    RET
@play:
    SYS BTN
    ST [sd_btn], r0
    OV CALL, sd_step
    LD r0, [mode]
    CMP r0, M_SIDE
    OV JNE, @out                    ; he left at an edge
    OV CALL, sd_draw
@out:
    RET

; r0 = x px, r1 = y px -> r0 = the tile's flags (0 background, ST_SOLID, ST_CLIMB). Below the view is solid; left
; and right of it is open (the exits). Clobbers r0-r2.
sd_attr:
    CMP r1, SIDE_ROWS * 8
    OV JGE, @floor
    CMP r1, 0
    OV JLT, @air
    LD r2, [sd_cols]
    SHL r2, 3
    CMP r0, r2
    OV JAE, @air
    SHR r0, 3
    MUL r0, SIDE_ROWS
    SHR r1, 3
    ADD r0, r1
    LDB r0, [r0 + sbuf]
    LDB r0, [r0 + side_attr]
    RET
@floor:
    LDI r0, ST_SOLID
    RET
@air:
    LDI r0, 0
    RET

; r0 = x px: 1 if a solid tile is at x anywhere along the body (feet, middle, head)
sd_col_hit:
    ST [bx], r0
    LD r1, [sd_y]
    SHR r1, 4
    SUB r1, 1
    OV CALL, sd_attr
    CMP r0, ST_SOLID
    OV JEQ, @hit
    LD r0, [bx]
    LD r1, [sd_y]
    SHR r1, 4
    SUB r1, 8
    OV CALL, sd_attr
    CMP r0, ST_SOLID
    OV JEQ, @hit
    OV CALL, sd_height
    MOV r1, r0
    LD r0, [sd_y]
    SHR r0, 4
    SUB r0, r1
    MOV r1, r0
    LD r0, [bx]
    OV CALL, sd_attr
    CMP r0, ST_SOLID
    OV JEQ, @hit
    LDI r0, 0
    RET
@hit:
    LDI r0, 1
    RET

; r1 = y px: 1 if a solid tile is at y under the body's left or right edge
sd_row_hit:
    ST [by], r1
    LD r0, [sd_x]
    SHR r0, 4
    SUB r0, 3
    OV CALL, sd_attr
    CMP r0, ST_SOLID
    OV JEQ, @hit
    LD r0, [sd_x]
    SHR r0, 4
    ADD r0, 2
    LD r1, [by]
    OV CALL, sd_attr
    CMP r0, ST_SOLID
    OV JEQ, @hit
    LDI r0, 0
    RET
@hit:
    LDI r0, 1
    RET

; r1 = y px of the feet's row: 1 if it is in the top tile of roots or holds (climbable, nothing climbable above),
; the feet were at or above that tile's top (sd_y), and ↓ is not held — the top of a climb is something to stand on
sd_ladder_top:
    LD r0, [sd_btn]
    AND r0, BTN_DOWN
    OV JNZ, @no
    ST [by], r1
    LD r0, [sd_y]                   ; at or above the tile's top
    SHR r0, 4
    AND r1, 0xFFF8
    CMP r0, r1
    OV JGT, @no
    LD r0, [sd_x]
    SHR r0, 4
    LD r1, [by]
    OV CALL, sd_attr
    CMP r0, ST_CLIMB
    OV JNE, @no
    LD r1, [by]
    SUB r1, 8
    LD r0, [sd_x]
    SHR r0, 4
    OV CALL, sd_attr
    CMP r0, ST_CLIMB
    OV JEQ, @no
    LDI r0, 1
    RET
@no:
    LDI r0, 0
    RET

; r0 = the body's height (crouching or not)
sd_height:
    LDI r0, SD_H
    LD r1, [sd_crouch]
    CMP r1, 0
    OV JEQ, @done
    LDI r0, SD_HC
@done:
    RET

sd_step:
    LD r0, [sd_x]                   ; on roots or holds? (at the feet: he climbs until his feet reach the top)
    SHR r0, 4
    LD r1, [sd_y]
    SHR r1, 4
    SUB r1, 1
    OV CALL, sd_attr
    LDI r7, 0
    CMP r0, ST_CLIMB
    OV JNE, @noclimb
    LDI r7, 1
@noclimb:
    LD r0, [sd_climb]
    CMP r7, 0
    OV JNE, @canclimb
    LDI r0, 0
    OV JMP, @setclimb
@canclimb:
    LD r1, [sd_btn]
    AND r1, BTN_UP | BTN_DOWN
    OV JZ, @setclimb
    LDI r0, 1
@setclimb:
    ST [sd_climb], r0
    LDI r0, 0                       ; crouch: ↓ on the ground, not climbing
    LD r1, [sd_climb]
    CMP r1, 0
    OV JNE, @cr
    LD r1, [sd_ground]
    CMP r1, 0
    OV JEQ, @cr
    LD r1, [sd_btn]
    AND r1, BTN_DOWN
    OV JZ, @cr
    LDI r0, 1
@cr:
    ST [sd_crouch], r0
    LD r0, [sd_climb]               ; vertical: climbing, or gravity and the jump
    CMP r0, 0
    OV JEQ, @gravity
    LDI r0, 0
    ST [sd_vy], r0
    LDI r5, 0
    LD r1, [sd_btn]
    AND r1, BTN_UP
    OV JZ, @cdown
    LDI r5, 0 - SD_CLIMB
@cdown:
    LD r1, [sd_btn]
    AND r1, BTN_DOWN
    OV JZ, @cjump
    LDI r5, SD_CLIMB
@cjump:
    LD r1, [sd_btnp]
    AND r1, BTN_A
    OV JZ, @vmove
    LDI r0, 0                       ; A: jump off
    ST [sd_climb], r0
    LDI r5, SD_JUMP
    ST [sd_vy], r5
    OV JMP, @vmove
@gravity:
    LD r5, [sd_vy]
    LD r1, [sd_btnp]
    AND r1, BTN_A
    OV JZ, @nojump
    LD r1, [sd_ground]
    CMP r1, 0
    OV JEQ, @nojump
    LDI r5, SD_JUMP
@nojump:
    LD r1, [sd_btn]                 ; A released while rising: the jump is cut short
    AND r1, BTN_A
    OV JNZ, @held
    CMP r5, SD_CUT
    OV JGE, @held
    LDI r5, SD_CUT
@held:
    ADD r5, SD_GRAV
    CMP r5, SD_FALL
    OV JLE, @capped
    LDI r5, SD_FALL
@capped:
    ST [sd_vy], r5
@vmove:                             ; r5 = dy (1/16 px)
    LD r0, [sd_y]
    ADD r0, r5
    ST [ny], r0
    CMP r5, 0
    OV JEQ, @vdone
    OV JLT, @rising
    SHR r0, 4                       ; falling: the feet's row
    SUB r0, 1
    MOV r1, r0
    OV CALL, sd_row_hit
    CMP r0, 0
    OV JNE, @land
    LD r1, [ny]                     ; or the top of roots or holds (not while ↓ is held)
    SHR r1, 4
    SUB r1, 1
    OV CALL, sd_ladder_top
    CMP r0, 0
    OV JEQ, @vfree
@land:
    LD r0, [ny]                     ; land on that tile's top
    SHR r0, 4
    SUB r0, 1
    AND r0, 0xFFF8
    SHL r0, 4
    ST [sd_y], r0
    LDI r0, 0
    ST [sd_vy], r0
    OV JMP, @vdone
@rising:
    OV CALL, sd_height
    MOV r1, r0
    LD r0, [ny]
    SHR r0, 4
    SUB r0, r1
    MOV r1, r0
    OV CALL, sd_row_hit
    CMP r0, 0
    OV JEQ, @vfree
    LDI r0, 0                       ; the head hits: stop rising
    ST [sd_vy], r0
    OV JMP, @vdone
@vfree:
    LD r0, [ny]
    ST [sd_y], r0
@vdone:
    LD r1, [sd_y]                   ; on the ground: solid (or the top of roots) just under the feet
    SHR r1, 4
    OV CALL, sd_row_hit
    CMP r0, 0
    OV JNE, @grounded
    LD r1, [sd_y]
    SHR r1, 4
    OV CALL, sd_ladder_top
@grounded:
    ST [sd_ground], r0
    LDI r5, 0                       ; horizontal: walking (not while crouching)
    LD r1, [sd_crouch]
    CMP r1, 0
    OV JNE, @wind
    LD r1, [sd_btn]
    AND r1, BTN_RIGHT
    OV JZ, @left
    LDI r5, SD_WALK
    LD r0, [pw]                     ; chips: 1.5 x
    CMP r0, PW_CHIPS
    OV JNE, @rspeed
    LDI r5, SD_WALK * 3 / 2
@rspeed:
    LDI r0, 0
    ST [sd_face], r0
    OV JMP, @wind
@left:
    LD r1, [sd_btn]
    AND r1, BTN_LEFT
    OV JZ, @wind
    LDI r5, 0 - SD_WALK
    LD r0, [pw]
    CMP r0, PW_CHIPS
    OV JNE, @lspeed
    LDI r5, 0 - SD_WALK * 3 / 2
@lspeed:
    LDI r0, 1
    ST [sd_face], r0
@wind:
    LD r0, [sd_climb]
    CMP r0, 0
    OV JEQ, @walked
    SAR r5, 1                       ; sideways on roots and holds at half speed
@walked:
    ST [sd_dx], r5
    PUSH r5
    OV CALL, sd_lee_check
    POP r5
    LD r0, [sd_lee]                 ; the wind: not in the lee, not with chocolate, not climbing
    CMP r0, 0
    OV JNE, @hmove
    LD r0, [pw]
    CMP r0, PW_CHOCOLATE
    OV JEQ, @hmove
    LD r0, [sd_climb]
    CMP r0, 0
    OV JNE, @hmove
    LD r0, [sd_wind]
    ADD r5, r0
@hmove:
    CMP r5, 0
    OV JEQ, @exits
    LD r0, [sd_x]
    ADD r0, r5
    ST [nx], r0
    SHR r0, 4
    CMP r5, 0
    OV JLT, @hleft
    ADD r0, 2
    OV JMP, @hcheck
@hleft:
    SUB r0, 3
@hcheck:
    OV CALL, sd_col_hit
    CMP r0, 0
    OV JNE, @exits
    LD r0, [nx]
    ST [sd_x], r0
@exits:
    LD r0, [sd_x]                   ; out at an edge
    SHR r0, 4
    CMP r0, 2
    OV JLT, @outl
    LD r1, [sd_cols]
    SHL r1, 3
    SUB r1, 2
    CMP r0, r1
    OV JGE, @outr
    RET
@outl:
    LD r0, [sd_link]
    LD r0, [r0 + SL_EXITL]
    CALL side_exit
    RET
@outr:
    LD r0, [sd_link]
    LD r0, [r0 + SL_EXITR]
    CALL side_exit
    RET

; the lee (DESIGN §6.5): with wind, something solid within 14 px upwind at the feet — and at the head, unless he
; crouches — keeps the wind off him
sd_lee_check:
    LDI r0, 0
    ST [sd_lee], r0
    LD r0, [sd_wind]
    CMP r0, 0
    OV JEQ, @done
    LDI r6, 6                       ; the wind blows to the left: it comes from the right
    LDI r7, 14
    CMP r0, 0
    OV JLT, @look
    LDI r6, -6
    LDI r7, -14
@look:
    LD r1, [sd_y]
    SHR r1, 4
    SUB r1, 4
    OV CALL, sd_up_solid
    CMP r0, 0
    OV JEQ, @done
    LD r0, [sd_crouch]
    CMP r0, 0
    OV JNE, @lee
    LD r1, [sd_y]
    SHR r1, 4
    SUB r1, 12
    OV CALL, sd_up_solid
    CMP r0, 0
    OV JEQ, @done
@lee:
    LDI r0, 1
    ST [sd_lee], r0
@done:
    RET

; r1 = y px, r6, r7 = x offsets: 1 if solid at x + r6 or x + r7
sd_up_solid:
    ST [by], r1
    LD r0, [sd_x]
    SHR r0, 4
    ADD r0, r6
    OV CALL, sd_attr
    CMP r0, ST_SOLID
    OV JEQ, @yes
    LD r0, [sd_x]
    SHR r0, 4
    ADD r0, r7
    LD r1, [by]
    OV CALL, sd_attr
    CMP r0, ST_SOLID
    OV JEQ, @yes
    LDI r0, 0
    RET
@yes:
    LDI r0, 1
    RET

; the side view on screen: the camera follows him, one MAP per column (17 with the scroll), the wind, Sixten,
; and the HUD row with the compass showing the way he faces
sd_draw:
    LD r0, [sd_x]
    SHR r0, 4
    SUB r0, 64
    CMP r0, 0
    OV JGE, @c1
    LDI r0, 0
@c1:
    LD r1, [sd_cols]
    SHL r1, 3
    SUB r1, 128
    CMP r0, r1
    OV JLE, @c2
    MOV r0, r1
@c2:
    ST [sd_cam], r0
    LD r6, [sd_rec]
    LDB r0, [r6 + SR_SKY]
    SYS CLS
    LD r7, [sd_cam]
    SHR r7, 3
    LDI r6, 0
@col:
    MOV r0, r7
    ADD r0, r6
    LD r1, [sd_cols]
    CMP r0, r1
    OV JGE, @nextcol
    MUL r0, SIDE_ROWS
    ADD r0, sbuf
    LDI r1, tiles_side
    LDI r2, 1
    LDI r3, SIDE_ROWS
    MOV r4, r6
    SHL r4, 3
    LD r5, [sd_cam]
    AND r5, 7
    SUB r4, r5
    LDI r5, SIDE_Y
    SYS MAP
@nextcol:
    ADD r6, 1
    CMP r6, 17
    OV JLT, @col
    OV CALL, sd_wind_draw
    LD r1, [sd_x]                   ; Sixten
    SHR r1, 4
    LD r0, [sd_cam]
    SUB r1, r0
    SUB r1, 4
    LD r2, [sd_y]
    SHR r2, 4
    ADD r2, SIDE_Y
    LD r3, [sd_face]
    LD r0, [sd_crouch]
    CMP r0, 0
    OV JEQ, @stand
    SUB r2, 12
    LDI r0, spr_sc_head
    SYS SPR
    ADD r2, 8
    LDI r0, spr_sc_body
    SYS SPR
    OV JMP, @hud
@stand:
    SUB r2, 16
    LD r0, [sd_climb]
    CMP r0, 0
    OV JEQ, @walking
    LDI r3, 0
    LDI r0, spr_head_up
    SYS SPR
    ADD r2, 8
    LD r0, [sd_y]
    SHR r0, 6
    AND r0, 1
    SHL r0, 1
    LD r0, [r0 + climb_bodies]
    SYS SPR
    OV JMP, @hud
@walking:
    LDI r0, spr_head_rt
    SYS SPR
    ADD r2, 8
    LD r0, [sd_x]
    SHR r0, 7
    AND r0, 1
    SHL r0, 1
    LD r0, [r0 + walk_bodies]
    SYS SPR
@hud:
    LD r0, [sd_right]               ; the compass: the way he faces, and its letter
    LD r1, [sd_face]
    CMP r1, 0
    OV JEQ, @facing
    ADD r0, 8
    AND r0, 15
@facing:
    ST [sd_dir], r0
    PUSH r0
    CALL draw_hud_top
    POP r0
    SHR r0, 2
    SHL r0, 1
    LD r0, [r0 + dir_letters]
    LDI r1, 17
    LDI r2, 2
    LDI r3, font_w
    CALL draw_text
    RET

; the wind in the side view: 12 streaks and leaves cross the screen at half the wind's 1/16 px per frame, in px
sd_wind_draw:
    LD r4, [sd_wind]
    CMP r4, 0
    OV JEQ, @done
    SAR r4, 1
    LDI r6, 0
@p:
    MOV r3, r6
    SHL r3, 1
    LD r0, [r3 + part_x]
    LD r1, [r3 + part_y]
    ADD r0, r4
    CMP r0, 128
    OV JB, @keep
    LDI r0, 127                     ; back in on the upwind side
    CMP r4, 0
    OV JLT, @y
    LDI r0, 0
@y:
    LD r1, [tick]                   ; (kept positive: MOD is signed)
    AND r1, 0x3FFF
    MOV r2, r6
    MUL r2, 29
    ADD r1, r2
    MOD r1, 56
    ADD r1, SIDE_Y + 8
@keep:
    ST [r3 + part_x], r0
    ST [r3 + part_y], r1
    MOV r2, r6
    AND r2, 1
    OV JNZ, @leaf
    MOV r2, r0
    ADD r2, 4
    MOV r3, r1
    LDI r4, C_WHITE
    SYS LINE
    LD r4, [sd_wind]
    SAR r4, 1
    OV JMP, @next
@leaf:
    LDI r2, C_ORANGE
    SYS PSET
@next:
    ADD r6, 1
    CMP r6, 12
    OV JLT, @p
@done:
    RET
ovl_side_end:
