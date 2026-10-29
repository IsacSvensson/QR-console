; NADIR - constants, RAM layout and macros. The generated files (tables, textures, bg, map) are included before
; this file, so their constants (COLS, TEX_BYTES, BG_BYTES ...) are known here.

; ---- colours (DB16) -----------------------------------------------------------------------------------
C_BLACK     = 0

; ---- render flags (dbg_flags, for A/B measurements; 0 = the default build) ----------------------------
FL_NOINTERP = 2             ; cast all 64 columns (no interpolation)
FL_NOSIL    = 4             ; no 1-px silhouettes (2-px base columns)
FL_NOVEC    = 8             ; no face-vector details
FL_NOFLOOR  = 16            ; no floor seams, light pools or ceiling glow

; ---- camera (prototype controller, camera.asm) --------------------------------------------------------
TURN_MIN    = 8             ; angle units per frame when a turn starts (0.7 degrees)
TURN_ACC    = 3             ; added every frame the turn is held
TURN_MAX    = 44            ; 3.9 degrees per frame
MOVE        = 16            ; u8.8 per frame (0.0625 cells, 3.75 cells per second)
RADIUS      = 64            ; camera collision half-size (0.25 cells)

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
.var turn_v                 ; current turn speed
.var dbg_pose               ; test hook: n > 0 sets the camera to pose n (map.gen.asm), then 0
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
.var quad, 4 * Q_SIZE       ; quadrant records
.var group_lit, 4           ; per flicker group: 1 if lit this frame
.var mat_cur, 2 * (NUM_MATS + 1)   ; per material id: address of its current mat_ent entry

; ---- ray temporaries ----------------------------------------------------------------------------------
.var cc                     ; column being cast
.var cc2                    ; cc * 2
.var ray_rec                ; address of the ray's quadrant record
.var ray_fold               ; folded angle 0..1024

; ---- column buffers (DESIGN §3.8; the tests read them) -------------------------------------------------
.var col_h, 2 * COLS        ; wall height in px (inverse depth: F256 / perpendicular distance)
.var col_face, 2 * COLS     ; cell * 4 + side
.var col_front, 2 * COLS    ; map index of the cell in front of the face
.var col_uf, 2 * COLS       ; texture u as a 0.16 fraction (already mirrored for E and N faces)
.var col_u, COLS            ; texel column 0..31
.var col_mat, COLS          ; material id
.var col_lvl, COLS          ; light level 0..7

; ---- world --------------------------------------------------------------------------------------------
MAP_CELLS = MAP_W * MAP_H
.var map, MAP_CELLS         ; material id per cell (0 = floor)
.var lmap, MAP_CELLS        ; light byte per cell (DESIGN §3.5)
.var zmap, MAP_CELLS        ; zone per cell
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
