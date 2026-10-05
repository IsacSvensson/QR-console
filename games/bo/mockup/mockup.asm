; BO'S SKATEÄVENTYR — planning mockup (a spike, not the game). See ../DESIGN.md §14.
; One static screen from level 1-1 (the driveway), drawn the way the real engine is planned to draw:
;   - the level lives in RAM, column-major (16 rows per column), and is drawn with one MAP call per
;     visible column (17 calls), so any horizontal scroll offset works;
;   - the bubble font is stored 1 bit per pixel (8 bytes per glyph, incl. Å Ä Ö) and unpacked once
;     into RAM sprites, one SPR per character;
;   - the skateboard is drawn with RECTFILL (deck colour from a table = cheap unlockable boards).
; Build and look:  npm run qrc -- build games/bo/mockup
;                  npm run qrc -- run games/bo/mockup/mockup.qrc --frames 2 --dump-frame m.png --scale 4
.title "BO MOCKUP"

.include "font.gen.asm"

; ---- colours (DawnBringer 16) ----------------------------------------------------------------
C_PURPLE = 1
C_NAVY   = 2
C_DGREY  = 3
C_ORANGE = 9
C_CYAN   = 13
C_YELLOW = 14
C_WHITE  = 15

; ---- layout ----------------------------------------------------------------------------------
LV_COLS  = 18               ; columns in the mock level (the real ones are up to ~384)
LV_ROWS  = 16               ; rows per column in RAM (row 0 = behind the HUD)
CAM_X    = 5                ; camera x in pixels: shows that sub-tile scrolling works
VIEW_COLS = 17              ; 16 columns + 1 for the partial one
BG_Y     = 72               ; distant trees (parallax strip)
BO_X     = 56               ; Bo, world pixels (sprite top-left; 8 x 16 incl. the board)
BO_Y     = 80
TEXT_INK = C_PURPLE
LINE_FRAMES = 120           ; each bubble line shows for 2 s

; ---- RAM -------------------------------------------------------------------------------------
.var level, LV_COLS * LV_ROWS       ; column-major: level[col * 16 + row]
.var font, FONT_GLYPHS * 32         ; unpacked bubble font: 4bpp sprites
.var tick
.var board                          ; selected board (0 = Bo's own)

; ---- init: transpose the ROM map into RAM, unpack the font -------------------------------------
init:
    LDI r4, 0                       ; col
@col:
    LDI r5, 0                       ; row
@row:
    MOV r1, r5
    MUL r1, LV_COLS
    ADD r1, r4
    LDB r0, [r1 + map_rows]         ; rom[row * 18 + col]
    MOV r2, r4
    SHL r2, 4
    ADD r2, r5
    STB [r2 + level], r0            ; ram[col * 16 + row]
    ADD r5, 1
    CMP r5, LV_ROWS
    JLT @row
    ADD r4, 1
    CMP r4, LV_COLS
    JLT @col
    ; font: each 1bpp row byte (bit 7 = leftmost pixel) -> 4 bytes of 4bpp in TEXT_INK
    LDI r4, 0                       ; source byte index (glyph * 8 + row)
@frow:
    LDB r1, [r4 + font1]
    MOV r2, r4
    SHL r2, 2                       ; destination = font + index * 4
    ADD r2, font
    LDI r5, 6                       ; shift for the current pixel pair: 6, 4, 2, 0
@pair:
    MOV r0, r1
    SHR r0, r5
    AND r0, 3                       ; two pixels: bit 1 = left, bit 0 = right
    MOV r3, r0
    SHR r3, 1
    MUL r3, TEXT_INK * 16           ; left pixel -> high nibble
    AND r0, 1
    MUL r0, TEXT_INK                ; right pixel -> low nibble
    OR r0, r3
    STB [r2], r0
    ADD r2, 1
    SUB r5, 2
    JGE @pair
    ADD r4, 1
    CMP r4, FONT_GLYPHS * 8
    JLT @frow
    RET

; ---- update: draw the screen -----------------------------------------------------------------
update:
    LD r0, [tick]
    ADD r0, 1
    ST [tick], r0
    LDI r0, C_CYAN
    SYS CLS
    CALL draw_sky
    ; distant trees: one MAP call for the whole strip, scrolled at half speed
    LDI r0, bg_strip
    LDI r1, tiles
    LDI r2, 32
    LDI r3, 3
    LDI r4, 0 - (CAM_X >> 1)
    LDI r5, BG_Y
    SYS MAP
    CALL draw_level
    CALL draw_items
    CALL draw_bo
    CALL draw_bubble
    CALL draw_hud
    RET

draw_sky:
    LDI r0, spr_sun
    LDI r1, 106
    LDI r2, 12
    LDI r3, 0
    SYS SPR
    LDI r0, spr_cloud_l
    LDI r1, 10
    LDI r2, 18
    SYS SPR
    LDI r0, spr_cloud_r
    LDI r1, 18
    SYS SPR
    LDI r0, spr_cloud_l
    LDI r1, 58
    LDI r2, 28
    SYS SPR
    LDI r0, spr_cloud_r
    LDI r1, 66
    SYS SPR
    RET

; 17 visible columns, each one MAP call of 1 x 15 tiles straight from the column-major RAM buffer
draw_level:
    LDI r6, 0                       ; screen column
@col:
    MOV r0, r6
    ADD r0, CAM_X >> 3              ; level column
    SHL r0, 4
    ADD r0, level + 1               ; skip row 0 (behind the HUD)
    LDI r1, tiles
    LDI r2, 1
    LDI r3, LV_ROWS - 1
    MOV r4, r6
    SHL r4, 3
    SUB r4, CAM_X & 7
    LDI r5, 8
    SYS MAP
    ADD r6, 1
    CMP r6, VIEW_COLS
    JLT @col
    RET

draw_items:
    LDI r6, 0
@apple:
    MOV r7, r6
    SHL r7, 2
    LDI r0, spr_apple
    LD r1, [r7 + apple_xy]
    SUB r1, CAM_X
    LD r2, [r7 + apple_xy + 2]
    LDI r3, 0
    SYS SPR
    ADD r6, 1
    CMP r6, 3
    JLT @apple
    LDI r0, spr_star
    LDI r1, 123 - CAM_X
    LDI r2, 24
    SYS SPR
    LDI r0, spr_snail
    LDI r1, 122 - CAM_X
    LDI r2, 88
    SYS SPR
    RET

; Bo = two 8x8 sprites + a procedural board (deck row 14, wheels row 15). Pommes speed lines behind him.
draw_bo:
    LDI r0, BO_X - CAM_X - 11
    LDI r1, BO_Y + 4
    LDI r2, 7
    LDI r3, 1
    LDI r4, C_YELLOW
    SYS RECTFILL
    LDI r0, BO_X - CAM_X - 8
    LDI r1, BO_Y + 8
    LDI r2, 6
    LDI r4, C_ORANGE
    SYS RECTFILL
    LDI r0, BO_X - CAM_X - 13
    LDI r1, BO_Y + 12
    LDI r2, 9
    LDI r4, C_YELLOW
    SYS RECTFILL
    LDI r0, spr_bo_up
    LDI r1, BO_X - CAM_X
    LDI r2, BO_Y
    LDI r3, 0
    SYS SPR
    LD r0, [tick]                   ; push animation: two leg frames
    SHR r0, 3
    AND r0, 1
    SHL r0, 5
    ADD r0, spr_bo_lo
    LDI r2, BO_Y + 8
    SYS SPR
    LD r5, [board]                  ; deck colour = the selected board
    LDB r4, [r5 + board_colors]
    LDI r0, BO_X - CAM_X - 1
    LDI r1, BO_Y + 14
    LDI r2, 10
    LDI r3, 1
    SYS RECTFILL
    LDI r0, BO_X - CAM_X + 1
    LDI r1, BO_Y + 15
    LDI r2, 2
    LDI r4, C_DGREY
    SYS RECTFILL
    LDI r0, BO_X - CAM_X + 5
    SYS RECTFILL
    RET

; the current line in a white bubble above Bo, centred on him and kept on screen
draw_bubble:
    LD r0, [tick]
    DIV r0, LINE_FRAMES
    MOD r0, NUM_LINES
    SHL r0, 1
    LD r6, [r0 + lines]             ; r6 = line (glyph indices, 255-terminated)
    LDI r5, 0                       ; length
@len:
    LDB r0, [r6]
    CMP r0, 255
    JEQ @measured
    ADD r6, 1
    ADD r5, 1
    JMP @len
@measured:
    SUB r6, r5
    MUL r5, 6                       ; text width + 1
    MOV r7, r5
    SHR r7, 1
    LDI r0, BO_X - CAM_X + 4 - 3    ; bubble x = Bo's centre - (width + 6) / 2, clamped
    SUB r0, r7
    CMP r0, 2
    JGE @x_ok
    LDI r0, 2
@x_ok:
    MOV r7, r0                      ; r7 = bubble x
    LDI r1, BO_Y - 22
    MOV r2, r5
    ADD r2, 5
    LDI r3, 13
    LDI r4, C_WHITE
    SYS RECTFILL
    LDI r4, C_PURPLE
    SYS RECT
    LDI r0, BO_X - CAM_X + 3        ; tail
    LDI r1, BO_Y - 10
    LDI r2, 3
    LDI r3, 2
    LDI r4, C_WHITE
    SYS RECTFILL
    LDI r0, BO_X - CAM_X + 4
    LDI r1, BO_Y - 8
    LDI r2, 1
    LDI r3, 2
    SYS RECTFILL
    LDI r0, BO_X - CAM_X + 2
    LDI r1, BO_Y - 9
    LDI r2, C_PURPLE
    SYS PSET
    LDI r0, BO_X - CAM_X + 6
    SYS PSET
    LDI r0, BO_X - CAM_X + 3
    LDI r1, BO_Y - 7
    SYS PSET
    LDI r0, BO_X - CAM_X + 5
    SYS PSET
    LDI r0, BO_X - CAM_X + 4
    LDI r1, BO_Y - 6
    SYS PSET
    MOV r0, r6
    MOV r1, r7
    ADD r1, 3
    LDI r2, BO_Y - 22 + 3 - 2       ; glyph rows 0-1 are the diacritic space
    CALL draw_text
    RET

; r0 = glyph-index string (255-terminated), r1 = x, r2 = y: one SPR per character, 6-pixel advance
draw_text:
    MOV r6, r0
    MOV r7, r1
@next:
    LDB r0, [r6]
    CMP r0, 255
    JEQ @done
    CMP r0, 0
    JEQ @advance                    ; space: nothing to draw
    SHL r0, 5
    ADD r0, font
    MOV r1, r7
    LDI r3, 0
    SYS SPR
@advance:
    ADD r6, 1
    ADD r7, 6
    JMP @next
@done:
    RET

draw_hud:
    LDI r0, 0
    LDI r1, 0
    LDI r2, 128
    LDI r3, 8
    LDI r4, C_NAVY
    SYS RECTFILL
    LDI r0, spr_apple
    LDI r1, 1
    LDI r2, 0
    LDI r3, 0
    SYS SPR
    LDI r0, 23
    LDI r1, 10
    LDI r2, 2
    LDI r3, C_WHITE
    SYS NUM
    LDI r0, spr_star
    LDI r1, 26
    LDI r2, 0
    LDI r3, 0
    SYS SPR
    LDI r1, 34
    SYS SPR
    LDI r0, spr_star_off
    LDI r1, 42
    SYS SPR
    LDI r0, spr_bo_head
    LDI r1, 58
    SYS SPR
    LDI r0, s_times
    LDI r1, 67
    LDI r2, 2
    LDI r3, C_WHITE
    SYS TEXT
    LDI r0, 5
    LDI r1, 71
    SYS NUM
    LDI r0, spr_fries
    LDI r1, 86
    LDI r2, 0
    LDI r3, 0
    SYS SPR
    LDI r0, 96                      ; pommes timer bar
    LDI r1, 2
    LDI r2, 30
    LDI r3, 4
    LDI r4, C_WHITE
    SYS RECT
    LD r2, [tick]                   ; shrinks over 10 s, then refills (it is a mock)
    MOD r2, 600
    LDI r3, 600
    SUB r3, r2
    MUL r3, 28
    DIV r3, 600
    MOV r2, r3
    LDI r0, 97
    LDI r1, 3
    LDI r3, 2
    LDI r4, C_ORANGE
    SYS RECTFILL
    RET

; ---- data ------------------------------------------------------------------------------------
.data
board_colors: .byte C_ORANGE, 6, 11, 8, 14, 15   ; own, then the five unlockable boards
s_times: .string "X"
apple_xy: .word 109, 66, 117, 52, 126, 42

; the mock level, row-major here for readability (init transposes it); 0 = sky
; 1 grass 2 dirt 3 road 4 asphalt 5 road marking 6/7 driveway slope (22.5°) 8 wall 9/10 corner boards
; 11 window 12/13 door 14/15/16 roof 17/18 fence 19 kicker ramp (45°)
map_rows:
    .byte  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0     ; 0 (HUD)
    .byte  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0     ; 1
    .byte  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0     ; 2
    .byte  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0     ; 3
    .byte  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0     ; 4
    .byte  0,14,15,15,16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0     ; 5
    .byte 14,15,15,15,15,16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0     ; 6
    .byte  9, 8, 8, 8,10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0     ; 7
    .byte  9,11, 8,11,10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0     ; 8
    .byte  9, 8,12, 8,10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0     ; 9
    .byte  9, 8,13, 8,10, 0, 0,17,17,17,17, 0, 0, 0, 0, 0, 0, 0     ; 10
    .byte  1, 1, 1, 1, 1, 6, 7,18,18,18,18, 0,19, 0, 0, 0, 0, 0     ; 11
    .byte  2, 2, 2, 2, 2, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3     ; 12
    .byte  2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4     ; 13
    .byte  2, 2, 2, 2, 2, 4, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5     ; 14
    .byte  2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4     ; 15

bg_strip:                           ; distant trees: 32 x 3, drawn at half the camera speed
    .byte 20,21,20,20,21,20,21,21,20,21,20,20,21,21,20,21,20,21,21,20,20,21,20,21,20,20,21,20,21,21,20,21
    .fill 64, 22

tiles = tile_data - 32
tile_data:
.sprite                             ; 1 grass
    5bb5bbb5
    bbbbbbbb
    b5bbb5bb
    44b444b4
    44444444
    44414444
    44444441
    14444444
.sprite                             ; 2 dirt
    44444444
    44414444
    44444441
    44444444
    41444444
    44444444
    44444144
    44444444
.sprite                             ; 3 road surface (curb edge on top)
    aaaaaaaa
    77777777
    33333333
    33373333
    33333333
    33333373
    37333333
    33333333
.sprite                             ; 4 asphalt
    33333333
    33373333
    33333333
    33333373
    33333333
    37333333
    33333333
    33333333
.sprite                             ; 5 asphalt with a road marking
    33333333
    33333333
    33333333
    ffffffff
    ffffffff
    33333333
    33333373
    33333333
.sprite                             ; 6 driveway, 22.5° down, upper half
    aa......
    33aa....
    3333aa..
    333333aa
    33333333
    33333333
    33373333
    33333333
.sprite                             ; 7 driveway, 22.5° down, lower half
    ........
    ........
    ........
    ........
    aa......
    33aa....
    3333aa..
    333333aa
.sprite                             ; 8 wall (falu red, vertical boards)
    66616661
    66616661
    66616661
    66616661
    66616661
    66616661
    66616661
    66616661
.sprite                             ; 9 corner board, left
    fff16661
    fff16661
    fff16661
    fff16661
    fff16661
    fff16661
    fff16661
    fff16661
.sprite                             ; 10 corner board, right
    66616fff
    66616fff
    66616fff
    66616fff
    66616fff
    66616fff
    66616fff
    66616fff
.sprite                             ; 11 window
    6ffffff1
    6fddfdf1
    6fd8f8f1
    6ffffff1
    6fd8fdf1
    6f88f8f1
    6ffffff1
    66616661
.sprite                             ; 12 door, top
    6ffffff1
    6f2222f1
    6f2dd2f1
    6f2dd2f1
    6f2222f1
    6f2222f1
    6f2222f1
    6f2222f1
.sprite                             ; 13 door, bottom
    6f2222f1
    6f22e2f1
    6f2222f1
    6f2222f1
    6f2222f1
    6f2222f1
    6f2222f1
    6ffffff1
.sprite                             ; 14 roof, left edge
    .......3
    ......11
    .....333
    ....3333
    ...11111
    ..333333
    .3333333
    11111111
.sprite                             ; 15 roof
    33333333
    11111111
    33333333
    33333333
    11111111
    33333333
    33333333
    11111111
.sprite                             ; 16 roof, right edge
    3.......
    11......
    333.....
    3333....
    11111...
    333333..
    3333333.
    11111111
.sprite                             ; 17 fence, top
    .f...f..
    ff..ff..
    ffa.ffa.
    ffa.ffa.
    ffa.ffa.
    ffffffff
    ffa.ffa.
    ffa.ffa.
.sprite                             ; 18 fence
    ffa.ffa.
    ffa.ffa.
    ffa.ffa.
    ffffffff
    ffa.ffa.
    ffa.ffa.
    ffa.ffa.
    ffa.ffa.
.sprite                             ; 19 kicker ramp, 45° up
    .......9
    ......94
    .....944
    ....9444
    ...94444
    ..944444
    .9444444
    94444444
.sprite                             ; 20 distant trees, top A
    ..55....
    .5555.5.
    55555555
    55555555
    55555555
    55555555
    55555555
    55555555
.sprite                             ; 21 distant trees, top B
    .....55.
    ..5.5555
    .5555555
    55555555
    55555555
    55555555
    55555555
    55555555
.sprite                             ; 22 distant trees
    55555555
    55555555
    55555555
    55555555
    55555555
    55555555
    55555555
    55555555

spr_bo_up:
.sprite
    ..4444..
    .444444.
    .44cccc.
    .4c1cc1c
    ..cccc6.
    ...cc...
    .c8888c.
    ..8888..
spr_bo_lo:
.sprite                             ; legs, frame A
    ..8888..
    ..2222..
    .22..22.
    .2....2.
    .2....2.
    ff....ff
    ........
    ........
.sprite                             ; legs, frame B
    ..8888..
    ..2222..
    .22..2..
    22...2..
    2....2..
    f....ff.
    ........
    ........
spr_bo_head:
.sprite
    ..4444..
    .444444.
    .44cccc.
    .4c1cc1c
    ..cccc6.
    ...cc...
    ........
    ........
spr_apple:
.sprite
    ....4b..
    ...4bb..
    .66466..
    6f66666.
    6f66666.
    6666666.
    .66666..
    ..6.66..
spr_star:
.sprite
    ...ee...
    ...ee...
    eeeeeeee
    .eeeeee.
    ..eeee..
    .eeeeee.
    .ee..ee.
    .e....e.
spr_star_off:
.sprite
    ...77...
    ...77...
    77777777
    .777777.
    ..7777..
    .777777.
    .77..77.
    .7....7.
spr_snail:
.sprite
    a.a.....
    .a.a999.
    .a.94449
    .aa94949
    .aa94449
    aaaa9999
    aaaaaaaa
    ........
spr_sun:
.sprite
    ..eeee..
    .eeeeee.
    eeeeeeee
    eeeeeeee
    eeeeeeee
    eeeeeeee
    .eeeeee.
    ..eeee..
spr_cloud_l:
.sprite
    ........
    ...fff..
    ..fffff.
    .fffffff
    ffffffff
    ffffffff
    .aaaaaaa
    ........
spr_cloud_r:
.sprite
    ........
    ........
    .fff....
    fffff...
    fffffff.
    ffffffff
    aaaaaaa.
    ........
spr_fries:
.sprite
    .e.e.e..
    .eeeee..
    .eeeee..
    6666666.
    66f6666.
    .66666..
    .66666..
    ........
