; Timed changes (DESIGN.md §6.6): trees falling in a storm, a landslide, water rising. Each is level data (`event:`
; in .map): it starts when its control is stamped (or at the level's start), shows its warning for its last `warn`
; frames, then changes its cells. Like the whirlwind it never reads Sixten's position and never uses RND; its clock
; runs in play and slide frames (the map pauses it). Sixten on a cell that a tree or a slide falls on: AJ!.
.code

EVK_FALL  = 1
EVK_SLIDE = 2
EVK_FLOOD = 3

; level start: no event running
events_reset:
    LDI r0, ev_t
    LDI r1, 0xFF
    LDI r2, 16
    SYS FILL                        ; every clock 0xFFFF = not started
    LDI r0, 0
    ST [ev_done], r0
    ST [ev_warn], r0
    RET

; r6 = the k-th event's record (r0 = k)
ev_ptr:
    MUL r0, EV_REC
    LD r6, [lv_ptr]
    LD r6, [r6 + LR_EVENTS]
    ADD r6, r0
    RET

; one frame: start the events whose trigger has happened, run their clocks, warn, change
events_update:
    LDI r0, 0
    ST [ev_warn], r0
    LDI r5, 0
@k:
    LD r1, [lv_ptr]
    LDB r1, [r1 + LR_NEV]
    CMP r5, r1
    JGE @done
    LDI r1, 1
    SHL r1, r5
    LD r0, [ev_done]
    AND r0, r1
    JNZ @next
    MOV r0, r5
    CALL ev_ptr
    MOV r7, r5
    SHL r7, 1
    LD r0, [r7 + ev_t]
    CMP r0, 0xFFFF
    JNE @running
    LDB r1, [r6]                    ; trigger: 0 = the start, else control k (index + 1) stamped
    CMP r1, 0
    JEQ @start
    SUB r1, 1
    LD r2, [stamped]
    SHR r2, r1
    AND r2, 1
    JZ @next
@start:
    LDI r0, 0
@running:
    ADD r0, 1
    ST [r7 + ev_t], r0
    LD r2, [r6 + 4]                 ; when
    LD r3, [r6 + 6]                 ; warning
    MOV r4, r2
    SUB r4, r3
    CMP r0, r4
    JB @check
    LDI r1, 1                       ; warning
    SHL r1, r5
    LD r4, [ev_warn]
    OR r4, r1
    ST [ev_warn], r4
@check:
    CMP r0, r2
    JB @next
    CALL ev_happen
@next:
    ADD r5, 1
    JMP @k
@done:
    CALL ev_effects
    RET

; r5 = event index, r6 = its record: its cells change; under a falling tree or a slide: AJ!
ev_happen:
    LDI r1, 1
    SHL r1, r5
    LD r0, [ev_done]
    OR r0, r1
    ST [ev_done], r0
    LDB r7, [r6 + 2]
    LD r4, [r6 + 8]
@c:
    CMP r7, 0
    JEQ @changed
    LD r0, [r4]
    LDB r1, [r4 + 2]
    STB [r0 + cells], r1
    LD r2, [cell_i]
    CMP r0, r2
    JNE @nc
    LDB r1, [r6 + 1]
    CMP r1, EVK_FLOOD
    JEQ @nc
    PUSH r4
    PUSH r5
    PUSH r6
    PUSH r7
    CALL aj
    POP r7
    POP r6
    POP r5
    POP r4
@nc:
    ADD r4, 4
    SUB r7, 1
    JMP @c
@changed:
    LDI r0, 1
    ST [wh_dirty], r0
    LDI r0, SFX_CHANGE
    SYS SFX
    RET

; the warnings' sound: a creak (falling trees) or a rumble (a slide) every 30 frames
ev_effects:
    LD r0, [ev_warn]
    CMP r0, 0
    JEQ @done
    LD r0, [tick]
    AND r0, 0x3FFF                  ; (kept positive: MOD is signed)
    MOD r0, 30
    JNZ @done
    LDI r0, SFX_CREAK
    SYS SFX
@done:
    RET

; on the view: for each event in its warning, its cells show it (a branch's shadow under falling trees, gravel
; trickling where the slope will come down, ripples where the water will rise)
draw_events:
    LD r0, [ev_warn]
    CMP r0, 0
    JEQ @done
    LDI r5, 0
@k:
    LD r1, [lv_ptr]
    LDB r1, [r1 + LR_NEV]
    CMP r5, r1
    JGE @done
    LDI r1, 1
    SHL r1, r5
    LD r0, [ev_warn]
    AND r0, r1
    JZ @next
    MOV r0, r5
    CALL ev_ptr
    LDB r7, [r6 + 2]
    LD r4, [r6 + 8]
    LDB r3, [r6 + 1]
@c:
    CMP r7, 0
    JEQ @next
    PUSH r3
    PUSH r4
    PUSH r5
    PUSH r7
    LD r0, [r4]                     ; the cell's top-left on screen
    LD r1, [lv_w]
    MOV r2, r0
    DIV r2, r1
    MUL r1, r2
    SUB r0, r1
    SHL r0, 5
    LD r1, [camx]
    SUB r0, r1
    SHL r2, 5
    ADD r2, PLAY_Y
    LD r1, [camy]
    SUB r2, r1
    MOV r1, r2
    CALL ev_mark
    POP r7
    POP r5
    POP r4
    POP r3
    ADD r4, 4
    SUB r7, 1
    JMP @c
@next:
    ADD r5, 1
    JMP @k
@done:
    RET

; r0, r1 = a cell's top-left on screen, r3 = the event's kind: its warning mark
ev_mark:
    CMP r3, EVK_FALL
    JNE @slide
    ADD r0, 12                      ; a growing shadow
    ADD r1, 12
    LDI r2, 8
    LDI r3, 6
    LDI r4, C_DGREY
    SYS RECTFILL
    RET
@slide:
    CMP r3, EVK_SLIDE
    JNE @flood
    LD r2, [tick]                   ; gravel trickling down the cell
    AND r2, 31
    ADD r1, r2
    ADD r0, 8
    LDI r2, C_KHAKI
    SYS PSET
    ADD r0, 9
    SUB r1, 9
    SYS PSET
    ADD r0, 6
    ADD r1, 14
    SYS PSET
    RET
@flood:
    LD r2, [tick]                   ; ripples
    AND r2, 15
    ADD r0, r2
    ADD r0, 8
    ADD r1, 16
    MOV r2, r0
    ADD r2, 5
    MOV r3, r1
    LDI r4, C_BLUE
    SYS LINE
    RET

; rain over the view (World 3): falling streaks, drawn when no whirlwind blows its particles
draw_rain:
    LD r0, [lv_ptr]
    LDB r0, [r0 + LR_WORLD]
    CMP r0, 3
    JNE @done
    LD r0, [wh_state]
    CMP r0, WH_NONE
    JNE @done
    LDI r6, 0
@p:
    MOV r0, r6                      ; x from the drop's number, y falls 4 px a frame
    MUL r0, 37
    AND r0, 127
    LD r1, [tick]                   ; (kept positive: MOD is signed)
    AND r1, 0x0FFF
    SHL r1, 2
    MOV r2, r6
    MUL r2, 23
    ADD r1, r2
    MOD r1, 96
    ADD r1, PLAY_Y
    MOV r2, r0
    SUB r2, 1
    MOV r3, r1
    ADD r3, 3
    LDI r4, C_LGREY
    SYS LINE
    ADD r6, 1
    CMP r6, 16
    JLT @p
@done:
    RET
