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
LV_REC    = 12                  ; level_table record: ter, obj, width (words), h0, rows, world, start, music, pad
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

; modes
M_MENU = 0
M_LOAD = 1
M_PLAY = 2

; Bo's states
ST_GROUND = 0
ST_AIR    = 1

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

.var mode
.var tick
.var btn                        ; buttons held this frame
.var btnp                       ; buttons pressed this frame
.var dbg_level                  ; test hook: write level + 1 to start that level
.var menu_sel

; current level
.var level
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
