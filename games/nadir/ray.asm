; NADIR - the raycaster (DESIGN §3.2-3.5): 64 sample columns, DDA on the map grid with half-step angle tables.
; Per column it stores the wall height (one DIV: F256 / cos(offset) / t), the face, the cell in front, the
; material and the texture u. Depth is kept as the height h (inverse depth): the light rule and the sprites use it.
; Thin cells (DESIGN §3.10): doors are a plane through the cell centre that a ray passes where the door is open;
; the first masked plane is recorded in the masked layer of the column buffers (LAYER bytes further on) and the
; ray goes on to a solid wall. Both are handled off the 7-instruction DDA loop, only when a ray enters such a cell.
.code

; quadrant record fields (Q_STEPX .. Q_MY are in defs.asm)
Q_FMASK = 8                         ; 0 or 1023: folds the angle within the quadrant (one XOR)
Q_XSIDE = 10                        ; face of an x hit: 0 W or 1 E
Q_XSGN  = 12                        ; sign of sin (1 or -1): direction of the hit along y
Q_XMIR  = 14                        ; 0 or -1: mirror u (east faces)
Q_YSIDE = 16                        ; face of a y hit: 2 N or 3 S
Q_YSGN  = 18                        ; sign of cos
Q_YMIR  = 20                        ; 0 or -1: mirror u (north faces)

.var ray_mir                        ; mirror mask of the hit (0 or -1)
.var th_in                          ; thin cell entered by an x step (0) or a y step (1)
.var th_byte                        ; its map byte
.var th_door                        ; its door table entry, 0 for a masked cell
.var th_t                           ; distance to its plane
.var sv1                            ; the DDA registers r1-r5 while a masked plane is recorded
.var sv2
.var sv3
.var sv4
.var sv5

; Once: the static part of the four quadrant records (q0: +x +y, q1: -x +y, q2: -x -y, q3: +x -y).
ray_init:
    LDI r0, quad_init
    LDI r1, quad
    LDI r2, 0
@copy:
    LD r3, [r0]
    ST [r1], r3
    ADD r0, 2
    ADD r1, 2
    ADD r2, 1
    CMP r2, 4 * Q_SIZE / 2
    JLT @copy
    RET

; Per frame: camera cell, fractions, zone, the first-crossing multipliers of the quadrant records.
ray_frame:
    LD r0, [cam_a]                  ; the image's cos and sin in s1.12 (sprites, DESIGN §3.12)
    CALL cos_a
    SAR r0, 2
    ST [rcam_c12], r0
    LD r0, [cam_a]
    CALL sin_a
    SAR r0, 2
    ST [rcam_s12], r0
    LD r0, [cam_x]
    MOV r1, r0
    AND r1, 255                     ; fx
    MOV r3, r1
    SHL r3, 8
    ST [cam_fx8], r3
    SHR r0, 8
    LD r2, [cam_y]
    MOV r3, r2
    AND r3, 255                     ; fy
    MOV r4, r3
    SHL r4, 8
    ST [cam_fy8], r4
    SHR r2, 8
    SHL r2, 5
    ADD r2, r0
    ST [cam_cell], r2
    LDB r4, [r2 + zmap]
    ST [cam_zone], r4
    LD r4, [bob]
    ST [rbob], r4
    ADD r4, HORIZON
    ST [hor], r4
    LD r4, [cam_x]                  ; the camera of this image (DESIGN §3.11)
    ST [rcam_x], r4
    LD r4, [cam_y]
    ST [rcam_y], r4
    LD r4, [cam_a]
    ST [rcam_a], r4
    LD r4, [cam_c8]
    ST [rcam_c8], r4
    LD r4, [cam_s8]
    ST [rcam_s8], r4
    LD r4, [tick]
    ST [rtick], r4
    LDI r4, 0
    ST [mcount], r4
    ST [ncast], r4
    LDI r5, 256
    SUB r5, r1                      ; 256 - fx: the first x crossing when stepping +x
    LDI r7, 256
    SUB r7, r3
    ST [quad + 0 * Q_SIZE + Q_MX], r5
    ST [quad + 0 * Q_SIZE + Q_MY], r7
    ST [quad + 1 * Q_SIZE + Q_MX], r1
    ST [quad + 1 * Q_SIZE + Q_MY], r7
    ST [quad + 2 * Q_SIZE + Q_MX], r1
    ST [quad + 2 * Q_SIZE + Q_MY], r3
    ST [quad + 3 * Q_SIZE + Q_MX], r5
    ST [quad + 3 * Q_SIZE + Q_MY], r3
    RET

; All columns (DESIGN §3.2): every 4th column and the last two are cast; column 4k + 2 is interpolated from its
; neighbours 2 away, then every odd column from its neighbours 1 away, when each layer is on one plane (the same face,
; or coplanar faces whose middle cell is a wall of the same kind with an empty cell in front); otherwise it is
; cast. FL_NOINTERP casts every column, FL_NOWIDE casts the even ones (the M26 scheme).
cast_all:
    LD r0, [dbg_flags]
    AND r0, FL_NOINTERP
    JNZ @every
    LD r0, [dbg_flags]
    AND r0, FL_NOWIDE
    LDI r1, 4
    JZ @wide
    LDI r1, 2
@wide:
    ST [ca_step], r1
    LDI r0, 0
@base:
    PUSH r0
    CALL cast
    POP r0
    LD r1, [ca_step]
    ADD r0, r1
    CMP r0, COLS
    JLT @base
    LDI r0, COLS - 1
    CALL cast
    LD r1, [ca_step]
    CMP r1, 2
    JEQ @odd0
    LDI r0, COLS - 2
    CALL cast
    LDI r0, 2
@mid:
    PUSH r0
    LDI r1, 2
    CALL interp
    POP r0
    ADD r0, 4
    CMP r0, COLS - 2
    JLT @mid
@odd0:
    LDI r0, 1
@odd:
    PUSH r0
    LDI r1, 1
    CALL interp
    POP r0
    ADD r0, 2
    CMP r0, COLS - 1
    JLT @odd
    RET
@every:
    LDI r0, 0
@all:
    PUSH r0
    CALL cast
    POP r0
    ADD r0, 1
    CMP r0, COLS
    JLT @all
    RET

; r0 = column c: casts its ray and fills its column buffers. Clobbers r0-r7.
cast:
    LD r1, [ncast]                  ; rays cast this image (the pacing estimate, DESIGN §3.11)
    ADD r1, 1
    ST [ncast], r1
    ST [cc], r0
    MOV r7, r0
    SHL r7, 1
    ST [cc2], r7
    LDI r1, -1
    ST [r7 + col_face + LAYER], r1  ; no masked plane yet
    LD r1, [r7 + colang]
    LD r2, [cam_a]
    ADD r1, r2
    AND r1, 4095                    ; ray angle
    MOV r2, r1
    SHR r2, 10
    SHL r2, 5
    ADD r2, quad                    ; its quadrant record
    ST [ray_rec], r2
    AND r1, 1023
    LD r3, [r2 + Q_FMASK]
    XOR r1, r3                      ; fold: |cos| = cos_h(fold), |sin| = sin_h(fold)
    ST [ray_fold], r1
    SHL r1, 1
    LD r3, [r1 + rcp_h]             ; dX = 1 / |cos|
    NEG r1
    LD r4, [r1 + rcp_h + 2046]      ; dY = 1 / |sin| = rcp_h[1023 - fold]
    LD r6, [r2 + Q_STEPX]
    LD r7, [r2 + Q_STEPY]
    LD r0, [r2 + Q_MX]
    MULQ8 r1, r3, r0, r5            ; sideX: distance to the first x crossing
    CMP r3, 32767
    JEQ @tinyx
@sx:
    LD r0, [r2 + Q_MY]
    MULQ8 r2, r4, r0, r5            ; sideY
    CMP r4, 32767
    JEQ @tinyy
@sy:
    LD r5, [cam_cell]
@step:                              ; the DDA: 7 instructions per step
    CMP r1, r2
    JAE @ystep
    ADD r1, r3
    ADD r5, r6
    LDB r0, [r5 + map]
    CMP r0, 0
    JEQ @step
    CMP r0, 0x40
    JAE @xthin
    ; ---- an x crossing hit a wall
    SUB r1, r3                      ; t
    MOV r2, r5
    SUB r2, r6                      ; the cell in front
    LD r6, [ray_rec]
    LD r3, [r6 + Q_XSIDE]
    LD r7, [r6 + Q_XSGN]
    LD r4, [r6 + Q_XMIR]
    ST [ray_mir], r4
    LD r4, [ray_fold]
    SHL r4, 1
    LD r4, [r4 + sin_h]             ; |sin|: the hit's y offset is t * sin
    LD r6, [cam_fy8]
    JMP @hit
@ystep:
    ADD r2, r4
    ADD r5, r7
    LDB r0, [r5 + map]
    CMP r0, 0
    JEQ @step
    CMP r0, 0x40
    JAE @ythin
    ; ---- a y crossing hit a wall
    MOV r1, r2
    SUB r1, r4                      ; t
    MOV r2, r5
    SUB r2, r7                      ; the cell in front
    LD r6, [ray_rec]
    LD r3, [r6 + Q_YSIDE]
    LD r7, [r6 + Q_YSGN]
    LD r4, [r6 + Q_YMIR]
    ST [ray_mir], r4
    LD r4, [ray_fold]
    NEG r4
    SHL r4, 1
    LD r4, [r4 + sin_h + 2046]      ; |cos| = sin_h[1023 - fold]: the hit's x offset is t * cos
    LD r6, [cam_fx8]
    JMP @hit
; ---- a thin cell (DESIGN §3.10): r0 = map byte, r1/r2 = the next x/y crossing, r3/r4 = dX/dY, r5 = the cell.
; r6 and r7 (the steps) are free here and reloaded from the quadrant record before the DDA goes on.
@xthin:
    LDI r6, 0
    JMP @thin
@ythin:
    LDI r6, 1
@thin:
    ST [th_in], r6
    ST [th_byte], r0
    MOV r6, r0
    AND r6, 0xC0
    CMP r6, 0x40
    JNE @mk
    MOV r6, r0                      ; a door: orientation from its table entry
    AND r6, 15
    SHL r6, 4
    ADD r6, doors
    ST [th_door], r6
    LDB r7, [r6 + D_ORIENT]
    JMP @plane
@mk:
    LD r6, [cc2]
    LD r6, [r6 + col_face + LAYER]
    CMP r6, -1
    JNE @cont                       ; this ray has its masked plane already: the next one is not seen
    LDI r6, 0
    ST [th_door], r6
    MOV r7, r0
    SHR r7, 5
    AND r7, 1
@plane:
    CMP r7, 0
    JEQ @hor
    ; o = 1, the plane x = cx + 1/2: tp = sideX - dX/2, within the cell if tp < sideY (and tp >= sideY - dY
    ; when the ray came in by a y step)
    MOV r6, r3
    SHR r6, 1
    MOV r7, r1
    SUB r7, r6
    CMP r7, r2
    JAE @cont
    LD r6, [th_in]
    CMP r6, 0
    JEQ @vhit
    MOV r6, r2
    SUB r6, r4
    CMP r7, r6
    JB @cont
@vhit:
    CALL @save
    LD r6, [ray_rec]
    LD r3, [r6 + Q_XSIDE]
    LD r4, [r6 + Q_XMIR]
    ST [ray_mir], r4
    LD r2, [r6 + Q_STEPX]
    LD r7, [r6 + Q_XSGN]
    LD r4, [ray_fold]
    SHL r4, 1
    LD r4, [r4 + sin_h]             ; |sin|
    LD r6, [cam_fy8]
    JMP @thit
@hor:                               ; o = 0, the plane y = cy + 1/2
    MOV r6, r4
    SHR r6, 1
    MOV r7, r2
    SUB r7, r6
    CMP r7, r1
    JAE @cont
    LD r6, [th_in]
    CMP r6, 1
    JEQ @hhit
    MOV r6, r1
    SUB r6, r3
    CMP r7, r6
    JB @cont
@hhit:
    CALL @save
    LD r6, [ray_rec]
    LD r3, [r6 + Q_YSIDE]
    LD r4, [r6 + Q_YMIR]
    ST [ray_mir], r4
    LD r2, [r6 + Q_STEPY]
    LD r7, [r6 + Q_YSGN]
    LD r4, [ray_fold]
    NEG r4
    SHL r4, 1
    LD r4, [r4 + sin_h + 2046]      ; |cos|
    LD r6, [cam_fx8]
@thit:                              ; r2 = the step along the plane's axis
    MOV r1, r5
    SUB r1, r2
    MOV r2, r1                      ; the cell in front of the plane
    LD r1, [th_t]
    LD r0, [th_door]
    CMP r0, 0
    JEQ @mhit
    ; ---- a door: the hit's fraction along the plane (as in @hit) against open
    PUSH r3
    LD r3, [r0 + D_OPEN]
    CMP r3, 256
    JAE @dpass                      ; fully open
    SHL r3, 8                       ; open, 0.16
    PUSH r3
    MOV r3, r4
    SHR r3, 4
    MOV r0, r1
    SHR r0, 2
    MUL r0, r3
    MUL r0, r7
    ADD r0, r6                      ; the fraction, 0.16
    POP r3
    CMP r0, r3
    JB @dpass                       ; in the open part: the ray goes on
    SUB r6, r3                      ; u counts from the door's edge: fraction - open
    LD r0, [th_door]
    LDB r0, [r0 + D_MAT]
    POP r3
    JMP @hit
@dpass:
    POP r3
    JMP @restore
@mhit:                              ; ---- a masked plane: recorded in the masked layer, then the ray goes on
    LD r0, [th_byte]
    AND r0, 31
    CALL @hitm
@restore:
    LD r1, [sv1]
    LD r2, [sv2]
    LD r3, [sv3]
    LD r4, [sv4]
    LD r5, [sv5]
@cont:
    LD r6, [ray_rec]
    LD r7, [r6 + Q_STEPY]
    LD r6, [r6 + Q_STEPX]
    JMP @step
@save:                              ; r7 = tp
    ST [th_t], r7
    ST [sv1], r1
    ST [sv2], r2
    ST [sv3], r3
    ST [sv4], r4
    ST [sv5], r5
    RET
; A component under 1/128 has 1/|c| beyond 128 cells (clamped in rcp_h): the first crossing is then
; m / |c| = 128 * (m * 128 / |c|_14), saturated at 127 cells (the deltas stay clamped: the next crossing is then
; always beyond the map). Rare: only rays within 0.4 degrees of an axis.
@tinyx:
    PUSH r4
    LD r4, [ray_fold]
    NEG r4
    SHL r4, 1
    LD r4, [r4 + sin_h + 2046]      ; |cos|, s1.14
    CALL @tiny
    MOV r1, r0
    POP r4
    JMP @sx
@tinyy:
    LD r4, [ray_fold]
    SHL r4, 1
    LD r4, [r4 + sin_h]             ; |sin|
    CALL @tiny
    MOV r2, r0
    LDI r4, 32767                   ; dY
    JMP @sy
@tiny:                              ; r0 = m (0..256), r4 = |c| s1.14 -> r0 = m / |c| in u8.8, saturated
    CMP r0, 256
    JB @m
    LDI r0, 255
@m:
    SHL r0, 7
    DIV r0, r4
    CMP r0, 256
    JB @q
    LDI r0, 255
@q:
    SHL r0, 7
    RET
; r0 = material, r1 = t (u8.8), r2 = front cell, r3 = side, r4 = |sin| or |cos| (s1.14), r5 = hit cell,
; r6 = the camera's fraction on the hit axis (0.16), r7 = the component's sign, ray_mir = the mirror mask.
; Writes the column buffers of column cc; RET returns from cast. (@hitm below: the same for the masked layer.)
@hit:
    PUSH r0
    SHR r4, 4                       ; u0.10
    MOV r0, r1
    SHR r0, 2                       ; t, u8.6
    MUL r0, r4                      ; the low 16 bits are the fraction of t * |component|
    MUL r0, r7
    ADD r0, r6                      ; fraction of the hit coordinate, 0.16
    POP r6                          ; material
    LD r4, [ray_mir]
    XOR r0, r4                      ; east and north faces are mirrored (DESIGN §3.2)
    LD r7, [cc2]
    ST [r7 + col_uf], r0
    SHR r0, 11
    LD r4, [cc]
    STB [r4 + col_u], r0
    STB [r4 + col_mat], r6
    MOV r0, r5
    SHL r0, 2
    ADD r0, r3
    ST [r7 + col_face], r0
    ST [r7 + col_front], r2
    LD r0, [r7 + colf]
    MOV r3, r0
    DIV r0, r1                      ; h = F256 / cos(offset) / t = F256 / perp
    MOD r3, r1
    SHL r0, 3
    CMP r1, 4096
    JAE @round
    SHL r3, 3
    DIV r3, r1
    ADD r0, r3                      ; h8 = 8 h (with three fraction bits, for interpolation)
@round:
    ST [r7 + col_h8], r0
    ADD r0, 4
    SHR r0, 3                       ; h, rounded
    ST [r7 + col_h], r0
    RET

@hitm:                              ; @hit for the masked layer (every buffer + LAYER)
    PUSH r0
    LD r0, [mcount]
    ADD r0, 1
    ST [mcount], r0
    SHR r4, 4                       ; u0.10
    MOV r0, r1
    SHR r0, 2                       ; t, u8.6
    MUL r0, r4                      ; the low 16 bits are the fraction of t * |component|
    MUL r0, r7
    ADD r0, r6                      ; fraction of the hit coordinate, 0.16
    POP r6                          ; material
    LD r4, [ray_mir]
    XOR r0, r4                      ; east and north faces are mirrored (DESIGN §3.2)
    LD r7, [cc2]
    ST [r7 + col_uf + LAYER], r0
    SHR r0, 11
    LD r4, [cc]
    STB [r4 + col_u + LAYER], r0
    STB [r4 + col_mat + LAYER], r6
    MOV r0, r5
    SHL r0, 2
    ADD r0, r3
    ST [r7 + col_face + LAYER], r0
    ST [r7 + col_front + LAYER], r2
    LD r0, [r7 + colf]
    MOV r3, r0
    DIV r0, r1                      ; h = F256 / cos(offset) / t = F256 / perp
    MOD r3, r1
    SHL r0, 3
    CMP r1, 4096
    JAE @roundm
    SHL r3, 3
    DIV r3, r1
    ADD r0, r3                      ; h8 = 8 h (with three fraction bits, for interpolation)
@roundm:
    ST [r7 + col_h8 + LAYER], r0
    ADD r0, 4
    SHR r0, 3                       ; h, rounded
    ST [r7 + col_h + LAYER], r0
    RET

; r0 = column m, r1 = d: interpolates m from l = m - d and r = m + d (both filled), or casts it (see cast_all).
; h is linear in screen x on a plane; the position along the plane is interpolated perspective-correctly as
; A' = idx' * 256 + uf / 256 (idx' = the cell's index along the plane, mirrored like u for E and N faces, so that A'
; grows to the right), which gives the middle column's cell, u and face.
.var ca_step
.var ip_m
.var ip_m2
.var ip_l
.var ip_l2
.var ip_r2
.var ip_fl
.var ip_fr
interp:
    MOV r7, r0
    SHL r7, 1                       ; 2m
    SHL r1, 1
    MOV r2, r7
    SUB r2, r1                      ; 2l
    MOV r3, r7
    ADD r3, r1                      ; 2r
    LD r4, [r2 + col_face + LAYER]
    LD r5, [r3 + col_face + LAYER]
    CMP r4, r5
    JNE @general
    CMP r4, -1
    JEQ @nomask
    PUSH r0                         ; one masked face on both sides: the fast path on the masked layer
    PUSH r2
    PUSH r3
    PUSH r7
    ADD r2, LAYER
    ADD r3, LAYER
    ADD r7, LAYER
    MOV r6, r0
    ADD r6, LAYER
    LD r1, [mcount]
    ADD r1, 1
    ST [mcount], r1
    CALL @fast
    POP r7
    POP r3
    POP r2
    POP r0
    JMP @wl
@nomask:
    ST [r7 + col_face + LAYER], r4  ; no masked plane on either side: none in the middle
@wl:
    LD r4, [r2 + col_face]
    LD r5, [r3 + col_face]
    CMP r4, r5
    JNE @walls
    MOV r6, r0
; ---- the fast path, one face: r4 = face, r2 / r3 / r7 = 2l / 2r / 2m and r6 = m (all + the layer offset)
@fast:
    ST [r7 + col_face], r4
    MOV r1, r7
    SUB r1, r2
    SHR r1, 1
    NEG r1
    ADD r1, r6                      ; l
    LDB r1, [r1 + col_mat]
    STB [r6 + col_mat], r1
    LD r1, [r2 + col_front]
    ST [r7 + col_front], r1
    LD r4, [r2 + col_h8]
    LD r5, [r3 + col_h8]
    ADD r4, r5
    SHR r4, 1                       ; h is linear in x on a plane (in eighths: no rounding drift)
    ST [r7 + col_h8], r4
    ADD r4, 4
    SHR r4, 3
    ST [r7 + col_h], r4
    LD r4, [r2 + col_h]
    LD r5, [r3 + col_h]
@fscale:
    CMP r4, 128
    JAE @fhalf
    CMP r5, 128
    JB @fscaled
@fhalf:
    SHR r4, 1
    SHR r5, 1
    JMP @fscale
@fscaled:
    ADD r4, r5
    SHL r5, 8
    DIV r5, r4
    LD r0, [r2 + col_uf]
    LD r1, [r3 + col_uf]
    CMP r1, r0
    JB @fu
    SUB r1, r0
    SHR r1, 8
    MUL r1, r5
    ADD r0, r1
@fu:
    ST [r7 + col_uf], r0
    SHR r0, 11
    STB [r6 + col_u], r0
    RET
@walls:                             ; the masked layer is done; the walls need the general path
    CALL @setup
    LDI r6, 0
    CALL @layer
    CMP r0, 0
    JNE @cast
    RET
@general:
    CALL @setup
    LDI r6, LAYER
    CALL @layer
    CMP r0, 0
    JNE @cast
    LDI r6, 0
    CALL @layer
    CMP r0, 0
    JNE @cast
    RET
@cast:
    LD r0, [ip_m]
    JMP cast
@setup:                             ; r0 = m, r2 = 2l, r3 = 2r, r7 = 2m
    ST [ip_m], r0
    ST [ip_m2], r7
    ST [ip_l2], r2
    ST [ip_r2], r3
    SHR r2, 1
    ST [ip_l], r2
    RET
; one layer, r6 = 0 (walls) or LAYER (masked planes) -> r0 = 0 done, 1 = cast the column
@layer:
    LD r2, [ip_l2]
    ADD r2, r6
    LD r3, [ip_r2]
    ADD r3, r6
    LD r7, [ip_m2]
    ADD r7, r6
    LD r4, [r2 + col_face]
    LD r5, [r3 + col_face]
    ST [ip_fl], r4
    ST [ip_fr], r5
    CMP r4, r5
    JNE @diff
    CMP r4, -1
    JNE @plane
    ST [r7 + col_face], r4          ; no masked plane on either side: none in the middle
    LDI r0, 0
    RET
@diff:
    CMP r4, -1
    JEQ @fail
    CMP r5, -1
    JEQ @fail
    MOV r0, r4
    XOR r0, r5
    MOV r1, r0
    AND r1, 3
    JNZ @fail                       ; not the same side
    MOV r1, r4
    AND r1, 3
    CMP r1, 2
    JAE @ysame
    AND r0, 124                     ; x faces: the same cell x
    JNZ @fail
    JMP @kind
@ysame:
    AND r0, 0xFF80                  ; y faces: the same cell y
    JNZ @fail
@kind:
    CMP r6, 0
    JNE @plane                      ; masked-layer faces are always masked cells
    MOV r0, r4
    SHR r0, 2
    LDB r0, [r0 + map]
    CMP r0, 0x40
    JAE @fail                       ; walls only (a door's plane is not its cell's face)
    MOV r0, r5
    SHR r0, 2
    LDB r0, [r0 + map]
    CMP r0, 0x40
    JAE @fail
@plane:
    CMP r6, 0
    JEQ @pl
    LD r4, [mcount]
    ADD r4, 1
    ST [mcount], r4
@pl:
    LD r4, [r2 + col_h8]
    LD r5, [r3 + col_h8]
    ADD r4, r5
    SHR r4, 1
    ST [r7 + col_h8], r4
    ADD r4, 4
    SHR r4, 3
    ST [r7 + col_h], r4
    LD r4, [r2 + col_h]
    LD r5, [r3 + col_h]
@scale:                             ; the weight of r: h_r / (h_l + h_r), heights scaled below 128
    CMP r4, 128
    JAE @half
    CMP r5, 128
    JB @scaled
@half:
    SHR r4, 1
    SHR r5, 1
    JMP @scale
@scaled:
    ADD r4, r5
    SHL r5, 8
    DIV r5, r4                      ; u0.8
    LD r4, [ip_m]
    ADD r4, r6
    LD r0, [ip_fl]
    LD r1, [ip_fr]
    CMP r0, r1
    JNE @coplanar
    ; ---- the same face: u from uf (it grows to the right on one face), material and cell in front from l
    ST [r7 + col_face], r0
    LD r0, [r2 + col_uf]
    LD r1, [r3 + col_uf]
    CMP r1, r0
    JB @u                           ; equal up to rounding: keep u_l
    SUB r1, r0
    SHR r1, 8
    MUL r1, r5
    ADD r0, r1
@u:
    ST [r7 + col_uf], r0
    SHR r0, 11
    STB [r4 + col_u], r0
    LD r3, [ip_l]
    ADD r3, r6
    LDB r3, [r3 + col_mat]
    STB [r4 + col_mat], r3
    LD r3, [r2 + col_front]
    ST [r7 + col_front], r3
    LDI r0, 0
    RET
@coplanar:
    PUSH r4
    LD r0, [ip_fr]
    LD r1, [r3 + col_uf]
    CALL @ap
    PUSH r0
    LD r0, [ip_fl]
    LD r1, [r2 + col_uf]
    CALL @ap
    MOV r1, r0                      ; A'_l
    POP r0
    SUB r0, r1                      ; A'_r - A'_l
    CMP r0, 0x8000
    JB @pos
    LDI r0, 0                       ; equal up to rounding
@pos:
    MULQ8 r4, r0, r5, r3
    ADD r1, r4                      ; A'_m
    POP r4
    MOV r0, r1
    SHL r0, 8
    ST [r7 + col_uf], r0
    SHR r0, 11
    STB [r4 + col_u], r0
    LD r0, [ip_fl]
@newcell:                           ; r0 = face of l, r1 = A'_m, r4 = m (+ layer)
    MOV r2, r1
    SHR r2, 8                       ; idx'
    MOV r3, r0
    AND r3, 3                       ; side
    CMP r3, 1
    JEQ @mir
    CMP r3, 2
    JNE @nomir
@mir:
    NEG r2
    ADD r2, 31
@nomir:
    SHR r0, 2
    CMP r3, 2
    JAE @ycell
    AND r0, 31                      ; x face: the cell (cell x of l, idx)
    SHL r2, 5
    ADD r0, r2
    JMP @cell
@ycell:
    AND r0, 0xFFE0                  ; y face: the cell (idx, cell y of l)
    ADD r0, r2
@cell:
    LDB r1, [r0 + map]
    CMP r6, 0
    JNE @mcell
    CMP r1, 0
    JEQ @fail
    CMP r1, 0x40
    JAE @fail
    JMP @front
@mcell:
    CMP r1, 0x80
    JB @fail
    AND r1, 31
@front:
    MOV r2, r3
    SHL r2, 1
    LD r2, [r2 + front_step]
    ADD r2, r0                      ; the cell in front must be empty
    LDB r5, [r2 + map]
    CMP r5, 0
    JNE @fail
    ST [r7 + col_front], r2
    STB [r4 + col_mat], r1
    SHL r0, 2
    ADD r0, r3
    ST [r7 + col_face], r0
    LDI r0, 0
    RET
@fail:
    LDI r0, 1
    RET
; r0 = face, r1 = uf -> r0 = A' = idx' * 256 + uf / 256. Clobbers r1.
@ap:
    PUSH r2
    MOV r2, r0
    AND r2, 3
    SHR r0, 2
    CMP r2, 2
    JAE @apy
    SHR r0, 5                       ; x faces run along y
    JMP @apm
@apy:
    AND r0, 31
@apm:
    CMP r2, 1
    JEQ @apmir
    CMP r2, 2
    JNE @apo
@apmir:
    NEG r0
    ADD r0, 31
@apo:
    SHL r0, 8
    SHR r1, 8
    ADD r0, r1
    POP r2
    RET

.data
; per side: the map index step from a face's cell to the cell in front of it (W, E, N, S)
front_step:
    .word -1, 1, -32, 32
; static quadrant records: stepx, stepy, mx, my (per frame), fmask, xside, xsgn, xmir, yside, ysgn, ymir
quad_init:
    .word 1, 32, 0, 0, 0, 0, 1, 0, 2, 1, -1
    .fill Q_SIZE - 22
    .word -1, 32, 0, 0, 1023, 1, 1, -1, 2, -1, -1
    .fill Q_SIZE - 22
    .word -1, -32, 0, 0, 0, 1, -1, -1, 3, -1, 0
    .fill Q_SIZE - 22
    .word 1, -32, 0, 0, 1023, 0, -1, 0, 3, 1, 0
    .fill Q_SIZE - 22
.code
