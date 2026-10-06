; BO'S SKATEÄVENTYR — constants and RAM. See DESIGN.md (the specification) and levels/FORMAT.md.

; ---- colours (DawnBringer 16) ------------------------------------------------------------------
C_BLACK  = 0
C_PURPLE = 1
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
C_PEACH  = 12
C_CYAN   = 13
C_YELLOW = 14
C_WHITE  = 15

; ---- physics (DESIGN.md §3.2; the values live in the ROM table `phys`, read by the engine) ----------
; Units: 1/16 px per frame. "1 per N frames" constants are stored as the period N.
.data
phys:
PH_G:           .word 3         ; gravity
PH_JUMP_V:      .word 52        ; ollie
PH_JUMP_CUT:    .word 16        ; A released on the way up: at most this upward speed
PH_MAX_FALL:    .word 64
PH_PUSH_ACC:    .word 1
PH_PUSH_MAX:    .word 24
PH_ROLL_FRIC:   .word 4         ; 1 per 4 frames when coasting
PH_BRAKE:       .word 3
PH_SLOPE_22:    .word 1
PH_SLOPE_45:    .word 2
PH_SPEED_CAP:   .word 56
PH_POMMES_ACC:  .word 2
PH_POMMES_MAX:  .word 40
PH_POMMES_CAP:  .word 64
PH_ICE_FRIC:    .word 0         ; no rolling friction on ice
PH_ICE_BRAKE:   .word 2         ; 1 per 2 frames
PH_SAND_FRIC:   .word 1         ; 1 per frame
PH_LAUNCH_MAX:  .word 80
PH_TRICK_BOOST: .word 8
PH_BOUNCE_V:    .word 72
PH_CROUCH_FRIC: .word 2         ; crouching: 1 per 2 frames (DECISIONS D-029)
PH_AIR_ACC:     .word 2         ; steering in the air: 1 per 2 frames (DECISIONS D-029)
.code

; ---- engine constants ---------------------------------------------------------------------------
LV_ROWS   = 32
MAX_COLS  = 384
LV_REC    = 14                  ; level_table record: data hi, lo, objects offset, width (words), h0, rows, world, start, music, pad
HUD_H     = 8
VIEW_COLS = 17
STEP_UP   = 6                   ; how far the feet may step up while rolling (px); more is a wall
BOX_W_L   = 3                   ; body box: cx - 3 .. cx + 2 (6 px)
BOX_W_R   = 2
BOX_TOP   = 16                  ; standing: feet - 16 .. feet - 3 (14 px)
BOX_TOP_C = 11                  ; crouching: feet - 11 .. feet - 3 (9 px)
BOX_BOT   = 3
CAM_AHEAD = 40                  ; Bo at x 40 on screen when rolling right (88 when rolling left)
CAM_BOT   = 80                  ; vertical camera: Bo's feet at screen y 80 (dead zone ±16)
LOAD_COLS = 64                  ; terrain columns decoded per frame while loading

LIP_GRACE = 6                   ; frames after leaving a ramp in which A still adds the ollie
STOMP_V   = 40                  ; Bo bounces up this much after landing on a box, a weak block or an enemy
LOOK_AIR  = 48                  ; a landing after this many frames in the air: Bo looks back (0.8 s)
LOOK_T    = 30                  ; for 0.5 s
IDLE_POP  = 180                 ; standing still 3 s: the little trick on the spot
POP_T     = 24
IDLE_BAL  = 480                 ; 8 s: balancing on the back wheels
BUMP_T    = 30                  ; wobble after bumping into a wall
BUMP_MIN  = 8                   ; ... at this speed or more
WIII_GAP  = 300                 ; WIII! at most every 5 s
GRIND_WIII = 16                 ; a grind this long is "successful"
DEAD_T    = 60
OVER_T    = 120
GOAL_T    = 150                 ; frames from the goal flag until the level ends
BUB_T     = 90                  ; a bubble shows for 1.5 s
COMBO_T   = 60                  ; the combo name shows for 1 s
WHEEL_STEP = 16 * 16            ; a click every 16 px (1/16 px units)
MAX_CP    = 12                  ; checkpoint flags per level

; modes
M_MENU  = 0
M_LOAD  = 1
M_PLAY  = 2
M_TITLE = 3
M_INTRO = 4
M_CODE  = 5
M_MAP   = 6
M_TALLY = 7
M_CUT   = 8
; progress per game level (one byte): stars in bits 0-2
PR_PART = 8
PR_DONE = 16

; Bo's states
ST_GROUND = 0
ST_AIR    = 1
ST_GRIND  = 2
ST_DEAD   = 3
ST_OVER   = 4

; poses (what is drawn; never changes position or box, DESIGN.md §0.2)
P_RIDE    = 0
P_PUSH    = 1
P_FAST    = 2
P_BRAKE   = 3
P_POP     = 4
P_BALANCE = 5
P_LOOK    = 6
P_CROUCH  = 7
P_AIR     = 8
P_TRICK   = 9
P_OJ      = 10
P_HURT    = 11
P_GOAL    = 12
P_GRIND   = 13

; tricks (DESIGN.md §4)
TR_NONE     = 0
TR_KICKFLIP = 1
TR_SHOVEIT  = 2
TR_GRAB     = 3
TR_360      = 4
TR_GODIS    = 5
TR_GRIND    = 6
TR_SUPER    = 7
TR_OLLIE    = 8
MAX_COMBO   = 7

; class flags (class_flags table)
CF_SURF   = 1                   ; can be stood on
CF_WALL   = 2                   ; blocks the body box
CF_ONEWAY = 4                   ; only from above
CF_HMAP   = 8                   ; surface follows a height map
CF_BAR    = 16                  ; wall only in the upper half of the cell
CF_DECEL  = 32                  ; slope: accelerates down, decelerates up

NONE = $7FFF

; ---- RAM ----------------------------------------------------------------------------------------
.var lvl, MAX_COLS * LV_ROWS    ; the level, column-major: lvl[col * 32 + row] = tile code
.var tilebank, NUM_CODES * 32   ; unpacked tiles (4 bits per pixel), tile t at tilebank + 32 * t
.var attr_tab, NUM_CODES        ; attribute of every tile code in the current world
WASSET_MAX = 1024                   ; the largest world asset block (test/bo/engine.test.ts checks it)
.var wasset, WASSET_MAX          ; the current world's assets (music, boss sprites; wassets.asm)
.var wblk, WBLK_MAX              ; the current world's block (tile entries, attributes, strip, sky, own patterns)

.var mode
.var tick
.var btn                        ; buttons held this frame
.var btnp                       ; buttons pressed this frame
.var dbg_level                  ; test hook: write level + 1 to start that level
.var menu_sel

; current level
.var level
.var lv_src, LV_SRC_MAX          ; the current level's terrain and objects, unpacked from xdata
.var lv_ter
.var lv_obj
.var lv_w
.var lv_wpx                     ; width in px
.var lv_h0
.var lv_rows
.var lv_world
.var lv_start
.var lv_music
.var cur_world                  ; world whose tiles are in tilebank (0 = none)

; loader
.var ld_phase
.var ld_ptr
.var ld_col
.var ld_h
.var ld_type
.var ld_left
.var ld_i
.var ld_top
.var ld_fill
.var ld_ltop
.var ld_liq

; Bo
.var bo_x                       ; centre x, 1/16 px (unsigned 12.4)
.var bo_y                       ; feet y, 1/16 px (the first ground pixel row when grounded)
.var bo_vx
.var bo_vy
.var bo_state
.var bo_dir                     ; facing: 1 right, -1 left
.var bo_crouch
.var bo_jheld                   ; the ollie's A is still held (JUMP_CUT applies when released)
.var bo_fric_t                  ; friction period counter
.var bo_sattr                   ; attribute of the surface under the feet
.var bo_air_t                   ; frames in the air
.var bo_bump                    ; frames of the wobble after bumping into a wall

; camera (world px at the screen's top-left)
.var cam_x
.var cam_y

; scratch
.var t_cx
.var t_foot
.var t_old
.var t_dx
.var t_s
.var t_sg
.var t_hit
.var t_fl
.var pal4, 4                    ; tile unpack: palette, low nibbles
.var pal4h, 4                   ; and high nibbles

; HUD state
.var apples
.var lives

; Bo: more state (M20)
.var bo_pose
.var bo_idle_t
.var bo_look_t
.var bo_lip_t
.var bo_ollied                  ; this airtime started with an ollie (OLLIE heads the combo name)
.var f_push                     ; this frame: pushing / braking (for the pose)
.var f_brake
.var bo_kick_t                  ; push-kick animation phase
.var dead_t
.var goal_t                     ; > 0 after the goal flag
.var wheel_d                    ; distance rolled since the last wheel click (1/16 px)
.var t_scol                     ; x of the sensor that found the landing surface
.var t_plat                     ; surface(): the moving platform found (0 = the level)
.var t_sy
.var t_sattr
.var bo_plat                    ; the platform Bo stands on (valid while grounded)
.var plat_n                     ; live moving platforms (counted every frame)
.var t_pn

; tricks and combos
.var trick
.var trick_t
.var combo_pts
.var combo_n
.var combo_list, MAX_COMBO
.var combo_show_t
.var combo_x                    ; where the combo name is shown (world px)
.var combo_y
.var combo_str, 64
.var grind_t
.var wiii_t
.var score_lo                   ; score = score_hi * 10000 + score_lo
.var score_hi

; bubbles
.var font, FONT_GLYPHS * 32     ; the bubble font unpacked to 4-bit sprites
.var bub_id                     ; text id (255 = none)
.var bub_t
.var banner_id                  ; a big centred banner (255 = none)
.var banner_t

; checkpoints and goal
.var cp_n
.var cp_next
.var cp_cols, MAX_CP * 2
.var cp_rows, MAX_CP * 2
.var cp_col                     ; respawn column
.var goal_col

; power-ups (DESIGN.md §5)
PW_NONE   = 0
PW_POMMES = 1
PW_GODIS  = 2
.var pw_kind
.var pw_t
.var helmet                     ; the apple helmet (one extra hit)
.var godis_used                 ; the godissnurr of this airtime is used
.var inv_t                      ; invulnerable frames after losing the helmet
.var apples_life                ; apples towards the next extra life
.var board_sel                  ; the board Bo rides (0 = his own)
.var goal_said
.var d_x                        ; drawing Bo: sprite top-left on screen and SPR flags
.var d_y
.var d_f
MAX_FG = 8
.var fg_n
.var fg_list, MAX_FG * 4        ; column (word), bottom row, prefab

; collectibles of the current level
.var lv_stars                   ; bits 0-2
.var lv_part
.var apple_chain                ; consecutive apples: rising pitch
.var apple_chain_t

; music
.var music_track
.var voice_t, 4
.var voice_p, 4
.var voice_s, 4
.var sfx_busy, 6

; hints (FIRST10.md §5): a blinking arrow after 3 s standing still, a blinking A after 2 s against a wall
HINT_ARROW = 1
HINT_A     = 2
WALL_HINT  = 120
.var hint
.var wall_t                     ; frames standing still against a wall since bumping into it

; bosses (boss.asm)
.var boss_hits
.var boss_tx
.var boss_ty
.var boss_win_t
.var chase_stop                 ; the chase level: x px where the rabbit stops (0: no chase)
.var chase_t                    ; frames until the rabbit comes on

; enemies (actors.asm)
.var en_n
.var en_col, 80
.var en_row, 40
.var en_type, 40
.var en_st, 40                  ; 0 can appear, 1 on screen, 2 defeated (until Bo falls)
.var actors, 12 * 22
.var t_act
.var t_atop
.var bo_pfoot                   ; Bo's feet at the start of the frame
.var ev_n                       ; contact events (for the tests)
.var ev_kind
.var ev_type
.var joke_id
.var joke_t
.var joke_x
.var joke_y

; the game around the levels (screens.asm)
.var ld_after                   ; what comes after loading (0 = play, TITLE_LOAD = the title)
.var title_t
.var scene_t
.var first_done                 ; the intro has been seen
.var code_pos
.var code_v, 4
.var code_bad
.var map_world                  ; 0..4
.var map_sel                    ; game level selected on the map
.var unlocked                   ; highest game level that can be played
.var progress, 25
.var lv_apples                  ; apples of this level (for the tally)
