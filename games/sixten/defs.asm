; SIXTENS EXPEDITION — constants and RAM. See DESIGN.md (§3 views, §4 cells, §5 compass, §10 HUD).

; ---- colours (DawnBringer 16) ----------------------------------------------------------------
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
C_CYAN   = 13
C_YELLOW = 14
C_WHITE  = 15

; ---- modes -----------------------------------------------------------------------------------
M_PLAY   = 0
M_SLIDE  = 1
M_MAP    = 2
M_CARD   = 3                 ; the level card before a level (until the title and world map exist, M29)
M_SIDE   = 4                 ; a side view: its engine is a code overlay at OVL_RAM
M_TITLE  = 5
M_WMAP   = 6                 ; the world map (with the save code)
M_PAGE   = 7                 ; a nature-book page over the play screen
M_TALLY  = 8                 ; after the goal
M_BOOK   = 9                 ; the nature book (from the world map)
M_END    = 10                ; the ending

; ---- layout ----------------------------------------------------------------------------------
PLAY_Y   = 32               ; HUD: two rows of 16 px; the playfield is 4 x 3 cells = 128 x 96
SCR_TC   = 16               ; tiles per screen: 16 columns x 12 rows
SCR_TR   = 12
SCR_W    = 128
SCR_H    = 96
TB_COLS  = 32               ; the tile buffer holds two screens side by side or stacked (the slide)
TB_ROWS  = 24
SLIDE_STEP = 8              ; px per frame: horizontal slides take 16 frames, vertical 12
MAX_CELLS = 24 * 15
MAP_CELL = 5                ; the map screen: 5 px per cell
MAP_Y    = 20

; Sixten: the position is his feet (bottom centre), 12.4 fixed point px; the box is x-3..x+2, y-3..y
FEET_DY  = 20               ; feet this far into a cell when placed on it
FACE_DN  = 0
FACE_UP  = 1
FACE_RT  = 2
FACE_LT  = 3
HEARTS   = 5
PW_NONE  = 0
PW_CUCUMBER = 1
PW_CHIPS = 2
PW_CHOCOLATE = 3

; the whirlwind (DESIGN §6); WARN_FRAMES, STEP_FRAMES, TURN_FRAMES come from levels.gen.asm
WH_NONE  = 0
WH_WARN  = 1                ; phases 1-2: clouds and wind, strength 0
WH_ACTIVE = 2               ; it grows, moves along its legs, waits at waypoints
WH_DYING = 3                ; phase 6: one strength step down per STEP_FRAMES
DANGER_S = 3                ; strength from which it hurts inside its radius
EXPO_FRAMES = 20            ; frames inside the radius, unsheltered, before AJ!
BRANCH_FRAMES = 60          ; a branch's shadow shows this long before it falls (forest, wind >= 3)
STILL_CROUCH = 30           ; frames standing still in shelter before Sixten crouches
INV_FRAMES = 120            ; after AJ!
N_PART   = 24
; whirlwind record (8 B), waypoint record (WP_REC B), change (4 B)
WR_TRIG  = 0
WR_NWP   = 1
WR_NCHG  = 2
WR_WPS   = 4
WR_CHG   = 6
WP_X     = 0
WP_Y     = 2
WP_S     = 4
WP_DIR   = 5
WP_WAIT  = 6
WP_N     = 8
WP_QX    = 10
WP_QY    = 12
WP_RX    = 14
WP_RY    = 16
WP_SX    = 18
WP_SY    = 19

; level record (levels.gen.asm)
LR_HI    = 0
LR_LO    = 2
LR_W     = 4
LR_H     = 5
LR_SC    = 6
LR_SR    = 7
LR_GC    = 8
LR_GR    = 9
LR_NCTRL = 10
LR_WORLD = 11
LR_NAME  = 12
LR_CTRLS = 14
LR_WHIRLS = 16
LR_NWHIRL = 18
LR_FLAGS = 19                ; bit 0 fog, bit 1 night (DESIGN §5)
LR_LINKS = 20
LR_NLINK = 22
LR_OBJS  = 24
LR_NOBJ  = 26
LR_EVENTS = 28
LR_NEV   = 30
STREAM_FRAMES = 20          ; frames in flowing water before AJ! (S8)
THUNDER_FRAMES = 30         ; frames exposed to lightning before AJ! (S4)
FOG_WIN  = 56               ; what can be seen in fog or at night: a square round Sixten
; objects (OBJ_REC B): kind, column, row, argument, target cell
OB_KIND  = 0
OB_C     = 1
OB_R     = 2
OB_ARG   = 3
OB_TGT   = 4
OK_ITEM  = 1
OK_ENTRY = 2
OK_BUILD = 3
PW_FRAMES = 900             ; a power-up lasts 15 s
MAX_HARVEST = 8
WORLDS   = 5
; side link (8 B) and side view record (16 B), levels.gen.asm
SL_CELL  = 0
SL_SIDE  = 2
SL_NEEDS = 3                ; 0, or the cell type + 1 the link needs
SL_EXITL = 4
SL_EXITR = 6
SR_HI    = 0
SR_LO    = 2
SR_COLS  = 4
SR_SKY   = 5
SR_RIGHT = 6
SR_WIND  = 8
SR_SX    = 10
SR_SY    = 12

; ---- the side view (DESIGN §3.2) -------------------------------------------------------------
OVL_RAM  = 0xE000           ; code overlays run here (D-040); RAM variables stay far below
SIDE_Y   = 16               ; the side view is drawn under a 16 px HUD row
SD_WALK  = 16               ; 1/16 px per frame
SD_CLIMB = 12
SD_GRAV  = 3                ; 1/16 px per frame per frame
SD_JUMP  = -46              ; jump speed; releasing A early cuts it to SD_CUT
SD_CUT   = -16
SD_FALL  = 64
SD_H     = 14               ; body height (standing); 9 crouching
SD_HC    = 9

; ---- sound -----------------------------------------------------------------------------------
.sfx SFX_BIP, 0, 1760, 6, 10
.sfx SFX_MAP, 2, 900, 4, 5
.sfx SFX_COURSE, 1, 1320, 5, 8, -40
.sfx SFX_AJ, 0, 660, 12, 12, -30
.sfx SFX_PLING, 0, 1568, 10, 9, 40
.sfx SFX_POWER, 0, 880, 16, 10, 60
.sfx SFX_WOOD, 2, 400, 6, 10
.sfx SFX_BUILD, 0, 523, 14, 10, 30
.sfx SFX_GOAL, 0, 1047, 24, 11, 20
.sfx SFX_CREAK, 2, 160, 10, 7, -6
.sfx SFX_CHANGE, 2, 300, 20, 10, -8

; ---- RAM -------------------------------------------------------------------------------------
.var mode
.var tick
.var level                          ; index into level_table
.var lv_ptr                         ; its record
.var lv_w                           ; size in cells
.var lv_h
.var cells, MAX_CELLS               ; the cell map (DESIGN §4.1), unpacked from xdata; row-major
.var tbuf, TB_COLS * TB_ROWS        ; tiles, column-major: tbuf[col * TB_ROWS + row]
.var font_w, FONT_GLYPHS * 32       ; bubble font, white ink (HUD)
.var font_d, FONT_GLYPHS * 32       ; bubble font, navy ink (map)
.var px                             ; Sixten's feet, 12.4 fixed point
.var py
.var face
.var walk_t
.var moving
.var btn
.var cell_i                         ; the cell under his feet (index), 0xFFFF = none yet
.var scr_c                          ; the screen he is on
.var scr_r
.var camx                           ; top-left of the view, world px
.var camy
.var bufx                           ; world px of the tile buffer's column 0 / row 0
.var bufy
.var slide_dx
.var slide_dy
.var slide_n
.var stamped                        ; controls stamped (bit k = control k+1)
.var n_stamped
.var hearts
.var wood
.var pw                             ; active power-up
.var you_here                       ; 1 = the map may show where he is (DESIGN §5)
.var course_set
.var course_dir                     ; 0 = east, 4 = north … (16ths of a turn, anticlockwise)
.var course_ctrl
.var steps                          ; cells walked since the course was set
.var map_t                          ; frames since the map screen opened (parts 0-4 draw it)
.var map_sel                        ; selected control on the map
.var map_k                          ; map_part3: control loop
.var card_sel                       ; the level card: chosen level
.var pairtab, 4                     ; unpack_font: the four pixel pairs
.var map_x0
.var npts
.var pts_x, 20
.var pts_y, 20
.var pts_n, 10
.var ex_c0                          ; expand: arguments
.var ex_r0
.var ex_dc
.var ex_dr
.var ex_cell
.var ex_pat
.var nx                             ; try_x / try_y
.var ny
.var bx
.var by
.var cx0                            ; draw_compass / circle
.var cy0
.var c_dir
.var circ_r
.var circ_col
.var tmp0
.var stamp_k                        ; stamp: the control just stamped + 1
.var last_cell                      ; where AJ! puts him back: the last stamped control (or the start)
.var still_t                        ; frames standing still
.var sheltered                      ; 1 = standing still in a shelter cell (ditch, hollow, cabin)
.var danger                         ; 1 = inside the radius of a whirlwind of strength >= DANGER_S
.var expo                           ; frames in danger without shelter
.var branch_t                       ; frames under a falling branch (forest, wind >= 3)
.var inv_t                          ; frames of safety after AJ!
.var n_aj                           ; AJ! count (tests)
.var wh_state
.var wh_idx                         ; which whirlwind of the level
.var wh_wps                         ; its waypoints
.var wh_chg                         ; its changes
.var wh_nchg
.var wh_t                           ; its own clock: frames since its trigger (the map pauses it)
.var wh_x                           ; centre (foot), 1/16 px
.var wh_y
.var wh_ex                          ; remainders of the leg's steps
.var wh_ey
.var wh_s                           ; strength 0-5
.var wh_st                          ; frames since the last strength step
.var wh_wp                          ; the waypoint it left or waits at
.var wh_leg                         ; frames left on the leg (0 = at a waypoint)
.var wh_wait                        ; frames left waiting
.var wh_wind                        ; the wind's direction (16ths of a turn, 0 = east, 4 = north)
.var wh_pending                     ; bit k: whirlwind k triggered, waiting for its turn
.var wh_started                     ; bit k: whirlwind k has started
.var wh_dirty                       ; a cell changed: expand the view again
.var bend_on                        ; grass bends towards the whirlwind (strength >= 2)
.var bend_prev
.var dt_x                           ; draw_tromb arguments
.var dt_y
.var dt_s
.var dt_l
.var part_x, N_PART * 2
.var part_y, N_PART * 2
.var strbuf, 6
; test hooks (as BLACKBOX and Bo): written by tests and tools, read once per frame
.var sbuf, 96 * SIDE_ROWS            ; the side view's tiles, column-major: sbuf[col * SIDE_ROWS + row]
.var sd_link                        ; the side link Sixten came through
.var sd_rec                         ; its side view record
.var sd_cols
.var sd_wind                        ; 1/16 px per frame, + = to the right
.var sd_right                       ; compass direction of the right edge (16ths)
.var sd_x                           ; feet (bottom centre), 1/16 px; the body is x-3..x+2, y-14..y-1
.var sd_y
.var sd_vy
.var sd_face                        ; 0 right, 1 left
.var sd_ground
.var sd_climb
.var sd_crouch
.var sd_lee                         ; 1 = something solid upwind covers him (DESIGN §6.5): the wind does not push
.var sd_btn
.var sd_btnp
.var sd_cam
.var sd_dx                          ; this frame's walking step (tests)
.var sd_dir                         ; the compass arrow: the way he faces (16ths)
.var ovl_loaded                     ; which overlay is in OVL_RAM (1 = the side view)
.var map_ret                        ; the mode the map returns to
.var pw_t                           ; frames left of the power-up
.var obj_taken                      ; bit k: object k taken (a power-up) or built (a site)
.var harvest, MAX_HARVEST * 2       ; fallen trees already taken wood from (cell + 1)
.var n_harvest
.var face_cell                      ; the cell Sixten faces
.var a_label                        ; what A does now (a text)
.var o_mask                         ; the level's obligatory controls (bits)
.var world                          ; the world on the map (1-5, 6 = the game is done)
.var wm_sel                         ; the world map: the chosen level of the world
.var lv_done, 4                     ; levels done: one bit per level index (up to 32)
.var lv_goals, 32                   ; per level index: bit 0 done, 1 all controls, 2 every entry
.var book, 5                        ; the nature book: bit k-1 = entry k found
.var page_e                         ; the page being read: entry, page
.var page_n
.var page_new                       ; 1 = found just now
.var nbuf, 140                      ; its pages, unpacked
.var code_bits, 8
.var code_str, 11                   ; the save code as glyphs (255-terminated)
.var mus_t                          ; music: frames to the next step, the step
.var mus_i
.var sel_keep
.var ev_t, 16                       ; per event: frames since it started (0xFFFF = not yet)
.var ev_done                        ; bit k: event k has happened
.var ev_warn                        ; bit k: event k shows its warning now
.var stream_t                       ; frames in flowing water
.var lightning                      ; 1 = a thunderstorm's lightning is on (DESIGN §6.6)
.var thunder_t                      ; frames exposed to it
.var tally_c                        ; the tally: controls, entries of the level found, entries in it
.var tally_e
.var tally_n
.var dbg_level                      ; n + 1: start level n
.var dbg_goto                       ; cell + 1: put Sixten on that cell
.var dbg_cell                       ; cell + 1: write dbg_cell_v into it
.var dbg_cell_v
.var dbg_pw                         ; power-up + 1
