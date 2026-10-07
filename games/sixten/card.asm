; The level card (DESIGN.md §10.1): the level's name; ←/→ choose a level, A starts it. Until the title and the world
; map exist (M29) it is also how a replay chooses its level.
.code

card_frame:
    SYS BTNP
    MOV r7, r0
    AND r0, BTN_A
    JZ @choose
    LD r0, [card_sel]
    CALL level_start
    CALL draw_world
    RET
@choose:
    LD r0, [card_sel]
    MOV r1, r7
    AND r1, BTN_RIGHT
    JZ @left
    ADD r0, 1
    CMP r0, LEVEL_COUNT
    JLT @store
    LDI r0, 0
    JMP @store
@left:
    MOV r1, r7
    AND r1, BTN_LEFT
    JZ @draw
    SUB r0, 1
    JGE @store
    LDI r0, LEVEL_COUNT - 1
@store:
    ST [card_sel], r0
@draw:
    LDI r0, C_DGREEN
    SYS CLS
    LDI r0, 8
    LDI r1, 48
    LDI r2, 112
    LDI r3, 28
    LDI r4, C_WHITE
    SYS RECTFILL
    LDI r4, C_BLACK
    SYS RECT
    LD r0, [card_sel]
    MUL r0, LV_REC
    ADD r0, level_table + LR_NAME
    LD r0, [r0]
    LDI r1, 16
    LDI r2, 56
    LDI r3, font_d
    CALL draw_text
    LDI r0, spr_btn_a
    LDI r1, 60
    LDI r2, 92
    LDI r3, 0
    SYS SPR
    RET
