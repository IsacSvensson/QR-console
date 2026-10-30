; NADIR - constants, RAM layout and macros. The generated files (tables, textures, bg, map) are included before
; this file, so their constants (COLS, TEX_BYTES, BG_BYTES ...) are known here.

; ---- colours (DB16) -----------------------------------------------------------------------------------
C_BLACK     = 0

; ---- render flags (dbg_flags, for A/B measurements; 0 = the default build) ----------------------------
FL_NOINTERP = 2             ; cast all 64 columns (no interpolation)
FL_NOSIL    = 4             ; no 1-px silhouettes (2-px base columns)
FL_NOVEC    = 8             ; no face-vector details
FL_NOFLOOR  = 16            ; no floor seams, light pools or ceiling glow
FL_NOWIDE   = 32            ; interpolation from neighbours 1 away only (cast every even column, M26)
FL_NOPACE   = 64            ; never split an image over two frames (DESIGN §3.11)
FL_NOSPR    = 128           ; no sprites (the occlusion test)

; ---- doors (DESIGN §3.10): the door table entry -------------------------------------------------------
D_CELL      = 0             ; map index (word)
D_OPEN      = 2             ; 0..256 (word)
D_STATE     = 4             ; 0 closed, 1 opening, 2 open, 3 closing
D_TIMER     = 5
D_ORIENT    = 6             ; 1: the plane x = cx + 1/2, 0: y = cy + 1/2
D_KEY       = 7             ; key bit, 0 = none
D_MAT       = 8             ; material drawn (door or locked door)
DOOR_SIZE   = 16

; ---- props (DESIGN §3.12): the prop table entry ---------------------------------------------------------
P_X         = 0             ; u8.8
P_Y         = 2
P_TYPE      = 4             ; sprite type (sprites.gen.asm)
P_ALIVE     = 5             ; 0 once picked up
PROP_SIZE   = 8

; ---- quadrant record (ray.asm): one per quadrant of the ray angle --------------------------------------
Q_STEPX     = 0             ; +1 / -1 (map index step for an x step)
Q_STEPY     = 2             ; +32 / -32
Q_MX        = 4             ; multiplier of dX for the first x crossing (256 - fx or fx)
Q_MY        = 6
Q_SIZE      = 32            ; (fields from 8 on: ray.asm)

; ---- game state ---------------------------------------------------------------------------------------
.var tick                   ; frames since start
.var btn                    ; buttons held this frame
.var btnp                   ; buttons pressed this frame
.var cam_x                  ; u8.8
.var cam_y
.var cam_a                  ; u12
.var walk_v                 ; forward speed, u8.8 per frame (signed; DESIGN §5)
.var turn_k                 ; frames the turn has been held
.var turn_dir               ; -1 left, 1 right, 0 none
.var tap_dir                ; the last registered tap (-1, 1) for the double tap, 0 none
.var tap_tick               ; its frame
.var dash_n                 ; frames of side step left
.var dash_dir               ; -1 left, 1 right
.var bob_ph                 ; head bob phase
.var ctl_s1                 ; 1: control scheme S1 (B = strafe modifier)
.var opt_nobob              ; 1: no head bob
.var keys                   ; key bits held
.var doors, 16 * DOOR_SIZE  ; the door table
.var props, 32 * PROP_SIZE  ; the prop table: the static props, then one entry per enemy (DESIGN §6.3)
.var picked_med             ; pickups collected
.var picked_ammo
.var pvs_img, 3             ; props that may be seen from the image's camera cell (DESIGN §3.12)
.var pnear, 3               ; props near the player's cell (collision, pickups)
.var bk_x                   ; blocked: the box centre being tested
.var bk_y
.var dbg_pose               ; test hook: n > 0 sets the player to pose n (map.gen.asm), at rest, then 0
.var dbg_flags              ; test hook: FL_* render flags
.var dbg_sentinel           ; test hook: colour of the CLS before drawing (0 normally)

; ---- per frame ----------------------------------------------------------------------------------------
.var cam_cell               ; map index of the camera cell
.var cam_fx8                ; (cam_x & 255) << 8
.var cam_fy8
.var cam_zone               ; zone of the camera cell (background tiles)
.var cam_c8                 ; cos(cam_a), s.8
.var cam_s8                 ; sin(cam_a), s.8
.var bob                    ; horizon offset in px
.var hor                    ; HORIZON + bob
; ---- the image being rendered (DESIGN §3.11): the camera when its rays were cast, used by the drawing, which
; may run one frame later
.var rcam_x
.var rcam_y
.var rcam_a
.var rcam_c8
.var rcam_s8
.var rcam_c12               ; cos and sin of rcam_a, s1.12
.var rcam_s12
.var rbob
.var rtick
.var rflash                 ; FLASH_LIGHT if the muzzle flash lights this image, else 0
.var pace                   ; 1: the rays of this image are cast, it is drawn next frame
.var mcount                 ; columns with a masked plane in this image
.var ncast                  ; rays cast for this image
.var quad, 4 * Q_SIZE       ; quadrant records
.var group_lit, 4           ; per flicker group: 1 if lit this frame
.var mat_cur, 2 * (NUM_MATS + 1)   ; per material id: address of its current mat_ent entry

; ---- ray temporaries ----------------------------------------------------------------------------------
.var cc                     ; column being cast
.var cc2                    ; cc * 2
.var ray_rec                ; address of the ray's quadrant record
.var ray_fold               ; folded angle 0..1024

; ---- column buffers (DESIGN §3.8; the tests read them) -------------------------------------------------
; Two layers with the same layout: the solid wall, then LAYER bytes on the first masked plane (DESIGN §3.10), so
; the same code fills either layer with its index moved by LAYER.
LAYER = 14 * COLS
.var colbuf, 2 * LAYER
col_h     = colbuf          ; wall height in px (inverse depth: F256 / perpendicular distance)
col_face  = col_h + 2 * COLS    ; cell * 4 + side (masked layer: -1 = no masked plane)
col_front = col_face + 2 * COLS ; map index of the cell in front of the face
col_uf    = col_front + 2 * COLS ; texture u as a 0.16 fraction (already mirrored for E and N faces)
col_u     = col_uf + 2 * COLS   ; texel column 0..31
col_mat   = col_u + COLS        ; material id
col_lvl   = col_mat + COLS      ; light level 0..7
col_h8    = col_lvl + COLS      ; 8 h (three fraction bits: interpolation)
col_mh    = col_h + LAYER       ; the masked layer
col_mface = col_face + LAYER
col_mfront = col_front + LAYER
col_mu    = col_u + LAYER
col_mmat  = col_mat + LAYER
col_mlvl  = col_lvl + LAYER

; ---- world --------------------------------------------------------------------------------------------
MAP_CELLS = MAP_W * MAP_H
.var map, MAP_CELLS         ; DESIGN §3.10 byte per cell (0 = floor)
.var lmap, LIGHT_CELLS      ; light byte per cell (DESIGN §3.5), the rows down to the last open one
.var zmap, LIGHT_CELLS      ; zone per cell, likewise
.var texram, TEX_BYTES      ; textures (from xdata)
.var coderam, CODE_BYTES    ; compiled LOD 0 texture columns (from xdata; this code runs from RAM)
.var bgram, BG_BYTES        ; floor/ceiling tiles (from xdata)

; ---- macros -------------------------------------------------------------------------------------------

; dst = (src * m) >> 8 for src u8.8 (< 64 cells) and m <= 256, without overflow (byte-split multiply).
; dst, src, m and tmp are four different registers; src and m are preserved.
.macro MULQ8 dst, src, m, tmp
    MOV dst, src
    SHR dst, 8
    MUL dst, m
    MOV tmp, src
    AND tmp, 255
    MUL tmp, m
    SHR tmp, 8
    ADD dst, tmp
.endm

; COPY len bytes from the far (xdata) label src into RAM at dest.
.macro FARCOPY dest, src, len
    MOV r0, dest
    MOV r1, src >> 16
    MOV r2, src & 0xFFFF
    MOV r3, len
    SYS COPY
.endm
