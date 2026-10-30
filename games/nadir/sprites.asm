; NADIR - sprites (DESIGN §3.12): props projected with the image's camera, the nearest SPR_MAX kept and sorted far
; to near, LODs within the rectangle budget, per-column visibility against the walls (col_h), shaded by the light
; rule, drawn as scaled rectangle lists clipped to the visible column intervals.
.code

; sprite record (one per candidate; the tests read them)
SR_PROP  = 0                        ; address of the prop in the prop table
SR_Z     = 2                        ; depth, u8.8
SR_H     = 4                        ; wall height at that depth (inverse depth)
SR_S     = 6                        ; screen size of a source pixel, 1/16 px
SR_CX    = 8                        ; screen x of the centre
SR_HGT   = 10                       ; screen height
SR_WID   = 12                       ; screen width
SR_LEFT  = 14
SR_TOP   = 16
SR_LOD   = 18
SR_TYPE  = 20                       ; address of its spr_type entry
SR_CELL  = 22                       ; its map cell (light)
SR_SIZE  = 58                       ; (boxes keep their corners from byte 24 on: boxes.asm)
SPR_CAND = 32                       ; candidates at most (all props and enemies)

.var spr_cn                         ; candidates this image
.var spr_img                        ; images whose sprites were chosen (tests)
.var spr_o0                         ; first drawn entry of spr_ord (the farthest ones are dropped)
.var spr_rects                      ; rectangles drawn this image (after the budget)
.var spr_cand, SPR_CAND * SR_SIZE
.var spr_ord, 2 * SPR_CAND          ; record addresses, farthest first
.var spr_hc, 2 * COLS               ; per column: the largest h of a sprite visible there (0 = none)
.var spr_pal, 32                    ; the drawn sprite's shade row
.var sd_rec                         ; drawing state
.var sd_k
.var sd_c
.var sd_cl
.var sd_cr
.var sd_top
.var sd_list
.var spr_buf, 48 * 5 + 1                ; the drawn sprite's rectangle list (from xdata)

; r0 = RAM destination, r4 = map cell, r5 = 0 (the seen set) or 3 (the near set): fetches the cell's 3-byte prop set
; from the per-cell table in xdata (one COPY). Clobbers r0-r4.
prop_set:
    MUL r4, 6
    ADD r4, r5
    LDI r1, pvs_x >> 16
    LDI r2, pvs_x & 0xFFFF
    ADD r2, r4
    JAE @nc
    ADD r1, 1
@nc:
    LDI r3, 3
    SYS COPY
    RET

; r6 = address of a prop, r7 = a 3-byte prop set -> Z clear (JNZ) if the prop is in the set. Clobbers r0, r1.
in_set:
    MOV r0, r6
    SUB r0, props
    SHR r0, 3                       ; prop index (PROP_SIZE = 8)
    MOV r1, r0
    AND r1, 7
    SHR r0, 3
    ADD r0, r7
    LDB r0, [r0]
    SHR r0, r1
    AND r0, 1
    RET

; ---- after cast_all: candidates, order, LODs and budget, spr_hc --------------------------------------------
spr_frame:
    LD r0, [spr_img]                ; (tests: which frame chose the sprites)
    ADD r0, 1
    ST [spr_img], r0
    LDI r0, spr_hc
    LDI r1, 0
    LDI r2, 2 * COLS
    SYS FILL
    LDI r0, col_bh                  ; the nearest box side per column (tests)
    LDI r1, 0
    LDI r2, 2 * COLS
    SYS FILL
    LDI r0, col_bface
    LDI r1, 255
    LDI r2, 2 * COLS
    SYS FILL
    LDI r0, 0
    ST [spr_cn], r0
    ST [spr_o0], r0
    ST [spr_rects], r0
    LD r0, [dbg_flags]
    AND r0, FL_NOSPR
    JZ @go
    RET
@go:
    LDI r0, pvs_img                 ; the props that may be seen from the image's camera cell
    LD r4, [cam_cell]
    LDI r5, 0
    CALL prop_set
    LDI r6, props
@prop:
    CMP r6, props + (NUM_PROPS + NUM_ENEMIES) * PROP_SIZE
    JAE @sort
    CMP r6, props + NUM_PROPS * PROP_SIZE
    JAE @dyn                        ; an enemy (DESIGN §6.3): it moves, no per-cell table
    LDI r7, pvs_img
    CALL in_set
    JZ @next
@dyn:
    LDB r0, [r6 + P_ALIVE]
    CMP r0, 0
    JEQ @next
    LD r4, [r6 + P_X]
    LD r0, [rcam_x]
    SUB r4, r0                      ; dx
    LD r5, [r6 + P_Y]
    LD r0, [rcam_y]
    SUB r5, r0                      ; dy
    MOV r0, r4                      ; quick reject: |dx|, |dy| < SPR_FAR
    ADD r0, SPR_FAR
    CMP r0, 2 * SPR_FAR
    JAE @next
    MOV r0, r5
    ADD r0, SPR_FAR
    CMP r0, 2 * SPR_FAR
    JAE @next
    ; a cheap cone test first (5-bit coordinates, half cos/sin; conservative): z' = z / 4, lat' = lat / 4
    ; roughly; dropped if z' < 0 or |lat'| > z' + 64 (the view cone is |lat| < 0.65 z, plus the widest sprite)
    LD r2, [rcam_c12]
    SAR r2, 5
    LD r3, [rcam_s12]
    SAR r3, 5
    MOV r0, r4
    SAR r0, 5
    MUL r0, r2
    MOV r1, r5
    SAR r1, 5
    MUL r1, r3
    ADD r0, r1
    SAR r0, 4                       ; z', 1/4 of z within ~+-24
    CMP r0, -24
    JLT @next
    MOV r7, r0
    MOV r0, r5
    SAR r0, 5
    MUL r0, r2
    MOV r1, r4
    SAR r1, 5
    MUL r1, r3
    SUB r0, r1
    SAR r0, 4                       ; lat'
    JGE @lpos
    NEG r0
@lpos:
    ADD r7, 64
    CMP r0, r7
    JGT @next
    ; z = smul(dx, cos) + smul(dy, sin), cos and sin in s1.12
    MOV r0, r4
    LD r1, [rcam_c12]
    CALL smul12
    MOV r7, r0
    MOV r0, r5
    LD r1, [rcam_s12]
    CALL smul12
    ADD r7, r0                      ; z in 1/1024 cell
    LDB r2, [r6 + P_TYPE]           ; a box (DESIGN §3.12): its corners decide, not its centre
    SHL r2, 4
    LDB r2, [r2 + spr_type + 15]
    CMP r2, 0
    JEQ @bill
    CMP r7, -4 * 256
    JLT @next
    CMP r7, 4 * SPR_FAR
    JGT @next
    MOV r0, r5
    LD r1, [rcam_c12]
    CALL smul12
    PUSH r0
    MOV r0, r4
    LD r1, [rcam_s12]
    CALL smul12
    POP r1
    SUB r1, r0
    CALL box_frame
    CMP r0, 0
    JEQ @next
    JMP @accept
@bill:
    CMP r7, 4 * SPR_NEAR
    JLT @next
    CMP r7, 4 * SPR_FAR
    JGT @next
    ; lat = smul(dy, cos) - smul(dx, sin)
    MOV r0, r5
    LD r1, [rcam_c12]
    CALL smul12
    PUSH r0
    MOV r0, r4
    LD r1, [rcam_s12]
    CALL smul12
    POP r1
    SUB r1, r0                      ; lat in 1/1024 cell
    ; h with its fraction in eighths (h8): from z in 1/4096 cell (exact products, one rounding) for a sprite nearer
    ; than ~1 cell (DESIGN §3.12: a Kryp up close), else from z in u8.8
    PUSH r1
    CMP r7, 1008
    JAE @coarse
    MOV r0, r4
    LD r1, [rcam_c12]
    CALL smul12r
    PUSH r0
    MOV r0, r5
    LD r1, [rcam_s12]
    CALL smul12r
    POP r1
    ADD r1, r0                      ; z4096 (< 4096)
    LDI r0, F256                    ; 2 h8 = 256 F256 / z4096: the integer, then four 2-bit steps (16-bit DIVs)
    MOV r2, r0
    DIV r0, r1
    MOD r2, r1
    SHL r0, 8
    LDI r4, 6
@q:
    SHL r2, 2
    MOV r3, r2
    DIV r3, r1
    MOD r2, r1
    SHL r3, r4
    ADD r0, r3
    SUB r4, 2
    JGE @q
    ADD r0, 1
    SHR r0, 1                       ; h8, rounded
    JMP @hd
@coarse:
    MOV r2, r7
    ADD r2, 2
    SHR r2, 2                       ; z, u8.8
    LDI r0, F256
    DIV r0, r2                      ; h
    LDI r3, F256                    ; f = ((F256 mod z) 8 + z / 2) / z, eighths (rounded)
    MOD r3, r2
    SHL r3, 3
    MOV r1, r2
    SHR r1, 1
    ADD r3, r1
    DIV r3, r2
    SHL r0, 3
    ADD r0, r3                      ; h8
@hd:
    POP r1
    MOV r2, r0
    ADD r7, 2
    SHR r7, 2                       ; z, u8.8 (rounded)
    ; the record
    LD r0, [spr_cn]
    MUL r0, SR_SIZE
    ADD r0, spr_cand
    MOV r5, r0                      ; r5 = record
    ST [r5 + SR_PROP], r6
    ST [r5 + SR_Z], r7
    MOV r0, r2
    MOV r3, r0
    AND r3, 7                       ; f
    SHR r0, 3
    ST [r5 + SR_H], r0              ; h
    MOV r4, r0
    PUSH r3
    LDB r2, [r6 + P_TYPE]
    SHL r2, 4
    ADD r2, spr_type
    ST [r5 + SR_TYPE], r2
    LDB r0, [r2 + 2]                ; K
    MUL r3, r0
    SHR r3, 3
    MUL r0, r4
    ADD r3, r0                      ; (h + f / 8) K
    SHR r3, 5                       ; s = (h + f / 8) K / 32, 1/64 px per source pixel
    ST [r5 + SR_S], r3
    LDB r0, [r2 + 1]
    MUL r0, r3
    ADD r0, 32
    SHR r0, 6
    ST [r5 + SR_HGT], r0
    LDB r0, [r2]
    MUL r0, r3
    ADD r0, 32
    SHR r0, 6
    ST [r5 + SR_WID], r0
    ; cx = 64 + (lat (h + f / 8)) >> 8 (h may exceed 256: lat + (lat (h - 256)) >> 8)
    MOV r0, r1
    POP r3
    PUSH r4
    SHL r4, 3
    ADD r4, r3
    MOV r1, r4                      ; 8 h + f
    CALL @mulh                      ; lat (h + f / 8) / 256 with lat in 1/1024 cell, rounded
    POP r4
    ADD r0, 64
    ST [r5 + SR_CX], r0
    LD r1, [r5 + SR_WID]
    SHR r1, 1
    SUB r0, r1
    ST [r5 + SR_LEFT], r0           ; left
    CMP r0, 128
    JGE @next
    LD r1, [r5 + SR_WID]
    ADD r1, r0
    CMP r1, 0
    JLE @next
    LD r0, [hor]
    SHR r4, 1
    ADD r0, r4                      ; the floor at that depth
    LD r1, [r5 + SR_HGT]
    SUB r0, r1
    ST [r5 + SR_TOP], r0
    LD r0, [r6 + P_Y]               ; its cell
    SHR r0, 8
    SHL r0, 5
    LD r1, [r6 + P_X]
    SHR r1, 8
    ADD r0, r1
    ST [r5 + SR_CELL], r0
    ; LOD by height
    LD r0, [r5 + SR_HGT]
    LDI r1, 0
    CMP r0, SPR_LOD1_H
    JGE @lod
    LDI r1, 1
    CMP r0, SPR_LOD2_H
    JGE @lod
    LDI r1, 2
@lod:
    ST [r5 + SR_LOD], r1
@accept:
    LD r0, [spr_cn]
    ADD r0, 1
    ST [spr_cn], r0
@next:
    ADD r6, PROP_SIZE
    JMP @prop
    ; ---- insertion sort of the records by z, farthest first
@sort:
    LDI r0, 0
@fill:
    LD r1, [spr_cn]
    CMP r0, r1
    JAE @ins
    MOV r1, r0
    MUL r1, SR_SIZE
    ADD r1, spr_cand
    MOV r2, r0
    SHL r2, 1
    ST [r2 + spr_ord], r1
    ADD r0, 1
    JMP @fill
@ins:
    LDI r0, 1
@i:
    LD r1, [spr_cn]
    CMP r0, r1
    JAE @keep
    MOV r2, r0
    SHL r2, 1
    LD r3, [r2 + spr_ord]           ; the record to insert
    LD r4, [r3 + SR_Z]
@shift:
    CMP r2, 0
    JEQ @put
    LD r5, [r2 + spr_ord - 2]
    LD r6, [r5 + SR_Z]
    CMP r6, r4
    JGE @put                        ; the one before is farther (or as far): stop
    ST [r2 + spr_ord], r5
    SUB r2, 2
    JMP @shift
@put:
    ST [r2 + spr_ord], r3
    ADD r0, 1
    JMP @i
@keep:                              ; the nearest SPR_MAX are drawn
    LD r0, [spr_cn]
    SUB r0, SPR_MAX
    JLE @budget
    SHL r0, 1
    ST [spr_o0], r0
    ; ---- the rectangle budget: demote the farthest sprite that is not at LOD 2 yet, until it holds
@budget:
    CALL @count
    CMP r0, SPR_RECTS
    JLE @cols
    LD r1, [spr_o0]
@far:
    LD r2, [spr_cn]
    SHL r2, 1
    CMP r1, r2
    JAE @cols                       ; everything at LOD 2
    LD r3, [r1 + spr_ord]
    LD r4, [r3 + SR_LOD]
    CMP r4, 2
    JLT @demote
    ADD r1, 2
    JMP @far
@demote:
    ADD r4, 1
    ST [r3 + SR_LOD], r4
    JMP @budget
    ; ---- spr_hc: per column the largest h of a sprite that is nearer than the wall there
@cols:
    ST [spr_rects], r0
    LD r6, [spr_o0]
@scol:
    LD r0, [spr_cn]
    SHL r0, 1
    CMP r6, r0
    JAE @done
    LD r5, [r6 + spr_ord]
    CALL spr_span                   ; r0 = first column, r1 = last
    LD r4, [r5 + SR_H]
@c:
    CMP r0, r1
    JGT @nexts
    MOV r2, r0
    SHL r2, 1
    LD r3, [r2 + col_h]
    CMP r4, r3
    JLE @cn
    LD r3, [r2 + spr_hc]
    CMP r4, r3
    JLE @cn
    ST [r2 + spr_hc], r4
@cn:
    ADD r0, 1
    JMP @c
@nexts:
    ADD r6, 2
    JMP @scol
@done:
    RET
; r0 = rectangles of the drawn sprites at their LODs (a box: its cost in rectangles). Clobbers r1-r4.
@count:
    LDI r0, 0
    LD r1, [spr_o0]
@cl:
    LD r2, [spr_cn]
    SHL r2, 1
    CMP r1, r2
    JAE @cdone
    LD r2, [r1 + spr_ord]
    LD r4, [r2 + SR_TYPE]
    LDB r3, [r4 + 15]
    CMP r3, 0
    JEQ @cb
    LD r2, [r2 + SR_S]              ; a box: its cost in rectangles (boxes.asm)
    JMP @ca
@cb:
    LD r3, [r2 + SR_LOD]
    ADD r4, r3
    LDB r2, [r4 + 12]
@ca:
    ADD r0, r2
    ADD r1, 2
    JMP @cl
@cdone:
    RET
; r0 = a (signed, |a| < 64 * 256), r1 = b (0 .. 4095) -> r0 = a b / 8192 rounded (magnitude), with
; a = ah 256 + al and b = bh 256 + bl: T = ah b + al bh + (al bl + 128) / 256 = a b / 256, then (T + 16) / 32.
; For a = lat in 1/1024 cell and b = 8 h + f, T = lat h / 8 stays below 16 bits for every sprite that passes the
; cone test (|lat| < z + 1 cell, z >= SPR_NEAR). Clobbers r1-r4.
@mulh:
    LDI r4, 0
    CMP r0, 0
    JGE @mp
    NEG r0
    LDI r4, 1
@mp:
    MOV r2, r0
    SHR r2, 8
    MUL r2, r1                      ; ah b
    AND r0, 255
    MOV r3, r1
    SHR r3, 8
    MUL r3, r0                      ; al bh
    ADD r2, r3
    AND r1, 255
    MUL r0, r1
    ADD r0, 128
    SHR r0, 8                       ; (al bl + 128) / 256
    ADD r0, r2
    ADD r0, 16
    SHR r0, 5
    CMP r4, 0
    JEQ @mq
    NEG r0
@mq:
    RET

; r0 = d (signed u8.8, |d| < 16 cells), r1 = c (s1.12) -> r0 = d c in 1/1024 cell, rounded (sign and magnitude),
; from the four byte products: with d = dh 256 + dl, c = ch 256 + cl, R = dh ch 256 + dh cl + dl ch +
; (dl cl + 128) / 256 = d c / 256, then (R + 2) / 4. Clobbers r1-r3.
smul12:
    PUSH r4
    LDI r4, 0
    JMP smul_core
; the same in 1/4096 cell, not rounded further: R (for |d| < 2 cells, so that |R| < 8192)
smul12r:
    PUSH r4
    LDI r4, 4
smul_core:
    CMP r0, 0
    JGE @a
    NEG r0
    XOR r4, 1
@a:
    CMP r1, 0
    JGE @b
    NEG r1
    XOR r4, 1
@b:
    MOV r2, r0
    SHR r2, 8                       ; dh
    MOV r3, r1
    SHR r3, 8                       ; ch
    AND r0, 255                     ; dl
    AND r1, 255                     ; cl
    PUSH r2
    MUL r2, r3
    SHL r2, 8                       ; dh ch 256
    MUL r3, r0                      ; dl ch
    ADD r2, r3
    POP r3
    MUL r3, r1                      ; dh cl
    ADD r2, r3
    MUL r0, r1                      ; dl cl
    ADD r0, 128
    JAE @nc
    ADD r2, 256                     ; dl cl + 128 carried out of 16 bits
@nc:
    SHR r0, 8
    ADD r0, r2
    MOV r2, r4
    AND r2, 4
    JNZ @s
    MOV r2, r4
    AND r2, 2
    JNZ @f
    ADD r0, 2
    SHR r0, 2
    JMP @s
@f:
    ADD r0, 1
    SHR r0, 1
@s:
    MOV r2, r4
    AND r2, 1
    JZ @p
    NEG r0
@p:
    POP r4
    RET

; r5 = record -> r0, r1 = its first and last sample column on the screen. Clobbers r2.
spr_span:
    LD r0, [r5 + SR_LEFT]
    LD r1, [r5 + SR_WID]
    ADD r1, r0
    SUB r1, 1
    CMP r0, 0
    JGE @s0
    LDI r0, 0
@s0:
    CMP r1, 127
    JLE @s1
    LDI r1, 127
@s1:
    SAR r0, 1
    SAR r1, 1
    RET
; ---- drawing, far to near ------------------------------------------------------------------------------
draw_sprites:
    LD r6, [spr_o0]
@spr:
    LD r0, [spr_cn]
    SHL r0, 1
    CMP r6, r0
    JAE @end
    ST [sd_rec], r6
    LD r5, [r6 + spr_ord]
    LD r0, [r5 + SR_TYPE]
    LDB r0, [r0 + 15]
    CMP r0, 0
    JEQ @bill
    CALL draw_box                   ; a 3D box (boxes.asm)
    JMP @nextspr
@bill:
    ; ---- light: the prop's cell, the fog of the column under its centre at its h (DESIGN §3.12)
    LD r2, [r5 + SR_CELL]
    CALL span_light
    LD r0, [r5 + SR_CX]
    SAR r0, 1
    CMP r0, 0
    JGE @c0
    LDI r0, 0
@c0:
    CMP r0, COLS - 1
    JLE @c1
    LDI r0, COLS - 1
@c1:
    SHL r0, 1
    LD r1, [r0 + colfog]
    LD r0, [r5 + SR_H]
    ADD r1, r0
    LDB r1, [r1]
    LD r0, [sp_base]
    ADD r1, r0
    LDB r1, [r1 + clamp_tab]
    SHL r1, 5
    LD r0, [sp_set]
    ADD r1, r0
    LDI r0, spr_pal                 ; its shade row, so that a rectangle's colour is one load
    MOV r2, r1
    LDI r1, 0
    LDI r3, 32
    SYS COPY
    ; ---- its rectangle list at its LOD (in xdata: copied into spr_buf, count 5 + 1 bytes) and its scale
    LD r1, [r5 + SR_LOD]
    LD r2, [r5 + SR_TYPE]
    MOV r3, r1
    SHL r3, 1
    ADD r3, r2
    LD r4, [r3 + 6]                 ; the list's address in the bank SPR_X_HI
    ADD r1, r2
    LDB r3, [r1 + 12]
    MUL r3, 5
    ADD r3, 1
    MOV r2, r4
    LDI r1, SPR_X_HI
    LDI r0, spr_buf
    SYS COPY
    LDI r3, spr_buf
    ST [sd_list], r3
    LD r0, [r5 + SR_S]
    ST [sd_k], r0                   ; 1/64 px per source pixel (every LOD is in source pixels)
    LD r0, [r5 + SR_TOP]
    ST [sd_top], r0
    ; ---- intervals of columns where it is nearer than the wall
    CALL spr_span
    LD r4, [r5 + SR_H]
    ST [sd_c], r0
@scan:
    LD r0, [sd_c]
@skip:
    CMP r0, r1
    JGT @nextspr
    MOV r2, r0
    SHL r2, 1
    LD r3, [r2 + col_h]
    CMP r4, r3
    JGT @open
    ADD r0, 1
    JMP @skip
@open:
    MOV r7, r0                      ; first visible column
@run:
    ADD r0, 1
    CMP r0, r1
    JGT @close
    MOV r2, r0
    SHL r2, 1
    LD r3, [r2 + col_h]
    CMP r4, r3
    JGT @run
@close:
    ST [sd_c], r0
    PUSH r1
    SHL r7, 1
    ST [sd_cl], r7
    SHL r0, 1
    ST [sd_cr], r0
    CALL @rects
    POP r1
    LD r6, [sd_rec]
    LD r5, [r6 + spr_ord]
    LD r4, [r5 + SR_H]
    JMP @scan
@nextspr:
    ; ---- a hit enemy (DESIGN §6.2): green sparks around its chest while E_SPK runs, if it is nearer than the wall
    LD r6, [sd_rec]
    LD r5, [r6 + spr_ord]
    LD r0, [r5 + SR_PROP]
    SUB r0, props
    SHR r0, 3
    CMP r0, NUM_PROPS
    JLT @ns
    SUB r0, NUM_PROPS
    MUL r0, E_SIZE
    ADD r0, enemies
    LDB r7, [r0 + E_SPK]
    CMP r7, 0
    JEQ @ns
    LD r0, [r5 + SR_CX]
    CMP r0, 0
    JLT @ns
    CMP r0, 127
    JGT @ns
    SHR r0, 1
    SHL r0, 1
    LD r2, [r0 + col_h]
    LD r3, [r5 + SR_H]
    CMP r3, r2
    JLE @ns
    LD r1, [r5 + SR_HGT]
    CMP r1, 4 * SPARK_FRAMES
    JLT @ns                         ; too small: no room for them inside its box
    LDI r6, SPARK_FRAMES + 1
    SUB r6, r7                      ; the sparks fly apart: 1 .. SPARK_FRAMES px
    SHR r1, 2
    LD r0, [r5 + SR_TOP]
    ADD r1, r0                      ; y: a quarter down, in its centre column
    LD r0, [r5 + SR_CX]
    LDI r7, 3
@sp:
    PUSH r0
    PUSH r1
    LDI r2, 1
    LDI r3, 1
    LDI r4, 11
    CMP r7, 1
    JNE @sc
    LDI r4, 14
@sc:
    SYS RECTFILL
    POP r1
    POP r0
    ADD r1, r6
    SUB r7, 1
    JNZ @sp
@ns:
    LD r6, [sd_rec]
    ADD r6, 2
    JMP @spr
@end:
    RET
; the rectangle list, clipped to [sd_cl, sd_cr): r5 = record. Clobbers r0-r7.
@rects:
    LD r6, [sd_list]
    LD r7, [r5 + SR_LEFT]
    LD r5, [sd_k]
@r:
    LDB r0, [r6]
    CMP r0, 255
    JEQ @rdone
    MUL r0, r5
    ADD r0, 32
    SHR r0, 6
    ADD r0, r7                      ; x0
    LDB r2, [r6 + 2]
    MUL r2, r5
    ADD r2, 32
    SHR r2, 6
    ADD r2, r7                      ; x1
    LD r1, [sd_cl]
    CMP r0, r1
    JGE @xa
    MOV r0, r1
@xa:
    LD r1, [sd_cr]
    CMP r2, r1
    JLE @xb
    MOV r2, r1
@xb:
    SUB r2, r0
    JLE @rnext
    LDB r1, [r6 + 1]
    MUL r1, r5
    ADD r1, 32
    SHR r1, 6
    LD r3, [sd_top]
    ADD r1, r3                      ; y0
    LDB r3, [r6 + 3]
    MUL r3, r5
    ADD r3, 32
    SHR r3, 6
    LD r4, [sd_top]
    ADD r3, r4
    SUB r3, r1                      ; height
    JLE @rnext
    LDB r4, [r6 + 4]
    LDB r4, [r4 + spr_pal]
    SYS RECTFILL
@rnext:
    ADD r6, 5
    JMP @r
@rdone:
    RET
