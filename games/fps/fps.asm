; FPS SPIKE - can QR Console run a first-person shooter? (games/fps/SPIKE.md, PLAN.md Part 4, M26)
; A grid raycaster with textured walls, a sliding door and one enemy, drawn into a RAM buffer and put on
; screen with one MAP call. Original code and art; nothing from Doom or its ports.
.title "FPS SPIKE"

.include "defs.asm"
.include "config.asm"
.include "render.asm"
.include "player.asm"
.include "actors.asm"

.sfx S_SHOT, 2, 900, 8, 12, -60
.sfx S_HIT, 0, 330, 6, 10, -30
.sfx S_DIE, 2, 260, 30, 12, -4
.sfx S_DOOR, 1, 110, 24, 8, 2
.sfx S_HURT, 0, 160, 10, 12, -8

init:
    LDI r0, map                     ; the level, in RAM so that the game could change it
    LDI r1, 0
    LDI r2, level_map
    LDI r3, 256
    SYS COPY
    LDI r0, runs_ram
    LDI r1, runs_x >> 16
    LDI r2, runs_x & 0xFFFF
    SYS UNPACK
    LDI r0, spr_ram
    LDI r1, spr_x >> 16
    LDI r2, spr_x & 0xFFFF
    SYS UNPACK
    LDI r0, START_X
    ST [px], r0
    LDI r0, START_Y
    ST [py], r0
    LDI r0, START_HP
    ST [health], r0
    LDI r0, START_AMMO
    ST [ammo], r0
    CALL doors_init
    CALL enemy_init
    RET

update:
    SYS BTN
    ST [btn], r0
    SYS BTNP
    ST [btnp], r0
    LD r0, [tick]                   ; images per second, latched once a second
    ADD r0, 1
    CMP r0, 60
    JLT @t
    LD r1, [images_sec]
    ST [fps], r1
    LDI r1, 0
    ST [images_sec], r1
    LDI r0, 0
@t:
    ST [tick], r0
    CALL player_tick
    CALL doors_tick
    CALL enemy_tick
    CALL render_step
    RET

hud_draw:
    LD r0, [hurt]                   ; red frame while hurt
    CMP r0, 0
    JEQ @bar
    LDI r0, 0
    LDI r1, 0
    LDI r2, 128
    LDI r3, VIEW_H
    LDI r4, C_HURT
    SYS RECT
    LDI r0, 1
    LDI r1, 1
    LDI r2, 126
    LDI r3, VIEW_H - 2
    SYS RECT
@bar:
    LDI r0, 0
    LDI r1, VIEW_H
    LDI r2, 128
    LDI r3, 128 - VIEW_H
    LDI r4, C_HUD
    SYS RECTFILL
    LDI r0, 0
    LDI r1, VIEW_H
    LDI r2, 128
    LDI r3, 1
    LDI r4, C_HUD_LINE
    SYS RECTFILL
    LDI r0, s_labels
    LDI r1, 4
    LDI r2, VIEW_H + 4
    LDI r3, C_LABEL
    SYS TEXT
    LD r0, [health]
    LDI r1, 4
    LDI r2, VIEW_H + 11
    LDI r3, C_VALUE
    SYS NUM
    LD r0, [ammo]
    LDI r1, 52
    SYS NUM
    LD r0, [fps]
    LDI r1, 100
    SYS NUM
    LDI r0, s_help
    LDI r1, 4
    LDI r2, VIEW_H + 22
    LDI r3, C_HELP
    SYS TEXT
    RET

.data
s_labels: .string "HEALTH      AMMO        FPS"
s_help:   .string "A FIRE  B OPEN  B+<> STRAFE"

.include "tables.gen.asm"

.var buf, 16 * VIEW_H / 8 * 32  ; the view, 16x12 tiles in column order (SPIKE.md §3.2)
.var runs_ram, RUNS_BYTES
.var spr_ram, SPR_BYTES
