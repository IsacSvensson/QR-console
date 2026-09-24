; BLACKBOX — the two bosses (LAYOUT.md 4.5 and 7.1). Both are actors of type O_BOSS; AC_MODE = boss id.
;   0 SECURITY DIRECTOR: faces the player and fires three pulses along its line of sight, then turns its back
;     for BOSS_TURN frames; its three panels can only be hacked while it is turned. P4: the first panel
;     hacked in the first window.
;   1 the measuring unit: follows the player; its four panels can only be hacked while it is EMP-stunned.
; Actor fields: AC_T timer, AC_ST 0 firing / 1 turned, AC_P1 pulses fired, AC_P2 turn count,
; AC_CNT panels hacked (bits), AC_D0: boss 1 power-up frames / boss 2 bark bits.
; Boss 1 powers up for BOSS_WAKE frames after the player enters: no aim, no sight (the S door is in its column).
.code

act_boss:
    LD r0, [r6 + AC_MODE]
    CMP r0, 0
    JNE unit_logic
    LD r0, [r6 + AC_D0]
    CMP r0, BOSS_WAKE
    JGE @awake
    ADD r0, 1               ; powering up
    ST [r6 + AC_D0], r0
    RET
@awake:
    LD r1, [r6 + AC_T]
    ADD r1, 1
    ST [r6 + AC_T], r1
    LD r0, [r6 + AC_ST]
    CMP r0, 0
    JNE @turned
    CALL face_player
    LD r6, [ap]
    LD r1, [r6 + AC_T]
    CMP r1, BOSS_PULSE
    JLT @look
    LDI r1, 0
    ST [r6 + AC_T], r1
    LDI r0, SFX_PULSE
    CALL play_sfx
    LD r6, [ap]
    LD r0, [r6 + AC_P1]
    ADD r0, 1
    ST [r6 + AC_P1], r0
    CMP r0, 3
    JLT @look
    LDI r0, 1               ; three pulses: turn its back
    ST [r6 + AC_ST], r0
    LDI r0, 0
    ST [r6 + AC_P1], r0
    LD r0, [r6 + AC_P2]
    ADD r0, 1
    ST [r6 + AC_P2], r0
    LD r0, [r6 + AC_DIR]
    ADD r0, 2
    AND r0, 3
    ST [r6 + AC_DIR], r0
    JMP @look
@turned:
    CMP r1, BOSS_TURN
    JLT @look
    LDI r0, 0
    ST [r6 + AC_ST], r0
    ST [r6 + AC_T], r0
@look:
    LD r6, [ap]
    LDI r0, BOSS_RANGE
    CALL look
    CALL boss_contact
    RET

; face along the axis on which the player is further away
face_player:
    LD r6, [ap]
    LD r0, [px]
    LD r1, [r6 + AC_X]
    SUB r0, r1
    LD r1, [py]
    LD r2, [r6 + AC_Y]
    SUB r1, r2
    MOV r4, r0
    CALL abs4
    MOV r5, r1
    CALL abs5
    CMP r4, r5
    JLT @vert
    LDI r2, DIR_E
    CMP r0, 0
    JGE @set
    LDI r2, DIR_W
    JMP @set
@vert:
    LDI r2, DIR_S
    CMP r1, 0
    JGE @set
    LDI r2, DIR_N
@set:
    ST [r6 + AC_DIR], r2
    RET

unit_logic:
    ; ORACLE's running commentary (each bark once per visit)
    LD r0, [held]
    AND r0, BTN_LEFT
    JZ @no_left
    LDI r0, 1
    LDI r1, box_BARK_5      ; "LEFT. AS EXPECTED."
    CALL boss_bark
@no_left:
    LD r6, [ap]
    LD r1, [r6 + AC_T]
    ADD r1, 1
    ST [r6 + AC_T], r1
    CMP r1, 900
    JLT @no_slow
    LDI r0, 4
    LDI r1, box_BARK_7      ; "THIS IS TAKING LONGER THAN FORECAST."
    CALL boss_bark
@no_slow:
    LD r6, [ap]
    LD r0, [px]
    LD r1, [r6 + AC_X]
    SUB r0, r1
    CALL abs0
    CMP r0, 24
    JGE @move
    LD r0, [py]
    LD r1, [r6 + AC_Y]
    SUB r0, r1
    CALL abs0
    CMP r0, 24
    JGE @move
    LDI r0, 2
    LDI r1, box_BARK_6      ; "YOU HESITATE WHEN CORNERED."
    CALL boss_bark
@move:
    LD r0, [frame]
    MOD r0, 3
    JEQ @touch
    LD r0, [px]
    LD r1, [py]
    CALL chase
@touch:
    CALL boss_contact
    RET

; r0 = bark bit, r1 = box: show it once per visit (bits in AC_D0 of the unit)
boss_bark:
    LD r6, [ap]
    LD r2, [r6 + AC_D0]
    MOV r3, r2
    AND r3, r0
    JNZ @done
    OR r2, r0
    ST [r6 + AC_D0], r2
    MOV r0, r1
    CALL open_bark
@done:
    RET

; the 16x16 body touching the player's collision box = caught
boss_contact:
    LD r6, [ap]
    LD r0, [px]
    ADD r0, PBOX_X
    LD r1, [py]
    ADD r1, PBOX_Y
    LDI r2, PBOX_W
    LDI r3, PBOX_H
    LD r4, [r6 + AC_X]
    SUB r4, BOSS_BODY_OFS
    LD r5, [r6 + AC_Y]
    SUB r5, BOSS_BODY_OFS
    LDI r6, BOSS_BODY
    LDI r7, BOSS_BODY
    SYS OVERLAP
    CMP r0, 0
    JEQ @no
    CALL got_caught
@no:
    RET

; r0 = panel index. Hacks it if the boss allows it now. Sets F_HACKED on success.
boss_hack:
    MOV r5, r0
    LDI r0, F_HACKED
    CALL flag_clr
    LDI r6, actors
    LD r7, [n_actors]
@find:
    CMP r7, 0
    JEQ @fail
    LD r0, [r6 + AC_TYPE]
    CMP r0, O_BOSS
    JEQ @found
    ADD r6, ACT_SIZE
    SUB r7, 1
    JMP @find
@found:
    LD r0, [r6 + AC_MODE]
    CMP r0, 0
    JNE @unit
    LD r0, [r6 + AC_ST]     ; boss 1: only while its back is turned
    CMP r0, 1
    JNE @fail
    LDI r4, 7               ; three panels
    JMP @ok
@unit:
    LD r0, [r6 + AC_STUN]   ; boss 2: only while stunned
    CMP r0, 0
    JEQ @fail
    LDI r4, 15              ; four panels
@ok:
    LDI r1, 1
    SHL r1, r5
    LD r2, [r6 + AC_CNT]
    MOV r3, r2
    AND r3, r1
    JNZ @fail               ; already hacked
    CMP r2, 0
    JNE @notfirst
    LD r0, [r6 + AC_MODE]   ; the first panel: in the first window? (P4)
    CMP r0, 0
    JNE @notfirst
    LD r0, [r6 + AC_P2]
    CMP r0, 1
    JNE @notfirst
    PUSH r1
    PUSH r2
    PUSH r4
    PUSH r6
    LDI r0, F_P4OK
    CALL flag_set
    POP r6
    POP r4
    POP r2
    POP r1
@notfirst:
    OR r2, r1
    ST [r6 + AC_CNT], r2
    PUSH r2
    PUSH r4
    PUSH r6
    LDI r0, F_HACKED
    CALL flag_set
    LDI r0, SFX_USE
    CALL play_sfx
    POP r6
    POP r4
    POP r2
    CMP r2, r4
    JNE @done
    LDI r0, 0               ; all panels: defeated
    ST [r6 + AC_TYPE], r0
    LD r0, [r6 + AC_MODE]
    LDI r1, F_LABCARD
    CMP r0, 0
    JEQ @flag
    LDI r1, F_BOSS2
@flag:
    MOV r0, r1
    CALL flag_set
    CALL apply_locks
    LDI r0, SFX_DOWN
    CALL play_sfx
@done:
    RET
@fail:
    LDI r0, SFX_EMPTY
    CALL play_sfx
    RET

; draw a 16x16 boss: four sprites around its centre
draw_boss:
    LD r5, [r6 + AC_MODE]
    SHL r5, 2
    ADD r5, SPR_BOSS
    LD r1, [r6 + AC_X]
    SUB r1, 4
    LD r2, [r6 + AC_Y]
    ADD r2, ROOM_Y - 4
    LDI r3, 0
    LDI r4, 0
@quad:
    MOV r0, r5
    ADD r0, r4
    SHL r0, 5
    ADD r0, spr_actors
    PUSH r1
    PUSH r2
    MOV r6, r4
    AND r6, 1
    SHL r6, 3
    ADD r1, r6
    MOV r6, r4
    SHR r6, 1
    SHL r6, 3
    ADD r2, r6
    SYS SPR
    POP r2
    POP r1
    ADD r4, 1
    CMP r4, 4
    JLT @quad
    RET
