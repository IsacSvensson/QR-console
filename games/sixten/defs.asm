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
C_YELLOW = 14
C_WHITE  = 15

; ---- modes -----------------------------------------------------------------------------------
M_PLAY   = 0
M_SLIDE  = 1
M_MAP    = 2
M_CARD   = 3                 ; the level card before a level (until the title and world map exist, M29)

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

; ---- sound -----------------------------------------------------------------------------------
.sfx SFX_BIP, 0, 1760, 6, 10
.sfx SFX_MAP, 2, 900, 4, 5
.sfx SFX_COURSE, 1, 1320, 5, 8, -40

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
.var strbuf, 6
; test hooks (as BLACKBOX and Bo): written by tests and tools, read once per frame
.var dbg_level                      ; n + 1: start level n
.var dbg_goto                       ; cell + 1: put Sixten on that cell
.var dbg_cell                       ; cell + 1: write dbg_cell_v into it
.var dbg_cell_v
.var dbg_pw                         ; power-up + 1
