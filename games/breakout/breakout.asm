; BREAKOUT for QR Console
; LEFT/RIGHT move the paddle, A launches the ball / restarts after GAME OVER.
.title "BREAKOUT"

; ---- constants -----------------------------------------------------------------------------
PAD_Y     = 118
PAD_W     = 20
PAD_H     = 3
PAD_SPEED = 2
BALL      = 3               ; ball is 3x3 pixels
TOP       = 9               ; top of the play field (HUD above)
BRICK_Y   = 16              ; first brick row (tilemap origin)
COLS      = 16              ; tilemap columns (8 bricks of 2 tiles)
ROWS      = 5
FIX       = 4               ; ball position/velocity are fixed point, 1/16 pixel
BALL_VY   = 22              ; 1.375 px per frame
MAX_X     = (128 - BALL) << FIX
START_LIVES = 3

ST_SERVE  = 0
ST_PLAY   = 1
ST_OVER   = 2

C_BLACK = 0
C_GRAY  = 7
C_LGRAY = 10
C_WHITE = 15
C_YELLOW = 14

; ---- sound effects: name, channel, Hz, frames, volume, sweep -----------------------------------
.sfx SFX_WALL,   0, 330, 3, 7
.sfx SFX_PADDLE, 0, 523, 5, 10
.sfx SFX_BRICK,  1, 880, 5, 10, 24
.sfx SFX_LOSE,   2, 900, 30, 12, -25
.sfx SFX_LAUNCH, 1, 440, 8, 8, 30

; ---- RAM -------------------------------------------------------------------------------------
.var state
.var score
.var lives
.var level
.var pad_x
.var bx                     ; ball x, fixed point
.var by                     ; ball y, fixed point
.var vx
.var vy
.var bricks_left
.var map, COLS * ROWS       ; brick tilemap (tile 0 = no brick)

; ---- entry points ----------------------------------------------------------------------------
init:
    CALL new_game
    RET

update:
    CALL move_paddle
    LD r0, [state]
    CMP r0, ST_SERVE
    JEQ @serve
    CMP r0, ST_PLAY
    JEQ @play
    ; game over: A restarts
    SYS BTNP
    AND r0, BTN_A
    JZ @draw
    CALL new_game
    JMP @draw
@serve:
    CALL stick_ball
    SYS BTNP
    AND r0, BTN_A
    JZ @draw
    CALL launch
    JMP @draw
@play:
    CALL move_ball
@draw:
    CALL draw
    RET

; ---- game state ------------------------------------------------------------------------------
new_game:
    LDI r0, 0
    ST [score], r0
    LDI r0, START_LIVES
    ST [lives], r0
    LDI r0, 1
    ST [level], r0
    LDI r0, (128 - PAD_W) / 2
    ST [pad_x], r0
    CALL reset_bricks
    LDI r0, ST_SERVE
    ST [state], r0
    RET

; map[i] = 1 + 2*row + (i & 1): left/right half of a brick in the row's colour
reset_bricks:
    LDI r1, 0
@loop:
    MOV r2, r1
    SHR r2, 4
    SHL r2, 1
    ADD r2, 1
    MOV r3, r1
    AND r3, 1
    ADD r2, r3
    STB [r1 + map], r2
    ADD r1, 1
    CMP r1, COLS * ROWS
    JLT @loop
    LDI r0, COLS * ROWS / 2
    ST [bricks_left], r0
    RET

; keep the ball on top of the paddle while serving
stick_ball:
    LD r0, [pad_x]
    ADD r0, (PAD_W - BALL) / 2
    SHL r0, FIX
    ST [bx], r0
    LDI r0, (PAD_Y - BALL) << FIX
    ST [by], r0
    RET

launch:
    LDI r0, 33
    SYS RND
    SUB r0, 16              ; vx in -16..16
    JNZ @nz
    LDI r0, 8
@nz:
    ST [vx], r0
    LD r0, [level]
    ADD r0, BALL_VY - 1     ; a little faster every level
    NEG r0
    ST [vy], r0
    LDI r0, ST_PLAY
    ST [state], r0
    LDI r0, SFX_LAUNCH
    SYS SFX
    RET

move_paddle:
    SYS BTN
    MOV r7, r0
    LD r1, [pad_x]
    MOV r0, r7
    AND r0, BTN_LEFT
    JZ @noleft
    SUB r1, PAD_SPEED
    CMP r1, 0
    JGE @noleft
    LDI r1, 0
@noleft:
    MOV r0, r7
    AND r0, BTN_RIGHT
    JZ @noright
    ADD r1, PAD_SPEED
    CMP r1, 128 - PAD_W
    JLE @noright
    LDI r1, 128 - PAD_W
@noright:
    ST [pad_x], r1
    RET

; ---- ball physics ----------------------------------------------------------------------------
move_ball:
    ; horizontal movement and side walls
    LD r1, [bx]
    LD r2, [vx]
    ADD r1, r2
    CMP r1, 0
    JGE @notleft
    LDI r1, 0
    CALL bounce_x
@notleft:
    CMP r1, MAX_X
    JLE @notright
    LDI r1, MAX_X
    CALL bounce_x
@notright:
    ST [bx], r1

    ; vertical movement and top wall
    LD r1, [by]
    LD r2, [vy]
    ADD r1, r2
    CMP r1, TOP << FIX
    JGE @nottop
    LDI r1, TOP << FIX
    LD r0, [vy]
    NEG r0
    ST [vy], r0
    LDI r0, SFX_WALL
    SYS SFX
@nottop:
    ST [by], r1

    CALL hit_paddle
    CALL hit_brick

    ; fell below the screen?
    LD r0, [by]
    SAR r0, FIX
    CMP r0, 128
    JLT @done
    LDI r0, SFX_LOSE
    SYS SFX
    LD r0, [lives]
    SUB r0, 1
    ST [lives], r0
    JNZ @again
    LDI r0, ST_OVER
    ST [state], r0
    RET
@again:
    LDI r0, ST_SERVE
    ST [state], r0
@done:
    RET

bounce_x:
    LD r0, [vx]
    NEG r0
    ST [vx], r0
    LDI r0, SFX_WALL
    SYS SFX
    RET

hit_paddle:
    LD r0, [vy]
    CMP r0, 0
    JLE @no                 ; only when moving down
    LD r0, [bx]
    SAR r0, FIX
    LD r1, [by]
    SAR r1, FIX
    LDI r2, BALL
    LDI r3, BALL
    LD r4, [pad_x]
    LDI r5, PAD_Y
    LDI r6, PAD_W
    LDI r7, PAD_H
    SYS OVERLAP             ; ball (r0..r3) vs paddle (r4..r7); r4 survives the syscall
    CMP r0, 0
    JEQ @no
    ; bounce up; angle depends on where the ball hit the paddle
    LD r0, [vy]
    NEG r0
    ST [vy], r0
    LDI r0, (PAD_Y - BALL) << FIX
    ST [by], r0
    LD r0, [bx]
    SAR r0, FIX
    ADD r0, BALL / 2
    SUB r0, r4
    SUB r0, PAD_W / 2       ; -11 .. +11
    MUL r0, 3
    ST [vx], r0
    LDI r0, SFX_PADDLE
    SYS SFX
@no:
    RET

; brick under the ball's centre pixel?
hit_brick:
    LD r1, [by]
    SAR r1, FIX
    ADD r1, BALL / 2        ; centre y
    SUB r1, BRICK_Y
    JLT @no
    CMP r1, ROWS * 8
    JGE @no
    SHR r1, 3               ; r1 = row
    LD r2, [bx]
    SAR r2, FIX
    ADD r2, BALL / 2
    SHR r2, 3               ; r2 = tile column
    MOV r3, r1
    SHL r3, 4
    ADD r3, r2              ; r3 = map index
    LDB r0, [r3 + map]
    CMP r0, 0
    JEQ @no
    ; remove both halves of the brick
    LDI r0, 0
    STB [r3 + map], r0
    XOR r3, 1
    STB [r3 + map], r0
    ; score += (ROWS - row) * 10
    LDI r0, ROWS
    SUB r0, r1
    MUL r0, 10
    LD r4, [score]
    ADD r4, r0
    ST [score], r4
    LD r0, [vy]
    NEG r0
    ST [vy], r0
    LDI r0, SFX_BRICK
    SYS SFX
    LD r0, [bricks_left]
    SUB r0, 1
    ST [bricks_left], r0
    JNZ @no
    ; cleared: next level
    CALL reset_bricks
    LD r0, [level]
    ADD r0, 1
    ST [level], r0
    LDI r0, ST_SERVE
    ST [state], r0
@no:
    RET

; ---- drawing ---------------------------------------------------------------------------------
draw:
    LDI r0, C_BLACK
    SYS CLS
    ; HUD
    LDI r0, s_score
    LDI r1, 1
    LDI r2, 1
    LDI r3, C_LGRAY
    SYS TEXT
    LD r0, [score]
    LDI r1, 26
    LDI r2, 1
    LDI r3, C_WHITE
    SYS NUM
    ; lives as balls in the top-right corner
    LD r4, [lives]
    LDI r1, 123
@life:
    CMP r4, 0
    JLE @lives_done
    LDI r0, spr_ball
    LDI r2, 2
    LDI r3, 0
    SYS SPR
    SUB r1, 5
    SUB r4, 1
    JMP @life
@lives_done:
    LDI r0, 0
    LDI r1, TOP - 2
    LDI r2, 128
    LDI r3, 1
    LDI r4, C_GRAY
    SYS RECTFILL
    ; bricks
    LDI r0, map
    LDI r1, tiles
    LDI r2, COLS
    LDI r3, ROWS
    LDI r4, 0
    LDI r5, BRICK_Y
    SYS MAP
    ; paddle
    LD r0, [pad_x]
    LDI r1, PAD_Y
    LDI r2, PAD_W
    LDI r3, PAD_H
    LDI r4, C_LGRAY
    SYS RECTFILL
    LDI r2, PAD_W
    LDI r3, 1
    LDI r4, C_WHITE
    SYS RECTFILL
    ; ball
    LD r1, [bx]
    SAR r1, FIX
    LD r2, [by]
    SAR r2, FIX
    LDI r0, spr_ball
    LDI r3, 0
    SYS SPR
    ; messages
    LD r0, [state]
    CMP r0, ST_PLAY
    JEQ @done
    CMP r0, ST_OVER
    JNE @press
    LDI r0, s_over
    LDI r1, 46
    LDI r2, 72
    LDI r3, C_WHITE
    SYS TEXT
@press:
    LDI r0, s_press
    LDI r1, 36
    LDI r2, 84
    LDI r3, C_YELLOW
    SYS TEXT
@done:
    RET

; ---- read-only data ----------------------------------------------------------------------------
.data
s_score: .string "SCORE"
s_over:  .string "GAME OVER"
s_press: .string "PRESS A/Z"

spr_ball: .sprite
    .f......
    fff.....
    .f......
    ........
    ........
    ........
    ........
    ........

; tile t is at tiles + 32*t; tile 0 (no brick) is never drawn, so the table starts one tile early
tiles = brick_tiles - 32
brick_tiles:
.sprite             ; 1: red, left half
    .6666666
    .6666666
    .6666666
    .6666666
    .6666666
    .4444444
    ........
    ........
.sprite             ; 2: red, right half
    6666666.
    6666666.
    6666666.
    6666666.
    6666666.
    4444444.
    ........
    ........
.sprite             ; 3: orange, left
    .9999999
    .9999999
    .9999999
    .9999999
    .9999999
    .4444444
    ........
    ........
.sprite             ; 4: orange, right
    9999999.
    9999999.
    9999999.
    9999999.
    9999999.
    4444444.
    ........
    ........
.sprite             ; 5: yellow, left
    .eeeeeee
    .eeeeeee
    .eeeeeee
    .eeeeeee
    .eeeeeee
    .9999999
    ........
    ........
.sprite             ; 6: yellow, right
    eeeeeee.
    eeeeeee.
    eeeeeee.
    eeeeeee.
    eeeeeee.
    9999999.
    ........
    ........
.sprite             ; 7: green, left
    .bbbbbbb
    .bbbbbbb
    .bbbbbbb
    .bbbbbbb
    .bbbbbbb
    .5555555
    ........
    ........
.sprite             ; 8: green, right
    bbbbbbb.
    bbbbbbb.
    bbbbbbb.
    bbbbbbb.
    bbbbbbb.
    5555555.
    ........
    ........
.sprite             ; 9: blue, left
    .8888888
    .8888888
    .8888888
    .8888888
    .8888888
    .2222222
    ........
    ........
.sprite             ; 10: blue, right
    8888888.
    8888888.
    8888888.
    8888888.
    8888888.
    2222222.
    ........
    ........
