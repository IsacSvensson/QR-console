; Doors and the enemy (SPIKE.md §4).

; ---- doors ----
; find the door cells of the map (at most NDOORS)
doors_init:
    LDI r0, 0                       ; cell
    LDI r1, 0                       ; doors found
@cell:
    LDB r2, [r0 + map]
    CMP r2, CELL_DOOR_V
    JB @next
    CMP r1, NDOORS
    JAE @next
    MOV r3, r1
    MUL r3, D_SIZE
    ST [r3 + doors + D_CELL], r0
    ADD r1, 1
@next:
    ADD r0, 1
    CMP r0, 256
    JLT @cell
    ST [ndoors], r1
    RET

; B: open the door in front (or one the player stands in)
use_door:
    CALL cell_ahead
    MOV r6, r0
    LDI r4, 0
@find:
    LD r5, [ndoors]
    CMP r4, r5
    JAE @none
    MOV r3, r4
    MUL r3, D_SIZE
    LD r1, [r3 + doors + D_CELL]
    CMP r1, r6
    JNE @skip
    LD r1, [r3 + doors + D_STATE]
    CMP r1, DS_OPEN
    JEQ @none
    CMP r1, DS_OPENING
    JEQ @none
    LDI r1, DS_OPENING
    ST [r3 + doors + D_STATE], r1
    LDI r0, S_DOOR
    SYS SFX
    RET
@skip:
    ADD r4, 1
    JMP @find
@none:
    RET

; the player's map cell -> r0
player_cell:
    LD r0, [py]
    SHR r0, 8
    SHL r0, 4
    LD r1, [px]
    SHR r1, 8
    ADD r0, r1
    RET

doors_tick:
    CALL player_cell
    MOV r6, r0
    LDI r4, 0
@door:
    LD r5, [ndoors]
    CMP r4, r5
    JAE @done
    MOV r3, r4
    MUL r3, D_SIZE
    LD r7, [r3 + doors + D_CELL]
    LDB r1, [r7 + dopen]
    LD r2, [r3 + doors + D_STATE]
    CMP r2, DS_OPENING
    JEQ @opening
    CMP r2, DS_OPEN
    JEQ @open
    CMP r2, DS_CLOSING
    JEQ @closing
    JMP @next
@opening:
    ADD r1, DOOR_STEP
    CMP r1, 255
    JLT @set
    LDI r1, 255
    LDI r2, DS_OPEN
    ST [r3 + doors + D_STATE], r2
    LDI r2, DOOR_WAIT
    ST [r3 + doors + D_TIMER], r2
    JMP @set
@open:
    CMP r7, r6                      ; never close on the player
    JEQ @next
    LD r2, [r3 + doors + D_TIMER]
    SUB r2, 1
    ST [r3 + doors + D_TIMER], r2
    JNZ @next
    LDI r2, DS_CLOSING
    ST [r3 + doors + D_STATE], r2
    LDI r0, S_DOOR
    SYS SFX
    JMP @next
@closing:
    CMP r7, r6
    JNE @shut
    LDI r2, DS_OPENING              ; the player walked into it: open again
    ST [r3 + doors + D_STATE], r2
    JMP @next
@shut:
    SUB r1, DOOR_STEP
    JGT @set
    LDI r1, 0
    LDI r2, DS_CLOSED
    ST [r3 + doors + D_STATE], r2
@set:
    STB [r7 + dopen], r1
@next:
    ADD r4, 1
    JMP @door
@done:
    RET

; ---- the enemy ----
enemy_init:
    LDI r0, ENEMY_X
    ST [ex], r0
    LDI r0, ENEMY_Y
    ST [ey], r0
    LDI r0, E_HP
    ST [ehp], r0
    RET

enemy_tick:
    LD r0, [epain]
    CMP r0, 0
    JEQ @np
    SUB r0, 1
    ST [epain], r0
@np:
    LD r0, [estate]
    CMP r0, E_DEAD
    JEQ @done
    LD r4, [px]                     ; r4, r5 = player - enemy
    LD r0, [ex]
    SUB r4, r0
    LD r5, [py]
    LD r0, [ey]
    SUB r5, r0
    MOV r6, r4                      ; r6 = |dx|, r7 = |dy|
    CMP r6, 0
    JGE @ax
    NEG r6
@ax:
    MOV r7, r5
    CMP r7, 0
    JGE @ay
    NEG r7
@ay:
    LD r0, [estate]
    CMP r0, E_CHASE
    JEQ @chase
    MOV r0, r6
    ADD r0, r7
    CMP r0, E_WAKE
    JGE @done
    LDI r0, E_CHASE
    ST [estate], r0
@chase:
    LD r0, [eatk]
    CMP r0, 0
    JEQ @noatk
    SUB r0, 1
    ST [eatk], r0
@noatk:
    MOV r0, r6                      ; max norm
    CMP r0, r7
    JGE @mx
    MOV r0, r7
@mx:
    CMP r0, E_REACH
    JGE @far
    LD r1, [eatk]
    CMP r1, 0
    JNE @far
    LDI r1, E_ATTACK_DELAY          ; hit the player
    ST [eatk], r1
    LD r1, [health]
    SUB r1, E_DAMAGE
    JGE @hp
    LDI r1, 0
@hp:
    ST [health], r1
    LDI r1, HURT_TIME
    ST [hurt], r1
    PUSH r0
    LDI r0, S_HURT
    SYS SFX
    POP r0
@far:
    CMP r0, E_NEAR
    JLT @done
    LD r0, [epain]                  ; stands still while in pain
    CMP r0, 0
    JNE @done
    ; step towards the player on each axis, if the cell there is free
    LDI r6, 0
    CMP r4, 0
    JEQ @sx
    LDI r6, E_SPEED
    JGT @sx
    LDI r6, -E_SPEED
@sx:
    LD r0, [ex]
    ADD r0, r6
    PUSH r0
    LD r1, [ey]
    CALL solid
    POP r0
    JNZ @nox
    ST [ex], r0
@nox:
    LDI r6, 0
    CMP r5, 0
    JEQ @sy
    LDI r6, E_SPEED
    JGT @sy
    LDI r6, -E_SPEED
@sy:
    LD r1, [ey]
    ADD r1, r6
    PUSH r1
    LD r0, [ex]
    CALL solid
    POP r1
    JNZ @done
    ST [ey], r1
@done:
    RET

; a shot: hits the enemy if it covers the middle of the last image and is nearer than the wall there
shoot:
    LD r0, [estate]
    CMP r0, E_DEAD
    JEQ @miss
    LD r0, [e_vis]
    CMP r0, 0
    JEQ @miss
    LD r0, [e_left]
    CMP r0, 64
    JGT @miss
    LD r1, [e_size]
    SHL r1, 1
    LD r1, [r1 + size_px]
    ADD r0, r1
    CMP r0, 64
    JLE @miss
    LD r0, [e_depth]
    LD r1, [zb + NRAYS]             ; the middle ray (index NRAYS / 2, two bytes each)
    CMP r0, r1
    JGE @miss
    LDI r0, E_CHASE
    ST [estate], r0
    LDI r0, PAIN_TIME
    ST [epain], r0
    LD r0, [ehp]
    SUB r0, 1
    ST [ehp], r0
    JNZ @hurt
    LDI r0, E_DEAD
    ST [estate], r0
    LDI r0, S_DIE
    SYS SFX
    RET
@hurt:
    LDI r0, S_HIT
    SYS SFX
@miss:
    RET

; project the enemy with the image's camera and draw it, one tile column at a time, where it is nearer
; than the wall in the middle of that column
enemy_draw:
    LDI r0, 0
    ST [e_vis], r0
    LD r0, [ex]
    LD r1, [cx]
    SUB r0, r1
    MOV r6, r0                      ; r6 = relative x
    LD r0, [ey]
    LD r1, [cy]
    SUB r0, r1
    MOV r7, r0                      ; r7 = relative y
    LD r1, [cdx]                    ; depth = rel . dir
    MOV r0, r6
    CALL fmul
    MOV r5, r0
    MOV r0, r7
    LD r1, [cdy]
    CALL fmul
    ADD r5, r0
    CMP r5, PERP_MIN
    JLT @out
    MOV r0, r6                      ; side = rel . (-dir y, dir x)
    LD r1, [cdy]
    NEG r1
    CALL fmul
    MOV r4, r0
    MOV r0, r7
    LD r1, [cdx]
    CALL fmul
    ADD r4, r0
    ST [e_depth], r5
    ; off screen if |side| > 2 * depth
    MOV r0, r4
    CMP r0, 0
    JGE @abs
    NEG r0
@abs:
    MOV r1, r5
    SHL r1, 1
    CMP r0, r1
    JGT @out
    ; screen x = 64 + FOCAL * side / depth, with side and depth halved until |side| < 256
    MOV r1, r5
@shrink:
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
    ADD r4, 64                      ; r4 = centre x
    LDI r0, FOCAL256
    DIV r0, r5                      ; wall height at that depth
    CMP r0, HMAX
    JLE @hok
    LDI r0, HMAX
@hok:
    LDB r1, [r0 + spr_size]
    CMP r1, 255
    JEQ @out
    ST [e_size], r1
    SHR r0, 1
    ADD r0, VIEW_H / 2              ; the floor line
    SHL r1, 1
    LD r2, [r1 + size_px]
    SUB r0, r2
    ST [e_top], r0
    MOV r3, r2
    SHR r3, 1
    SUB r4, r3
    ST [e_left], r4
    LDI r0, 1
    ST [e_vis], r0
    ; blink while in pain
    LD r0, [epain]
    AND r0, 2
    JNZ @out
    ; tiles: spr_table[(pose * NUM_SIZES + size) * 4]
    LD r0, [estate]
    LDI r1, 0
    CMP r0, E_DEAD
    JNE @pose
    LDI r1, NUM_SIZES
@pose:
    LD r0, [e_size]
    ADD r1, r0
    SHL r1, 2
    LD r6, [r1 + spr_table]         ; r6 = tiles of column 0 (tile 0 trick)
    LD r7, [r1 + spr_table + 2]     ; r7 = tiles per side
    LD r4, [e_left]
    MOV r5, r7                      ; r5 = columns left
@col:
    MOV r0, r4                      ; ray in the middle of this tile column
    ADD r0, 4
    CMP r0, 0
    JLT @next
    CMP r0, 128
    JGE @next
    SHR r0, COLW_SHIFT
    SHL r0, 1
    LD r0, [r0 + zb]
    LD r1, [e_depth]
    CMP r1, r0
    JGE @next
    LDI r0, seq_map
    MOV r1, r6
    LDI r2, 1
    MOV r3, r7
    PUSH r4
    PUSH r5
    LD r5, [e_top]
    SYS MAP
    POP r5
    POP r4
@next:
    ADD r4, 8
    MOV r0, r7
    SHL r0, 5
    ADD r6, r0
    SUB r5, 1
    JNZ @col
@out:
    RET

gun_draw:
    LD r0, [flash]
    CMP r0, 0
    JEQ @gun
    LDI r0, seq_map
    LDI r1, flash_tiles
    LDI r2, 3
    LDI r3, 1
    LDI r4, 52
    LDI r5, 72
    SYS MAP
@gun:
    LDI r0, gun_map
    LDI r1, gun_tiles
    LDI r2, 3
    LDI r3, 2
    LDI r4, 52
    LDI r5, 80
    SYS MAP
    RET
