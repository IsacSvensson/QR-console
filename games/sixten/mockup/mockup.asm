; SIXTENS EXPEDITION — planning mockup (a spike, not the game). See ../DESIGN.md §14.
; Four scenes take turns, 5 s each:
;   1. top-down: one screen of level 1-1, expanded from the cell map (one byte per cell, 4 x 4 tiles per cell)
;      into a column-major tile buffer and drawn with one MAP call per column; the whirlwind approaches at
;      strength 3, wind particles flow in towards it, the grass near it bends towards it; HUD with the compass;
;   2. the map screen: the SAME cell bytes drawn as an orienteering map (white forest, yellow open land, blue
;      water, brown hills, black paths, the course in red), spread over five frames;
;   3. side view: the fallen tree over the ditch, wind as horizontal streaks, Sixten crouching in the lee;
;   4. overlays: two code blocks in xdata are copied in turn to the same RAM address (OVL_RAM) and run there.
;      Every jump inside an overlay is written OVL_RAM + (target - overlay start) (macro OJ): no assembler change.
; Build and look:  npx tsx games/sixten/mockup/gen.ts && npx tsx games/sixten/mockup/measure.ts
;                  (or: npm run qrc -- build games/sixten/mockup, then qrc run … --frames N --dump-frame f.png)

.title "SIXTEN MOCKUP"

.include "art.gen.asm"
.code                               ; art.gen.asm ends in .xdata

; ---- colours (DawnBringer 16) ----------------------------------------------------------------
C_BLACK  = 0
C_NAVY   = 2
C_DGREY  = 3
C_BROWN  = 4
C_DGREEN = 5
C_RED    = 6
C_KHAKI  = 7
C_BLUE   = 8
C_ORANGE = 9
C_LGREY  = 10
C_GREEN  = 11
C_YELLOW = 14
C_WHITE  = 15

; ---- layout ----------------------------------------------------------------------------------
SCENE_FRAMES = 300
HUD_H    = 32               ; two HUD rows (info, button hints); the playfield is 4 x 3 cells = 128 x 96
PLAY_Y   = 32
SCR_TC   = 16               ; tiles per screen: 16 columns x 12 rows
SCR_TR   = 12
SCR_X    = 3                ; the screen shown: cells 12-15 x 6-8 (the boulder, the field, the ditch)
SCR_Y    = 2
TR_BASE_Y = 88              ; the whirlwind's foot in the top-down scene
WIND_R   = 44               ; grass within this distance of the whirlwind bends towards it
SX_TOP   = 106              ; Sixten in the top-down scene (sprite top-left; 8 x 16)
SY_TOP   = 70
N_PART   = 24
MAP_X    = 4                ; the map screen: 5 px per cell
MAP_Y    = 20
OVL_RAM  = 0xE000           ; overlays run here (below the stack)

; a jump or call inside an overlay: the target's offset in the overlay, at the overlay's RAM address
.macro OJ op, target
    op OVL_RAM + (target - ovl_a)
.endm
.macro OJB op, target
    op OVL_RAM + (target - ovl_b)
.endm

; ---- RAM -------------------------------------------------------------------------------------
.var cells, LV_W * LV_H             ; the level's cell map, unpacked from xdata
.var tbuf, SCR_TC * SCR_TR          ; the screen's tiles, column-major: tbuf[col * 12 + row]
.var font_w, FONT_GLYPHS * 32       ; bubble font, white ink (HUD)
.var font_d, FONT_GLYPHS * 32       ; bubble font, navy ink (bubbles, map)
.var tick
.var st                             ; frame within the current scene
.var trx                            ; the whirlwind's x in the top-down scene
.var tr_x                           ; draw_tromb arguments
.var tr_y
.var tr_s
.var tr_l
.var part_x, N_PART * 2
.var part_y, N_PART * 2
.var tmp0
.var tmp1
.var ovl_len

; ---- init ------------------------------------------------------------------------------------
init:
    LDI r0, cells
    LDI r1, cells_1_1 >> 16
    LDI r2, cells_1_1 & 0xFFFF
    SYS UNPACK
    LDI r0, font_w
    LDI r1, C_WHITE
    CALL unpack_font
    LDI r0, font_d
    LDI r1, C_NAVY
    CALL unpack_font
    RET

; r0 = destination, r1 = ink: the 1 bpp font (bit 7 = leftmost pixel) -> 4 bpp sprites, 4 bytes per row
unpack_font:
    MOV r6, r0
    MOV r7, r1
    LDI r4, 0                       ; source byte (glyph * 8 + row)
@row:
    LDB r1, [r4 + font1]
    LDI r5, 6                       ; shift of the current pixel pair: 6, 4, 2, 0
@pair:
    MOV r0, r1
    SHR r0, r5
    AND r0, 3                       ; bit 1 = left pixel, bit 0 = right pixel
    MOV r3, r0
    SHR r3, 1
    MUL r3, r7
    SHL r3, 4
    AND r0, 1
    MUL r0, r7
    OR r0, r3
    STB [r6], r0
    ADD r6, 1
    SUB r5, 2
    JGE @pair
    ADD r4, 1
    CMP r4, FONT_GLYPHS * 8
    JLT @row
    RET

; ---- update: the scenes take turns -----------------------------------------------------------
update:
    LD r0, [tick]
    MOV r1, r0
    ADD r1, 1
    CMP r1, SCENE_FRAMES * 4
    JLT @counted
    LDI r1, 0
@counted:
    ST [tick], r1
    MOV r1, r0
    MOD r1, SCENE_FRAMES
    ST [st], r1
    DIV r0, SCENE_FRAMES
    SHL r0, 1
    LD r0, [r0 + scenes]
    CALL r0
    RET

; ---- scene 1: top-down -----------------------------------------------------------------------
scene_top:
    LD r0, [st]
    CMP r0, 0
    JNE @running
    CALL particles_init
@running:
    LD r0, [st]                     ; the whirlwind drifts east, 1 px per 8 frames
    SHR r0, 3
    ADD r0, 16
    ST [trx], r0
    LD r0, [st]
    AND r0, 7
    JNZ @expanded
    CALL expand_screen              ; every 8 frames: the bent grass follows the whirlwind
@expanded:
    LDI r0, C_GREEN
    SYS CLS
    CALL draw_screen
    CALL draw_flags
    LDI r0, spr_sixten_head
    LDI r1, SX_TOP
    LDI r2, SY_TOP
    LDI r3, 0
    SYS SPR
    LDI r0, spr_sixten_body
    LDI r2, SY_TOP + 8
    SYS SPR
    LD r0, [trx]
    LDI r1, TR_BASE_Y
    LDI r2, 3
    CALL draw_tromb
    CALL particles_top
    LD r0, [st]                     ; Sixten's line: changes every 100 frames
    DIV r0, 100
    SHL r0, 1
    LD r0, [r0 + lines]
    LDI r1, SX_TOP + 4
    LDI r2, SY_TOP - 3
    CALL draw_bubble
    LDI r0, 2                       ; the course arrow points NE (to control 3)
    CALL draw_hud_info
    CALL draw_hud_hints
    RET

; the cells of the screen (SCR_X, SCR_Y) -> tbuf. Grass tufts within WIND_R of the whirlwind bend towards it.
expand_screen:
    LDI r6, 0                       ; cell row in the screen
@cy:
    LDI r5, 0                       ; cell column in the screen
@cx:
    MOV r0, r6
    ADD r0, SCR_Y * 3
    MUL r0, LV_W
    ADD r0, r5
    ADD r0, SCR_X * 4
    LDB r0, [r0 + cells]
    MOV r1, r0
    AND r1, 0x20                    ; variant: the pattern is mirrored
    ST [tmp0], r1
    AND r0, 31
    SHL r0, 4
    ADD r0, patterns
    ST [tmp1], r0
    LDI r4, 0                       ; tile row in the cell
@ty:
    LDI r3, 0                       ; tile column in the cell
@tx:
    MOV r2, r3
    LD r1, [tmp0]
    CMP r1, 0
    JEQ @plain
    LDI r2, 3
    SUB r2, r3
@plain:
    MOV r1, r4
    SHL r1, 2
    ADD r1, r2
    LD r2, [tmp1]
    ADD r1, r2
    LDB r1, [r1]                    ; the tile
    MOV r0, r5                      ; screen tile column
    SHL r0, 2
    ADD r0, r3
    MOV r2, r6                      ; screen tile row
    SHL r2, 2
    ADD r2, r4
    CMP r1, T_TUFT
    JNE @store
    MOV r7, r2
    SHL r7, 3
    ADD r7, PLAY_Y + 4 - TR_BASE_Y
    CMP r7, 0
    JGE @ypos
    NEG r7
@ypos:
    CMP r7, WIND_R
    JGE @store
    PUSH r0
    SHL r0, 3
    ADD r0, 4
    LD r7, [trx]
    SUB r7, r0                      ; dx = whirlwind - tuft
    POP r0
    LDI r1, T_TUFT_R
    CMP r7, 0
    JGE @right
    NEG r7
    LDI r1, T_TUFT_L
@right:
    CMP r7, WIND_R
    JLT @store
    LDI r1, T_TUFT
@store:
    MUL r0, SCR_TR
    ADD r0, r2
    STB [r0 + tbuf], r1
    ADD r3, 1
    CMP r3, 4
    JLT @tx
    ADD r4, 1
    CMP r4, 4
    JLT @ty
    ADD r5, 1
    CMP r5, 4
    JLT @cx
    ADD r6, 1
    CMP r6, 3
    JLT @cy
    RET

; 16 columns, each one MAP call of 1 x 12 tiles straight from the column-major buffer
draw_screen:
    LDI r6, 0
@col:
    MOV r0, r6
    MUL r0, SCR_TR
    ADD r0, tbuf
    LDI r1, tiles_top
    LDI r2, 1
    LDI r3, SCR_TR
    MOV r4, r6
    SHL r4, 3
    LDI r5, PLAY_Y
    SYS MAP
    ADD r6, 1
    CMP r6, SCR_TC
    JLT @col
    RET

; the control flags of the course that stand on this screen
draw_flags:
    LDI r6, 1
@next:
    MOV r5, r6
    SHL r5, 1
    LDB r1, [r5 + course]
    LDB r2, [r5 + course + 1]
    SUB r1, SCR_X * 4
    CMP r1, 4
    JAE @skip                       ; unsigned: left of the screen is skipped too
    SUB r2, SCR_Y * 3
    CMP r2, 3
    JAE @skip
    SHL r1, 5
    ADD r1, 24
    SHL r2, 5
    ADD r2, PLAY_Y + 6
    LDI r0, spr_flag
    LDI r3, 0
    SYS SPR
@skip:
    ADD r6, 1
    CMP r6, COURSE_N - 1
    JLT @next
    RET

; ---- the whirlwind ---------------------------------------------------------------------------
; r0 = x, r1 = foot y, r2 = strength 1-5. Visual language (DESIGN §6.3): taller and wider with strength;
; debris by strength: 1 leaves, 2 more leaves, 3 sticks, 4 twigs, 5 planks. Dust ring at the foot.
draw_tromb:
    ST [tr_x], r0
    ST [tr_y], r1
    ST [tr_s], r2
    SHL r2, 1
    ADD r2, 3
    ST [tr_l], r2                   ; layers: 3 + 2 * strength, 4 px apart
    LDI r6, 0                       ; dust ring: 8 points, radius 6 + 2 * strength, squashed
@dust:
    LD r0, [tick]
    SHR r0, 1
    ADD r0, r6
    ADD r0, r6
    AND r0, 15
    SHL r0, 1
    LD r1, [r0 + cos_t]
    LD r2, [r0 + sin_t]
    LD r3, [tr_s]
    SHL r3, 1
    ADD r3, 6
    MUL r1, r3
    SAR r1, 6
    MUL r2, r3
    SAR r2, 8
    LD r0, [tr_x]
    ADD r0, r1
    LD r1, [tr_y]
    ADD r1, r2
    LDI r2, C_KHAKI
    SYS PSET
    ADD r6, 1
    CMP r6, 8
    JLT @dust
    LDI r6, 0                       ; the funnel: layer i has half-width 1 + i*i/12
@layer:
    MOV r5, r6
    MUL r5, r6
    DIV r5, 12
    ADD r5, 1
    LD r1, [tr_y]
    MOV r0, r6
    SHL r0, 2
    SUB r1, r0
    LD r0, [tr_x]
    SUB r0, r5
    LD r2, [tr_x]
    ADD r2, r5
    MOV r3, r1
    LDI r4, C_LGREY
    SYS LINE
    SUB r1, 2
    MOV r3, r1
    SYS LINE
    LD r0, [tick]                   ; a dark band turning round the funnel
    SHR r0, 1
    ADD r0, r6
    ADD r0, r6
    AND r0, 15
    SHL r0, 1
    LD r2, [r0 + cos_t]
    MUL r2, r5
    SAR r2, 6
    LD r0, [tr_x]
    ADD r0, r2
    LDI r2, C_DGREY
    SYS PSET
    ADD r1, 1
    SYS PSET
    ADD r1, 1
    SYS PSET
    ADD r6, 1
    LD r0, [tr_l]
    CMP r6, r0
    JLT @layer
    LD r0, [tr_l]                   ; the cloud on top
    SUB r0, 1
    MOV r5, r0
    MUL r5, r0
    DIV r5, 12
    ADD r5, 7
    LD r1, [tr_l]
    SHL r1, 2
    LD r2, [tr_y]
    SUB r2, r1
    SUB r2, 5
    MOV r1, r2
    LD r0, [tr_x]
    SUB r0, r5
    MOV r2, r5
    SHL r2, 1
    LDI r3, 5
    LDI r4, C_DGREY
    SYS RECTFILL
    ADD r0, 3
    SUB r1, 2
    SUB r2, 6
    LDI r3, 2
    SYS RECTFILL
    LDI r6, 0                       ; debris: 3 * strength pieces orbiting the funnel
@deb:
    MOV r5, r6
    MUL r5, 7
    LD r0, [tr_l]
    MOD r5, r0                      ; its layer
    MOV r4, r5
    MUL r4, r5
    DIV r4, 12
    ADD r4, 4
    MOV r0, r6
    AND r0, 3
    ADD r4, r0                      ; its radius
    LD r0, [tick]
    SHR r0, 1
    MOV r3, r6
    MUL r3, 5
    ADD r0, r3
    AND r0, 15
    SHL r0, 1
    LD r1, [r0 + cos_t]
    LD r2, [r0 + sin_t]
    MUL r1, r4
    SAR r1, 6
    MUL r2, r4
    SAR r2, 8
    LD r0, [tr_x]
    ADD r0, r1
    SHL r5, 2
    LD r1, [tr_y]
    SUB r1, r5
    ADD r1, r2
    MOV r2, r6
    LD r3, [tr_s]
    MOD r2, r3
    SHL r2, 1
    LD r2, [r2 + debris]
    CALL r2
    ADD r6, 1
    LD r0, [tr_s]
    MUL r0, 3
    CMP r6, r0
    JLT @deb
    RET

; debris pieces at r0 = x, r1 = y (they keep r5-r7)
deb_leaf_o:
    LDI r2, C_ORANGE
    SYS PSET
    ADD r0, 1
    SYS PSET
    RET
deb_leaf_y:
    LDI r2, C_YELLOW
    SYS PSET
    ADD r1, 1
    SYS PSET
    RET
deb_stick:
    MOV r2, r0
    ADD r2, 3
    MOV r3, r1
    SUB r3, 1
    LDI r4, C_BROWN
    SYS LINE
    RET
deb_twig:
    MOV r2, r0
    ADD r2, 2
    MOV r3, r1
    ADD r3, 2
    LDI r4, C_DGREEN
    SYS LINE
    RET
deb_plank:
    LDI r2, 5
    LDI r3, 2
    LDI r4, C_KHAKI
    SYS RECTFILL
    RET

; ---- wind particles (top-down): they flow in towards the funnel and turn anticlockwise ---------
particles_init:
    LDI r6, 0
@p:
    MOV r0, r6
    AND r0, 15
    SHL r0, 1
    LD r1, [r0 + spawn_x]
    LD r2, [r0 + spawn_y]
    MOV r0, r6
    SHR r0, 4
    SHL r0, 3
    ADD r1, r0
    MOV r7, r6
    SHL r7, 1
    ST [r7 + part_x], r1
    ST [r7 + part_y], r2
    ADD r6, 1
    CMP r6, N_PART
    JLT @p
    RET

particles_top:
    LDI r6, 0
@p:
    MOV r7, r6
    SHL r7, 1
    LD r0, [r7 + part_x]
    LD r1, [r7 + part_y]
    LD r2, [trx]
    SUB r2, r0                      ; dx
    LDI r3, TR_BASE_Y - 12
    SUB r3, r1                      ; dy (to the funnel's lower part)
    LDI r4, 0                       ; sx = sign(dx)
    CMP r2, 0
    JEQ @sx
    LDI r4, 1
    JGT @sx
    LDI r4, -1
    NEG r2
@sx:
    LDI r5, 0                       ; sy = sign(dy)
    CMP r3, 0
    JEQ @sy
    LDI r5, 1
    JGT @sy
    LDI r5, -1
    NEG r3
@sy:
    CMP r2, 6                       ; |dx|, |dy| < 6: taken in, comes back at an edge
    JGE @move
    CMP r3, 6
    JGE @move
    LD r0, [tick]
    SHR r0, 3
    MOV r1, r6
    MUL r1, 5
    ADD r0, r1
    AND r0, 15
    SHL r0, 1
    LD r1, [r0 + spawn_y]
    LD r0, [r0 + spawn_x]
    JMP @store
@move:
    MOV r2, r4                      ; x += 2 sx + sy, y += sy - sx
    SHL r2, 1
    ADD r2, r5
    ADD r0, r2
    MOV r3, r5
    SUB r3, r4
    ADD r1, r3
@store:
    ST [r7 + part_x], r0
    ST [r7 + part_y], r1
    CMP r1, PLAY_Y
    JLT @next
    MOV r3, r6
    AND r3, 1
    JNZ @leaf
    MOV r2, r4                      ; a streak behind the particle
    SHL r2, 1
    ADD r2, r5
    SHL r2, 1
    NEG r2
    ADD r2, r0
    MOV r3, r5
    SUB r3, r4
    SHL r3, 1
    NEG r3
    ADD r3, r1
    LDI r4, C_WHITE
    SYS LINE
    JMP @next
@leaf:
    LDI r2, C_ORANGE
    MOV r3, r6
    AND r3, 2
    JZ @col
    LDI r2, C_YELLOW
@col:
    SYS PSET
    ADD r0, 1
    SYS PSET
@next:
    ADD r6, 1
    CMP r6, N_PART
    JLT @p
    RET

; ---- text, bubble, HUD -----------------------------------------------------------------------
; r0 = glyph-index string (255-terminated), r1 = x, r2 = y, r3 = font (font_w / font_d): one SPR per
; character, 6 px advance. Returns r0 = x after the text. Clobbers r5-r7.
draw_text:
    MOV r6, r0
    MOV r7, r1
    MOV r5, r3
@next:
    LDB r0, [r6]
    CMP r0, 255
    JEQ @done
    CMP r0, 0
    JEQ @advance                    ; space
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

; r0 = string, r1 = centre x, r2 = bottom y: a white bubble with navy text, kept on screen
draw_bubble:
    MOV r6, r0
    LDI r3, 0
@len:
    LDB r4, [r6]
    CMP r4, 255
    JEQ @measured
    ADD r6, 1
    ADD r3, 1
    JMP @len
@measured:
    MUL r3, 6
    ADD r3, 3                       ; width
    ST [tmp0], r1                   ; centre (the tail)
    MOV r6, r1
    MOV r4, r3
    SHR r4, 1
    SUB r6, r4                      ; left
    CMP r6, 1
    JGE @left_ok
    LDI r6, 1
@left_ok:
    MOV r4, r6
    ADD r4, r3
    CMP r4, 127
    JLE @right_ok
    LDI r6, 127
    SUB r6, r3
@right_ok:
    PUSH r0
    PUSH r2
    MOV r0, r6
    MOV r1, r2
    SUB r1, 11
    MOV r2, r3
    LDI r3, 10
    LDI r4, C_WHITE
    SYS RECTFILL
    LD r0, [tmp0]                   ; the tail
    ADD r1, 10
    LDI r2, 3
    LDI r3, 2
    SYS RECTFILL
    MOV r1, r6
    ADD r1, 2
    POP r2
    SUB r2, 12
    POP r0
    LDI r3, font_d
    CALL draw_text
    RET

; HUD row 1 (y 0-15): compass with r0 = arrow direction (0 E, 2 NE, 4 N … in 16ths of a turn), the control
; count, wood, the active power-up and five lives
draw_hud_info:
    PUSH r0
    LDI r0, 0
    LDI r1, 0
    LDI r2, 128
    LDI r3, 16
    LDI r4, C_NAVY
    SYS RECTFILL
    LDI r1, 15
    LDI r3, 1
    LDI r4, C_DGREY
    SYS RECTFILL
    POP r2
    LDI r0, 8
    LDI r1, 8
    CALL draw_compass
    LDI r0, spr_flag
    LDI r1, 22
    LDI r2, 4
    LDI r3, 0
    SYS SPR
    LDI r0, t_ctrl
    LDI r1, 32
    LDI r2, 2
    LDI r3, font_w
    CALL draw_text
    LDI r0, spr_wood
    LDI r1, 54
    LDI r2, 4
    LDI r3, 0
    SYS SPR
    LDI r0, t_wood
    LDI r1, 64
    LDI r2, 2
    LDI r3, font_w
    CALL draw_text
    LDI r0, spr_cucumber
    LDI r1, 74
    LDI r2, 4
    LDI r3, 0
    SYS SPR
    LDI r0, spr_heart
    LDI r1, 86
    LDI r2, 5
@heart:
    SYS SPR
    ADD r1, 8
    CMP r1, 126
    JLT @heart
    RET

; HUD row 2 (y 16-31): the buttons
draw_hud_hints:
    LDI r0, 0
    LDI r1, 16
    LDI r2, 128
    LDI r3, 16
    LDI r4, C_NAVY
    SYS RECTFILL
    LDI r0, spr_dpad
    LDI r1, 1
    LDI r2, 19
    LDI r3, 0
    SYS SPR
    LDI r0, spr_btn_a
    LDI r1, 25
    SYS SPR
    LDI r0, spr_btn_b
    LDI r1, 85
    SYS SPR
    LDI r0, t_go
    LDI r1, 10
    LDI r2, 17
    LDI r3, font_w
    CALL draw_text
    LDI r0, t_look
    LDI r1, 34
    LDI r2, 17
    LDI r3, font_w
    CALL draw_text
    LDI r0, t_map
    LDI r1, 94
    LDI r2, 17
    LDI r3, font_w
    CALL draw_text
    RET

; r0 = centre x, r1 = centre y, r2 = arrow direction: dial, red north needle, yellow arrow (course/heading)
draw_compass:
    ST [tr_x], r0
    ST [tr_y], r1
    ST [tmp1], r2
    LDI r6, 0
@dial:
    MOV r0, r6
    SHL r0, 1
    LD r1, [r0 + cos_t]
    LD r2, [r0 + sin_t]
    MUL r1, 6
    SAR r1, 6
    MUL r2, 6
    SAR r2, 6
    LD r0, [tr_x]
    ADD r0, r1
    LD r1, [tr_y]
    SUB r1, r2
    LDI r2, C_LGREY
    SYS PSET
    ADD r6, 1
    CMP r6, 16
    JLT @dial
    LD r0, [tr_x]
    LD r1, [tr_y]
    MOV r2, r0
    MOV r3, r1
    ADD r3, 4
    LDI r4, C_WHITE
    SYS LINE
    SUB r3, 8
    LDI r4, C_RED
    SYS LINE
    LD r5, [tmp1]
    SHL r5, 1
    LD r2, [r5 + cos_t]
    MUL r2, 5
    SAR r2, 6
    ADD r2, r0
    LD r3, [r5 + sin_t]
    MUL r3, 5
    SAR r3, 6
    NEG r3
    ADD r3, r1
    LDI r4, C_YELLOW
    SYS LINE
    RET

; ---- scene 2: the map screen, drawn from the same cell bytes, spread over five frames ----------
scene_map:
    LD r0, [st]
    CMP r0, 5
    JAE @done                       ; the framebuffer keeps the map
    SHL r0, 1
    LD r0, [r0 + map_parts]
    CALL r0
@done:
    RET

map_part0:
    LDI r0, C_WHITE
    SYS CLS
    LDI r0, t_map_title
    LDI r1, 4
    LDI r2, 4
    LDI r3, font_d
    CALL draw_text
    LDI r0, 121                     ; north arrow
    LDI r1, 16
    LDI r2, 121
    LDI r3, 8
    LDI r4, C_BLACK
    SYS LINE
    LDI r0, 119
    LDI r1, 10
    LDI r2, 121
    LDI r3, 8
    SYS LINE
    LDI r0, 123
    SYS LINE
    LDI r0, s_n
    LDI r1, 120
    LDI r2, 1
    LDI r3, C_BLACK
    SYS TEXT
    LDI r0, 0
    LDI r1, 8
    CALL map_fill_rows
    RET
map_part1:
    LDI r0, 8
    LDI r1, LV_H
    CALL map_fill_rows
    LDI r0, MAP_X - 1
    LDI r1, MAP_Y - 1
    LDI r2, LV_W * 5 + 2
    LDI r3, LV_H * 5 + 2
    LDI r4, C_BLACK
    SYS RECT
    RET

; r0 = first row, r1 = end row: one RECTFILL per cell in its map colour
map_fill_rows:
    MOV r7, r0
    ST [tmp0], r1
@row:
    LDI r6, 0
@col:
    MOV r0, r7
    MUL r0, LV_W
    ADD r0, r6
    LDB r4, [r0 + cells]
    AND r4, 31
    LDB r4, [r4 + map_fill]
    MOV r0, r6
    MUL r0, 5
    ADD r0, MAP_X
    MOV r1, r7
    MUL r1, 5
    ADD r1, MAP_Y
    LDI r2, 5
    LDI r3, 5
    SYS RECTFILL
    ADD r6, 1
    CMP r6, LV_W
    JLT @col
    ADD r7, 1
    LD r0, [tmp0]
    CMP r7, r0
    JLT @row
    RET

; north lines (blue, dotted), then every cell's symbol
map_part2:
    LDI r6, MAP_X + 12
@nline:
    LDI r1, MAP_Y
@dot:
    MOV r0, r6
    LDI r2, C_BLUE
    SYS PSET
    ADD r1, 3
    CMP r1, MAP_Y + LV_H * 5
    JLT @dot
    ADD r6, 30
    CMP r6, MAP_X + LV_W * 5
    JLT @nline
    LDI r7, 0
@row:
    LDI r6, 0
@col:
    MOV r0, r7
    MUL r0, LV_W
    ADD r0, r6
    LDB r2, [r0 + cells]
    AND r2, 31
    LDB r2, [r2 + map_sym]
    CMP r2, 0
    JEQ @next
    SHL r2, 1
    LD r2, [r2 + sym_routines]
    MOV r0, r6
    MUL r0, 5
    ADD r0, MAP_X
    MOV r1, r7
    MUL r1, 5
    ADD r1, MAP_Y
    CALL r2
@next:
    ADD r6, 1
    CMP r6, LV_W
    JLT @col
    ADD r7, 1
    CMP r7, LV_H
    JLT @row
    RET

; map symbols: r0, r1 = the cell's top-left on screen (5 x 5); they keep r6, r7
sym_path_ew:
    ADD r1, 2
    LDI r2, C_BLACK
    SYS PSET
    ADD r0, 2
    SYS PSET
    ADD r0, 2
    SYS PSET
    RET
sym_path_ns:
    ADD r0, 2
    LDI r2, C_BLACK
    SYS PSET
    ADD r1, 2
    SYS PSET
    ADD r1, 2
    SYS PSET
    RET
sym_path_x:
    PUSH r0
    PUSH r1
    CALL sym_path_ew
    POP r1
    POP r0
    CALL sym_path_ns
    RET
sym_marsh:
    ADD r1, 1
    MOV r2, r0
    ADD r2, 2
    MOV r3, r1
    LDI r4, C_BLUE
    SYS LINE
    ADD r0, 2
    ADD r1, 2
    ADD r2, 2
    ADD r3, 2
    SYS LINE
    RET
sym_contours:
    ADD r1, 1
    MOV r2, r0
    ADD r2, 4
    MOV r3, r1
    LDI r4, C_BROWN
    SYS LINE
    ADD r1, 2
    ADD r3, 2
    SYS LINE
    RET
sym_ditch:
    ADD r1, 2
    MOV r2, r0
    ADD r2, 4
    MOV r3, r1
    LDI r4, C_BLUE
    SYS LINE
    RET
sym_hollow:
    LDI r2, C_BROWN
    ADD r0, 1
    ADD r1, 1
    SYS PSET
    ADD r1, 1
    SYS PSET
    ADD r0, 1
    ADD r1, 1
    SYS PSET
    ADD r0, 1
    SUB r1, 1
    SYS PSET
    SUB r1, 1
    SYS PSET
    RET
sym_house:
    ADD r0, 1
    ADD r1, 1
    LDI r2, 3
    LDI r3, 3
    LDI r4, C_BLACK
    SYS RECTFILL
    RET
sym_boulder:
    ADD r0, 2
    ADD r1, 2
    LDI r2, 2
    LDI r3, 2
    LDI r4, C_BLACK
    SYS RECTFILL
    RET
sym_fallen:
    ADD r0, 1
    ADD r1, 1
    MOV r2, r0
    ADD r2, 2
    MOV r3, r1
    ADD r3, 2
    LDI r4, C_BLACK
    SYS LINE
    ADD r1, 2
    SUB r3, 2
    SYS LINE
    RET
sym_bridge:
    ADD r1, 1
    MOV r2, r0
    ADD r2, 4
    MOV r3, r1
    LDI r4, C_BLACK
    SYS LINE
    ADD r1, 2
    ADD r3, 2
    SYS LINE
    RET
sym_cave:
    ADD r0, 1
    ADD r1, 1
    MOV r2, r0
    ADD r2, 1
    MOV r3, r1
    ADD r3, 2
    LDI r4, C_BLACK
    SYS LINE
    ADD r0, 2
    SYS LINE
    RET
sym_lone_tree:
    ADD r0, 1
    ADD r1, 1
    LDI r2, 3
    LDI r3, 3
    LDI r4, C_GREEN
    SYS RECTFILL
    RET

; the course in red: legs, start triangle, control circles with numbers, finish double circle
map_part3:
    LDI r6, 0
@leg:
    MOV r5, r6
    SHL r5, 1
    CALL course_xy
    MOV r2, r0
    MOV r3, r1
    ADD r5, 2
    CALL course_xy
    LDI r4, C_RED
    SYS LINE
    ADD r6, 1
    CMP r6, COURSE_N - 1
    JLT @leg
    LDI r5, 0                       ; start: a triangle
    CALL course_xy
    MOV r2, r0
    MOV r3, r1
    SUB r1, 3
    ADD r2, 3
    ADD r3, 2
    LDI r4, C_RED
    SYS LINE
    MOV r2, r0
    SUB r2, 3
    SYS LINE
    MOV r0, r2
    MOV r1, r3
    ADD r2, 6
    SYS LINE
    LDI r6, 1                       ; controls
@ctrl:
    MOV r5, r6
    SHL r5, 1
    CALL course_xy
    LDI r2, 3
    CALL circle
    MOV r2, r1
    SUB r2, 7
    MOV r1, r0
    ADD r1, 3
    MOV r0, r6
    LDI r3, C_RED
    SYS NUM
    ADD r6, 1
    CMP r6, COURSE_N - 1
    JLT @ctrl
    LDI r5, (COURSE_N - 1) * 2      ; finish
    CALL course_xy
    LDI r2, 3
    CALL circle
    LDI r2, 2
    CALL circle
    RET

; r5 = course byte offset -> r0, r1 = the cell's centre on the map
course_xy:
    LDB r0, [r5 + course]
    MUL r0, 5
    ADD r0, MAP_X + 2
    LDB r1, [r5 + course + 1]
    MUL r1, 5
    ADD r1, MAP_Y + 2
    RET

; r0, r1 = centre, r2 = radius: 16 red points (keeps r0, r1, r5, r6)
circle:
    ST [tmp0], r2
    LDI r7, 0
@pt:
    PUSH r0
    PUSH r1
    MOV r3, r7
    SHL r3, 1
    LD r2, [r3 + cos_t]
    LD r4, [tmp0]
    MUL r2, r4
    SAR r2, 6
    ADD r0, r2
    LD r2, [r3 + sin_t]
    MUL r2, r4
    SAR r2, 6
    ADD r1, r2
    LDI r2, C_RED
    SYS PSET
    POP r1
    POP r0
    ADD r7, 1
    CMP r7, 16
    JLT @pt
    RET

; the legend: three columns of two
map_part4:
    LDI r6, 0
@entry:
    MOV r5, r6
    SHL r5, 1
    LD r0, [r5 + legend_x]
    LD r1, [r5 + legend_y]
    LDI r2, 6
    LDI r3, 6
    LDB r4, [r6 + legend_fill]
    SYS RECTFILL
    LDI r4, C_DGREY
    SYS RECT
    LD r2, [r5 + legend_sym]
    CMP r2, 0
    JEQ @label
    PUSH r5
    PUSH r6
    CALL r2
    POP r6
    POP r5
@label:
    PUSH r6
    LD r0, [r5 + legend_txt]
    LD r1, [r5 + legend_x]
    ADD r1, 9
    LD r2, [r5 + legend_y]
    SUB r2, 2
    LDI r3, font_d
    CALL draw_text
    POP r6
    ADD r6, 1
    CMP r6, 6
    JLT @entry
    RET

; ---- scene 3: side view at the fallen tree ---------------------------------------------------
scene_side:
    LD r0, [st]
    CMP r0, 0
    JNE @running
    LDI r6, 0                       ; streaks and leaves spread over the sky
@init:
    MOV r7, r6
    SHL r7, 1
    MOV r0, r6
    MUL r0, 23
    MOD r0, 136
    ST [r7 + part_x], r0
    MOV r0, r6
    MUL r0, 13
    MOD r0, 58
    ADD r0, 20
    ST [r7 + part_y], r0
    ADD r6, 1
    CMP r6, N_PART
    JLT @init
@running:
    LDI r0, C_LGREY                 ; storm sky
    SYS CLS
    LDI r0, 0
    LDI r1, 16
    LDI r2, 128
    LDI r3, 9
    LDI r4, C_DGREY
    SYS RECTFILL
    LDI r6, 0                       ; the scene: one MAP call per column
@col:
    MOV r0, r6
    MUL r0, SIDE_ROWS
    ADD r0, side_map
    LDI r1, tiles_side
    LDI r2, 1
    LDI r3, SIDE_ROWS
    MOV r4, r6
    SHL r4, 3
    LDI r5, 16
    SYS MAP
    ADD r6, 1
    CMP r6, SIDE_COLS
    JLT @col
    LDI r0, spr_crouch_head         ; Sixten crouching in the ditch, in the lee
    LDI r1, 58
    LDI r2, 82
    LDI r3, 0
    SYS SPR
    LDI r0, spr_crouch_body
    LDI r2, 90
    SYS SPR
    CALL particles_side
    LDI r0, t_lee
    LDI r1, 62
    LDI r2, 62
    CALL draw_bubble
    LDI r0, 0                       ; HUD: Sixten faces east
    CALL draw_hud_info
    LDI r0, t_east
    LDI r1, 15
    LDI r2, 2
    LDI r3, font_w
    CALL draw_text
    RET

; wind from the east: streaks (even) and leaves (odd) cross the sky above the ground, never the ditch
particles_side:
    LDI r6, 0
@p:
    MOV r7, r6
    SHL r7, 1
    LD r0, [r7 + part_x]
    LD r1, [r7 + part_y]
    MOV r2, r6
    AND r2, 1
    JNZ @leaf
    SUB r0, 4
    JMP @moved
@leaf:
    SUB r0, 2
@moved:
    CMP r0, -6
    JGE @keep
    LDI r0, 132
    LD r1, [tick]
    MOV r2, r6
    MUL r2, 13
    ADD r1, r2
    MOD r1, 58
    ADD r1, 20
@keep:
    ST [r7 + part_x], r0
    ST [r7 + part_y], r1
    MOV r2, r6
    AND r2, 1
    JNZ @draw_leaf
    MOV r2, r0
    ADD r2, 5
    MOV r3, r1
    LDI r4, C_WHITE
    SYS LINE
    JMP @next
@draw_leaf:
    LD r2, [tick]                   ; leaves flutter
    SHR r2, 1
    MOV r3, r6
    MUL r3, 3
    ADD r2, r3
    AND r2, 15
    SHL r2, 1
    LD r2, [r2 + sin_t]
    SAR r2, 5
    ADD r1, r2
    LDI r2, C_ORANGE
    MOV r3, r6
    AND r3, 2
    JZ @lc
    LDI r2, C_YELLOW
@lc:
    SYS PSET
    ADD r0, 1
    SYS PSET
@next:
    ADD r6, 1
    CMP r6, N_PART
    JLT @p
    RET

; ---- scene 4: overlays -----------------------------------------------------------------------
scene_ovl:
    LD r0, [st]
    CMP r0, 0
    JNE @b
    LDI r1, ovl_a >> 16             ; overlay A -> RAM
    LDI r2, ovl_a & 0xFFFF
    LDI r3, ovl_a_end - ovl_a
    JMP @copy
@b:
    CMP r0, SCENE_FRAMES / 2
    JNE @run
    LDI r1, ovl_b >> 16             ; overlay B -> the same RAM
    LDI r2, ovl_b & 0xFFFF
    LDI r3, ovl_b_end - ovl_b
@copy:
    ST [ovl_len], r3
    LDI r0, OVL_RAM
    SYS COPY
@run:
    CALL OVL_RAM
    RET

; the header both overlays share: r0 = title string, r1 = an address inside the running overlay
ovl_header:
    PUSH r1
    LDI r1, 4
    LDI r2, 4
    LDI r3, font_w
    CALL draw_text
    LDI r0, t_ovl_addr
    LDI r1, 4
    LDI r2, 16
    LDI r3, font_w
    CALL draw_text
    MOV r1, r0
    ADD r1, 4
    POP r0
    LDI r2, 18
    LDI r3, C_YELLOW
    SYS NUM
    LD r0, [ovl_len]
    LDI r1, 4
    LDI r2, 30
    SYS NUM
    MOV r1, r0
    ADD r1, 4
    LDI r0, t_ovl_size
    LDI r2, 28
    LDI r3, font_w
    CALL draw_text
    RET

; ---- data ------------------------------------------------------------------------------------
.data
scenes:     .word scene_top, scene_map, scene_side, scene_ovl
map_parts:  .word map_part0, map_part1, map_part2, map_part3, map_part4
debris:     .word deb_leaf_o, deb_leaf_y, deb_stick, deb_twig, deb_plank
sym_routines: .word 0, sym_path_ew, sym_path_ns, sym_path_x, sym_marsh, sym_contours, sym_ditch, sym_hollow
            .word sym_house, sym_boulder, sym_fallen, sym_bridge, sym_cave, sym_lone_tree
; 16 directions: cos and sin x 64 (0 = east, 4 = north)
cos_t:      .word 64, 59, 45, 24, 0, -24, -45, -59, -64, -59, -45, -24, 0, 24, 45, 59
sin_t:      .word 0, 24, 45, 59, 64, 59, 45, 24, 0, -24, -45, -59, -64, -59, -45, -24
; where wind particles (re)appear: the edges of the playfield
spawn_x:    .word 0, 0, 0, 0, 0, 0, 127, 127, 127, 127, 20, 50, 80, 110, 40, 90
spawn_y:    .word 40, 56, 72, 90, 108, 124, 44, 64, 84, 104, 126, 126, 126, 126, 34, 34
; the map legend: SKOG ÖPPET VATTEN / HÖJD STIG MYR
legend_x:   .word 2, 39, 82, 2, 39, 82
legend_y:   .word 104, 104, 104, 116, 116, 116
legend_fill: .byte 15, 14, 8, 15, 15, 15
legend_sym: .word 0, 0, 0, sym_contours, sym_path_ew, sym_marsh
legend_txt: .word t_lg_forest, t_lg_open, t_lg_water, t_lg_hill, t_lg_path, t_lg_marsh
ovl_x:      .word 10, 30, 52, 78, 108
s_n:        .string "N"

; ---- overlays (xdata): copied to OVL_RAM and run there -----------------------------------------
.xdata
; overlay A: the whirlwind's strength scale 1-5, drawn by calling draw_tromb in ROM
ovl_a:
    LDI r0, C_NAVY
    SYS CLS
    LDI r0, 0
    LDI r1, 112
    LDI r2, 128
    LDI r3, 16
    LDI r4, C_DGREEN
    SYS RECTFILL
    LDI r0, t_ovl_a
    LDI r1, OVL_RAM + (@loop - ovl_a)   ; an address inside this overlay, as it runs
    CALL ovl_header
    LDI r0, t_ovl_scale
    LDI r1, 4
    LDI r2, 40
    LDI r3, font_w
    CALL draw_text
    LDI r6, 1
@loop:
    PUSH r6
    MOV r5, r6
    SUB r5, 1
    SHL r5, 1
    LD r0, [r5 + ovl_x]
    LDI r1, 110
    MOV r2, r6
    CALL draw_tromb
    POP r6
    PUSH r6
    MOV r5, r6
    SUB r5, 1
    SHL r5, 1
    LD r1, [r5 + ovl_x]
    SUB r1, 1
    MOV r0, r6
    LDI r2, 118
    LDI r3, C_WHITE
    SYS NUM
    POP r6
    ADD r6, 1
    CMP r6, 6
    OJ JLT, @loop
    RET
ovl_a_end:

; overlay B: the level as a minimap, 4 px per cell, from the same cell bytes (nested loops = relocated jumps)
ovl_b:
    LDI r0, C_NAVY
    SYS CLS
    LDI r0, t_ovl_b
    LDI r1, OVL_RAM + (@row - ovl_b)
    CALL ovl_header
    LDI r7, 0
@row:
    LDI r6, 0
@col:
    MOV r0, r7
    MUL r0, LV_W
    ADD r0, r6
    LDB r4, [r0 + cells]
    AND r4, 31
    LDB r4, [r4 + map_fill]
    MOV r0, r6
    SHL r0, 2
    ADD r0, 16
    MOV r1, r7
    SHL r1, 2
    ADD r1, 50
    LDI r2, 4
    LDI r3, 4
    SYS RECTFILL
    ADD r6, 1
    CMP r6, LV_W
    OJB JLT, @col
    ADD r7, 1
    CMP r7, LV_H
    OJB JLT, @row
    RET
ovl_b_end:
