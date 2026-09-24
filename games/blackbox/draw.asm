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
    CALL draw_player
    CALL draw_hud
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
