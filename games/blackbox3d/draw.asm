; BLACKBOX 3D — the play screen (DESIGN.md §3.5, §4.2): the 3D view (rendered RAY_CHUNK rays per frame, shown
; when complete), the actors as billboards, the detection and EMP overlays, and the status bar with the radar.
.code

; projected actors of the image being presented (per actor: words)
BB_DEPTH = 0
BB_LEFT  = 2
BB_TOP   = 4
BB_PIC   = 6                ; tiles of the picture at its size (column order)
BB_T     = 8                ; tiles per side
BB_FLIP  = 10
BB_SIZE  = 12
.var bb, MAX_ACT * BB_SIZE
.var bb_vis                 ; bit per actor: projected and drawn
.var bb_i

draw_play:
    LDI r0, F_ENDING        ; after the final action: only text on black
    CALL flag_test
    CMP r0, 0
    JEQ @world
    LDI r0, 0
    SYS CLS
    RET
@world:
    LD r0, [emp_fx]
    CMP r0, 0
    JEQ @render
    SUB r0, 1
    ST [emp_fx], r0
@render:
    LD r0, [loaded]         ; loading a room is a frame's work on its own
    CMP r0, 0
    JEQ @rays
    LDI r0, 0
    ST [loaded], r0
    JMP @hud
@rays:
    CALL render_step
@hud:
    CALL draw_hud
    CALL draw_bark
    RET

; the finished image: the view, the actors, the overlays
present:
    LDI r0, view_map
    LDI r1, buf - 32
    LDI r2, 16
    LDI r3, VIEW_H / 8
    LDI r4, 0
    LDI r5, 0
    SYS MAP
    CALL draw_billboards
    LD r0, [caught_t]       ; detected: a red frame
    CMP r0, 0
    JEQ @emp
    AND r0, 8
    JZ @emp
    LDI r0, 0
    LDI r1, 0
    LDI r2, 128
    LDI r3, VIEW_H
    LDI r4, 6
    SYS RECT
    LDI r0, 1
    LDI r1, 1
    LDI r2, 126
    LDI r3, VIEW_H - 2
    SYS RECT
@emp:
    LD r5, [emp_fx]         ; EMP: a cyan ring growing from the middle of the view
    CMP r5, 0
    JEQ @done
    XOR r5, 15
    SHL r5, 2
    LDI r0, 64
    SUB r0, r5
    LDI r1, VIEW_H / 2
    SUB r1, r5
    MOV r2, r5
    SHL r2, 1
    MOV r3, r2
    LDI r4, 13
    SYS RECT
@done:
    LD r0, [images]
    ADD r0, 1
    ST [images], r0
    RET

; ---- billboards --------------------------------------------------------------------------------
; project every visible actor with the image's camera, then draw them far to near
draw_billboards:
    LDI r0, 0
    ST [bb_vis], r0
    ST [ai], r0
    LDI r0, actors
    ST [ap], r0
@proj:
    LD r0, [ai]
    LD r1, [n_actors]
    CMP r0, r1
    JGE @draw
    CALL project
    LD r0, [ai]
    ADD r0, 1
    ST [ai], r0
    LD r0, [ap]
    ADD r0, ACT_SIZE
    ST [ap], r0
    JMP @proj
@draw:                      ; the farthest remaining one, until none is left
    LDI r5, -1              ; best index
    LDI r4, 0               ; its depth
    LDI r3, 0
@find:
    LD r0, [n_actors]
    CMP r3, r0
    JGE @found
    LDI r0, 1
    SHL r0, r3
    LD r1, [bb_vis]
    AND r1, r0
    JZ @nf
    MOV r1, r3
    MUL r1, BB_SIZE
    LD r1, [r1 + bb + BB_DEPTH]
    CMP r1, r4
    JLT @nf
    MOV r4, r1
    MOV r5, r3
@nf:
    ADD r3, 1
    JMP @find
@found:
    CMP r5, 0
    JLT @done
    LDI r0, 1               ; take it off the list and draw it
    SHL r0, r5
    XOR r0, -1
    LD r1, [bb_vis]
    AND r1, r0
    ST [bb_vis], r1
    MUL r5, BB_SIZE
    ADD r5, bb
    ST [bb_i], r5
    CALL draw_bb
    JMP @draw
@done:
    RET

; actor [ap] -> its record in bb and its bit in bb_vis, if it can be seen
project:
    LD r6, [ap]
    LD r5, [r6 + AC_TYPE]
    CMP r5, 0
    JEQ @out
    CMP r5, O_CAMERA
    JEQ @out                ; cameras are walls
    LD r0, [r6 + AC_STUN]   ; stunned: blink
    CMP r0, 0
    JEQ @vis
    LD r0, [frame]
    AND r0, 4
    JNZ @out
@vis:
    LD r0, [r6 + AC_X]      ; relative position of its centre, 8.8 cells
    ADD r0, 4
    SHL r0, 5
    LD r1, [cx]
    SUB r0, r1
    MOV r7, r0
    LD r0, [r6 + AC_Y]
    ADD r0, 4
    SHL r0, 5
    LD r1, [cy]
    SUB r0, r1
    PUSH r0                 ; rel y
    MOV r0, r7
    LD r1, [cdx]
    CALL fmul
    MOV r5, r0
    POP r0
    PUSH r0
    LD r1, [cdy]
    CALL fmul
    ADD r5, r0              ; depth = rel . dir
    CMP r5, PERP_MIN
    JLT @out1
    MOV r0, r7
    LD r1, [cdy]
    NEG r1
    CALL fmul
    MOV r4, r0
    POP r0
    LD r1, [cdx]
    CALL fmul
    ADD r4, r0              ; side = rel . (-dir y, dir x)
    MOV r0, r4              ; off screen if |side| > 2 depth
    CMP r0, 0
    JGE @abs
    NEG r0
@abs:
    MOV r1, r5
    SHL r1, 1
    CMP r0, r1
    JGT @out
    MOV r1, r5
@shrink:                    ; screen x = 64 + FOCAL * side / depth (SPIKE.md §3.6)
    CMP r0, 256
    JLT @ratio
    SHR r0, 1
    SAR r4, 1
    SAR r1, 1
    JMP @shrink
@ratio:
    SHL r4, 7
    DIV r4, r1
    MUL r4, FOCAL
    SAR r4, 7
    ADD r4, 64              ; r4 = centre x
    LDI r0, FOCAL256
    DIV r0, r5              ; q there: the wall is 2q high
    CMP r0, QMAX
    JLE @hok
    LDI r0, QMAX
@hok:
    LDB r1, [r0 + spr_size]
    CMP r1, 255
    JEQ @out
    LD r6, [ai]
    MUL r6, BB_SIZE
    ADD r6, bb
    ST [r6 + BB_DEPTH], r5
    ADD r0, VIEW_H / 2      ; the floor line: half the wall below the middle
    PUSH r1
    SHL r1, 1
    LD r2, [r1 + size_px]
    SUB r0, r2
    ST [r6 + BB_TOP], r0
    SHR r2, 1
    SUB r4, r2
    ST [r6 + BB_LEFT], r4
    CALL pose               ; -> r0 = picture, r3 = flip
    ST [r6 + BB_FLIP], r3
    POP r1
    MUL r0, NUM_SIZES
    ADD r0, r1
    SHL r0, 2
    LD r1, [r0 + pic_table]
    ST [r6 + BB_PIC], r1
    LD r1, [r0 + pic_table + 2]
    ST [r6 + BB_T], r1
    LDI r0, 1
    LD r1, [ai]
    SHL r0, r1
    LD r1, [bb_vis]
    OR r1, r0
    ST [bb_vis], r1
    RET
@out1:
    POP r0
@out:
    RET

; actor [ap] seen from the camera -> r0 = picture, r3 = 1 if mirrored. A guard faces the viewer, faces away or
; is seen from the side (DESIGN.md §4.2); everything else has one picture.
pose:
    PUSH r6
    LD r6, [ap]
    LD r0, [r6 + AC_TYPE]
    LDI r3, 0
    LDB r1, [r0 + has_poses]
    CMP r1, 0
    JNE @guard
    LDI r0, PIC_UNKNOWN
    POP r6
    RET
@guard:
    LD r1, [cx]             ; where the camera is, seen from the actor: the larger axis
    LD r0, [r6 + AC_X]
    ADD r0, 4
    SHL r0, 5
    SUB r1, r0
    LD r2, [cy]
    LD r0, [r6 + AC_Y]
    ADD r0, 4
    SHL r0, 5
    SUB r2, r0
    MOV r4, r1
    CALL abs4
    MOV r5, r2
    CALL abs5
    CMP r4, r5
    JLT @ns
    LDI r0, DIR_E
    CMP r1, 0
    JGE @side
    LDI r0, DIR_W
    JMP @side
@ns:
    LDI r0, DIR_S
    CMP r2, 0
    JGE @side
    LDI r0, DIR_N
@side:
    LD r1, [r6 + AC_DIR]    ; (facing - camera side) & 3: 0 front, 2 back, 1 side mirrored, 3 side
    SUB r1, r0
    AND r1, 3
    LDI r0, PIC_GUARD_FRONT
    CMP r1, 0
    JEQ @done
    LDI r0, PIC_GUARD_BACK
    CMP r1, 2
    JEQ @done
    LDI r0, PIC_GUARD_SIDE
    CMP r1, 3
    JEQ @done
    LDI r3, 1
@done:
    POP r6
    RET

; draw billboard [bb_i]: tile column by tile column, where it is nearer than the wall at that column's middle
; ray; behind a low block only the tile rows above the block's top (DESIGN.md §4.2)
draw_bb:
    LDI r7, 0               ; tile column
@col:
    LD r6, [bb_i]
    LD r1, [r6 + BB_T]
    CMP r7, r1
    JGE @done
    LD r0, [r6 + BB_LEFT]
    MOV r1, r7
    SHL r1, 3
    ADD r0, r1
    ADD r0, 4
    CMP r0, 0
    JLT @next
    CMP r0, 128
    JGE @next
    SHR r0, COLW_SHIFT      ; middle ray
    MOV r5, r0
    SHL r0, 1
    LD r1, [r0 + zb]
    LD r2, [r6 + BB_DEPTH]
    CMP r2, r1
    JGE @next
    LDI r4, VIEW_H          ; rows end: the view, or a nearer low block's top
    LD r1, [r0 + zlow]
    CMP r2, r1
    JB @rows
    LDB r4, [r5 + ylow]
@rows:
    ; source column: mirrored pictures are read right to left
    LD r1, [r6 + BB_T]
    MOV r0, r7
    LD r3, [r6 + BB_FLIP]
    CMP r3, 0
    JEQ @src
    MOV r0, r1
    SUB r0, 1
    SUB r0, r7
@src:
    MUL r0, r1
    SHL r0, 5
    LD r1, [r6 + BB_PIC]
    ADD r0, r1              ; first tile of the column
    LD r1, [r6 + BB_LEFT]
    MOV r2, r7
    SHL r2, 3
    ADD r1, r2              ; x
    LD r2, [r6 + BB_TOP]    ; y
    LD r5, [r6 + BB_T]
@tile:
    MOV r6, r2
    ADD r6, 8
    CMP r6, r4
    JGT @part               ; this tile reaches below the cut
    SYS SPR
    ADD r0, 32
    ADD r2, 8
    SUB r5, 1
    JNZ @tile
    JMP @next
@part:
    MOV r6, r4              ; its rows above the cut, pixel by pixel
    SUB r6, r2
    JLE @next
    PUSH r7
    CALL spr_rows
    POP r7
@next:
    ADD r7, 1
    JMP @col
@done:
    RET

; the first r6 rows of the 8x8 sprite at r0, at (r1, r2), mirrored if r3 = 1 (SPR's flag); keeps r0-r5
spr_rows:
    PUSH r0
    PUSH r1
    PUSH r2
    PUSH r3
    PUSH r4
    PUSH r5
    MOV r4, r0              ; source byte
    MOV r5, r3              ; mirrored?
@row:
    LDI r7, 0               ; pixel in the row
@px:
    MOV r3, r7
    SHR r3, 1
    ADD r3, r4
    LDB r3, [r3]
    MOV r0, r7
    AND r0, 1
    JNZ @low
    SHR r3, 4
@low:
    AND r3, 15
    JZ @skip                ; transparent
    MOV r0, r7
    CMP r5, 0
    JEQ @x
    XOR r0, 7
@x:
    ADD r0, r1              ; x
    PUSH r1
    PUSH r2
    MOV r1, r2              ; y
    MOV r2, r3              ; colour
    SYS PSET
    POP r2
    POP r1
@skip:
    ADD r7, 1
    CMP r7, 8
    JLT @px
    ADD r4, 4
    ADD r2, 1
    SUB r6, 1
    JNZ @row
    POP r5
    POP r4
    POP r3
    POP r2
    POP r1
    POP r0
    RET

; ---- the status bar ----------------------------------------------------------------------------
draw_hud:
    LDI r0, 0
    LDI r1, HUD_Y
    LDI r2, 128
    LDI r3, 128 - HUD_Y
    LDI r4, C_HUD
    SYS RECTFILL
    LDI r0, radar_map
    LDI r1, radar_buf - 32
    LDI r2, 4
    LDI r3, 4
    LDI r4, RADAR_X
    LDI r5, RADAR_Y
    SYS MAP
    CALL radar_actors
    LD r0, [pfx]            ; the player: a white dot and a dot ahead
    SHR r0, 7
    ADD r0, RADAR_X
    LD r1, [pfy]
    SHR r1, 7
    ADD r1, RADAR_Y
    LDI r2, C_RADAR_ME
    SYS PSET
    PUSH r0
    PUSH r1
    LD r0, [ang]
    CALL sincos
    POP r1
    POP r0
    SAR r3, 7
    ADD r0, r3
    SAR r2, 7
    ADD r1, r2
    LDI r2, 14
    SYS PSET
    LD r0, [room_rec]
    LDB r0, [r0 + RR_ZONE]
    SHL r0, 1
    LD r0, [r0 + section_names]
    LDI r1, 40
    LDI r2, HUD_Y + 4
    LDI r3, 7
    SYS TEXT
    ; the live ORACLE figure, once ORACLE has spoken (6.1)
    LDI r0, F_LIVE
    CALL flag_test
    CMP r0, 0
    JEQ @charges
    CALL accuracy
    LDI r1, num_buf
    CALL put_pct
    LDI r0, 0
    STB [r1], r0
    LDI r0, num_buf
    LDI r1, 40
    LDI r2, HUD_Y + 12
    LDI r3, 6
    SYS TEXT
@charges:
    LD r5, [charges]        ; EMP charges
    LDI r0, 120
@charge:
    CMP r5, 0
    JEQ @meter
    LDI r1, HUD_Y + 12
    LDI r2, 3
    LDI r3, 5
    LDI r4, 13
    SYS RECTFILL
    SUB r0, 5
    SUB r5, 1
    JMP @charge
@meter:
    LDI r0, s_seen          ; the detection meter
    LDI r1, 40
    LDI r2, HUD_Y + 28
    LDI r3, 3
    SYS TEXT
    LDI r0, 60
    LDI r1, HUD_Y + 28
    LDI r2, 66
    LDI r3, 5
    LDI r4, 3
    SYS RECT
    LD r2, [meter]
    CMP r2, 0
    JEQ @done
    LDI r0, 61
    LDI r1, HUD_Y + 29
    LDI r3, 3
    LDI r4, 6
    SYS RECTFILL
@done:
    RET

.data
radar_map:     .byte 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
section_names: .word s_sec0, s_sec1, s_sec2, s_sec3, s_sec4, s_sec5, s_sec6, s_sec7
s_sec0: .string "APARTMENT"
s_sec1: .string "ENTRANCE"
s_sec2: .string "ADMINISTRATION"
s_sec3: .string "SECURITY"
s_sec4: .string "LABORATORY"
s_sec5: .string "UNDERGROUND"
s_sec6: .string "SERVER COMPLEX"
s_sec7: .string "ORACLE CORE"
s_seen: .string "SEEN"
