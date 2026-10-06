; Bulldozern (3-5 Byggarbetsplatsen, DESIGN.md §10.3). A driverless bulldozer drives slowly towards Bo; on its
; roof sits a big red STOP button. Three phases: (1) jump from the kicker and land on the button: it backs off;
; (2) the bucket is raised and guards the front: drop onto the button from the scaffolding; (3) it drops sand
; piles (its bucket down again) and parks under the end of the crane arm while Bo is up high: grind the crane arm
; and land on the button with a trick. Then it stops for good: DEN ÄR AVSTÄNGD!
; Landing on the roof beside the button bounces Bo off; touching the bulldozer or its raised bucket is a hit.
DZ_DRIVE = 0
DZ_BACK  = 1
DZ_WAIT  = 2
DZ_DONE  = 3
DZ_BUTTON = 6                       ; px either side of the centre
DZ_SAND_T = 90                      ; phase 3: frames between sand piles
DZ_SAND_MAX = 3

b_dozer:
    LD r0, [r7 + AC_SUB]
    SHL r0, 1
    LD r0, [r0 + @states]
    JMP r0
@states:
    .word @drive, @back, @wait, @done
@drive:                             ; towards Bo, slowly (a little faster in every phase), within its range;
    CALL dozer_bucket               ; in phase 3 back home (under the end of the crane arm) while Bo is up high
    CALL dir_to_bo
    LD r1, [boss_hits]
    CMP r1, 2
    JNE @speed
    CALL act_pos                    ; (r1, r2 = its x, foot; Bo's foot is lost, so ask again)
    PUSH r2
    CALL feet
    POP r1
    SUB r1, 20
    CMP r2, r1
    JGE @low
    LD r3, [r7 + AC_HX]             ; Bo is up high: towards home
    LD r0, [r7 + AC_X]
    SHR r0, 4
    SUB r3, r0
    LDI r0, 1
    CMP r3, 0
    JGE @home
    LDI r0, -1
    NEG r3
@home:
    JMP @speed
@low:
    CALL dir_to_bo
@speed:
    LD r1, [boss_hits]
    SHL r1, 1
    ADD r1, 4
    CMP r3, 2
    JGE @go
    LDI r1, 0                       ; right under Bo: it waits there
@go:
    MUL r0, r1
    ST [r7 + AC_VX], r0
    CALL en_row_of                  ; the range: from home to range columns left of it
    LDB r2, [r1 + 7]
    LD r1, [r7 + AC_X]
    ADD r1, r0
    SHL r2, 7                       ; columns * 8 px * 16
    LD r3, [r7 + AC_HX]
    SHL r3, 4
    CMP r1, r3                      ; (unsigned: x is 12.4 fixed point)
    JB @right
    MOV r1, r3
@right:
    SUB r3, r2
    CMP r1, r3
    JAE @left
    MOV r1, r3
@left:
    ST [r7 + AC_X], r1
    LD r0, [boss_hits]              ; phase 3: sand piles
    CMP r0, 2
    JNE @done
    LD r0, [r7 + AC_T]
    ADD r0, 1
    ST [r7 + AC_T], r0
    CMP r0, DZ_SAND_T
    JLT @done
    LDI r0, 0
    ST [r7 + AC_T], r0
    JMP dozer_sand
@back:                              ; backs off to its home after a press
    LDI r0, 24
    ST [r7 + AC_VX], r0
    LD r1, [r7 + AC_X]
    ADD r1, r0
    LD r2, [r7 + AC_HX]
    SHL r2, 4
    CMP r1, r2
    JLT @b
    MOV r1, r2
    LDI r0, DZ_WAIT
    ST [r7 + AC_SUB], r0
    LDI r0, 60
    ST [r7 + AC_T], r0
@b:
    ST [r7 + AC_X], r1
    RET
@wait:
    CALL dozer_bucket
    LDI r0, 0
    ST [r7 + AC_VX], r0
    LD r0, [r7 + AC_T]
    SUB r0, 1
    ST [r7 + AC_T], r0
    JGT @done
    LDI r0, DZ_DRIVE
    ST [r7 + AC_SUB], r0
@done:
    RET

; dozer_bucket: r7 = the bulldozer: in phase 2 its raised bucket (in front, above the roof) hurts Bo (in phase 3
; the bucket is down again: it dumps the sand piles)
dozer_bucket:
    LD r0, [boss_hits]
    CMP r0, 1
    JNE @no
    LD r0, [inv_t]
    CMP r0, 0
    JNE @no
    LD r0, [bo_state]
    CMP r0, ST_DEAD
    JGE @no
    PUSH r7
    CALL act_pos
    MOV r4, r1
    SUB r4, 16                      ; bucket: x - 16 .. x - 8, top - 16 .. top
    MOV r5, r2
    SUB r5, 32
    CALL feet
    MOV r0, r1
    SUB r0, BOX_W_L
    MOV r1, r2
    SUB r1, BOX_TOP
    LDI r2, BOX_W_L + BOX_W_R + 1
    LDI r3, BOX_TOP
    LDI r6, 8
    LDI r7, 16
    SYS OVERLAP
    POP r7
    CMP r0, 0
    JEQ @no
    LDI r0, EV_HIT
    CALL event
    JMP bo_hit
@no:
    RET

; dozer_sand: r7 = the bulldozer: a sand pile in front of it (at most DZ_SAND_MAX at a time)
dozer_sand:
    LDI r1, actors
    LDI r2, 0
@count:
    LD r0, [r1 + AC_TYPE]
    CMP r0, EN_SAND
    JNE @next
    ADD r2, 1
@next:
    ADD r1, ACT_SIZE
    CMP r1, actors + MAX_ACT * ACT_SIZE
    JLT @count
    CMP r2, DZ_SAND_MAX
    JGE @full
    CALL act_pos
    SUB r1, 20
    PUSH r7
    PUSH r1
    PUSH r2
    CALL act_free_slot
    POP r2
    POP r1
    CMP r7, 0
    JEQ @none
    LDI r0, EN_SAND
    CALL act_init
    LDI r0, 255
    ST [r7 + AC_EN], r0
    LDI r0, 0
    ST [r7 + AC_VX], r0
@none:
    POP r7
@full:
    RET

; dozer_contact: r7 = the bulldozer overlapping Bo
dozer_contact:
    LD r0, [r7 + AC_SUB]
    CMP r0, DZ_DONE
    JEQ @none
    CMP r0, DZ_BACK                 ; backing off after a press: nothing happens
    JEQ @none
    LD r0, [bo_state]               ; a landing from above?
    CMP r0, ST_AIR
    JNE @side
    LD r0, [bo_vy]
    CMP r0, 0
    JLE @side
    LD r0, [bo_pfoot]
    LD r1, [t_atop]
    ADD r1, 4
    CMP r0, r1
    JGT @side
    CALL feet                       ; on the button?
    LD r0, [r7 + AC_X]
    SHR r0, 4
    SUB r1, r0
    CMP r1, -DZ_BUTTON
    JLT @roof
    CMP r1, DZ_BUTTON
    JGT @roof
    LD r0, [r7 + AC_SUB]            ; only while it drives (not while it waits at home)
    CMP r0, DZ_DRIVE
    JNE @roof
    LD r0, [boss_hits]              ; phase 3: only with a trick in this airtime (the grind + one more)
    CMP r0, 2
    JNE @press
    LD r0, [trick]
    CMP r0, TR_NONE
    JNE @press
    LD r0, [combo_n]
    CMP r0, 2
    JGE @press
    LDI r0, TX_OJ
    CALL say
@roof:                              ; beside the button (or no trick): Bo bounces off it, to the open side
    LDI r0, EV_BOUNCE
    CALL event
    LD r0, [r7 + AC_X]
    SHR r0, 4
    LD r1, [lv_wpx]
    SHR r1, 1
    LDI r2, 24
    CMP r0, r1
    JB @away
    LDI r2, -24
@away:
    ST [bo_vx], r2
    JMP @up
@press:
    LDI r0, EV_STOMP
    CALL event
    LDI r0, SFX_POFF
    CALL play_sfx
    LD r0, [boss_hits]
    ADD r0, 1
    ST [boss_hits], r0
    CMP r0, BOSS_HITS
    JGE @won
    LDI r0, DZ_BACK
    ST [r7 + AC_SUB], r0
@up:
    LDI r0, STOMP_V
    NEG r0
    ST [bo_vy], r0
    RET
@won:
    LDI r0, DZ_DONE
    ST [r7 + AC_SUB], r0
    LDI r0, 0
    ST [r7 + AC_VX], r0
    LDI r0, TX_DEN_AR_AVSTANGD
    CALL say
    LDI r0, 150
    ST [boss_win_t], r0
    JMP @up
@side:
    CALL feet                       ; feet at or above the roof (going up after a bounce): no harm
    LD r1, [t_atop]
    ADD r1, 6
    CMP r2, r1
    JLE @none
    LDI r0, EV_HIT
    CALL event
    JMP bo_hit
@none:
    RET

; sand_contact: a sand pile under Bo slows him down like sand (harmless)
sand_contact:
    LD r0, [bo_state]
    CMP r0, ST_GROUND
    JNE @no
    LD r0, [bo_vx]
    MOV r1, r0
    SAR r1, 3
    SUB r0, r1
    ST [bo_vx], r0
@no:
    RET

; draw_dozer: r7 = the bulldozer: 4 x 2 sprites, the button, the raised bucket
draw_dozer:
    CALL act_pos
    LD r0, [cam_x]
    SUB r1, r0
    SUB r1, 16
    LD r0, [cam_y]
    SUB r2, r0
    SUB r2, 16
    LDI r3, 0
    LDI r0, RA_DOZER
    LDI r4, 0
@spr:
    SYS SPR
    ADD r0, 32
    ADD r1, 8
    ADD r4, 1
    CMP r4, 4
    JNE @row
    SUB r1, 32
    ADD r2, 8
@row:
    CMP r4, 8
    JLT @spr
    SUB r1, 32                      ; r1 = left edge, r2 = top
    SUB r2, 8
    PUSH r1
    PUSH r2
    MOV r0, r1                      ; the button
    ADD r0, 13
    SUB r2, 2
    MOV r1, r2
    LDI r2, 6
    LDI r3, 2
    LDI r4, C_RED
    LD r5, [r7 + AC_SUB]
    CMP r5, DZ_DONE
    JNE @red
    LDI r4, C_LGREY
@red:
    SYS RECTFILL
    POP r2
    POP r1
    LD r0, [boss_hits]              ; the raised bucket (phase 2)
    CMP r0, 1
    JNE @end
    LD r0, [r7 + AC_SUB]
    CMP r0, DZ_DONE
    JEQ @end
    SUB r2, 16
    LDI r0, RA_BUCKET
    LDI r3, 0
    SYS SPR
    ADD r2, 8
    ADD r0, 32
    SYS SPR
@end:
    RET

.data

.code
