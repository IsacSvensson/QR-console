; Tricks and combos (DESIGN.md §4). B in the air starts a trick; it scores when it is complete. All tricks of one
; airtime (and a grind just before) are summed and multiplied by their number on a clean landing; landing mid-trick
; is a sloppy landing: OJ!, half speed, no points.

; trick_air: every frame in the air
trick_air:
    LD r0, [trick]
    CMP r0, TR_NONE
    JNE @active
    LD r0, [btnp]
    AND r0, BTN_B
    JZ @done
    LD r1, [btn]
    LDI r0, TR_GODIS                ; with godis: B alone is the GODISSNURR (once per airtime, §5)
    MOV r2, r1
    AND r2, BTN_UP | BTN_DOWN | BTN_LEFT | BTN_RIGHT
    JNZ @dirs
    LD r2, [pw_kind]
    CMP r2, PW_GODIS
    JNE @dirs
    LD r2, [godis_used]
    CMP r2, 0
    JEQ @start
@dirs:
    LDI r0, TR_SHOVEIT
    MOV r2, r1
    AND r2, BTN_UP
    JNZ @start
    LDI r0, TR_GRAB
    MOV r2, r1
    AND r2, BTN_DOWN
    JNZ @start
    LDI r0, TR_360
    MOV r2, r1
    AND r2, BTN_LEFT | BTN_RIGHT
    JNZ @start
    LDI r0, TR_KICKFLIP
@start:
    ST [trick], r0
    LDB r1, [r0 + trick_frames]
    CMP r0, TR_GRAB
    JNE @t
    LDI r1, 0                       ; a grab counts up while it is held
@t:
    ST [trick_t], r1
    CMP r0, TR_GODIS
    JNE @sound
    CALL godis_jump
@sound:
    LDI r0, SFX_TRICK
    SYS SFX
@done:
    RET
@active:
    CMP r0, TR_GRAB
    JEQ @grab
    LD r1, [trick_t]
    SUB r1, 1
    ST [trick_t], r1
    JNZ @done
    MOV r1, r0
    SHL r1, 1
    LD r1, [r1 + trick_points]
    JMP trick_complete
@grab:
    LD r1, [trick_t]
    ADD r1, 1
    ST [trick_t], r1
    CMP r1, 12
    JLT @done
    LD r2, [btn]
    AND r2, BTN_DOWN | BTN_B
    CMP r2, BTN_DOWN | BTN_B
    JEQ @done                       ; still holding the grab
grab_points:                        ; r1 = frames held -> 50 + 10 per 8 frames beyond the first 12
    SUB r1, 12
    SHR r1, 3
    MUL r1, 10
    LD r2, [trick_points + TR_GRAB * 2]
    ADD r1, r2
    LDI r0, TR_GRAB
; trick_complete: r0 = trick, r1 = points
trick_complete:
    PUSH r1
    LDI r1, TR_NONE
    ST [trick], r1
    POP r1
; combo_add: r0 = trick, r1 = points
combo_add:
    LD r2, [combo_pts]
    ADD r2, r1
    ST [combo_pts], r2
    LD r2, [combo_n]
    CMP r2, MAX_COMBO
    JGE @full
    STB [r2 + combo_list], r0
@full:
    ADD r2, 1
    ST [combo_n], r2
    RET

combo_reset:
    LDI r0, 0
    ST [combo_pts], r0
    ST [combo_n], r0
    ST [bo_ollied], r0
    ST [godis_used], r0
    RET

; trick_land_rail: landing on a rail; a trick still in progress is a sloppy landing (the grind goes on)
trick_land_rail:
    LD r0, [trick]
    CMP r0, TR_NONE
    JEQ @ok
    JMP sloppy
@ok:
    RET

; trick_land: landing on the ground: sloppy or clean (cash in the combo)
trick_land:
    LDI r0, 0
    ST [godis_used], r0
    LD r0, [trick]
    CMP r0, TR_NONE
    JEQ clean
    CMP r0, TR_GRAB
    JNE sloppy
    LD r1, [trick_t]
    CMP r1, 12
    JLT sloppy
    CALL grab_points                ; a grab held through the landing counts
    JMP clean
sloppy:
    LDI r0, TR_NONE
    ST [trick], r0
    LD r0, [bo_vx]                  ; OJ!: half speed, the combo is lost, no damage (§3.5)
    DIV r0, 2
    ST [bo_vx], r0
    CALL combo_reset
    LDI r0, BUMP_T
    ST [bo_bump], r0
    LDI r0, TX_OJ
    CALL say
    LDI r0, SFX_BUMP
    SYS SFX
    RET
clean:
    LD r7, [combo_n]
    CMP r7, 0
    JEQ combo_reset
    LD r6, [combo_pts]
    CMP r7, MAX_COMBO
    JLE @mul
    LDI r7, MAX_COMBO
@mul:
    MUL r6, r7                      ; the total
    MOV r0, r6
    CALL score_add
    ; TRICK_BOOST per trick, up to the speed cap
    CALL speed_split
    LD r0, [PH_TRICK_BOOST]
    MUL r0, r7
    LD r1, [t_sg]
    MUL r0, r1
    LD r1, [bo_vx]
    ADD r0, r1
    CALL cap_speed
    ST [bo_vx], r0
    CALL combo_text                 ; "OLLIE + KICKFLIP 100" above Bo for 1 s
    LDI r0, COMBO_T
    ST [combo_show_t], r0
    CALL feet
    ST [combo_x], r1
    ST [combo_y], r2
    CMP r7, 3                       ; a big combo: SÅG DU?!
    JGE @big
    CMP r6, 500
    JLT @small
@big:
    LDI r0, TX_SAG_DU
    CALL say
@small:
    LDI r0, SFX_COMBO
    SYS SFX
    JMP combo_reset

; score_add: r0 = points
score_add:
    LD r1, [score_lo]
    ADD r1, r0
@norm:
    CMP r1, 10000
    JB @done
    SUB r1, 10000
    LD r2, [score_hi]
    ADD r2, 1
    ST [score_hi], r2
    JMP @norm
@done:
    ST [score_lo], r1
    RET

; combo_text: builds "OLLIE + NAME + NAME TOTAL" in combo_str (r6 = total, r7 = count; kept)
combo_text:
    LDI r4, combo_str
    LD r0, [bo_ollied]
    CMP r0, 0
    JEQ @list
    LDI r0, TR_OLLIE
    CALL @name
@list:
    LDI r5, 0
@next:
    CMP r5, r7
    JGE @total
    CMP r4, combo_str
    JEQ @first
    LDI r0, ' '
    STB [r4], r0
    LDI r0, '+'
    STB [r4 + 1], r0
    LDI r0, ' '
    STB [r4 + 2], r0
    ADD r4, 3
@first:
    LDB r0, [r5 + combo_list]
    CALL @name
    ADD r5, 1
    JMP @next
@total:
    LDI r0, ' '
    STB [r4], r0
    ADD r4, 1
    MOV r0, r6
    CALL put_num
    LDI r0, 0
    STB [r4], r0
    RET
@name:                              ; append the name of trick r0 at r4
    SHL r0, 1
    LD r1, [r0 + trick_names]
@ch:
    LDB r0, [r1]
    CMP r0, 0
    JEQ @end
    STB [r4], r0
    ADD r1, 1
    ADD r4, 1
    JMP @ch
@end:
    RET

; put_num: write r0 (unsigned) as decimal ASCII at r4, advancing r4
put_num:
    LDI r2, 0                       ; digits pushed
@div:
    MOV r1, r0
    MOD r1, 10
    JGE @pos
    ADD r1, 10
@pos:
    ADD r1, '0'
    PUSH r1
    ADD r2, 1
    DIV r0, 10
    JNZ @div
@out:
    POP r1
    STB [r4], r1
    ADD r4, 1
    SUB r2, 1
    JNZ @out
    RET

.data
; per trick: frames in the air it takes, points (DESIGN.md §4); GRAB counts up (min 12), GRIND 10 per 8 frames
trick_frames: .byte 0, 18, 14, 12, 40, 24, 0, 40
trick_points: .word 0, 100, 75, 50, 300, 200, 10, 3000
trick_names:  .word 0, s_kickflip, s_shoveit, s_grab, s_360, s_godis, s_grind, s_super, s_ollie
s_kickflip: .string "KICKFLIP"
s_shoveit:  .string "SHOVE-IT"
s_grab:     .string "GRAB"
s_360:      .string "360"
s_godis:    .string "GODISSNURR"
s_grind:    .string "GRIND"
s_super:    .string "SUPERBOSSE"
s_ollie:    .string "OLLIE"
.code
