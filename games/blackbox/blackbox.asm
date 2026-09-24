; BLACKBOX — an original stealth adventure for QR Console.
; Main file: includes the engine and the generated data. See DESIGN.md.
.title "BLACKBOX"

.include "defs.asm"
.include "rooms.gen.asm"
.include "tiles.gen.asm"
.code
.include "room.asm"
.include "player.asm"
.include "script.asm"
.include "actors.asm"
.include "text.asm"
.include "oracle.asm"
.include "sounds.asm"
.include "draw.asm"
.include "gfx.asm"
.include "scripts.asm"
.include "text.gen.asm"

; ---- entry points -----------------------------------------------------------------------------
.code
init:
    LDI r0, M_TITLE
    ST [mode], r0
    RET

update:
    LD r0, [frame]
    ADD r0, 1
    ST [frame], r0
    SYS BTN
    ST [held], r0
    SYS BTNP
    ST [pressed], r0
    ; TEST HOOK: tests write room+1 to dbg_room to jump straight into a room
    LD r0, [dbg_room]
    CMP r0, 0
    JEQ @dispatch
    SUB r0, 1
    LDI r1, 0
    ST [dbg_room], r1
    LDI r1, M_PLAY
    ST [mode], r1
    CALL enter_room_at_arrival
@dispatch:
    LD r0, [dbg_oracle]     ; TEST HOOK: ORACLE values and their rendering
    CMP r0, 0
    JEQ @go
    LDI r0, 0
    ST [dbg_oracle], r0
    CALL oracle_update
    LDI r0, dbg_oracle_text
    LDI r1, text_buf
    CALL decode_text
@go:
    LD r1, [mode]
    SHL r1, 1
    LD r1, [r1 + mode_table]
    CALL r1
    RET

; ---- title ------------------------------------------------------------------------------------
mode_title:
    LD r0, [pressed]
    AND r0, BTN_A
    JZ @draw
    CALL new_game
    RET
@draw:
    LDI r0, 0
    SYS CLS
    LDI r0, 44              ; the black box
    LDI r1, 34
    LDI r2, 40
    LDI r3, 40
    LDI r4, 3
    SYS RECT
    LDI r0, 46
    LDI r1, 36
    LDI r2, 36
    LDI r3, 36
    LDI r4, 1
    SYS RECTFILL
    LDI r0, s_title
    LDI r1, 48
    LDI r2, 82
    LDI r3, 15
    SYS TEXT
    SYS FRAME
    AND r0, 32
    JZ @blink
    LDI r0, s_press
    LDI r1, 50
    LDI r2, 100
    LDI r3, 7
    SYS TEXT
@blink:
    RET

new_game:
    LDI r1, 0
@clear:
    LDI r0, 0
    STB [r1 + flags], r0
    STB [r1 + events], r0
    ADD r1, 1
    CMP r1, 8
    JLT @clear
    LDI r0, 0
    ST [script_pc], r0
    ST [script_wait], r0
    ST [caught_t], r0
    ST [det_count], r0
    ST [charges], r0
    ST [emp_uses], r0
    ST [pred_done], r0
    ST [pred_hit], r0
    ST [pred_misses], r0
    ST [logs_read], r0
    ST [mira_followed], r0
    ST [bark_t], r0
    LDI r0, F_TRUE
    CALL flag_set
    CALL oracle_update
    CALL accuracy
    ST [pct_before], r0
    LDI r0, DIR_S
    ST [pdir], r0
    LDI r0, M_PLAY          ; before entering: the room's ENTER script may open a dialogue
    ST [mode], r0
    LDI r0, R_0_1
    CALL enter_room_at_arrival
    RET

mode_play:
    LDI r0, 0
    ST [act_ran], r0
    LD r0, [caught_t]
    CMP r0, 0
    JEQ @free
    SUB r0, 1               ; detected: freeze, then restart the room
    ST [caught_t], r0
    JNZ @draw
    CALL restart_room
    JMP @draw
@free:
    CALL script_run
    LD r0, [script_pc]
    CMP r0, 0
    JNE @draw               ; the world waits while a script runs
    LD r0, [mode]
    CMP r0, M_PLAY
    JNE @draw
    LD r1, [room]
    PUSH r1
    CALL player_update
    POP r1
    LD r0, [room]
    CMP r0, r1
    JNE @draw               ; just changed rooms: the new room's actors start next frame
    LD r0, [pressed]
    AND r0, BTN_B
    JZ @actors
    CALL use_emp
@actors:
    LD r0, [script_pc]
    CMP r0, 0
    JNE @draw
    CALL update_actors
@draw:
    CALL draw_play
    RET

; placeholder until M17 (endings)
mode_ending:
    LDI r0, M_PLAY
    ST [mode], r0
    RET

.data
mode_table: .word mode_title, mode_play, mode_dialog, mode_term, mode_ending
s_title:    .string "BLACKBOX"
s_press:    .string "PRESS A"
dbg_oracle_text: .byte 2, ' ', 3, '/', 3, ' ', 1, 0
