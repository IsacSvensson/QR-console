; BO'S SKATEÄVENTYR — a side-scrolling skateboard platformer (games/bo/DESIGN.md, PLAN.md Part 3).
; Main file: the generated data, the engine and the frame loop.
.title "BO'S SKATEAVENTYR"

.include "tiles.gen.asm"
.include "levels.gen.asm"
.include "defs.asm"
.include "level.asm"
.include "player.asm"
.include "draw.asm"
.include "menu.asm"
.include "gfx.asm"

init:
    LDI r4, ts_common               ; the common tiles (apples, stars, signs ...) never change
    LDI r5, T_APPLE
    LDI r7, NUM_COMMON
    CALL unpack_tiles
    LDI r0, 5
    ST [lives], r0
    LDI r0, M_MENU
    ST [mode], r0
    RET

update:
    LD r0, [tick]
    ADD r0, 1
    ST [tick], r0
    SYS BTN
    ST [btn], r0
    SYS BTNP
    ST [btnp], r0
    LD r0, [dbg_level]              ; test hook: start a level directly
    CMP r0, 0
    JEQ @mode
    SUB r0, 1
    CALL level_start
    LDI r0, 0
    ST [dbg_level], r0
@mode:
    LD r0, [mode]
    SHL r0, 1
    LD r0, [r0 + mode_handlers]
    CALL r0
    RET

on_load:
    CALL load_step
    LDI r0, C_BLACK
    SYS CLS
    RET

on_play:
    CALL bo_update
    CALL camera_update
    CALL draw_play
    RET

.data
mode_handlers: .word on_menu, on_load, on_play
.code
