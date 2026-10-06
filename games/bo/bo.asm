; BO'S SKATEÄVENTYR — a side-scrolling skateboard platformer (games/bo/DESIGN.md, PLAN.md Part 3).
; Main file: the generated data, the engine and the frame loop.
.title "BO'S SKATEAVENTYR"

.include "tiles.gen.asm"
.include "levels.gen.asm"
.include "text.gen.asm"
.include "defs.asm"
.include "level.asm"
.include "player.asm"
.include "tricks.asm"
.include "items.asm"
.include "bubble.asm"
.include "sound.asm"
.include "draw.asm"
.include "menu.asm"
.include "gfx.asm"

init:
    LDI r4, ts_common               ; the common tiles (apples, stars, signs ...) never change
    LDI r5, T_APPLE
    LDI r7, NUM_COMMON
    CALL unpack_tiles
    CALL font_unpack
    LDI r0, 255
    ST [bub_id], r0
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
    CALL timers
    CALL bo_update
    CALL camera_update
    CALL draw_play
    RET

; timers that count down by themselves
timers:
    LDI r1, wiii_t
    CALL @down
    LDI r1, apple_chain_t
    CALL @down
    LDI r1, inv_t
    CALL @down
    LD r0, [pw_t]                   ; the power-up runs out
    CMP r0, 0
    JEQ @nopw
    SUB r0, 1
    ST [pw_t], r0
    JNZ @nopw
    ST [pw_kind], r0
@nopw:
    RET
@down:
    LD r0, [r1]
    CMP r0, 0
    JEQ @z
    SUB r0, 1
    ST [r1], r0
@z:
    RET

.data
mode_handlers: .word on_menu, on_load, on_play
.code
