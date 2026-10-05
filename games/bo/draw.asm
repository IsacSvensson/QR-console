; Camera and drawing (DESIGN.md §13, §14.2): one MAP call per visible column straight from the column-major
; level buffer, a parallax strip per world, Bo (two sprites and a RECTFILL board), the HUD.

; ---- camera ---------------------------------------------------------------------------------------
; camera_target: r0 = target cam_x, r1 = target cam_y
camera_target:
    LD r2, [bo_x]
    SHR r2, 4
    LD r3, [bo_vx]
    MOV r0, r2
    SUB r0, 64                      ; standing: centred
    CMP r3, 8
    JLT @notr
    MOV r0, r2
    SUB r0, CAM_AHEAD               ; rolling right: Bo at x 40
@notr:
    CMP r3, -8
    JGT @notl
    MOV r0, r2
    SUB r0, 128 - CAM_AHEAD         ; rolling left: Bo at x 88
@notl:
    LD r1, [bo_y]
    SAR r1, 4
    SUB r1, CAM_BOT
    RET

; camera_clamp: cam_x into 0..width-128, cam_y into the level's rows (16-row levels: fixed)
camera_clamp:
    LD r0, [cam_x]
    LD r1, [lv_wpx]
    SUB r1, 128
    CMP r0, r1
    JLE @xmax
    MOV r0, r1
@xmax:
    CMP r0, 0
    JGE @xmin
    LDI r0, 0
@xmin:
    ST [cam_x], r0
    LD r0, [cam_y]
    LDI r1, LV_ROWS * 8 - 128
    CMP r0, r1
    JLE @ymax
    MOV r0, r1
@ymax:
    LDI r1, LV_ROWS
    LD r2, [lv_rows]
    SUB r1, r2
    SHL r1, 3                       ; first visible world y of the level
    CMP r0, r1
    JGE @ymin
    MOV r0, r1
@ymin:
    ST [cam_y], r0
    RET

camera_snap:
    CALL camera_target
    ST [cam_x], r0
    ST [cam_y], r1
    JMP camera_clamp

camera_update:
    CALL camera_target
    ; horizontal: a quarter of the way to the target each frame, but Bo always stays 24..104 on screen
    LD r2, [cam_x]
    SUB r0, r2
    SAR r0, 2
    ADD r2, r0
    LD r3, [bo_x]
    SHR r3, 4
    MOV r0, r3
    SUB r0, 104
    CMP r2, r0
    JGE @right
    MOV r2, r0
@right:
    MOV r0, r3
    SUB r0, 24
    CMP r2, r0
    JLE @left
    MOV r2, r0
@left:
    ST [cam_x], r2
    ; vertical: dead zone of 16 px around the target, then follow
    LD r2, [cam_y]
    MOV r0, r1
    SUB r0, r2                      ; target - cam
    CMP r0, 16
    JLE @nd
    SUB r0, 16
    ADD r2, r0
    JMP @vy
@nd:
    CMP r0, -16
    JGE @vy
    ADD r0, 16
    ADD r2, r0
@vy:
    ST [cam_y], r2
    JMP camera_clamp

; ---- the play screen ------------------------------------------------------------------------------
draw_play:
    LD r1, [lv_world]
    LDB r0, [r1 + world_sky - 1]
    SYS CLS
    CALL draw_strip
    CALL draw_level
    CALL draw_bo
    CALL draw_hud
    RET

; parallax strip: 16 x 3 tiles at half the camera speed, drawn twice to wrap
draw_strip:
    LD r1, [lv_world]
    SUB r1, 1
    SHL r1, 1
    LD r0, [r1 + strips]
    LDI r1, tilebank
    LDI r2, 16
    LDI r3, 3
    LD r4, [cam_x]
    SHR r4, 1
    AND r4, 127
    NEG r4
    LD r5, [cam_y]                  ; 72 on a 16-row level; half speed vertically on a 32-row level
    NEG r5
    ADD r5, 128
    SAR r5, 1
    ADD r5, 72
    SYS MAP
    ADD r4, 128
    SYS MAP
    RET

draw_level:
    LD r7, [cam_y]
    SAR r7, 3                       ; first row
    LDI r3, LV_ROWS
    SUB r3, r7
    CMP r3, VIEW_COLS
    JLE @rows
    LDI r3, VIEW_COLS
@rows:
    LD r5, [cam_y]
    AND r5, 7
    NEG r5
    LDI r6, 0                       ; screen column
@col:
    LD r0, [cam_x]
    SHR r0, 3
    ADD r0, r6                      ; level column
    LD r1, [lv_w]
    CMP r0, r1
    JAE @done
    SHL r0, 5
    ADD r0, r7
    ADD r0, lvl
    LDI r1, tilebank
    LDI r2, 1
    MOV r4, r6
    SHL r4, 3
    LD r1, [cam_x]
    AND r1, 7
    SUB r4, r1
    LDI r1, tilebank
    SYS MAP
    ADD r6, 1
    CMP r6, VIEW_COLS
    JLT @col
@done:
    RET

; Bo: upper body + legs (two sprites) + the board (RECTFILL). sx, sy = sprite top-left on screen.
draw_bo:
    LD r5, [bo_x]
    SHR r5, 4
    SUB r5, 4
    LD r0, [cam_x]
    SUB r5, r0                      ; r5 = sx
    LD r6, [bo_y]
    SAR r6, 4
    SUB r6, 16
    LD r0, [cam_y]
    SUB r6, r0                      ; r6 = sy
    LDI r3, 0
    LD r0, [bo_dir]
    CMP r0, 0
    JGE @flip
    LDI r3, 1
@flip:
    LD r0, [bo_crouch]
    CMP r0, 0
    JEQ @tall
    LDI r0, spr_bo_up
    MOV r1, r5
    MOV r2, r6
    ADD r2, 4
    SYS SPR
    LDI r0, spr_bo_crouch
    ADD r2, 4
    SYS SPR
    JMP @board
@tall:
    LDI r0, spr_bo_up
    MOV r1, r5
    MOV r2, r6
    SYS SPR
    LDI r0, spr_bo_lo
    LD r4, [bo_state]
    CMP r4, ST_GROUND
    JNE @legs
    LD r4, [btn]                    ; pushing: the push frame every other 8 frames
    AND r4, BTN_LEFT | BTN_RIGHT
    JZ @legs
    LD r4, [tick]
    AND r4, 8
    JZ @legs
    LDI r0, spr_bo_lo + 32
@legs:
    ADD r2, 8
    SYS SPR
@board:
    MOV r0, r5                      ; deck on row 14, tails on row 13, wheels on row 15
    MOV r1, r6
    ADD r1, 14
    LDI r2, 8
    LDI r3, 1
    LDI r4, C_BLACK
    SYS RECTFILL
    SUB r0, 1
    SUB r1, 1
    LDI r2, C_BLACK
    SYS PSET
    ADD r0, 9
    SYS PSET
    MOV r0, r5
    ADD r0, 1
    ADD r1, 2
    LDI r2, 2
    LDI r4, C_WHITE
    SYS RECTFILL
    ADD r0, 4
    SYS RECTFILL
    RET

; HUD: apples, the level's stars, Bo's head x lives
draw_hud:
    LDI r0, 0
    LDI r1, 0
    LDI r2, 128
    LDI r3, HUD_H
    LDI r4, C_NAVY
    SYS RECTFILL
    LDI r0, spr_apple
    LDI r1, 1
    LDI r2, 0
    LDI r3, 0
    SYS SPR
    LD r0, [apples]
    LDI r1, 10
    LDI r2, 1
    LDI r3, C_WHITE
    SYS NUM
    LDI r6, 0
@star:
    LDI r0, spr_star_off
    MOV r1, r6
    MUL r1, 9
    ADD r1, 32
    LDI r2, 0
    LDI r3, 0
    SYS SPR
    ADD r6, 1
    CMP r6, 3
    JLT @star
    LDI r0, spr_bo_head
    LDI r1, 68
    LDI r2, 1
    SYS SPR
    LDI r0, s_times
    LDI r1, 77
    LDI r2, 1
    LDI r3, C_WHITE
    SYS TEXT
    LD r0, [lives]
    LDI r1, 81
    SYS NUM
    RET

.data
s_times: .string "X"
.code
