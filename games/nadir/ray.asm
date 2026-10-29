; NADIR - the raycaster (DESIGN §3.2-3.5): 64 sample columns, DDA on the map grid with half-step angle tables.
; Per column it stores the wall height (one DIV: F256 / cos(offset) / t), the face, the cell in front, the
; material and the texture u. Depth is kept as the height h (inverse depth): the light rule and the sprites use it.
.code

; quadrant record fields (Q_STEPX .. Q_MY are in defs.asm)
Q_FMASK = 8                         ; 0 or 1023: folds the angle within the quadrant (one XOR)
Q_XSIDE = 10                        ; face of an x hit: 0 W or 1 E
Q_XSGN  = 12                        ; sign of sin (1 or -1): direction of the hit along y
Q_XMIR  = 14                        ; 0 or -1: mirror u (east faces)
Q_YSIDE = 16                        ; face of a y hit: 2 N or 3 S
Q_YSGN  = 18                        ; sign of cos
Q_YMIR  = 20                        ; 0 or -1: mirror u (north faces)

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
    ADD r4, HORIZON
    ST [hor], r4
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

; All columns: the even ones and the last are cast; an odd column is interpolated when both neighbours hit the
; same face (h and u/z are linear in screen x on a plane), otherwise cast. FL_NOINTERP casts every column.
; (Stride 4 with subdivision was measured slower: faces change too often, D-040.)
cast_all:
    LD r0, [dbg_flags]
    AND r0, FL_NOINTERP
    JNZ @every
    LDI r0, 0
@even:
    PUSH r0
    CALL cast
    POP r0
    ADD r0, 2
    CMP r0, COLS
    JLT @even
    LDI r0, COLS - 1
    CALL cast
    LDI r0, 1
@odd:
    PUSH r0
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
    ST [cc], r0
    MOV r7, r0
    SHL r7, 1
    ST [cc2], r7
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
    ; ---- an x crossing hit a wall
    SUB r1, r3                      ; t
    MOV r2, r5
    SUB r2, r6                      ; the cell in front
    LD r6, [ray_rec]
    LD r3, [r6 + Q_XSIDE]
    LD r7, [r6 + Q_XSGN]
    LD r4, [r6 + Q_XMIR]
    PUSH r4
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
    ; ---- a y crossing hit a wall
    MOV r1, r2
    SUB r1, r4                      ; t
    MOV r2, r5
    SUB r2, r7                      ; the cell in front
    LD r6, [ray_rec]
    LD r3, [r6 + Q_YSIDE]
    LD r7, [r6 + Q_YSGN]
    LD r4, [r6 + Q_YMIR]
    PUSH r4
    LD r4, [ray_fold]
    NEG r4
    SHL r4, 1
    LD r4, [r4 + sin_h + 2046]      ; |cos| = sin_h[1023 - fold]: the hit's x offset is t * cos
    LD r6, [cam_fx8]
    JMP @hit
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
; r6 = the camera's fraction on the hit axis (0.16), r7 = the component's sign; the mirror mask on the stack.
@hit:
    PUSH r0
    SHR r4, 4                       ; u0.10
    MOV r0, r1
    SHR r0, 2                       ; t, u8.6
    MUL r0, r4                      ; the low 16 bits are the fraction of t * |component|
    MUL r0, r7
    ADD r0, r6                      ; fraction of the hit coordinate, 0.16
    POP r6                          ; material
    POP r4
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
    SHL r3, 1
    CMP r3, r1
    JB @round
    ADD r0, 1                       ; rounded, not truncated
@round:
    ST [r7 + col_h], r0
    RET

; r0 = odd column c: interpolates it from c - 1 and c + 1 when they hit the same face, else casts it.
interp:
    MOV r7, r0
    SHL r7, 1
    LD r1, [r7 + col_face - 2]
    LD r2, [r7 + col_face + 2]
    CMP r1, r2
    JEQ @same
    JMP cast
@same:
    MOV r6, r0
    ST [r7 + col_face], r1
    LDB r1, [r6 + col_mat - 1]
    STB [r6 + col_mat], r1
    LD r2, [r7 + col_front - 2]
    ST [r7 + col_front], r2
    LD r3, [r7 + col_h - 2]
    LD r4, [r7 + col_h + 2]
    MOV r5, r3
    ADD r5, r4
    SHR r5, 1                       ; h is linear in x on a plane
    ST [r7 + col_h], r5
    ; u is perspective-correct: u = u_l + (u_r - u_l) * h_r / (h_l + h_r); heights scaled below 128
@scale:
    CMP r3, 128
    JAE @half
    CMP r4, 128
    JB @scaled
@half:
    SHR r3, 1
    SHR r4, 1
    JMP @scale
@scaled:
    ADD r3, r4
    SHL r4, 8
    DIV r4, r3                      ; weight of the right neighbour, u0.8
    LD r0, [r7 + col_uf - 2]
    LD r1, [r7 + col_uf + 2]
    CMP r1, r0
    JB @u                           ; on one face u grows to the right; equal up to rounding: keep u_l
    SUB r1, r0
    SHR r1, 8
    MUL r1, r4
    ADD r0, r1
@u:
    ST [r7 + col_uf], r0
    SHR r0, 11
    STB [r6 + col_u], r0
    RET

.data
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
