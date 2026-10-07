; SIXTENS EXPEDITION — an orienteering adventure (PLAN.md Part 4, games/sixten/DESIGN.md).
; M26: the top-down engine — the level's cell map, screens expanded from cells, the screen slide, Sixten walking
; with collision by cell type, the HUD with the compass, the map screen drawn from the same cells.
.title "SIXTENS EXPEDITION"

.include "art.gen.asm"                ; first: defs.asm sizes RAM from its constants
.include "defs.asm"
.include "levels.gen.asm"
.code                               ; levels.gen.asm ends in .xdata

init:
    LDI r0, font_w
    LDI r1, C_WHITE
    CALL unpack_font
    LDI r0, font_d
    LDI r1, C_NAVY
    CALL unpack_font
    LDI r0, LEVEL_1_1
    ST [card_sel], r0
    LDI r0, M_CARD
    ST [mode], r0
    RET

update:
    LD r0, [tick]
    ADD r0, 1
    ST [tick], r0
    CALL debug_hooks
    LD r0, [mode]
    SHL r0, 1
    LD r0, [r0 + mode_table]
    CALL r0
    RET

; test hooks: start a level, put Sixten on a cell, change a cell, give a power-up
debug_hooks:
    LD r0, [dbg_level]
    CMP r0, 0
    JEQ @goto
    SUB r0, 1
    CALL level_start
    LDI r0, 0
    ST [dbg_level], r0
@goto:
    LD r0, [dbg_goto]
    CMP r0, 0
    JEQ @cell
    SUB r0, 1
    CALL place_on_cell
    LDI r0, 0
    ST [dbg_goto], r0
@cell:
    LD r0, [dbg_cell]
    CMP r0, 0
    JEQ @pw
    SUB r0, 1
    LD r1, [dbg_cell_v]
    STB [r0 + cells], r1
    LDI r0, 0
    ST [dbg_cell], r0
    CALL view_reset                 ; the next expansion shows the new cell
@pw:
    LD r0, [dbg_pw]
    CMP r0, 0
    JEQ @done
    SUB r0, 1
    ST [pw], r0
    LDI r0, 0
    ST [dbg_pw], r0
@done:
    RET

.include "level.asm"
.include "player.asm"
.include "hud.asm"
.include "mapscr.asm"
.include "draw.asm"
.include "card.asm"
.include "whirl.asm"

.data
mode_table: .word play_frame, slide_frame, map_frame, card_frame
