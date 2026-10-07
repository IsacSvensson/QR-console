; The save code (DESIGN.md §10.2): 50 bits = the world (3, highest bit first) + the nature book (40: entry 1 first) +
; a checksum (7: the sum of (i + 1) over the set bits i = 0..42, mod 128), as 10 characters of 32: character j is
; bits 5j..5j+4 (highest first) XOR (7j + 3) mod 32, in the alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789.
; The world map shows the code of the current state; the title's B opens the code screen (M32), which reads one back.
.code

code_make:
    LDI r0, code_bits
    LDI r1, 0
    LDI r2, 8
    SYS FILL
    LDI r6, 0                       ; the world: bits 0-2
@w:
    LD r1, [world]
    LDI r2, 2
    SUB r2, r6
    SHR r1, r2
    AND r1, 1
    MOV r0, r6
    CALL put_bit
    ADD r6, 1
    CMP r6, 3
    JLT @w
    LDI r6, 0                       ; the book: bits 3-42
@b:
    MOV r0, r6
    CALL book_has
    MOV r1, r0
    MOV r0, r6
    ADD r0, 3
    CALL put_bit
    ADD r6, 1
    CMP r6, NB_COUNT
    JLT @b
    LDI r6, 0                       ; the checksum
    LDI r7, 0
@s:
    MOV r0, r6
    CALL get_bit
    CMP r0, 0
    JEQ @ns
    ADD r7, r6
    ADD r7, 1
@ns:
    ADD r6, 1
    CMP r6, 43
    JLT @s
    AND r7, 127
    LDI r6, 0                       ; bits 43-49
@c:
    MOV r1, r7
    LDI r2, 6
    SUB r2, r6
    SHR r1, r2
    AND r1, 1
    MOV r0, r6
    ADD r0, 43
    CALL put_bit
    ADD r6, 1
    CMP r6, 7
    JLT @c
    LDI r6, 0                       ; the characters
@ch:
    LDI r5, 0
    LDI r7, 0
@bit:
    MOV r0, r6
    MUL r0, 5
    ADD r0, r7
    CALL get_bit
    SHL r5, 1
    OR r5, r0
    ADD r7, 1
    CMP r7, 5
    JLT @bit
    MOV r0, r6
    MUL r0, 7
    ADD r0, 3
    AND r0, 31
    XOR r5, r0
    LDB r0, [r5 + code_alpha]
    STB [r6 + code_str], r0
    ADD r6, 1
    CMP r6, 10
    JLT @ch
    LDI r0, 255
    STB [code_str + 10], r0
    RET

; r0 = bit index, r1 = 0/1: set it (the bits start cleared)
put_bit:
    CMP r1, 0
    JEQ @done
    MOV r2, r0
    SHR r2, 3
    AND r0, 7
    LDI r3, 128
    SHR r3, r0
    LDB r0, [r2 + code_bits]
    OR r0, r3
    STB [r2 + code_bits], r0
@done:
    RET

; r0 = bit index -> r0 = the bit
get_bit:
    MOV r2, r0
    SHR r2, 3
    AND r0, 7
    LDI r3, 7
    SUB r3, r0
    LDB r0, [r2 + code_bits]
    SHR r0, r3
    AND r0, 1
    RET

; ---- entering a code (M32) ---------------------------------------------------------------------
; the title's B: ten A's, the cursor on the first
code_enter:
    LDI r0, code_in
    LDI r1, 0
    LDI r2, 10
    SYS FILL
    LDI r0, 0
    ST [code_pos], r0
    ST [code_err], r0
    LDI r0, M_CODE
    ST [mode], r0
    RET

; up/down: the character, left/right: the place, A: try the code, B: back to the title
code_frame:
    SYS BTNP
    MOV r7, r0
    LD r6, [code_pos]
    LDB r5, [r6 + code_in]
    MOV r0, r7
    AND r0, BTN_UP
    JZ @dn
    ADD r5, 1
@dn:
    MOV r0, r7
    AND r0, BTN_DOWN
    JZ @set
    ADD r5, 31
@set:
    AND r5, 31
    STB [r6 + code_in], r5
    MOV r0, r7
    AND r0, BTN_LEFT
    JZ @rt
    CMP r6, 0
    JEQ @rt
    SUB r6, 1
@rt:
    MOV r0, r7
    AND r0, BTN_RIGHT
    JZ @pos
    CMP r6, 9
    JGE @pos
    ADD r6, 1
@pos:
    ST [code_pos], r6
    MOV r0, r7
    AND r0, BTN_B
    JZ @a
    LDI r0, M_TITLE
    ST [mode], r0
    RET
@a:
    LD r0, [code_err]
    CMP r0, 0
    JEQ @try
    SUB r0, 1
    ST [code_err], r0
@try:
    MOV r0, r7
    AND r0, BTN_A
    JZ @draw
    CALL code_read
    CMP r0, 0
    JEQ @wrong
    CALL wmap_enter
    RET
@wrong:
    LDI r0, CODE_ERR_FRAMES
    ST [code_err], r0
    LDI r0, SFX_AJ
    SYS SFX
@draw:
    LDI r0, C_NAVY
    SYS CLS
    LDI r0, t_code_in
    LDI r1, 25
    LDI r2, 24
    LDI r3, font_w
    CALL draw_text
    LDI r6, 0                       ; the ten characters, a gap after five
@ch:
    LDB r0, [r6 + code_in]
    LDB r0, [r0 + code_alpha]
    STB [code_show], r0
    LDI r0, 255
    STB [code_show + 1], r0
    CALL code_x
    MOV r1, r0
    LDI r0, code_show
    LDI r2, 60
    LDI r3, font_w
    PUSH r6
    CALL draw_text
    POP r6
    ADD r6, 1
    CMP r6, 10
    JLT @ch
    LD r6, [code_pos]               ; the cursor: a yellow line under it, arrows over and under
    CALL code_x
    MOV r6, r0
    LDI r7, 0
@tri:
    LDB r1, [r7 + cur_y]            ; two triangles of 5, 3, 1 px, one row each
    MOV r0, r6
    ADD r0, r7
    LDI r2, 5
    SUB r2, r7
    SUB r2, r7
    LDI r3, 1
    LDI r4, C_YELLOW
    SYS RECTFILL
    LDB r1, [r7 + cur_y + 3]
    SYS RECTFILL
    ADD r7, 1
    CMP r7, 3
    JLT @tri
    MOV r0, r6
    LDI r1, 68
    LDI r2, 5
    SYS RECTFILL
    LD r0, [code_err]
    CMP r0, 0
    JEQ @help
    LDI r0, t_wrong
    LDI r1, 4
    LDI r2, 88
    LDI r3, font_w
    CALL draw_text
@help:
    LDI r0, t_code_a
    LDI r1, 4
    LDI r2, 104
    LDI r3, font_w
    CALL draw_text
    LDI r0, t_code_b
    LDI r1, 4
    LDI r2, 114
    LDI r3, font_w
    CALL draw_text
    RET

.data
cur_y:  .byte 54, 53, 52, 71, 72, 73    ; the cursor's arrows: the rows of the 5-, 3- and 1-px lines
.code

; r6 = place 0-9 -> r0 = its x
code_x:
    MOV r0, r6
    MUL r0, 6
    ADD r0, 31
    CMP r6, 5
    JLT @done
    ADD r0, 6
@done:
    RET

; the entered code -> r0 = 1 and the state (world, book, the worlds before it done) or r0 = 0 for a wrong code
code_read:
    LDI r0, code_bits
    LDI r1, 0
    LDI r2, 8
    SYS FILL
    LDI r6, 0                       ; the characters back to bits
@ch:
    LDB r5, [r6 + code_in]
    MOV r0, r6
    MUL r0, 7
    ADD r0, 3
    AND r0, 31
    XOR r5, r0
    LDI r7, 0
@bit:
    MOV r1, r5
    LDI r2, 4
    SUB r2, r7
    SHR r1, r2
    AND r1, 1
    MOV r0, r6
    MUL r0, 5
    ADD r0, r7
    CALL put_bit
    ADD r7, 1
    CMP r7, 5
    JLT @bit
    ADD r6, 1
    CMP r6, 10
    JLT @ch
    LDI r6, 0                       ; the checksum of bits 0-42
    LDI r7, 0
@s:
    MOV r0, r6
    CALL get_bit
    CMP r0, 0
    JEQ @ns
    ADD r7, r6
    ADD r7, 1
@ns:
    ADD r6, 1
    CMP r6, 43
    JLT @s
    AND r7, 127
    LDI r5, 0                       ; the stored one, bits 43-49
    LDI r6, 43
@c:
    MOV r0, r6
    CALL get_bit
    SHL r5, 1
    OR r5, r0
    ADD r6, 1
    CMP r6, 50
    JLT @c
    CMP r5, r7
    JNE @wrong
    LDI r5, 0                       ; the world, 1-6
    LDI r6, 0
@w:
    MOV r0, r6
    CALL get_bit
    SHL r5, 1
    OR r5, r0
    ADD r6, 1
    CMP r6, 3
    JLT @w
    CMP r5, 0
    JEQ @wrong
    CMP r5, WORLDS + 1
    JGT @wrong
    ST [world], r5
    LDI r0, book                    ; the book: code bit 3 + n is entry n
    LDI r1, 0
    LDI r2, 5
    SYS FILL
    LDI r6, 0
@b:
    MOV r0, r6
    ADD r0, 3
    CALL get_bit
    CMP r0, 0
    JEQ @nb
    MOV r1, r6
    SHR r1, 3
    MOV r2, r6
    AND r2, 7
    LDI r3, 1
    SHL r3, r2
    LDB r0, [r1 + book]
    OR r0, r3
    STB [r1 + book], r0
@nb:
    ADD r6, 1
    CMP r6, NB_COUNT
    JLT @b
    LDI r0, lv_done                 ; every level of the worlds before it done, none of its own
    LDI r1, 0
    LDI r2, 4
    SYS FILL
    LD r0, [world]
    SUB r0, 1
    SHL r0, 2
    MOV r5, r0
    LDI r6, 0
@lv:
    CMP r6, r5
    JGE @ok
    LDB r0, [r6 + world_levels]
    MOV r1, r0
    SHR r1, 3
    AND r0, 7
    LDI r2, 1
    SHL r2, r0
    LDB r0, [r1 + lv_done]
    OR r0, r2
    STB [r1 + lv_done], r0
    ADD r6, 1
    JMP @lv
@ok:
    LDI r0, 1
    RET
@wrong:
    LDI r0, 0
    RET
