; PONG for QR Console — you (left) against a simple CPU (right). First to 5 wins.
; UP/DOWN move your paddle, A starts a match.
.title "PONG"

; ---- constants -----------------------------------------------------------------------------
TOP       = 10              ; play field top (score line above)
BOTTOM    = 128
PAD_H     = 16
PAD_W     = 3
PX        = 4               ; player paddle x
CX        = 121             ; CPU paddle x
BALL      = 3
FIX       = 4               ; ball position/velocity in 1/16 pixel
START_SPEED = 22
MAX_SPEED = 40
WIN       = 5
PAD_SPEED = 2
CPU_SPEED = 1
SERVE_WAIT = 45

ST_TITLE  = 0
ST_WAIT   = 1
ST_PLAY   = 2
ST_OVER   = 3

C_BG      = 5               ; dark green
C_LINE    = 11              ; green
C_WHITE   = 15
C_YELLOW  = 14
C_PEACH   = 12

.sfx SFX_PADDLE, 0, 660, 4, 10
.sfx SFX_WALL,   1, 330, 3, 6
.sfx SFX_POINT,  2, 300, 20, 12, -10
.sfx SFX_SERVE,  1, 990, 3, 6

; ---- RAM -------------------------------------------------------------------------------------
.var state
.var timer
.var p_y
.var c_y
.var bx
.var by
.var vx
.var vy
.var speed
.var serve_dir              ; +1 serve to the right, -1 to the left
.var p_score
.var c_score
.var rally                  ; paddle hits in the current match

; ---- entry -----------------------------------------------------------------------------------
init:
    LDI r0, ST_TITLE
    ST [state], r0
    LDI r0, (TOP + BOTTOM - PAD_H) / 2
    ST [p_y], r0
    ST [c_y], r0
    RET

update:
    LD r0, [state]
    CMP r0, ST_TITLE
    JEQ @start
    CMP r0, ST_OVER
    JEQ @start
    CALL move_player
    CALL move_cpu
    LD r0, [state]
    CMP r0, ST_PLAY
    JEQ @play
    ; ST_WAIT: count down, then serve
    LD r0, [timer]
    SUB r0, 1
    ST [timer], r0
    JNZ @draw
    CALL serve
    JMP @draw
@play:
    CALL move_ball
    JMP @draw
@start:
    SYS BTNP
    AND r0, BTN_A
    JZ @draw
    CALL new_match
@draw:
    CALL draw
    RET

; ---- match flow ------------------------------------------------------------------------------
new_match:
    LDI r0, 0
    ST [p_score], r0
    ST [c_score], r0
    ST [rally], r0
    LDI r0, -1
    CALL center_ball
    RET

; r0 = direction of the next serve (+1 / -1)
center_ball:
    ST [serve_dir], r0
    LDI r0, (128 - BALL) / 2 << FIX
    ST [bx], r0
    LDI r0, (TOP + BOTTOM - BALL) / 2 << FIX
    ST [by], r0
    LDI r0, 0
    ST [vx], r0
    ST [vy], r0
    LDI r0, SERVE_WAIT
    ST [timer], r0
    LDI r0, ST_WAIT
    ST [state], r0
    RET

serve:
    LDI r0, START_SPEED
    ST [speed], r0
    LD r1, [serve_dir]
    MUL r0, r1
    ST [vx], r0
    LDI r0, 25
    SYS RND
    SUB r0, 12              ; vy in -12..12
    ST [vy], r0
    LDI r0, ST_PLAY
    ST [state], r0
    LDI r0, SFX_SERVE
    SYS SFX
    RET

; ---- paddles ---------------------------------------------------------------------------------
move_player:
    SYS BTN
    MOV r2, r0
    LD r1, [p_y]
    AND r0, BTN_UP
    JZ @noup
    SUB r1, PAD_SPEED
@noup:
    MOV r0, r2
    AND r0, BTN_DOWN
    JZ @nodown
    ADD r1, PAD_SPEED
@nodown:
    MOV r0, r1
    CALL clamp_paddle
    ST [p_y], r0
    RET

; CPU: when the ball comes towards it and is past the middle, follow it; otherwise drift to the centre.
move_cpu:
    LD r1, [c_y]
    LDI r2, (TOP + BOTTOM - PAD_H) / 2   ; default target: centre
    LD r0, [vx]
    CMP r0, 0
    JLE @go
    LD r0, [bx]
    SAR r0, FIX
    CMP r0, 60
    JLT @go
    LD r2, [by]
    SAR r2, FIX
    SUB r2, (PAD_H - BALL) / 2
@go:
    CMP r1, r2
    JEQ @store
    JLT @down
    SUB r1, CPU_SPEED
    JMP @store
@down:
    ADD r1, CPU_SPEED
@store:
    MOV r0, r1
    CALL clamp_paddle
    ST [c_y], r0
    RET

; r0 = paddle y, clamped to the play field
clamp_paddle:
    CMP r0, TOP
    JGE @low_ok
    LDI r0, TOP
@low_ok:
    CMP r0, BOTTOM - PAD_H
    JLE @high_ok
    LDI r0, BOTTOM - PAD_H
@high_ok:
    RET

; ---- ball ------------------------------------------------------------------------------------
move_ball:
    LD r1, [bx]
    LD r2, [vx]
    ADD r1, r2
    ST [bx], r1
    LD r1, [by]
    LD r2, [vy]
    ADD r1, r2
    CMP r1, TOP << FIX
    JGE @not_top
    LDI r1, TOP << FIX
    CALL flip_vy
@not_top:
    CMP r1, (BOTTOM - BALL) << FIX
    JLE @not_bottom
    LDI r1, (BOTTOM - BALL) << FIX
    CALL flip_vy
@not_bottom:
    ST [by], r1

    ; paddle collisions
    LD r0, [vx]
    CMP r0, 0
    JGE @right_side
    LDI r4, PX
    LD r5, [p_y]
    CALL ball_hits          ; r0 = 1 if the ball overlaps the paddle at (r4, r5)
    CMP r0, 0
    JEQ @scoring
    LDI r0, 1
    LDI r1, (PX + PAD_W) << FIX
    CALL bounce
    JMP @scoring
@right_side:
    LDI r4, CX
    LD r5, [c_y]
    CALL ball_hits
    CMP r0, 0
    JEQ @scoring
    LDI r0, -1
    LDI r1, (CX - BALL) << FIX
    CALL bounce

@scoring:
    LD r0, [bx]
    SAR r0, FIX
    CMP r0, -BALL
    JLT @cpu_point
    CMP r0, 128
    JGE @player_point
    RET
@cpu_point:
    LD r0, [c_score]
    ADD r0, 1
    ST [c_score], r0
    LDI r0, -1              ; serve towards the player who lost the point
    JMP @point
@player_point:
    LD r0, [p_score]
    ADD r0, 1
    ST [p_score], r0
    LDI r0, 1
@point:
    CALL center_ball
    LDI r0, SFX_POINT
    SYS SFX
    LD r0, [p_score]
    CMP r0, WIN
    JEQ @over
    LD r0, [c_score]
    CMP r0, WIN
    JEQ @over
    RET
@over:
    LDI r0, ST_OVER
    ST [state], r0
    ; a short two-note jingle on both square channels
    LDI r0, 0
    LDI r1, 523
    LDI r2, 20
    LDI r3, 10
    SYS SOUND
    LDI r0, 1
    LDI r1, 784
    SYS SOUND
    RET

flip_vy:
    LD r0, [vy]
    NEG r0
    ST [vy], r0
    LDI r0, SFX_WALL
    SYS SFX
    RET

; paddle at (r4, r5) -> r0 = 1 if the ball overlaps it
ball_hits:
    LD r0, [bx]
    SAR r0, FIX
    LD r1, [by]
    SAR r1, FIX
    LDI r2, BALL
    LDI r3, BALL
    LDI r6, PAD_W
    LDI r7, PAD_H
    SYS OVERLAP
    RET

; r0 = new horizontal direction, r1 = ball x after the bounce, r5 = paddle y
bounce:
    ST [bx], r1
    MOV r2, r0
    LD r0, [speed]
    ADD r0, 1
    CMP r0, MAX_SPEED
    JLE @ok
    LDI r0, MAX_SPEED
@ok:
    ST [speed], r0
    MUL r0, r2
    ST [vx], r0
    ; vertical speed from where the ball hit the paddle: -18 .. +18
    LD r0, [by]
    SAR r0, FIX
    ADD r0, BALL / 2
    SUB r0, r5
    SUB r0, PAD_H / 2
    MUL r0, 2
    ST [vy], r0
    LD r0, [rally]
    ADD r0, 1
    ST [rally], r0
    LDI r0, SFX_PADDLE
    SYS SFX
    RET

; ---- drawing ---------------------------------------------------------------------------------
draw:
    LDI r0, C_BG
    SYS CLS
    ; score line and dashed net
    LDI r0, 0
    LDI r1, TOP - 1
    LDI r2, 127
    LDI r3, TOP - 1
    LDI r4, C_LINE
    SYS LINE
    LDI r5, TOP + 2
@net:
    LDI r0, 64
    MOV r1, r5
    LDI r2, 64
    MOV r3, r5
    ADD r3, 3
    SYS LINE
    ADD r5, 8
    CMP r5, BOTTOM
    JLT @net
    ; scores
    LDI r0, s_you
    LDI r1, 2
    LDI r2, 2
    LDI r3, C_PEACH
    SYS TEXT
    LDI r0, s_cpu
    LDI r1, 115
    SYS TEXT
    LD r0, [p_score]
    LDI r1, 54
    LDI r3, C_WHITE
    SYS NUM
    LD r0, [c_score]
    LDI r1, 71
    SYS NUM
    ; paddles
    LDI r0, PX
    LD r1, [p_y]
    LDI r2, PAD_W
    LDI r3, PAD_H
    LDI r4, C_WHITE
    SYS RECTFILL
    LDI r0, CX
    LD r1, [c_y]
    SYS RECTFILL
    ; ball / messages
    LD r0, [state]
    CMP r0, ST_TITLE
    JEQ @title
    CMP r0, ST_OVER
    JEQ @over
    LD r0, [bx]
    SAR r0, FIX
    LD r1, [by]
    SAR r1, FIX
    LDI r2, BALL
    LDI r3, BALL
    LDI r4, C_YELLOW
    SYS RECTFILL
    RET
@title:
    LDI r0, s_title
    LDI r1, 57
    LDI r2, 50
    LDI r3, C_WHITE
    SYS TEXT
    JMP @press
@over:
    LDI r0, s_win
    LD r1, [p_score]
    CMP r1, WIN
    JEQ @msg
    LDI r0, s_lose
@msg:
    LDI r1, 48
    LDI r2, 50
    LDI r3, C_WHITE
    SYS TEXT
@press:
    LDI r0, s_press
    LDI r1, 46
    LDI r2, 70
    LDI r3, C_YELLOW
    SYS TEXT
    RET

.data
s_you:   .string "YOU"
s_cpu:   .string "CPU"
s_title: .string "PONG"
s_win:   .string "YOU WIN"
s_lose:  .string "CPU WINS"
s_press: .string "PRESS A"
