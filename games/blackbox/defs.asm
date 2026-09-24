; BLACKBOX — constants and RAM. Design: DESIGN.md, LAYOUT.md.

; ---- screen -----------------------------------------------------------------------------------
ROOM_Y      = 8             ; the room is drawn below the 8-pixel HUD row
ROOM_W_PX   = 128
ROOM_H_PX   = 120

; ---- directions (facing) and exit sides (room record order) ------------------------------------
DIR_N = 0
DIR_E = 1
DIR_S = 2
DIR_W = 3
SIDE_N = 0
SIDE_S = 1
SIDE_E = 2
SIDE_W = 3

; ---- game modes -------------------------------------------------------------------------------
M_TITLE  = 0
M_PLAY   = 1
M_DIALOG = 2
M_TERM   = 3
M_ENDING = 4

; ---- player -----------------------------------------------------------------------------------
PBOX_X = 1                  ; collision box inside the 8x8 sprite
PBOX_Y = 2
PBOX_W = 6
PBOX_H = 6
NUDGE  = 3                  ; slide round corners that are at most this many pixels off
PX_MAX = 120                ; beyond these the player leaves through a doorway
PY_MAX = 112

; ---- room record (generated: rooms.gen.asm) -----------------------------------------------------
RR_RLE   = 0
RR_EXIT  = 2                ; N, S, E, W
RR_LOCK  = 6                ; N, S, E, W
RR_WARP  = 10
RR_WFLAG = 11
RR_ZONE  = 12
RR_TSET  = 13
RR_ARRX  = 14
RR_ARRY  = 15
RR_OBJS  = 16
RR_TRIG  = 18

; ---- RAM --------------------------------------------------------------------------------------
.var mode
.var frame
.var room                   ; current room index
.var room_rec               ; address of its record
.var tileset                ; MAP tiles base for the current zone
.var floor_col
.var px                     ; player top-left, room pixels (signed)
.var py
.var pdir
.var pstep                  ; walk animation counter
.var mdx                    ; this frame's intended movement
.var mdy
.var held                   ; buttons held
.var pressed                ; buttons pressed this frame
.var flags, 8               ; 64 story flags (F_* bit numbers)
.var events, 8              ; 64 event bits: D1-D20 = 1-20, L1-L10 = 21-30, P1-P8 = 31-38
.var trig_fired             ; STEP triggers already fired in this room (bit per trigger)
.var script_pc              ; running script, 0 = none
.var script_wait            ; frames to wait before the script continues
.var dbg_room               ; TEST HOOK: room index + 1 to load at its arrival point (0 = none)
.var room_buf, 240          ; the current room, 16 x 15 tile codes

; ---- stealth (M14) ----------------------------------------------------------------------------
; actor record (words)
AC_TYPE = 0
AC_X    = 2
AC_Y    = 4
AC_DIR  = 6
AC_MODE = 8                 ; object byte a
AC_P1   = 10                ; object byte b
AC_P2   = 12                ; object byte c
AC_T    = 14                ; timer
AC_STUN = 16                ; frames left stunned
AC_ST   = 18                ; state
AC_D0   = 20                ; initial direction
AC_CNT  = 22                ; distance counter
ACT_SIZE = 24
MAX_ACT  = 8

.var enter_x                ; where the player entered the current room (restart point)
.var enter_y
.var enter_dir
.var n_actors
.var actors, MAX_ACT * ACT_SIZE
.var ai                     ; actor loop index / pointer
.var ap
.var pcx                    ; player centre cell, this frame
.var pcy
.var caught_t               ; > 0: detected, counting down to the room restart
.var det_count              ; detections so far (statistics, tests)
.var act_ran                ; 1 if the actors were updated this frame (tests)
.var ray_mode               ; 0 = check for the player, 1 = draw
.var ray_hit
.var charges                ; EMP charges
.var emp_uses               ; ORACLE profile: aggressiveness
.var room_emp               ; EMP uses in the current room (P2)
.var emp_fx                 ; EMP pulse animation

GUARD_RANGE = 7             ; cells of sight
HEAVY_RANGE = 9
DRONE_RANGE = 5
CAM_RANGE   = 8
EMP_STUN    = 240           ; frames a machine stays stunned (4 s)
EMP_R       = 40            ; EMP reach in pixels (5 tiles)
MAX_CHARGES = 4
CAUGHT_FRAMES = 45

; flags defined by the game beyond LAYOUT.md's (rooms.gen.asm: NUM_LAYOUT_FLAGS)
F_PICK0  = NUM_LAYOUT_FLAGS + 0     ; pick-up 0 (the EMP) taken
F_PICK1  = NUM_LAYOUT_FLAGS + 1     ; pick-up 1 (spare charge) taken
F_ANSWER = NUM_LAYOUT_FLAGS + 2     ; last yes/no answer
