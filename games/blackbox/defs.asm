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
.var ch_dx                  ; chase: distance to the target
.var ch_dy

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
F_ENDING = NUM_LAYOUT_FLAGS + 3     ; the final action has happened (<PCT> shows before -> after)
F_LIVE   = NUM_LAYOUT_FLAGS + 4     ; the HUD shows the live ORACLE figure (from 6.1)
F_TRUE   = NUM_LAYOUT_FLAGS + 5     ; always set (S_PRED p, F_TRUE = hit)
F_FALSE  = NUM_LAYOUT_FLAGS + 6     ; never set
F_ROOM_EMP = NUM_LAYOUT_FLAGS + 7   ; the EMP was used in the current room (P2)
F_P4OK   = NUM_LAYOUT_FLAGS + 8     ; boss 1: first panel hacked in the first turn window
F_P5OK   = NUM_LAYOUT_FLAGS + 9     ; (unused)
F_HACKED = NUM_LAYOUT_FLAGS + 10    ; the last S_HACK succeeded
F_P6READ = NUM_LAYOUT_FLAGS + 11    ; 6.1: the player used the terminal (P6)

; ---- bosses (M17) -----------------------------------------------------------------------------
BOSS_RANGE    = 15          ; boss 1's line of sight
BOSS_PULSE    = 40          ; frames between its pulses
BOSS_TURN     = 120         ; frames its back stays turned
BOSS_WAKE     = 60          ; frames boss 1 needs to power up after the player comes in
BOSS_BODY     = 14          ; contact box of a 16x16 boss, centred on its cell
BOSS_BODY_OFS = 3
SPR_BOSS      = 15          ; boss sprites: 4 per boss (TL, TR, BL, BR)
BOX_MENU      = 2

.var room_det               ; detections in this room since entering it (not reset by a restart)
.var menu_sel
.var menu_choice

; ---- text and the ORACLE engine (M15) ---------------------------------------------------------
BOX_Y       = 84            ; dialogue box: header row + 5 text rows
BOX_SAY     = 0
BOX_ASK     = 1
BARK_FRAMES = 150
BASE_ACCURACY = 974         ; ORACLE's historical record: 97.4 % (DESIGN.md §2.2)
CH_DELETE  = 0
CH_RELEASE = 1
CH_LISTEN  = 2

.var text_buf, 720          ; decoded dialogue box / terminal page
.var bark_buf, 96
.var num_buf, 8
.var txt_src
.var pct_seq
.var n_seq
.var box_kind
.var box_spk
.var box_len
.var reveal
.var bark_t
.var bark_spk
.var term_log
.var term_page
.var term_pages
.var pred_done              ; bit p-1: prediction p resolved
.var pred_hit               ; bit p-1: prediction p came true
.var pred_misses
.var logs_read              ; ORACLE profile: curiosity
.var mira_followed          ; ORACLE profile: compliance
.var final_guess            ; CH_* forecast of the final choice
.var pct_before             ; accuracy just before the last action
.var code_bits, 6           ; access code bit stream (40 bits)
.var code_pos
.var code_text, 10          ; the 8-character code + 0
.var dbg_oracle             ; TEST HOOK: 1 = recompute the ORACLE values and render "<PCT> <N>/<N> <X>" 
