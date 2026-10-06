; The game around the levels (DESIGN.md §13, FIRST10.md §3–4, §6): title, intro, picture code, world map, tally,
; the scene after a boss. The title and the intro are drawn over level 1-1's street.
GAME_LEVELS = 25
TITLE_LOAD  = 1                     ; after loading: the title (instead of play)
CODE_TEST   = 15                    ; four Bos: the test levels
FIRST_W2    = 5                     ; game level index of 2-1

; ---- starting -------------------------------------------------------------------------------------
; to_title: load 1-1 behind the title
to_title:
    LDI r0, TITLE_LOAD
    ST [ld_after], r0
    LDI r0, LV_1_1
    JMP level_start

; game_level: r0 = game level (0 = 1-1) -> starts it
game_level:
    ADD r0, LV_1_1
    JMP level_start

; ---- title (FIRST10 §3) ---------------------------------------------------------------------------
on_title:
    LD r0, [title_t]
    ADD r0, 1
    ST [title_t], r0
    ; Bo rolls in from the left, pops an ollie, brakes in the middle and balances
    MOV r1, r0
    CMP r1, 60
    JLT @in
    LDI r1, 60
@in:
    ADD r1, 4                       ; x on screen: 4..64 px (stops in the middle)
    LDI r2, P_PUSH
    CMP r0, 30
    JLT @pose
    LDI r2, P_POP
    CMP r0, 54
    JLT @pose
    LDI r2, P_BRAKE
    CMP r0, 70
    JLT @pose
    LDI r2, P_BALANCE
@pose:
    ST [bo_pose], r2
    LDI r3, IDLE_POP + 12           ; the pop arc reads bo_idle_t
    ST [bo_idle_t], r3
    LD r3, [cam_x]
    ADD r1, r3
    SHL r1, 4
    ST [bo_x], r1
    LDI r0, 1
    ST [bo_dir], r0
    ST [bo_kick_t], r0
    LD r0, [tick]
    ST [bo_kick_t], r0
    CALL ground_bo
    CALL draw_scene
    ; the title banner
    LDI r0, 20
    LDI r1, 14
    LDI r2, 88
    LDI r3, 26
    LDI r4, C_WHITE
    SYS RECTFILL
    LDI r4, C_PURPLE
    SYS RECT
    LDI r0, TX_BO_S
    LDI r1, 52
    LDI r2, 15
    CALL draw_text_id
    LDI r0, TX_SKATEAVENTYR
    LDI r1, 28
    LDI r2, 27
    CALL draw_text_id
    ; a pulsing A button under Bo
    LD r0, [tick]
    AND r0, 16
    JZ @nob
    LDI r0, spr_btn_a
    LD r1, [bo_x]
    SHR r1, 4
    LD r2, [cam_x]
    SUB r1, r2
    SUB r1, 4
    LDI r2, 118
    LDI r3, 0
    SYS SPR
@nob:
    LD r0, [btnp]
    CMP r0, 0
    JEQ @wait
    AND r0, BTN_B
    JNZ @code
    LD r0, [first_done]             ; the first time: the intro, then straight into 1-1
    CMP r0, 0
    JNE @map
    LDI r0, 0
    ST [scene_t], r0
    LDI r0, M_INTRO
    ST [mode], r0
    RET
@map:
    JMP to_map
@code:
    LDI r0, 0
    ST [code_pos], r0
    ST [code_v], r0
    ST [code_v + 2], r0
    ST [code_bad], r0
    LDI r0, M_CODE
    ST [mode], r0
@wait:
    RET

; draw_scene: the street of 1-1 (sky, parallax, level, Bo); used by the title and the intro
draw_scene:
    LDB r0, [wblk + WB_SKY]
    SYS CLS
    CALL draw_clouds
    CALL draw_strip
    CALL draw_level
    JMP draw_bo

draw_clouds:                        ; two clouds drifting slowly
    LD r6, [tick]
    SHR r6, 3
    LDI r7, 0
@c:
    MOV r1, r6
    ADD r1, r7
    AND r1, 255
    SUB r1, 64
    LDI r0, spr_cloud
    LDI r2, 24
    ADD r2, r7
    SHR r2, 2
    LDI r3, 0
    SYS SPR
    ADD r1, 8
    LDI r3, 1
    SYS SPR
    ADD r7, 120
    CMP r7, 240
    JLT @c
    RET

; ground_bo: Bo's feet on the surface under bo_x
ground_bo:
    LD r1, [bo_x]
    SHR r1, 4
    LDI r2, 0
    LDI r3, LV_ROWS * 8 - 1
    LDI r6, 0
    CALL surface
    SHL r0, 4
    ST [bo_y], r0
    RET

; draw_text_id: r0 = text id, r1 = x, r2 = y
draw_text_id:
    SHL r0, 1
    LD r0, [r0 + text_table]
    JMP draw_text

; ---- intro (FIRST10 §4): 15 s, A skips --------------------------------------------------------------
on_intro:
    LD r0, [btnp]
    AND r0, BTN_A
    JNZ @go
    LD r0, [scene_t]
    ADD r0, 1
    ST [scene_t], r0
    CMP r0, 15 * 60
    JGE @go
    ; Bo sits on the steps by the house (crouching), a bag of pommes beside him
    LDI r1, 5 * 8 * 16
    ST [bo_x], r1
    LDI r1, P_CROUCH
    CMP r0, 7 * 60
    JLT @sit
    LDI r1, P_RIDE                  ; he stands up
    CMP r0, 10 * 60
    JLT @sit
    LDI r1, P_PUSH                  ; on the board: after the seagull
    LD r2, [scene_t]
    SUB r2, 10 * 60
    SHL r2, 4
    LDI r3, 5 * 8 * 16
    ADD r2, r3
    ST [bo_x], r2
@sit:
    ST [bo_pose], r1
    LD r1, [tick]
    ST [bo_kick_t], r1
    CALL ground_bo
    CALL draw_scene
    LD r0, [scene_t]
    CMP r0, 5 * 60 + 30             ; the pommes, until the seagull takes them
    JGE @nobag
    LDI r0, spr_fries
    LDI r1, 52
    LDI r2, 102
    LDI r3, 0
    SYS SPR
@nobag:
    LD r6, [scene_t]                ; a shadow grows on the grass (3-5 s)
    CMP r6, 3 * 60
    JLT @gull
    CMP r6, 5 * 60
    JGE @gull
    SUB r6, 3 * 60
    SHR r6, 3
    LDI r0, 52
    SUB r0, r6
    LDI r1, 110
    MOV r2, r6
    SHL r2, 1
    ADD r2, 4
    LDI r3, 2
    LDI r4, C_DGREEN
    SYS RECTFILL
@gull:
    LD r6, [scene_t]                ; the seagull dives (5-7 s) and flies off right with the bag
    CMP r6, 5 * 60
    JLT @lines
    SUB r6, 5 * 60
    MOV r1, r6
    SHL r1, 1
    ADD r1, 20                      ; x
    MOV r2, r6
    CMP r2, 30
    JLT @down
    LDI r2, 60
    SUB r2, r6
@down:
    SHL r2, 1
    ADD r2, 40                      ; y: down to the bag, then up
    CMP r2, 20
    JGE @y
    LDI r2, 20
@y:
    LDI r0, spr_en_gull
    LDI r3, 0
    SYS SPR
    ADD r1, 8
    ADD r0, 32
    SYS SPR
    CMP r6, 30
    JLT @lines
    LDI r0, spr_fries
    SUB r1, 4
    ADD r2, 7
    SYS SPR
@lines:
    LD r0, [scene_t]                ; the lines (bubbles above Bo)
    LDI r1, TX_MUMS
    CMP r0, 1
    JEQ @say
    LDI r1, TX_SKRIII
    CMP r0, 3 * 60
    JEQ @say
    LDI r1, TX_NEJ_MINA_POMMES
    CMP r0, 7 * 60
    JEQ @say
    LDI r1, TX_VANTA_MASEN
    CMP r0, 10 * 60
    JNE @draw
@say:
    MOV r0, r1
    CALL say
@draw:
    JMP draw_bubble
@go:                                ; 1-1 begins: Bo on the lawn, the level's name as a banner
    LDI r0, 1
    ST [first_done], r0
    JMP play_loaded

; play_loaded: play the level that is already loaded (1-1 behind the title)
play_loaded:
    CALL bo_spawn_start
    CALL camera_snap
    CALL level_banner
    LDI r0, 255
    ST [bub_id], r0
    LDI r0, 0
    ST [bub_t], r0
    LDI r0, M_PLAY
    ST [mode], r0
    LD r0, [lv_music]
    JMP set_music

; level_banner: the level's name over the play screen for 1.5 s
level_banner:
    LD r1, [level]
    LDB r0, [r1 + level_names]
    ST [banner_id], r0
    LDI r0, 90
    ST [banner_t], r0
    RET

; ---- picture code (DESIGN §7.3; M22: only the test code, M25 decodes the real ones) -------------------
on_code:
    LD r0, [btnp]
    LD r1, [code_pos]
    MOV r2, r0
    AND r2, BTN_LEFT
    JZ @r
    SUB r1, 1
    AND r1, 3
@r:
    MOV r2, r0
    AND r2, BTN_RIGHT
    JZ @ud
    ADD r1, 1
    AND r1, 3
@ud:
    ST [code_pos], r1
    LDB r3, [r1 + code_v]
    MOV r2, r0
    AND r2, BTN_UP
    JZ @dn
    ADD r3, 1
@dn:
    MOV r2, r0
    AND r2, BTN_DOWN
    JZ @set
    SUB r3, 1
@set:
    AND r3, 15
    STB [r1 + code_v], r3
    AND r0, BTN_A
    JZ @draw
    CALL code_decode                ; a real code: back to that world (Z clear if it was one)
    JNZ @done
    LDI r1, 0                       ; four Bos: the test levels
@chk:
    LDB r0, [r1 + code_v]
    CMP r0, CODE_TEST
    JNE @bad
    ADD r1, 1
    CMP r1, 4
    JLT @chk
    LDI r0, M_MENU
    ST [mode], r0
    RET
@bad:
    LDI r0, 90
    ST [code_bad], r0
@draw:
    LDI r0, C_NAVY
    SYS CLS
    LDI r0, TX_KOD
    LDI r1, 52
    LDI r2, 24
    CALL draw_text_id
    LDI r6, 0
@slot:
    MOV r1, r6
    MUL r1, 20
    ADD r1, 26
    LDI r2, 56
    MOV r0, r1
    SUB r0, 2
    MOV r5, r1
    LDI r1, 54
    LDI r2, 12
    LDI r3, 12
    LDI r4, C_WHITE
    LD r7, [code_pos]
    CMP r7, r6
    JNE @frame
    LDI r4, C_YELLOW
@frame:
    SYS RECTFILL
    LDB r0, [r6 + code_v]
    SHL r0, 1
    LD r0, [r0 + code_pics]
    MOV r1, r5
    LDI r2, 56
    LDI r3, 0
    SYS SPR
    ADD r6, 1
    CMP r6, 4
    JLT @slot
    LD r0, [code_bad]
    CMP r0, 0
    JEQ @done
    SUB r0, 1
    ST [code_bad], r0
    LDI r0, TX_FEL_KOD
    LDI r1, 43
    LDI r2, 84
    CALL draw_text_id
@done:
    RET

;; The picture code (DESIGN 7.3): 16 bits in four pictures of 4 bits, high to low:
;;   world (3 bits: 1-5, or 6 = the game is done) | world boards (5 bits, world 1 = the lowest)
;;   | worlds with all 12 stars (5 bits) | checksum (3 bits) = (3 * world + 5 * boards + 7 * full + 1) & 7.
;; Boards and full worlds can only be worlds that are done (those before the code's world).
; code_check: r0 = world, r1 = boards, r2 = full -> r3 = checksum
code_check:
    MOV r3, r0
    MUL r3, 3
    PUSH r1
    MUL r1, 5
    ADD r3, r1
    POP r1
    PUSH r2
    MUL r2, 7
    ADD r3, r2
    POP r2
    ADD r3, 1
    AND r3, 7
    RET

; code_encode: the code of the current state -> map_code (the map shows it)
code_encode:
    LD r0, [map_world]              ; world: the map's (1-5), or 6 when the final is done
    ADD r0, 1
    LD r1, [super_ok]
    CMP r1, 0
    JEQ @w
    LDI r0, 6
@w:
    LD r1, [boards]                 ; world boards: bits 1-5 of boards
    SHR r1, 1
    AND r1, 31
    LDI r2, 0                       ; full worlds: all 12 stars of the four levels
    LDI r4, 0
@world:
    MOV r5, r4
    MUL r5, 5
    LDI r6, 0
    LDI r7, 0
@level:
    LDB r3, [r5 + progress]
    AND r3, 7
    CMP r3, 7
    JNE @notall
    ADD r7, 1
@notall:
    ADD r5, 1
    ADD r6, 1
    CMP r6, 4
    JLT @level
    CMP r7, 4
    JLT @nf
    LDI r3, 1
    SHL r3, r4
    OR r2, r3
@nf:
    ADD r4, 1
    CMP r4, 5
    JLT @world
    MOV r3, r0                      ; only worlds that are done
    SUB r3, 1
    LDI r5, 1
    SHL r5, r3
    SUB r5, 1
    AND r1, r5
    AND r2, r5
    CALL code_check
    SHL r0, 13
    SHL r1, 8
    OR r0, r1
    SHL r2, 3
    OR r0, r2
    OR r0, r3
    ST [map_code], r0
    RET

; code_decode: the four pictures entered -> Z set if it is no code; else the game as the code says, and the map
code_decode:
    LDB r0, [code_v]                ; v = the four nibbles
    SHL r0, 4
    LDB r1, [code_v + 1]
    OR r0, r1
    SHL r0, 4
    LDB r1, [code_v + 2]
    OR r0, r1
    SHL r0, 4
    LDB r1, [code_v + 3]
    OR r0, r1
    MOV r6, r0                      ; r6 = v
    SHR r0, 13                      ; world
    CMP r0, 1
    JLT @no
    CMP r0, 6
    JGT @no
    MOV r1, r6
    SHR r1, 8
    AND r1, 31
    MOV r2, r6
    SHR r2, 3
    AND r2, 31
    MOV r5, r0                      ; boards and full worlds only among the worlds done
    SUB r5, 1
    LDI r4, 1
    SHL r4, r5
    SUB r4, 1
    XOR r4, 31                      ; the worlds not done
    MOV r5, r1
    OR r5, r2
    AND r5, r4
    JNZ @no
    CALL code_check
    MOV r5, r6
    AND r5, 7
    CMP r3, r5
    JNE @no
    ; the game as the code says: progress, boards, the theft, SUPERBOSSE
    ST [t_cw], r0
    ST [t_cb], r1
    ST [t_cf], r2
    LDI r7, 0
@clear:
    LDI r3, 0
    STB [r7 + progress], r3
    ADD r7, 1
    CMP r7, 25
    JLT @clear
    LD r0, [t_cw]                   ; the levels of the worlds done are done
    SUB r0, 1
    MUL r0, 5
    CMP r0, 25
    JLE @n
    LDI r0, 25
@n:
    LDI r7, 0
@done:
    CMP r7, r0
    JGE @worlds
    LDI r3, PR_DONE
    STB [r7 + progress], r3
    ADD r7, 1
    JMP @done
@worlds:
    LDI r4, 0                       ; per world: its board (the four parts), all 12 stars
@wl:
    MOV r5, r4
    MUL r5, 5
    LDI r6, 0
@lv:
    LDB r3, [r5 + progress]
    LD r1, [t_cb]
    SHR r1, r4
    AND r1, 1
    JZ @nopart
    OR r3, PR_PART
@nopart:
    LD r1, [t_cf]
    SHR r1, r4
    AND r1, 1
    JZ @nostars
    OR r3, 7
@nostars:
    STB [r5 + progress], r3
    ADD r5, 1
    ADD r6, 1
    CMP r6, 4
    JLT @lv
    ADD r4, 1
    CMP r4, 5
    JLT @wl
    LDI r0, 1 << BD_OWN
    ST [boards], r0
    CALL boards_update
    LDI r0, 0
    ST [stolen], r0
    ST [super_ok], r0
    ST [board_sel], r0
    LD r0, [t_cw]
    CMP r0, 5
    JLT @map
    LD r1, [boards]                 ; World 5 or later: the theft has happened, the licorice board
    OR r1, 1 << BD_LIQ
    ST [boards], r1
    CMP r0, 6
    JEQ @end
    LDI r1, 1
    ST [stolen], r1
    LDI r1, BD_LIQ
    ST [board_sel], r1
    JMP @map
@end:
    LDI r1, 1                       ; the game is done: SUPERBOSSE, his own board
    ST [super_ok], r1
    LDI r0, 5
@map:
    SUB r0, 1
    ST [map_world], r0
    MUL r0, 5
    LD r1, [super_ok]
    CMP r1, 0
    JEQ @sel
    LDI r0, 24
@sel:
    ST [map_sel], r0
    ST [unlocked], r0
    CALL to_map
    LDI r0, 1
    CMP r0, 0
    RET
@no:
    LDI r0, 0
    CMP r0, 0
    RET

; ---- the world map (FIRST10 §6) -------------------------------------------------------------------
; to_map: the map of the world of the current level (or of the next world after its boss)
to_map:
    LDI r0, M_MAP
    ST [mode], r0
    LDI r0, 0
    ST [scene_t], r0
    LD r0, [lv_music]               ; the world's own tune (its assets are the ones loaded)
    JMP set_music

on_map:
    LD r0, [scene_t]
    ADD r0, 1
    ST [scene_t], r0
    LD r6, [map_world]              ; first game level of this world
    MUL r6, 5
    LD r0, [btnp]
    LD r1, [map_sel]
    MOV r2, r0
    AND r2, BTN_LEFT
    JZ @r
    CMP r1, r6
    JLE @r
    SUB r1, 1
@r:
    MOV r2, r0
    AND r2, BTN_RIGHT
    JZ @sel
    MOV r3, r6
    ADD r3, 4
    CMP r1, r3
    JGE @sel
    LD r3, [unlocked]
    CMP r1, r3
    JGE @sel
    ADD r1, 1
@sel:
    ST [map_sel], r1
    MOV r2, r0                      ; B: the next board
    AND r2, BTN_B
    JZ @noboard
    PUSH r0
    CALL board_next
    POP r0
@noboard:
    AND r0, BTN_A
    JZ @draw
    LD r0, [scene_t]
    CMP r0, 20
    JLT @draw
    LD r0, [map_sel]
    MOV r1, r0
    ADD r1, LV_1_1
    CMP r1, NUM_LEVELS              ; not built yet: nothing to play
    JGE @draw
    JMP game_level
@draw:
    LD r1, [map_world]
    LDB r0, [r1 + world_sky]
    SYS CLS
    LD r1, [map_world]              ; the world's ground and the road
    LDB r4, [r1 + world_ground]
    LDI r0, 0
    LDI r1, 72
    LDI r2, 128
    LDI r3, 56
    SYS RECTFILL
    LDI r0, 12
    LDI r1, 82
    LDI r2, 104
    LDI r3, 6
    LDI r4, C_LGREY
    SYS RECTFILL
    LDI r0, TX_BANA
    LDI r1, 4
    LDI r2, 12
    CALL draw_text_id
    LD r0, [map_world]
    ADD r0, 1
    LDI r1, 40
    LDI r2, 16
    LDI r3, C_WHITE
    SYS NUM
    LDI r7, 0                       ; five stops: number, stars and part below each
@stop:
    MOV r5, r7
    MUL r5, 24
    ADD r5, 12
    LDI r0, spr_stop
    MOV r1, r5
    LDI r2, 80
    LDI r3, 0
    SYS SPR
    LD r0, [map_world]
    ADD r0, 1
    MOV r1, r5
    LDI r2, 94
    LDI r3, C_NAVY
    SYS NUM
    LDI r0, s_dash
    SYS TEXT
    MOV r0, r7
    ADD r0, 1
    SYS NUM
    MOV r4, r6                      ; progress of this level
    ADD r4, r7
    LDB r4, [r4 + progress]
    LDI r3, 0
@star:
    LDI r0, spr_star_small_off
    MOV r1, r4
    SHR r1, r3
    AND r1, 1
    JZ @off
    LDI r0, spr_star_small
@off:
    MOV r1, r3
    SHL r1, 2
    ADD r1, r5
    SUB r1, 2
    LDI r2, 102
    PUSH r3
    LDI r3, 0
    SYS SPR
    POP r3
    ADD r3, 1
    CMP r3, 3
    JLT @star
    AND r4, PR_PART
    JZ @nopart
    LDI r0, spr_part_small
    MOV r1, r5
    LDI r2, 108
    LDI r3, 0
    SYS SPR
@nopart:
    ADD r7, 1
    CMP r7, 5
    JLT @stop
    ; Bo's head over the selected stop
    LD r1, [map_sel]
    SUB r1, r6
    MUL r1, 24
    ADD r1, 12
    LDI r0, spr_bo_head
    LDI r2, 68
    LD r3, [tick]
    AND r3, 16
    JZ @hop
    SUB r2, 1
@hop:
    LDI r3, 0
    SYS SPR
    ADD r1, 0                       ; the board he rides, under his head
    ADD r2, 9
    MOV r0, r1
    MOV r1, r2
    LDI r2, 8
    LDI r3, 2
    LD r4, [board_sel]
    LDB r4, [r4 + board_colors]
    SYS RECTFILL
    CALL code_encode                ; the picture code of this world (DESIGN 7.3), top right
    LD r6, [map_code]
    LDI r5, 3
@pic:
    MOV r0, r6
    AND r0, 15
    SHL r0, 1
    LD r0, [r0 + code_pics]
    MOV r1, r5
    MUL r1, 10
    ADD r1, 84
    LDI r2, 4
    LDI r3, 0
    SYS SPR
    SHR r6, 4
    SUB r5, 1
    JGE @pic
    ; the seagull with the world's food flies over to the boss's stop
    LD r1, [scene_t]
    CMP r1, 120
    JGE @done
    LDI r0, spr_en_gull
    LDI r2, 40
    LDI r3, 0
    SYS SPR
    ADD r1, 8
    ADD r0, 32
    SYS SPR
    SUB r1, 4
    ADD r2, 7
    LDI r0, RA_FOOD                 ; the world food (wassets.asm)
    SYS SPR
@done:
    RET

; boards_update: a world's board when all four of its parts are found; the golden board with all 60 stars (7.2)
boards_update:
    LDI r6, 0                       ; world
    LDI r5, 0                       ; stars counted
@world:
    MOV r4, r6
    MUL r4, 5
    LDI r3, 0                       ; parts of this world
    LDI r2, 0
@level:
    LDB r1, [r4 + progress]
    MOV r0, r1
    AND r0, PR_PART
    JZ @np
    ADD r3, 1
@np:
    LDI r0, 0                       ; its stars
@bit:
    MOV r7, r1
    SHR r7, r0
    AND r7, 1
    ADD r5, r7
    ADD r0, 1
    CMP r0, 3
    JLT @bit
    ADD r4, 1
    ADD r2, 1
    CMP r2, 5
    JLT @level
    CMP r3, 4
    JLT @next
    MOV r1, r6                      ; board 1 + world
    ADD r1, 1
    LDI r0, 1
    SHL r0, r1
    LD r1, [boards]
    OR r1, r0
    ST [boards], r1
@next:
    ADD r6, 1
    CMP r6, 5
    JLT @world
    ST [stars_total], r5
    CMP r5, 60
    JLT @done
    LD r1, [boards]
    OR r1, 1 << BD_GOLD
    ST [boards], r1
@done:
    RET

; board_next: B on the map: the next board Bo has (his own only while the seagull does not have it)
board_next:
    LD r1, [board_sel]
    LDI r2, 8
@try:
    ADD r1, 1
    AND r1, 7
    LD r0, [boards]
    SHR r0, r1
    AND r0, 1
    JZ @skip
    CMP r1, BD_OWN
    JNE @take
    LD r0, [stolen]
    CMP r0, 0
    JEQ @take
@skip:
    SUB r2, 1
    JNZ @try
    RET
@take:
    ST [board_sel], r1
    RET

; ---- the end of a level: tally (DESIGN §8.1, §11.1) ----------------------------------------------------
; level_done: from the goal: progress, then the tally (test levels: back to the test menu)
level_done:
    LD r0, [level]
    CMP r0, LV_1_1
    JGE @game
    LDI r0, M_MENU
    ST [mode], r0
    RET
@game:
    SUB r0, LV_1_1                  ; stars and part of this level, kept for good
    LDB r1, [r0 + progress]
    LD r2, [lv_stars]
    OR r1, r2
    LD r2, [lv_part]
    CMP r2, 0
    JEQ @np
    OR r1, PR_PART
@np:
    OR r1, PR_DONE
    STB [r0 + progress], r1
    PUSH r0
    CALL boards_update
    LD r0, [apples_total]
    LD r1, [lv_apples]
    ADD r0, r1
    ST [apples_total], r0
    POP r0
    ADD r0, 1                       ; the next level opens
    LD r1, [unlocked]
    CMP r0, r1
    JLE @u
    ST [unlocked], r0
@u:
    LDI r0, M_TALLY
    ST [mode], r0
    LDI r0, 0
    ST [scene_t], r0
    LDI r0, MUS_FANFARE             ; level done: the fanfare
    JMP set_music

on_tally:
    LD r0, [scene_t]
    ADD r0, 1
    ST [scene_t], r0
    LD r0, [btnp]
    AND r0, BTN_A
    JZ @draw
    LD r0, [scene_t]
    CMP r0, 30
    JLT @draw
    LD r0, [level]                  ; after a boss: the scene, then the next world's map
    SUB r0, LV_1_1
    MOV r1, r0
    DIV r1, 5
    ST [map_world], r1
    MOV r1, r0
    ADD r1, 1
    MOD r1, 5
    JNZ @samew
    LDI r1, 0
    ST [scene_t], r1
    LDI r1, M_CUT
    ST [mode], r1
    RET
@samew:
    ADD r0, 1
    ST [map_sel], r0
    JMP to_map
@draw:
    LDI r0, C_NAVY
    SYS CLS
    LD r1, [level]
    LDB r0, [r1 + level_names]
    LDI r1, 10
    LDI r2, 10
    CALL draw_text_id
    LDI r0, TX_APPLEN
    LDI r1, 10
    LDI r2, 34
    CALL draw_text_id
    LD r0, [lv_apples]
    LDI r1, TALLY_X
    LDI r2, TALLY_Y1
    LDI r3, C_WHITE
    SYS NUM
    LDI r0, TX_STJARNOR
    LDI r1, 10
    LDI r2, 50
    CALL draw_text_id
    LDI r6, 0
@star:
    LDI r0, spr_star_off
    LD r1, [lv_stars]
    SHR r1, r6
    AND r1, 1
    JZ @off
    LDI r0, spr_star
@off:
    MOV r1, r6
    MUL r1, 10
    ADD r1, TALLY_X
    LDI r2, TALLY_Y2
    LDI r3, 0
    SYS SPR
    ADD r6, 1
    CMP r6, 3
    JLT @star
    LDI r0, TX_POANG
    LDI r1, 10
    LDI r2, 66
    CALL draw_text_id
    LD r0, [score_hi]               ; the score: thousands part first, then four digits
    LD r1, [score_lo]
    LDI r6, TALLY_X
    CMP r0, 0
    JEQ @lo
    LDI r1, TALLY_X
    LDI r2, TALLY_Y3
    LDI r3, C_WHITE
    SYS NUM
    MOV r6, r0
    LD r0, [score_lo]
    LDI r1, 1000
@pad:
    CMP r0, r1
    JAE @lo4
    PUSH r0
    PUSH r1
    LDI r0, s_zero
    MOV r1, r6
    LDI r2, TALLY_Y3
    LDI r3, C_WHITE
    SYS TEXT
    MOV r6, r0
    POP r1
    POP r0
    DIV r1, 10
    CMP r1, 1
    JGT @pad
@lo4:
    MOV r1, r0
@lo:
    MOV r0, r1
    MOV r1, r6
    LDI r2, TALLY_Y3
    LDI r3, C_WHITE
    SYS NUM
    LDI r0, TX_DEL
    LDI r1, 10
    LDI r2, 82
    CALL draw_text_id
    LD r0, [lv_part]
    CMP r0, 0
    JEQ @gull
    LDI r0, spr_part_small
    LDI r1, TALLY_X
    LDI r2, TALLY_Y4
    LDI r3, 0
    SYS SPR
@gull:                              ; the seagull flies past with the world's food (§11.1)
    LD r1, [scene_t]
    SHL r1, 1
    SUB r1, 20
    CMP r1, 140
    JGT @nogull
    LDI r0, spr_en_gull
    LDI r2, 104
    LDI r3, 0
    SYS SPR
    ADD r1, 8
    ADD r0, 32
    SYS SPR
    SUB r1, 4
    ADD r2, 7
    LDI r0, RA_FOOD                 ; the world food (wassets.asm)
    SYS SPR
@nogull:
    RET
TALLY_X  = 84
TALLY_Y1 = 37
TALLY_Y2 = 51
TALLY_Y3 = 69
TALLY_Y4 = 83

; ---- after a boss (DESIGN §11): a few lines, then the next world's map ----------------------------------
on_cut:
    LD r0, [scene_t]
    ADD r0, 1
    ST [scene_t], r0
    LD r1, [map_world]              ; the lines of this world's scene, 2 s each
    SHL r1, 1
    LD r6, [r1 + cut_lines]
    MOV r1, r0
    DIV r1, 120
    ADD r6, r1
    LDB r1, [r6]
    CMP r1, 255
    JEQ @end
    LD r2, [scene_t]
    MOD r2, 120
    CMP r2, 1
    JNE @draw
    MOV r0, r1
    CALL say
@draw:
    LDI r0, C_NAVY
    SYS CLS
    LDI r1, 60 * 16
    LD r0, [cam_x]
    SHL r0, 4
    ADD r1, r0
    ST [bo_x], r1
    LDI r0, P_RIDE
    ST [bo_pose], r0
    LDI r0, (HUD_H + 96) * 16
    LD r1, [cam_y]
    SHL r1, 4
    ADD r0, r1
    ST [bo_y], r0
    CALL draw_bo
    JMP draw_bubble
@end:
    LD r0, [map_world]
    CMP r0, 3
    JNE @notheft
    LDI r1, 1                       ; after Backhoppet: the seagull has Bo's board; the jelly man lends his
    ST [stolen], r1
    LD r1, [boards]
    OR r1, 1 << BD_LIQ
    ST [boards], r1
    LDI r1, BD_LIQ
    ST [board_sel], r1
@notheft:
    CMP r0, 4
    JNE @next
    LDI r1, 0                       ; after the final: his own board back, SUPERBOSSE unlocked, the ending
    ST [stolen], r1
    ST [board_sel], r1
    ST [scene_t], r1
    LDI r1, 1
    ST [super_ok], r1
    LDI r1, M_END
    ST [mode], r1
    LDI r0, MUS_END
    JMP set_music
@next:
    ADD r0, 1
    ST [map_world], r0
    MUL r0, 5
    ST [map_sel], r0
    JMP to_map

.data
s_dash: .string "-"
s_zero: .string "0"
; the 16 pictures of the code (DESIGN §7.3): apple, big apple, pommes, godis, star, wheel, truck, sticker,
; snail, seagull, hedgehog, wasp, ball, teddy, blob, Bo
code_pics: .word spr_apple, spr_bigapple, spr_fries, spr_candy, spr_star, spr_part_small, spr_truck, spr_sticker
           .word spr_en_snail, spr_en_gull + 32, spr_en_hedgehog, spr_en_wasp, spr_en_ball, spr_en_teddy, spr_en_blob, spr_bo_head
cut_lines:  .word cut_w1, cut_w2, cut_w3, cut_w4, cut_w5
cut_w1:     .byte TX_MINA_POMMES, TX_MUMS, TX_GODISLANDET, TX_JAG_SKA_TILL_GODISLANDET, 255
cut_w2:     .byte TX_DEN_VILLE_BARA_HA_MOROTTER, 255
cut_w3:     .byte TX_DEN_AR_AVSTANGD, 255
cut_w4:     .byte TX_JAG_GJORDE_DET, TX_SKRIII, TX_NEJ_MIN_BRADA, TX_LANA_MIN, TX_EN_LAKRITSBRADA, 255
cut_w5:     .byte TX_MIN_BRADA, TX_VILL_DU_HA_POMMES, TX_SKRII, TX_SLUT, 255
.code

; ---- the ending (DESIGN 10.5): Bo rides home through all five worlds with the seagull, then JAG GJORDE DET!,
; the statistics (stars x/60, apples, points) and, with all 60 stars, the golden board. A: the title.
END_WORLD_T = 150                   ; frames per world on the way home
on_end:
    LD r0, [scene_t]
    ADD r0, 1
    ST [scene_t], r0
    CMP r0, END_WORLD_T * 5
    JGE @stats
    DIV r0, END_WORLD_T             ; the world he rides through
    LDB r1, [r0 + world_sky]
    PUSH r0
    MOV r0, r1
    SYS CLS
    POP r1
    LDB r4, [r1 + world_ground]
    LDI r0, 0
    LDI r1, 96
    LDI r2, 128
    LDI r3, 32
    SYS RECTFILL
    LD r1, [scene_t]                ; the seagull, his friend now, flies along
    AND r1, 63
    ADD r1, 40
    LDI r0, spr_en_gull
    LDI r2, 40
    LDI r3, 0
    SYS SPR
    ADD r1, 8
    ADD r0, 32
    SYS SPR
    LDI r0, P_RIDE
    JMP end_bo
@stats:
    LDI r0, C_NAVY
    SYS CLS
    LDI r0, TX_JAG_GJORDE_DET
    LDI r1, 14
    LDI r2, 12
    CALL draw_text_id
    LDI r0, TX_STJARNOR
    LDI r1, 10
    LDI r2, 34
    CALL draw_text_id
    LD r0, [stars_total]
    LDI r1, END_X
    LDI r2, 36
    LDI r3, C_WHITE
    SYS NUM
    MOV r1, r0
    LDI r0, s_of60
    SYS TEXT
    LDI r0, TX_APPLEN
    LDI r1, 10
    LDI r2, 48
    CALL draw_text_id
    LD r0, [apples_total]
    LDI r1, END_X
    LDI r2, 50
    LDI r3, C_WHITE
    SYS NUM
    LDI r0, TX_POANG
    LDI r1, 10
    LDI r2, 62
    CALL draw_text_id
    LD r0, [score_hi]
    CMP r0, 0
    JEQ @lo
    LDI r1, END_X
    LDI r2, 64
    LDI r3, C_WHITE
    SYS NUM
    MOV r1, r0
    LD r0, [score_lo]               ; the low four digits, with zeros in front
    LDI r4, 1000
@zero:
    CMP r0, r4
    JAE @num
    PUSH r0
    LDI r0, s_zero
    SYS TEXT
    MOV r1, r0
    POP r0
    DIV r4, 10
    CMP r4, 1
    JGT @zero
@num:
    SYS NUM
    JMP @board
@lo:
    LD r0, [score_lo]
    LDI r1, END_X
    LDI r2, 64
    LDI r3, C_WHITE
    SYS NUM
@board:
    LD r0, [boards]                 ; all 60 stars: the golden board under him
    AND r0, 1 << BD_GOLD
    JZ @own
    LDI r0, BD_GOLD
    ST [board_sel], r0
@own:
    LD r0, [btnp]                   ; A: back to the title
    AND r0, BTN_A
    JZ @still
    LD r0, [scene_t]
    CMP r0, END_WORLD_T * 5 + 60
    JLT @still
    JMP to_title
@still:
    LDI r0, P_RIDE
end_bo:                             ; r0 = pose: Bo in the middle of the screen, on the ground line
    ST [bo_pose], r0
    LDI r1, 60 * 16
    LD r0, [cam_x]
    SHL r0, 4
    ADD r1, r0
    ST [bo_x], r1
    LDI r0, 96 * 16
    LD r1, [cam_y]
    SHL r1, 4
    ADD r0, r1
    ST [bo_y], r0
    JMP draw_bo
END_X = 70

.data
s_of60: .string " / 60"
.code
