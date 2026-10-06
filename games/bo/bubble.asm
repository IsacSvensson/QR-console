; Bo's voice: speech bubbles in the game's own font with ÅÄÖ (DESIGN.md §12, §14.4), a big banner, and the combo
; name in the built-in font.
TEXT_INK = C_PURPLE

; font_unpack: the 1-bit font -> 4-bit sprites in RAM (once, in init)
font_unpack:
    LDI r4, 0                       ; source byte (glyph * 8 + row)
@row:
    LDB r1, [r4 + font1]
    MOV r2, r4
    SHL r2, 2
    ADD r2, font
    LDI r5, 6
@pair:
    MOV r0, r1
    SHR r0, r5
    AND r0, 3
    MOV r3, r0
    SHR r3, 1
    MUL r3, TEXT_INK * 16
    AND r0, 1
    MUL r0, TEXT_INK
    OR r0, r3
    STB [r2], r0
    ADD r2, 1
    SUB r5, 2
    JGE @pair
    ADD r4, 1
    CMP r4, FONT_GLYPHS * 8
    JLT @row
    RET

; say: r0 = text id -> shown above Bo for 1.5 s (replaces the current one)
say:
    ST [bub_id], r0
    LDI r0, BUB_T
    ST [bub_t], r0
    RET

; text_size: r0 = text address -> r1 = width in px of the longest row, r2 = rows
text_size:
    LDI r1, 0
    LDI r2, 1
    LDI r3, 0
@ch:
    LDB r4, [r0]
    ADD r0, 1
    CMP r4, 254
    JLT @glyph
    CMP r3, r1
    JLE @shorter
    MOV r1, r3
@shorter:
    LDI r3, 0
    CMP r4, 255
    JEQ @done
    ADD r2, 1
    JMP @ch
@glyph:
    ADD r3, 6
    JMP @ch
@done:
    RET

; draw_text: r0 = text address, r1 = x, r2 = y (top of the glyph cells); one SPR per character
draw_text:
    MOV r6, r0
    MOV r7, r1
    MOV r5, r1
@next:
    LDB r0, [r6]
    ADD r6, 1
    CMP r0, 255
    JEQ @done
    CMP r0, 254
    JNE @glyph
    MOV r7, r5
    ADD r2, 9
    JMP @next
@glyph:
    CMP r0, 0
    JEQ @space
    SHL r0, 5
    ADD r0, font
    MOV r1, r7
    LDI r3, 0
    SYS SPR
@space:
    ADD r7, 6
    JMP @next
@done:
    RET

; draw_bubble: the current line in a white bubble above Bo, kept on screen
draw_bubble:
    LD r0, [bub_t]
    CMP r0, 0
    JEQ @none
    SUB r0, 1
    ST [bub_t], r0
    LD r0, [bub_id]
    SHL r0, 1
    LD r0, [r0 + text_table]
    PUSH r0
    CALL text_size                  ; r1 = width, r2 = rows
    ST [t_dx], r1
    MUL r2, 9
    ST [t_s], r2
    LD r5, [bo_x]                   ; bubble centred over Bo
    SHR r5, 4
    LD r0, [cam_x]
    SUB r5, r0
    MOV r0, r1
    SHR r0, 1
    SUB r5, r0
    SUB r5, 3
    CMP r5, 1
    JGE @l
    LDI r5, 1
@l:
    MOV r0, r1
    ADD r0, r5
    ADD r0, 6
    CMP r0, 127
    JLE @r
    LDI r5, 121
    SUB r5, r1
@r:
    LD r6, [bo_y]                   ; above his head
    SAR r6, 4
    LD r0, [cam_y]
    SUB r6, r0
    SUB r6, 26
    SUB r6, r2
    CMP r6, HUD_H + 1
    JGE @t
    LDI r6, HUD_H + 1
@t:
    MOV r0, r5
    MOV r1, r6
    LD r2, [t_dx]
    ADD r2, 5
    LD r3, [t_s]
    ADD r3, 4
    LDI r4, C_WHITE
    SYS RECTFILL
    LDI r4, C_PURPLE
    SYS RECT
    POP r0
    MOV r1, r5
    ADD r1, 3
    MOV r2, r6
    SUB r2, 1                       ; glyph rows 0-1 are the diacritic space
    CALL draw_text
@none:
    RET

; draw_banner: a big centred banner (FÖRSÖK IGEN!, POMMES POWER!, level names)
draw_banner:
    LD r0, [banner_t]
    CMP r0, 0
    JEQ @none
    SUB r0, 1
    ST [banner_t], r0
    LD r0, [banner_id]
    SHL r0, 1
    LD r0, [r0 + text_table]
    PUSH r0
    CALL text_size
    MOV r5, r1
    LDI r0, 128
    SUB r0, r5
    SHR r0, 1
    SUB r0, 4
    MOV r5, r0
    MUL r2, 9
    MOV r3, r2
    ADD r3, 6
    LDI r1, 40
    MOV r2, r5
    NEG r2
    ADD r2, 128
    SUB r2, r5
    LDI r4, C_YELLOW
    SYS RECTFILL
    LDI r4, C_PURPLE
    SYS RECT
    POP r0
    MOV r1, r5
    ADD r1, 4
    LDI r2, 41
    CALL draw_text
@none:
    RET

; draw_combo: "OLLIE + KICKFLIP 100" over the place of the landing, 1 s
draw_combo:
    LD r0, [combo_show_t]
    CMP r0, 0
    JEQ @none
    SUB r0, 1
    ST [combo_show_t], r0
    LDI r0, combo_str               ; width = 4 px per character
    LDI r1, 0
@len:
    LDB r2, [r0]
    CMP r2, 0
    JEQ @w
    ADD r0, 1
    ADD r1, 4
    JMP @len
@w:
    LD r0, [combo_x]
    LD r2, [cam_x]
    SUB r0, r2
    SHR r1, 1
    SUB r0, r1
    CMP r0, 1
    JGE @l
    LDI r0, 1
@l:
    SHL r1, 1
    ADD r1, r0
    CMP r1, 127
    JLE @r
    SUB r1, 127
    SUB r0, r1
@r:
    MOV r1, r0
    LD r2, [combo_y]
    LD r0, [cam_y]
    SUB r2, r0
    SUB r2, 28
    CMP r2, HUD_H + 1
    JGE @t
    LDI r2, HUD_H + 1
@t:
    LDI r0, combo_str
    LDI r3, C_YELLOW
    SYS TEXT
@none:
    RET
