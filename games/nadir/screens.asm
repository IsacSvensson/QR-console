; NADIR - the game around the level (M31, DESIGN §6.5, LEVEL.md): the title with its attract fly-through, the lift
; ride after the last objective, the statistics, and the objective text on the HUD.
.code

GS_TITLE = 0
GS_PLAY  = 1
GS_LIFT  = 2
GS_STATS = 3
AT_SEGS  = 4                        ; the attract path: segments of AT_FRAMES frames, whole steps per frame
AT_FRAMES = 256
AT_PERIOD = AT_SEGS * AT_FRAMES     ; the fly-through repeats exactly after this many frames
LIFT_CLOSE = 64                     ; the lift ride: the doors close, then the shaft rushes by
LIFT_FRAMES = 300
STATS_WAIT = 60                     ; frames before A leaves the statistics

.var gstate
.var at_t                           ; the frame in the attract loop (0 .. AT_PERIOD - 1)
.var lift_t
.var st_t
.var msg_k                          ; the HUD message: 0 .. NUM_OBJ - 1 = that objective's text, NUM_OBJ = a secret found

.data
; the attract path through the workshop (DESIGN §6.5): per segment x, y, angle at its start and the step per frame
at_path:
    .word 7 * 256 + 128, 10 * 256 + 128, 0,    7, 0, 4         ; half a cell from every wall and box
    .word 14 * 256 + 128, 10 * 256 + 128, 1024, 0, 4, 4
    .word 14 * 256 + 128, 14 * 256 + 128, 2048, 65529, 0, 4
    .word 7 * 256 + 128, 14 * 256 + 128, 3072, 0, 65532, 4
s_title:    .string "NADIR"
s_sub:      .string "1200 M BELOW THE SURFACE"
s_press:    .string "PRESS A"
s_up:       .string "GOING UP"
s_m:        .string "M"
s_done:     .string "MISSION COMPLETE"
s_time:     .string "TIME"
s_kills:    .string "KILLS"
s_secrets:  .string "SECRETS"
s_acc:      .string "ACCURACY"
s_deaths:   .string "DEATHS"
s_slash:    .string "/"
s_colon:    .string ":"
s_pct:      .string "%"
s_o1:       .string "FIND THE RED KEYCARD"
s_o2:       .string "OPEN THE SECURITY DOOR"
s_o3:       .string "SHUT DOWN THE CORE PUMP"
s_o4:       .string "RETURN TO THE LIFT"
s_secret:   .string "SECRET FOUND"
; the HUD messages (LEVEL.md: the next objective's text; a secret): string, x (centred: 4 px per character)
msg_tab:
    .word s_o1, 24
    .word s_o2, 20
    .word s_o3, 18
    .word s_o4, 28
    .word s_secret, 40
.code

; ---- the title -------------------------------------------------------------------------------------------------
; From init and after the statistics: the level in its start state, the attract loop from its start, the drone.
title_enter:
    CALL game_reset
    LDI r0, GS_TITLE
    ST [gstate], r0
    LDI r0, 0
    ST [at_t], r0
    ST [pace], r0
    ST [bob], r0
    LDI r0, MUS_DRONE
    JMP set_music

title_frame:
    LD r0, [btnp]
    AND r0, BTN_A
    JZ @fly
    CALL game_reset                 ; A: a new game (the statistics' counters from zero)
    LDI r0, 0
    ST [restarts], r0
    ST [play_f], r0
    ST [play_s], r0
    LDI r0, GS_PLAY
    ST [gstate], r0
    RET
@fly:
    LD r0, [at_t]
    CMP r0, 0
    JNE @pos
    ST [pace], r0                   ; the loop starts: no image half done
@pos:
    ST [tick], r0                   ; the flicker follows the loop
    MOV r1, r0
    SHR r1, 8                       ; the segment
    MUL r1, 12
    ADD r1, at_path
    AND r0, AT_FRAMES - 1           ; the frame in it
    LD r2, [r1 + 6]
    MUL r2, r0
    LD r3, [r1]
    ADD r2, r3
    ST [cam_x], r2
    LD r2, [r1 + 8]
    MUL r2, r0
    LD r3, [r1 + 2]
    ADD r2, r3
    ST [cam_y], r2
    LD r2, [r1 + 10]
    MUL r2, r0
    LD r3, [r1 + 4]
    ADD r2, r3
    AND r2, 4095
    ST [cam_a], r2
    LD r0, [at_t]
    ADD r0, 1
    CMP r0, AT_PERIOD
    JB @t
    LDI r0, 0
@t:
    ST [at_t], r0
    CALL music_step
    JMP render_step

; drawn over the attract image (render_step's last step in the title)
title_text:
    LDI r0, s_title
    LDI r1, 54
    LDI r2, 16
    LDI r3, 15
    SYS TEXT
    LDI r0, s_sub
    LDI r1, 16
    LDI r2, 26
    LDI r3, 9
    SYS TEXT
    LD r0, [at_t]
    AND r0, 32
    JNZ @no
    LDI r0, s_press
    LDI r1, 50
    LDI r2, 104
    LDI r3, 15
    SYS TEXT
@no:
    RET

; ---- the lift ride (after the last objective) --------------------------------------------------------------------
lift_enter:
    LDI r0, GS_LIFT
    ST [gstate], r0
    LDI r0, 0
    ST [lift_t], r0
    LDI r0, MUS_VICTORY
    JMP set_music

lift_frame:
    CALL music_step
    LD r6, [lift_t]
    ADD r6, 1
    ST [lift_t], r6
    CMP r6, LIFT_FRAMES
    JAE stats_enter
    CMP r6, LIFT_CLOSE
    JAE @shaft
    LDI r0, 0                       ; the doors close over the last image
    LDI r1, 0
    MOV r2, r6
    LDI r3, 128
    LDI r4, 0
    SYS RECTFILL
    LDI r0, 128
    SUB r0, r6
    LDI r1, 0
    MOV r2, r6
    LDI r3, 128
    LDI r4, 0
    SYS RECTFILL
    RET
@shaft:
    LDI r0, 0
    SYS CLS
    LDI r7, 0                       ; the shaft's ribs rush down: y = (16 k + 3 t) mod 128
@rib:
    MOV r1, r7
    SHL r1, 4
    MOV r0, r6
    MUL r0, 3
    ADD r1, r0
    AND r1, 127
    LDI r0, 8
    MOV r3, r1
    LDI r2, 120
    LDI r4, 3
    SYS LINE
    ADD r7, 1
    CMP r7, 8
    JLT @rib
    LDI r0, s_up
    LDI r1, 48
    LDI r2, 52
    LDI r3, 15
    SYS TEXT
    MOV r0, r6                      ; the depth: 1200 m at the doors, 0 at the top
    SUB r0, LIFT_CLOSE
    MUL r0, 5
    LDI r1, 1180
    SUB r1, r0
    JGE @d
    LDI r1, 0
@d:
    MOV r0, r1
    LDI r1, 52
    LDI r2, 62
    LDI r3, 9
    SYS NUM
    MOV r1, r0                      ; (NUM returns the x after the digits)
    ADD r1, 4
    LDI r0, s_m
    LDI r2, 62
    LDI r3, 9
    SYS TEXT
    RET

; ---- the statistics (DESIGN §6.5): the RAM counters ----------------------------------------------------------------
stats_enter:
    LDI r0, GS_STATS
    ST [gstate], r0
    LDI r0, 0
    ST [st_t], r0
    RET

stats_frame:
    CALL music_step
    LD r0, [st_t]
    ADD r0, 1
    ST [st_t], r0
    CMP r0, STATS_WAIT
    JB @draw
    LD r0, [btnp]
    AND r0, BTN_A
    JZ @draw
    JMP title_enter
@draw:
    LDI r0, 0
    SYS CLS
    LDI r0, s_done
    LDI r1, 32
    LDI r2, 16
    LDI r3, 15
    SYS TEXT
    ; TIME m:ss
    LDI r0, s_time
    LDI r1, 24
    LDI r2, 40
    LDI r3, 9
    SYS TEXT
    LD r5, [play_s]                 ; seconds (below 32 768: DIV is signed)
    MOV r0, r5
    DIV r0, 60
    LDI r1, 80
    LDI r2, 40
    LDI r3, 15
    SYS NUM
    MOV r1, r0
    LDI r0, s_colon
    LDI r2, 40
    LDI r3, 15
    SYS TEXT
    MOV r1, r0
    MOV r0, r5
    MOD r0, 60
    CMP r0, 10
    JAE @s2
    PUSH r0
    LDI r0, 0
    LDI r2, 40
    LDI r3, 15
    SYS NUM
    MOV r1, r0
    POP r0
@s2:
    LDI r2, 40
    LDI r3, 15
    SYS NUM
    ; KILLS k/N
    LDI r0, s_kills
    LDI r1, 24
    LDI r2, 52
    LDI r3, 9
    SYS TEXT
    LD r0, [kills]
    LDI r6, NUM_ENEMIES
    LDI r2, 52
    CALL @frac
    ; SECRETS s/N
    LDI r0, s_secrets
    LDI r1, 24
    LDI r2, 64
    LDI r3, 9
    SYS TEXT
    LD r1, [sec_bits]
    LDI r0, 0
@pop:
    CMP r1, 0
    JEQ @pd
    MOV r2, r1
    AND r2, 1
    ADD r0, r2
    SHR r1, 1
    JMP @pop
@pd:
    LDI r6, NUM_SECRETS
    LDI r2, 64
    CALL @frac
    ; ACCURACY p %
    LDI r0, s_acc
    LDI r1, 24
    LDI r2, 76
    LDI r3, 9
    SYS TEXT
    LD r0, [shots_hit]
    LD r1, [shots]
@sc:
    CMP r1, 256                     ; keep hits * 100 below 32 768 (DIV is signed)
    JB @sd
    SHR r0, 1
    SHR r1, 1
    JMP @sc
@sd:
    MUL r0, 100
    CMP r1, 0
    JEQ @a0
    DIV r0, r1
    JMP @a1
@a0:
    LDI r0, 0
@a1:
    LDI r1, 80
    LDI r2, 76
    LDI r3, 15
    SYS NUM
    MOV r1, r0
    LDI r0, s_pct
    LDI r2, 76
    LDI r3, 15
    SYS TEXT
    ; DEATHS d
    LDI r0, s_deaths
    LDI r1, 24
    LDI r2, 88
    LDI r3, 9
    SYS TEXT
    LD r0, [restarts]
    LDI r1, 80
    LDI r2, 88
    LDI r3, 15
    SYS NUM
    LD r0, [st_t]
    CMP r0, STATS_WAIT
    JB @ret
    LDI r0, s_press
    LDI r1, 50
    LDI r2, 110
    LDI r3, 15
    SYS TEXT
@ret:
    RET
; r0 = a count, r6 = of how many, r2 = y: "r0/r6" at x 80
@frac:
    LDI r1, 80
    LDI r3, 15
    PUSH r2
    SYS NUM
    MOV r1, r0
    POP r2
    PUSH r2
    LDI r0, s_slash
    LDI r3, 15
    SYS TEXT
    MOV r1, r0
    POP r2
    MOV r0, r6
    LDI r3, 15
    SYS NUM
    RET

; ---- on the HUD (in play): the next objective's text or "SECRET FOUND" while msg_t > 0 ----------------------------
draw_msg:
    LD r0, [msg_t]
    CMP r0, 0
    JEQ @no
    LD r1, [msg_k]
    SHL r1, 2
    LD r0, [r1 + msg_tab]
    LD r1, [r1 + msg_tab + 2]
    LDI r2, 12
    LDI r3, 15
    SYS TEXT
@no:
    RET
