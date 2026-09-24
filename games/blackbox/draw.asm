; BLACKBOX — drawing the play screen.
.code

draw_play:
    LD r0, [floor_col]
    SYS CLS
    LDI r0, room_buf
    LD r1, [tileset]
    LDI r2, 16
    LDI r3, 15
    LDI r4, 0
    LDI r5, ROOM_Y
    SYS MAP
    CALL draw_actors
    CALL draw_player
    CALL draw_hud
    CALL draw_overlays
    RET

; detection frame and EMP pulse
draw_overlays:
    LD r0, [caught_t]
    CMP r0, 0
    JEQ @emp
    AND r0, 8
    JZ @emp
    LDI r0, 0
    LDI r1, ROOM_Y
    LDI r2, 128
    LDI r3, 120
    LDI r4, 6
    SYS RECT
    LDI r0, 1
    LDI r1, ROOM_Y + 1
    LDI r2, 126
    LDI r3, 118
    SYS RECT
@emp:
    LD r5, [emp_fx]
    CMP r5, 0
    JEQ @done
    SUB r5, 1
    ST [emp_fx], r5
    MOV r6, r5
    XOR r6, 15              ; grows as it fades: 0 .. 15
    SHL r6, 2
    LD r0, [px]
    ADD r0, 4
    SUB r0, r6
    LD r1, [py]
    ADD r1, ROOM_Y + 4
    SUB r1, r6
    MOV r2, r6
    SHL r2, 1
    MOV r3, r2
    LDI r4, 13
    SYS RECT
@done:
    RET

; Eli: 3 poses (down, up, side) x 2 walking frames; west = side flipped
draw_player:
    LD r2, [pdir]
    LDB r0, [r2 + pose_of_dir]
    LD r1, [pstep]
    SHR r1, 3
    AND r1, 1
    ADD r0, r1
    SHL r0, 5
    ADD r0, spr_eli
    LDI r3, 0
    CMP r2, DIR_W
    JNE @noflip
    LDI r3, 1
@noflip:
    LD r1, [px]
    LD r2, [py]
    ADD r2, ROOM_Y
    SYS SPR
    RET

draw_hud:
    LDI r0, 0
    LDI r1, 0
    LDI r2, 128
    LDI r3, ROOM_Y
    LDI r4, 0
    SYS RECTFILL
    LD r0, [room_rec]
    LDB r0, [r0 + RR_ZONE]
    SHL r0, 1
    LD r0, [r0 + section_names]
    LDI r1, 1
    LDI r2, 1
    LDI r3, 7
    SYS TEXT
    ; EMP charges
    LD r5, [charges]
    LDI r0, 123
@charge:
    CMP r5, 0
    JEQ @done
    LDI r1, 2
    LDI r2, 3
    LDI r3, 4
    LDI r4, 13
    SYS RECTFILL
    SUB r0, 5
    SUB r5, 1
    JMP @charge
@done:
    RET

.data
pose_of_dir:   .byte 2, 4, 0, 4     ; N up, E side, S down, W side (flipped)
section_names: .word s_sec0, s_sec1, s_sec2, s_sec3, s_sec4, s_sec5, s_sec6, s_sec7
s_sec0: .string "APARTMENT"
s_sec1: .string "ENTRANCE"
s_sec2: .string "ADMINISTRATION"
s_sec3: .string "SECURITY"
s_sec4: .string "LABORATORY"
s_sec5: .string "UNDERGROUND"
s_sec6: .string "SERVER COMPLEX"
s_sec7: .string "ORACLE CORE"
