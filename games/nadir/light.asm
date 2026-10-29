; NADIR - per-frame light and material state (DESIGN §3.5-3.6).
.code

; Per frame: which flicker groups are lit, and mat_cur[m] = the entry of material
; m's current animation frame.
light_frame:
    ; group_lit[g] = 1 if flicker group g is lit this frame (DESIGN §3.5)
    LD r6, [tick]
    SHR r6, FLICK_SHIFT
    AND r6, 31
    LDI r5, 0
@group:
    MOV r1, r5
    SHL r1, 5
    ADD r1, r6
    LDB r1, [r1 + flick_tab]
    STB [r5 + group_lit], r1
    ADD r5, 1
    CMP r5, 4
    JLT @group
    ; ---- material animation frames
    LDI r5, 1
@mat:
    LDB r1, [r5 + mat_shift]
    LD r0, [tick]
    SHR r0, r1
    LDB r1, [r5 + mat_mask]
    AND r0, r1
    LDB r1, [r5 + mat_first]
    ADD r0, r1
    SHL r0, 3                       ; 8 bytes per entry
    ADD r0, mat_ent
    MOV r1, r5
    SHL r1, 1
    ST [r1 + mat_cur], r0
    ADD r5, 1
    CMP r5, NUM_MATS + 1
    JLT @mat
    RET
