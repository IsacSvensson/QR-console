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
    ; ---- span light (DESIGN §3.5): max(static, flicker if lit), the zone's darkness
    LD r2, [r7 + col_front]
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
    ST [sp_base], r0
    SHL r1, 8
    ADD r1, shade
    ST [sp_set], r1
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
