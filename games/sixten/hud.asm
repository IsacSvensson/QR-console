; HUD (DESIGN.md §10.1): row 1 the compass (and the course arrow and the step counter once a course is set), the
; stamped controls, wood, the active power-up and the hearts; row 2 the buttons and what they do.
.code

draw_hud:
    LDI r0, 0
    LDI r1, 0
    LDI r2, 128
    LDI r3, 32
    LDI r4, C_NAVY
    SYS RECTFILL
    LDI r1, 15
    LDI r3, 1
    LDI r4, C_DGREY
    SYS RECTFILL
    LDI r0, 8                       ; compass
    LDI r1, 8
    LD r2, [course_set]
    CMP r2, 0
    JEQ @nocourse
    LD r2, [course_dir]
    CALL draw_compass
    LD r0, [steps]                  ; the step counter (cells)
    LDI r1, 17
    LDI r2, 6
    LDI r3, C_YELLOW
    SYS NUM
    JMP @controls
@nocourse:
    LDI r2, 0xFFFF
    CALL draw_compass
@controls:
    LDI r0, spr_flag
    LDI r1, 28
    LDI r2, 4
    LDI r3, 0
    SYS SPR
    LD r0, [n_stamped]              ; "n/N"
    ADD r0, G_0
    STB [strbuf], r0
    LDI r0, G_SLASH
    STB [strbuf + 1], r0
    LD r0, [lv_ptr]
    LDB r0, [r0 + LR_NCTRL]
    ADD r0, G_0
    STB [strbuf + 2], r0
    LDI r0, 255
    STB [strbuf + 3], r0
    LDI r0, strbuf
    LDI r1, 37
    LDI r2, 2
    LDI r3, font_w
    CALL draw_text
    LDI r0, spr_wood
    LDI r1, 58
    LDI r2, 4
    LDI r3, 0
    SYS SPR
    LD r0, [wood]
    ADD r0, G_0
    STB [strbuf], r0
    LDI r0, 255
    STB [strbuf + 1], r0
    LDI r0, strbuf
    LDI r1, 67
    LDI r2, 2
    LDI r3, font_w
    CALL draw_text
    LD r0, [pw]
    CMP r0, PW_CUCUMBER
    JNE @hearts
    LDI r0, spr_cucumber
    LDI r1, 76
    LDI r2, 4
    LDI r3, 0
    SYS SPR
@hearts:
    LD r6, [hearts]
    LDI r0, spr_heart
    LDI r1, 87
    LDI r2, 5
    LDI r3, 0
@heart:
    CMP r6, 0
    JEQ @hints
    SYS SPR
    ADD r1, 8
    SUB r6, 1
    JMP @heart
@hints:
    LDI r0, spr_dpad
    LDI r1, 1
    LDI r2, 19
    LDI r3, 0
    SYS SPR
    LDI r0, spr_btn_a
    LDI r1, 25
    SYS SPR
    LDI r0, spr_btn_b
    LDI r1, 85
    SYS SPR
    LDI r0, t_go
    LDI r1, 10
    LDI r2, 17
    LDI r3, font_w
    CALL draw_text
    LDI r0, t_look
    LDI r1, 34
    LDI r2, 17
    LDI r3, font_w
    CALL draw_text
    LDI r0, t_map
    LDI r1, 94
    LDI r2, 17
    LDI r3, font_w
    CALL draw_text
    RET

; r0 = centre x, r1 = centre y, r2 = arrow direction (16ths of a turn, 0 = east, 4 = north) or 0xFFFF for none:
; a dial, the red north needle and the yellow course arrow
draw_compass:
    ST [cx0], r0
    ST [cy0], r1
    ST [c_dir], r2
    LDI r6, 0
@dial:
    MOV r0, r6
    SHL r0, 1
    LD r1, [r0 + cos_t]
    LD r2, [r0 + sin_t]
    MUL r1, 6
    SAR r1, 6
    MUL r2, 6
    SAR r2, 6
    LD r0, [cx0]
    ADD r0, r1
    LD r1, [cy0]
    SUB r1, r2
    LDI r2, C_LGREY
    SYS PSET
    ADD r6, 1
    CMP r6, 16
    JLT @dial
    LD r0, [cx0]
    LD r1, [cy0]
    MOV r2, r0
    MOV r3, r1
    ADD r3, 4
    LDI r4, C_WHITE
    SYS LINE
    SUB r3, 8
    LDI r4, C_RED
    SYS LINE
    LD r5, [c_dir]
    CMP r5, 16
    JAE @done
    SHL r5, 1
    LD r2, [r5 + cos_t]
    MUL r2, 5
    SAR r2, 6
    ADD r2, r0
    LD r3, [r5 + sin_t]
    MUL r3, 5
    SAR r3, 6
    NEG r3
    ADD r3, r1
    LDI r4, C_YELLOW
    SYS LINE
@done:
    RET

.data
; 16 directions: cos and sin x 64 (0 = east, 4 = north, anticlockwise)
cos_t:      .word 64, 59, 45, 24, 0, -24, -45, -59, -64, -59, -45, -24, 0, 24, 45, 59
sin_t:      .word 0, 24, 45, 59, 64, 59, 45, 24, 0, -24, -45, -59, -64, -59, -45, -24
.code
