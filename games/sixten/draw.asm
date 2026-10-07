; Drawing helpers: the bubble font, text, circles.
.code

; r0 = destination, r1 = ink: the 1 bpp font (bit 7 = leftmost pixel) -> 4 bpp sprites, 4 bytes per row.
; A table of the four pixel pairs keeps it at ~14 000 cycles per font (both fonts and a level start fit in init).
unpack_font:
    MOV r6, r0
    LDI r0, 0
    STB [pairtab], r0
    STB [pairtab + 1], r1           ; right pixel only
    MOV r0, r1
    SHL r0, 4
    STB [pairtab + 2], r0           ; left pixel only
    OR r0, r1
    STB [pairtab + 3], r0
    LDI r4, font1
    LDI r5, font1 + FONT_GLYPHS * 8
@row:
    LDB r1, [r4]
    MOV r0, r1
    SHR r0, 6
    LDB r0, [r0 + pairtab]
    STB [r6], r0
    MOV r0, r1
    SHR r0, 4
    AND r0, 3
    LDB r0, [r0 + pairtab]
    STB [r6 + 1], r0
    MOV r0, r1
    SHR r0, 2
    AND r0, 3
    LDB r0, [r0 + pairtab]
    STB [r6 + 2], r0
    AND r1, 3
    LDB r0, [r1 + pairtab]
    STB [r6 + 3], r0
    ADD r6, 4
    ADD r4, 1
    CMP r4, r5
    JLT @row
    RET

; r0 = glyph-index string (255-terminated), r1 = x, r2 = y, r3 = font (font_w / font_d): one SPR per character,
; 6 px advance. Returns r0 = x after the text. Clobbers r5-r7.
draw_text:
    MOV r6, r0
    MOV r7, r1
    MOV r5, r3
@next:
    LDB r0, [r6]
    CMP r0, 255
    JEQ @done
    CMP r0, 0
    JEQ @advance
    SHL r0, 5
    ADD r0, r5
    MOV r1, r7
    LDI r3, 0
    SYS SPR
@advance:
    ADD r6, 1
    ADD r7, 6
    JMP @next
@done:
    MOV r0, r7
    RET

; r0, r1 = centre, r2 = radius, [circ_col] = colour: 16 points (keeps r0, r1, r5, r6)
circle:
    ST [circ_r], r2
    LDI r7, 0
@pt:
    PUSH r0
    PUSH r1
    MOV r3, r7
    SHL r3, 1
    LD r2, [r3 + cos_t]
    LD r4, [circ_r]
    MUL r2, r4
    SAR r2, 6
    ADD r0, r2
    LD r2, [r3 + sin_t]
    MUL r2, r4
    SAR r2, 6
    ADD r1, r2
    LD r2, [circ_col]
    SYS PSET
    POP r1
    POP r0
    ADD r7, 1
    CMP r7, 16
    JLT @pt
    RET
