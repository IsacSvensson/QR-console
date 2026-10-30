; NADIR - wall drawing (DESIGN §3.5-3.6). The columns are walked as face spans (neighbouring columns that hit the
; same face): the light of the cell in front, the zone and the material are looked up once per span. Per column:
; the light level from tables (fog - cone + bias, + span base, clamped by a table), the texture column by LOD, the
; base colour as one RECTFILL and the detail runs on top.
.code

.var sh_base                        ; shade table of the column being drawn
.var wc                             ; column being drawn
.var sp_end                         ; last column of the span
.var sp_base                        ; amb - light of the span
.var sp_zone
.var sp_set                         ; shade + zone * 256
.var sp_ent                         ; material entry (mat_ent row) of the span

draw_walls:
    LDI r0, 0
    ST [wc], r0
@span:
    LD r6, [wc]
    MOV r7, r6
    SHL r7, 1
    LD r1, [r7 + col_face]
    MOV r2, r7
@scan:                              ; the span ends before the first column with another face
    ADD r2, 2
    CMP r2, 2 * COLS
    JAE @send
    LD r3, [r2 + col_face]
    CMP r3, r1
    JEQ @scan
@send:
    SHR r2, 1
    SUB r2, 1
    ST [sp_end], r2
    LD r2, [r7 + col_front]
    CALL span_light
    LDB r1, [r6 + col_mat]
    SHL r1, 1
    LD r1, [r1 + mat_cur]
    ST [sp_ent], r1
@col:                               ; r6 = c, r7 = 2c
    ; ---- light level: clamp_tab[fog table of this column [min(h, 255)] + span base]
    LD r0, [r7 + col_h]
    LD r1, [r7 + colfog]            ; this column's fog table (with its flashlight cone), indexed by h
    ADD r1, r0
    LDB r1, [r1]
    LD r0, [sp_base]
    ADD r1, r0
    LDB r1, [r1 + clamp_tab]
    STB [r6 + col_lvl], r1
    SHL r1, 5
    LD r0, [sp_set]
    ADD r1, r0
    ST [sh_base], r1
    ; ---- texture column: LOD by height, column u >> lod
    LD r1, [sp_ent]
    LD r5, [r7 + col_h]
    LDB r2, [r6 + col_u]
    CMP r5, LOD1_H
    JAE @lod0
    CMP r5, LOD2_H
    JAE @lod1
    LD r1, [r1 + 4]
    SHR r2, 2
    JMP @tab
@lod1:
    LD r1, [r1 + 2]
    SHR r2, 1
    JMP @tab
@lod0:                              ; compiled column: code in RAM, called with x, w, h, shade, top in registers
    LD r1, [r1]
    SHL r2, 1
    ADD r2, r1
    LD r4, [r2]
    MOV r0, r7                      ; x = 2c
    MOV r7, r5
    SHR r7, 1
    NEG r7
    LD r1, [hor]
    ADD r7, r1                      ; top
    LD r6, [sh_base]
    LDI r2, COL_W
    CALL r4
    JMP @next
@tab:
    SHL r2, 1
    ADD r2, r1
    LD r6, [r2]                     ; column data: base, runs (v0, v1, colour), 255
    ; ---- base colour over the whole wall height
    MOV r0, r7                      ; x = 2c
    MOV r7, r5
    SHR r7, 1
    NEG r7
    LD r1, [hor]
    ADD r7, r1                      ; top = horizon - h / 2
    MOV r1, r7
    MOV r3, r5
    LDB r4, [r6]
    LD r2, [sh_base]
    ADD r4, r2
    LDB r4, [r4]
    LDI r2, COL_W
    SYS RECTFILL
    ADD r6, 1
    ; ---- detail runs: y = top + v * h / 32 (r0 = x, r5 = h, r6 = run, r7 = top)
@run:
    LDB r1, [r6]
    CMP r1, 255
    JEQ @next
    MUL r1, r5
    SHR r1, 5
    ADD r1, r7
    LDB r3, [r6 + 1]
    MUL r3, r5
    SHR r3, 5
    ADD r3, r7
    SUB r3, r1
    LDB r4, [r6 + 2]
    LD r2, [sh_base]
    ADD r4, r2
    LDB r4, [r4]
    LDI r2, COL_W
    SYS RECTFILL
    ADD r6, 3
    JMP @run
@next:
    LD r6, [wc]
    ADD r6, 1
    ST [wc], r6
    MOV r7, r6
    SHL r7, 1
    LD r0, [sp_end]
    CMP r6, r0
    JLE @col
    CMP r6, COLS
    JLT @span
    RET

; r2 = the cell in front of a face -> the span light (DESIGN §3.5): sp_base = the zone's darkness - max(static,
; flicker if lit), sp_set = the zone's shade tables. Clobbers r0, r1, r3, r4.
span_light:
    LDB r0, [r2 + lmap]
    MOV r3, r0
    AND r3, 7
    MOV r4, r0
    SHR r4, 3
    AND r4, 7
    SHR r0, 6
    LDB r0, [r0 + group_lit]
    MUL r4, r0
    CMP r4, r3
    JGE @lit
    MOV r4, r3
@lit:
    LDB r1, [r2 + zmap]
    ST [sp_zone], r1
    LDB r0, [r1 + zone_amb]
    SUB r0, r4
    LD r3, [rflash]                 ; the muzzle flash (DESIGN §6.1)
    SUB r0, r3
    ST [sp_base], r0
    SHL r1, 8
    ADD r1, shade
    ST [sp_set], r1
    RET

; The masked layer (DESIGN §3.10, §3.12), after all walls, by spans of columns with the same masked plane: light,
; zone and material once per span; per column its light level and its opaque runs (LOD 0 compiled, without a
; base colour, like the walls; LOD 1 and 2 as data runs). r0 = 0: the columns whose plane is behind the sprites
; there (h <= spr_hc), drawn before the sprites; r0 = 1: the others, after them.
.var mc
.var mpass
draw_masks:
    ST [mpass], r0
    LD r1, [mcount]
    CMP r1, 0
    JNE @some
    RET                             ; no masked plane in this image
@some:
    CMP r0, 0
    JNE @go
    LD r1, [spr_rects]
    CMP r1, 0
    JNE @go
    RET                             ; no sprites: everything is drawn by the second pass
@go:
    LDI r6, 0
@span:
    ST [mc], r6
    MOV r7, r6
    SHL r7, 1
    LD r1, [r7 + col_mface]
    MOV r2, r7
@scan:
    ADD r2, 2
    CMP r2, 2 * COLS
    JAE @send
    LD r3, [r2 + col_mface]
    CMP r3, r1
    JEQ @scan
@send:
    SHR r2, 1
    SUB r2, 1
    ST [sp_end], r2
    CMP r1, -1
    JEQ @skip                       ; no masked plane in these columns
    LD r2, [r7 + col_mfront]
    CALL span_light
    LDB r1, [r6 + col_mmat]
    SHL r1, 1
    LD r1, [r1 + mat_cur]
    ST [sp_ent], r1
@col:
    LD r0, [r7 + col_mh]
    LD r1, [r7 + spr_hc]
    CMP r1, r0
    LD r1, [mpass]
    JB @front                       ; nearer than every sprite here: after them
    CMP r1, 0
    JNE @next
    JMP @this
@front:
    CMP r1, 0
    JEQ @next
@this:
    LD r1, [r7 + colfog]
    ADD r1, r0
    LDB r1, [r1]
    LD r0, [sp_base]
    ADD r1, r0
    LDB r1, [r1 + clamp_tab]
    STB [r6 + col_mlvl], r1
    SHL r1, 5
    LD r0, [sp_set]
    ADD r1, r0
    ST [sh_base], r1
    LD r1, [sp_ent]
    LD r5, [r7 + col_mh]
    LDB r2, [r6 + col_mu]
    CMP r5, LOD1_H
    JAE @lod0
    CMP r5, LOD2_H
    JAE @lod1
    LD r1, [r1 + 4]
    SHR r2, 2
    JMP @tab
@lod1:
    LD r1, [r1 + 2]
    SHR r2, 1
    JMP @tab
@lod0:
    LD r1, [r1]
    SHL r2, 1
    ADD r2, r1
    LD r4, [r2]
    MOV r0, r7
    MOV r7, r5
    SHR r7, 1
    NEG r7
    LD r1, [hor]
    ADD r7, r1
    LD r6, [sh_base]
    LDI r2, COL_W
    CALL r4
    JMP @next
@tab:
    SHL r2, 1
    ADD r2, r1
    LD r6, [r2]
    ADD r6, 1                       ; past the (transparent) base
    MOV r0, r7
    MOV r7, r5
    SHR r7, 1
    NEG r7
    LD r1, [hor]
    ADD r7, r1
@run:
    LDB r1, [r6]
    CMP r1, 255
    JEQ @next
    MUL r1, r5
    SHR r1, 5
    ADD r1, r7
    LDB r3, [r6 + 1]
    MUL r3, r5
    SHR r3, 5
    ADD r3, r7
    SUB r3, r1
    LDB r4, [r6 + 2]
    LD r2, [sh_base]
    ADD r4, r2
    LDB r4, [r4]
    LDI r2, COL_W
    SYS RECTFILL
    ADD r6, 3
    JMP @run
@next:
    LD r6, [mc]
    ADD r6, 1
    ST [mc], r6
    MOV r7, r6
    SHL r7, 1
    LD r0, [sp_end]
    CMP r6, r0
    JLE @col
    CMP r6, COLS
    JLT @span
    RET
@skip:
    LD r6, [sp_end]
    ADD r6, 1
    CMP r6, COLS
    JLT @span
    RET

; A LOD 0 column of a nocompile material (DESIGN §3.6): its stub in coderam jumps here with r1 = the column data.
; Same contract as a compiled column: r0 = x, r2 = COL_W, r5 = h, r6 = shade table, r7 = top; clobbers r1, r3, r4.
.var cd_p
col_data:
    LDB r4, [r1]
    ADD r1, 1
    ST [cd_p], r1
    ADD r4, r6
    LDB r4, [r4]
    MOV r1, r7
    MOV r3, r5
    SYS RECTFILL
@run:
    LD r4, [cd_p]
    LDB r1, [r4]
    CMP r1, 255
    JEQ @done
    MUL r1, r5
    SHR r1, 5
    ADD r1, r7
    LDB r3, [r4 + 1]
    MUL r3, r5
    SHR r3, 5
    ADD r3, r7
    SUB r3, r1
    LDB r4, [r4 + 2]
    ADD r4, r6
    LDB r4, [r4]
    SYS RECTFILL
    LD r4, [cd_p]
    ADD r4, 3
    ST [cd_p], r4
    JMP @run
@done:
    RET
