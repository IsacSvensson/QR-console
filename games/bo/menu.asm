; The test-level menu (M19-M21: the game starts here; from M22 it is reached from the title).
on_menu:
    LD r0, [btnp]
    MOV r1, r0
    AND r1, BTN_RIGHT
    JZ @noright
    LD r2, [menu_sel]
    ADD r2, 1
    CMP r2, NUM_LEVELS
    JLT @r
    LDI r2, 0
@r:
    ST [menu_sel], r2
@noright:
    MOV r1, r0
    AND r1, BTN_LEFT
    JZ @noleft
    LD r2, [menu_sel]
    SUB r2, 1
    JGE @l
    LDI r2, NUM_LEVELS - 1
@l:
    ST [menu_sel], r2
@noleft:
    AND r0, BTN_A
    JZ @draw
    LD r0, [menu_sel]
    CALL level_start
    RET
@draw:
    LDI r0, C_NAVY
    SYS CLS
    LDI r0, s_menu
    LDI r1, 20
    LDI r2, 40
    LDI r3, C_WHITE
    SYS TEXT
    LD r0, [menu_sel]
    ADD r0, 1
    LDI r1, 76
    LDI r2, 52
    LDI r3, C_YELLOW
    SYS NUM
    RET

.data
s_menu: .string "BO'S SKATEAVENTYR\n\n   TESTBANA  <    >\n\n\n  A = START"
.code

