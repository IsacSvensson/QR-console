; BLACKBOX — triggers and the script interpreter. Scripts are bytecode in ROM (scripts.asm), written with
; the S_* macros below; a running script is a coroutine: commands that wait (dialogue, WAIT) yield to
; the next frame and the script continues where it stopped.

; ---- trigger kinds (table records: kind, a, b, script word; kind 0 ends the table) --------------
TK_ENTER = 1                ; on entering the room
TK_USE   = 2                ; A on cell (a, b)
TK_STEP  = 3                ; player's centre cell = (a, b); 255 = any column/row. Once per visit.
TK_EXIT  = 4                ; leaving through side a (runs to completion before the room changes)
TK_TALK  = 5                ; A on object a (NPC)
TK_TOUCH = 6                ; pick-up a collected
TRIG_REC = 5

; ---- script opcodes ---------------------------------------------------------------------------
OP_END    = 0
OP_SET    = 1               ; flag
OP_CLR    = 2               ; flag
OP_IF     = 3               ; flag, target: jump if set
OP_IFNOT  = 4               ; flag, target
OP_JMP    = 5               ; target
OP_EVENT  = 6               ; event number (the test trace)
OP_IFEV   = 7               ; event, target: jump if it has happened
OP_WARP   = 8               ; room: move to its arrival point (no ENTER trigger)
OP_SFX    = 9               ; sound id
OP_WAIT   = 10              ; frames
OP_SAY    = 11              ; box: dialogue box, waits for A
OP_ASK    = 12              ; box: yes/no box; A sets F_ANSWER, B clears it
OP_LOG    = 13              ; log: terminal pages, waits until closed
OP_BARK   = 14              ; box: short box at the top, play continues
OP_PRED   = 15              ; p, flag: resolve prediction p (hit if flag is set); once only
OP_PROF   = 16              ; k: profile counter +1 (1 curiosity, 2 compliance)
OP_IFHIT  = 17              ; p, target: jump if prediction p came true
OP_IFGUESS = 18             ; choice, target: jump if ORACLE forecasts that final choice
OP_SNAP   = 19              ; remember the accuracy before the last action
OP_CODE   = 20              ; section: show the access code to resume at that section (waits for A)
OP_HACK   = 21              ; panel: try to hack a boss panel (sets F_HACKED on success)
OP_IFSTUN = 22              ; actor, target: jump if that actor is stunned
OP_ACTT   = 23              ; actor, frames (word): set its timer and face its first direction
OP_IFDET  = 24              ; target: jump if the player was detected in this room since entering
OP_MENU   = 25              ; box: three-way menu (UP/DOWN, A); the choice goes to menu_choice
OP_PREDCH = 26              ; p: resolve prediction p: hit if menu_choice = ORACLE's forecast
OP_IFCH   = 27              ; choice, target: jump if menu_choice = choice
OP_ENDING = 28              ; the end screen
NUM_OPS   = 29

.macro TR_ENTER script
    .byte TK_ENTER, 0, 0
    .word script
.endm
.macro TR_USE cx, cy, script
    .byte TK_USE, cx, cy
    .word script
.endm
.macro TR_STEP cx, cy, script
    .byte TK_STEP, cx, cy
    .word script
.endm
.macro TR_EXIT side, script
    .byte TK_EXIT, side, 0
    .word script
.endm
.macro TR_TALK obj, script
    .byte TK_TALK, obj, 0
    .word script
.endm
.macro TR_TOUCH id, script
    .byte TK_TOUCH, id, 0
    .word script
.endm
.macro TR_END
    .byte 0
.endm

.macro S_END
    .byte OP_END
.endm
.macro S_SET fl
    .byte OP_SET, fl
.endm
.macro S_CLR fl
    .byte OP_CLR, fl
.endm
.macro S_IF fl, target
    .byte OP_IF, fl
    .word target
.endm
.macro S_IFNOT fl, target
    .byte OP_IFNOT, fl
    .word target
.endm
.macro S_JMP target
    .byte OP_JMP
    .word target
.endm
.macro S_EVENT ev
    .byte OP_EVENT, ev
.endm
.macro S_IFEV ev, target
    .byte OP_IFEV, ev
    .word target
.endm
.macro S_WARP rm
    .byte OP_WARP, rm
.endm
.macro S_SFX snd
    .byte OP_SFX, snd
.endm
.macro S_WAIT frames
    .byte OP_WAIT, frames
.endm
.macro S_SAY bx
    .byte OP_SAY
    .word bx
.endm
.macro S_ASK bx
    .byte OP_ASK
    .word bx
.endm
.macro S_LOG lg
    .byte OP_LOG
    .word lg
.endm
.macro S_BARK bx
    .byte OP_BARK
    .word bx
.endm
.macro S_PRED p, fl
    .byte OP_PRED, p, fl
.endm
.macro S_PROF k
    .byte OP_PROF, k
.endm
.macro S_IFHIT p, target
    .byte OP_IFHIT, p
    .word target
.endm
.macro S_IFGUESS ch, target
    .byte OP_IFGUESS, ch
    .word target
.endm
.macro S_SNAP
    .byte OP_SNAP
.endm
.macro S_CODE sec
    .byte OP_CODE, sec
.endm
.macro S_HACK panel
    .byte OP_HACK, panel
.endm
.macro S_IFSTUN act, target
    .byte OP_IFSTUN, act
    .word target
.endm
.macro S_ACTT act, frames
    .byte OP_ACTT, act
    .word frames
.endm
.macro S_IFDET target
    .byte OP_IFDET
    .word target
.endm
.macro S_MENU bx
    .byte OP_MENU
    .word bx
.endm
.macro S_PREDCH p
    .byte OP_PREDCH, p
.endm
.macro S_IFCH ch, target
    .byte OP_IFCH, ch
    .word target
.endm
.macro S_ENDING
    .byte OP_ENDING
.endm
PROF_LOGS = 1
PROF_MIRA = 2

.code
; r0 = kind, r1 = a, r2 = b -> r0 = 1 if a trigger matched (its script has started and run until it waits)
fire_trigger:
    LD r3, [room_rec]
    LD r3, [r3 + RR_TRIG]
    LDI r7, 0               ; trigger index (for STEP once-per-visit bits)
@loop:
    LDB r4, [r3]
    CMP r4, 0
    JEQ @none
    CMP r4, r0
    JNE @next
    LDB r5, [r3 + 1]
    LDB r6, [r3 + 2]
    CMP r0, TK_ENTER
    JEQ @hit
    CMP r0, TK_USE
    JEQ @xy
    CMP r0, TK_STEP
    JEQ @step
    CMP r5, r1              ; EXIT side / TALK object
    JEQ @hit
    JMP @next
@xy:
    CMP r5, r1
    JNE @next
    CMP r6, r2
    JNE @next
    JMP @hit
@step:
    CMP r5, 255
    JEQ @sx
    CMP r5, r1
    JNE @next
@sx:
    CMP r6, 255
    JEQ @sy
    CMP r6, r2
    JNE @next
@sy:
    LDI r5, 1
    SHL r5, r7
    LD r4, [trig_fired]
    MOV r6, r4
    AND r6, r5
    JNZ @next
    OR r4, r5
    ST [trig_fired], r4
@hit:
    LD r0, [r3 + 3]
    ST [script_pc], r0
    LDI r0, 0
    ST [script_wait], r0
    CALL script_run
    LDI r0, 1
    RET
@next:
    ADD r3, TRIG_REC
    ADD r7, 1
    JMP @loop
@none:
    LDI r0, 0
    RET

; Runs the current script until it ends or waits. Handlers get r0 = address of their opcode and return
; r0 = next address, or 0 when the script stops or yields (the handler has stored script_pc itself).
script_run:
    LD r0, [script_wait]
    CMP r0, 0
    JEQ @go
    SUB r0, 1
    ST [script_wait], r0
    RET
@go:
    LD r0, [script_pc]
    CMP r0, 0
    JEQ @done
@step:
    LDB r1, [r0]
    CMP r1, NUM_OPS
    JAE @bad
    SHL r1, 1
    LD r1, [r1 + op_table]
    CALL r1
    CMP r0, 0
    JEQ @done
    ST [script_pc], r0
    JMP @step
@bad:
    LDI r0, 0
    ST [script_pc], r0
@done:
    RET

op_end:
    LDI r0, 0
    ST [script_pc], r0
    RET

op_set:
    PUSH r0
    LDB r0, [r0 + 1]
    CALL flag_set
    CALL apply_locks        ; a door may have just been unlocked
    POP r0
    ADD r0, 2
    RET

op_clr:
    PUSH r0
    LDB r0, [r0 + 1]
    CALL flag_clr
    POP r0
    ADD r0, 2
    RET

op_if:
    PUSH r0
    LDB r0, [r0 + 1]
    CALL flag_test
    MOV r2, r0
    POP r0
    CMP r2, 0
    JEQ @no
    LD r0, [r0 + 2]
    RET
@no:
    ADD r0, 4
    RET

op_ifnot:
    PUSH r0
    LDB r0, [r0 + 1]
    CALL flag_test
    MOV r2, r0
    POP r0
    CMP r2, 0
    JNE @no
    LD r0, [r0 + 2]
    RET
@no:
    ADD r0, 4
    RET

op_jmp:
    LD r0, [r0 + 1]
    RET

op_event:
    PUSH r0
    LDB r0, [r0 + 1]
    CALL event_set
    POP r0
    ADD r0, 2
    RET

op_ifev:
    PUSH r0
    LDB r0, [r0 + 1]
    CALL event_test
    MOV r2, r0
    POP r0
    CMP r2, 0
    JEQ @no
    LD r0, [r0 + 2]
    RET
@no:
    ADD r0, 4
    RET

op_warp:                    ; ends this script; the new room's ENTER trigger runs
    LDB r1, [r0 + 1]
    LDI r0, 0
    ST [script_pc], r0
    MOV r0, r1
    CALL enter_room_at_arrival
    LDI r0, 0
    RET

op_sfx:
    PUSH r0
    LDB r0, [r0 + 1]
    CALL play_sfx
    POP r0
    ADD r0, 2
    RET

op_wait:
    LDB r1, [r0 + 1]
    ST [script_wait], r1
    ADD r0, 2
    ST [script_pc], r0
    LDI r0, 0
    RET

op_say:
    LDI r2, BOX_SAY
    JMP box_op
op_ask:
    LDI r2, BOX_ASK
box_op:
    MOV r1, r0
    ADD r1, 3
    ST [script_pc], r1
    LD r0, [r0 + 1]
    CALL open_box
    LDI r0, 0
    RET

op_log:
    MOV r1, r0
    ADD r1, 3
    ST [script_pc], r1
    LD r0, [r0 + 1]
    CALL open_log
    LDI r0, 0
    RET

op_bark:
    PUSH r0
    LD r0, [r0 + 1]
    CALL open_bark
    POP r0
    ADD r0, 3
    RET

op_pred:
    PUSH r0
    LDB r5, [r0 + 1]
    LDB r0, [r0 + 2]
    PUSH r5
    CALL flag_test
    POP r5
    MOV r1, r0
    MOV r0, r5
    CALL resolve_pred
    POP r0
    ADD r0, 3
    RET

op_prof:
    PUSH r0
    LDB r1, [r0 + 1]
    SHL r1, 1
    LD r0, [r1 + prof_vars]
    CALL bump
    POP r0
    ADD r0, 2
    RET

op_ifhit:
    LDB r1, [r0 + 1]
    SUB r1, 1
    LDI r2, 1
    SHL r2, r1
    LD r1, [pred_done]
    LD r3, [pred_hit]
    AND r1, r3
    AND r1, r2
    JZ @no
    LD r0, [r0 + 2]
    RET
@no:
    ADD r0, 4
    RET

op_ifguess:
    PUSH r0
    CALL oracle_update
    POP r0
    LDB r1, [r0 + 1]
    LD r2, [final_guess]
    CMP r1, r2
    JNE @no
    LD r0, [r0 + 2]
    RET
@no:
    ADD r0, 4
    RET

op_code:
    MOV r1, r0
    ADD r1, 2
    ST [script_pc], r1
    LDB r0, [r0 + 1]
    CALL make_code
    LDI r1, text_buf        ; "ACCESS CODE" / the code, in a SYSTEM box
    LDI r0, s_access
    CALL copy_str
    LDI r0, code_text
    CALL copy_str
    LDI r0, 0
    STB [r1], r0
    SUB r1, text_buf
    ST [box_len], r1
    LDI r0, SP_SYSTEM
    ST [box_spk], r0
    LDI r0, BOX_SAY
    ST [box_kind], r0
    LDI r0, 0
    ST [reveal], r0
    LDI r0, M_DIALOG
    ST [mode], r0
    LDI r0, 0
    RET

op_hack:
    PUSH r0
    LDB r0, [r0 + 1]
    CALL boss_hack
    POP r0
    ADD r0, 2
    RET

; r1 = actor index -> r6 = its record
actor_rec:
    MOV r6, r1
    MUL r6, ACT_SIZE
    ADD r6, actors
    RET

op_ifstun:
    LDB r1, [r0 + 1]
    CALL actor_rec
    LD r1, [r6 + AC_STUN]
    CMP r1, 0
    JEQ @no
    LD r0, [r0 + 2]
    RET
@no:
    ADD r0, 4
    RET

op_actt:
    LDB r1, [r0 + 1]
    CALL actor_rec
    LD r1, [r0 + 2]
    ST [r6 + AC_T], r1
    LD r1, [r6 + AC_D0]
    ST [r6 + AC_DIR], r1
    ADD r0, 4
    RET

op_ifdet:
    LD r1, [room_det]
    CMP r1, 0
    JEQ @no
    LD r0, [r0 + 1]
    RET
@no:
    ADD r0, 3
    RET

op_menu:
    LDI r1, 0
    ST [menu_sel], r1
    LDI r2, BOX_MENU
    JMP box_op

op_predch:
    PUSH r0
    CALL oracle_update
    LD r1, [menu_choice]
    LD r2, [final_guess]
    LDI r3, 0
    CMP r1, r2
    JNE @miss
    LDI r3, 1
@miss:
    POP r0
    PUSH r0
    MOV r1, r3
    LDB r0, [r0 + 1]
    CALL resolve_pred
    POP r0
    ADD r0, 2
    RET

op_ifch:
    LDB r1, [r0 + 1]
    LD r2, [menu_choice]
    CMP r1, r2
    JNE @no
    LD r0, [r0 + 2]
    RET
@no:
    ADD r0, 4
    RET

op_ending:
    LDI r0, MUS_NONE
    CALL set_music
    LDI r1, 0
    ST [script_pc], r1
    LDI r1, M_ENDING
    ST [mode], r1
    LDI r0, 0
    RET

op_snap:
    PUSH r0
    CALL accuracy
    ST [pct_before], r0
    POP r0
    ADD r0, 1
    RET

.data
op_table: .word op_end, op_set, op_clr, op_if, op_ifnot, op_jmp, op_event, op_ifev, op_warp, op_sfx, op_wait
          .word op_say, op_ask, op_log, op_bark, op_pred, op_prof, op_ifhit, op_ifguess, op_snap, op_code
          .word op_hack, op_ifstun, op_actt, op_ifdet, op_menu, op_predch, op_ifch, op_ending
s_access: .string "ACCESS CODE\n\n    "
prof_vars: .word 0, logs_read, mira_followed
