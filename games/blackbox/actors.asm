; BLACKBOX — actors: guards, cameras, drones, hunters, prototypes, the ORACLE agent, NPCs, pick-ups; the EMP.
.code

; Fill the actor table from the room's object list (ROM). Called by load_room.
spawn_actors:
    LD r0, [room_rec]
    LD r1, [r0 + RR_OBJS]
    LDB r2, [r1]
    ADD r1, 1
    ST [n_actors], r2
    LDI r3, actors
@loop:
    CMP r2, 0
    JEQ @done
    LDB r0, [r1]
    CMP r0, O_PICKUP
    JNE @keep
    PUSH r1
    PUSH r2
    PUSH r3
    LDB r0, [r1 + 4]
    ADD r0, F_PICK0
    CALL flag_test
    MOV r4, r0
    POP r3
    POP r2
    POP r1
    LDI r0, O_PICKUP
    CMP r4, 0
    JEQ @keep
    LDI r0, 0               ; already taken
@keep:
    ST [r3 + AC_TYPE], r0
    LDB r0, [r1 + 1]
    SHL r0, 3
    ST [r3 + AC_X], r0
    LDB r0, [r1 + 2]
    SHL r0, 3
    ST [r3 + AC_Y], r0
    LDB r0, [r1 + 3]
    ST [r3 + AC_DIR], r0
    ST [r3 + AC_D0], r0
    LDB r0, [r1 + 4]
    ST [r3 + AC_MODE], r0
    LDB r0, [r1 + 5]
    ST [r3 + AC_P1], r0
    LDB r0, [r1 + 6]
    ST [r3 + AC_P2], r0
    LDI r0, 0
    ST [r3 + AC_T], r0
    ST [r3 + AC_STUN], r0
    ST [r3 + AC_ST], r0
    ST [r3 + AC_CNT], r0
    ADD r1, OBJ_REC
    ADD r3, ACT_SIZE
    SUB r2, 1
    JMP @loop
@done:
    RET

; Once per frame of free play: move every actor, then let it look for / touch the player.
update_actors:
    LDI r0, 1
    ST [act_ran], r0
    LD r0, [px]
    ADD r0, 4
    SAR r0, 3
    ST [pcx], r0
    LD r0, [py]
    ADD r0, 4
    SAR r0, 3
    ST [pcy], r0
    LDI r0, 0
    ST [ai], r0
    LDI r0, actors
    ST [ap], r0
@loop:
    LD r0, [ai]
    LD r1, [n_actors]
    CMP r0, r1
    JGE @done
    LD r6, [ap]
    LD r0, [r6 + AC_STUN]
    CMP r0, 0
    JEQ @act
    SUB r0, 1               ; stunned: count down; acts again on the frame it reaches 0
    ST [r6 + AC_STUN], r0
    JNZ @next
@act:
    LD r1, [r6 + AC_TYPE]
    SHL r1, 1
    LD r1, [r1 + actor_logic]
    CALL r1
@next:
    LD r0, [ai]
    ADD r0, 1
    ST [ai], r0
    LD r0, [ap]
    ADD r0, ACT_SIZE
    ST [ap], r0
    JMP @loop
@done:
    RET

act_none:
    RET

act_guard:
    LD r0, [frame]
    AND r0, 1
    JNZ @look
    CALL patrol
@look:
    LD r6, [ap]
    LDI r0, GUARD_RANGE
    CALL look
    CALL contact
    RET

act_heavy:
    LD r0, [frame]
    MOD r0, 3
    JNZ @look
    CALL patrol
@look:
    LD r6, [ap]
    LDI r0, HEAVY_RANGE
    CALL look
    CALL contact
    RET

act_drone:
    CALL patrol
    LD r6, [ap]
    LDI r0, DRONE_RANGE
    CALL look
    CALL contact
    RET

act_camera:
    LDI r0, CAM_RANGE
    CALL look
    RET

; Hunter: asleep until it sees the player within its range (any direction), then follows.
act_hunter:
    LD r0, [r6 + AC_ST]
    CMP r0, 0
    JNE @chase
    LDI r5, 0
@dirs:
    LD r6, [ap]
    ST [r6 + AC_DIR], r5
    PUSH r5
    LD r0, [r6 + AC_MODE]
    LDI r1, 0
    ST [ray_mode], r1
    CALL ray
    POP r5
    LD r0, [ray_hit]
    CMP r0, 0
    JNE @wake
    ADD r5, 1
    CMP r5, 4
    JLT @dirs
    LD r6, [ap]
    LD r0, [r6 + AC_D0]
    ST [r6 + AC_DIR], r0
    RET
@wake:
    LD r6, [ap]
    LDI r0, 1
    ST [r6 + AC_ST], r0
    LDI r0, SFX_WAKE
    SYS SFX
    RET
@chase:
    LD r0, [frame]
    AND r0, 1
    JNZ @touch
    LD r0, [px]
    LD r1, [py]
    CALL chase
@touch:
    CALL contact
    RET

; ORACLE agent: heads for where the player will be in ~1/2 s (position + 24 x current movement)
act_agent:
    LD r0, [frame]
    MOD r0, 3
    JEQ @touch
    LD r0, [mdx]
    MUL r0, 24
    LD r1, [px]
    ADD r0, r1
    LD r1, [mdy]
    MUL r1, 24
    LD r2, [py]
    ADD r1, r2
    CALL chase
@touch:
    CALL contact
    RET

; Prototype: a = 1 guards the blast door: follows the player's row along its column; too close = caught
act_proto:
    LD r0, [r6 + AC_MODE]
    CMP r0, 0
    JEQ @done
    LD r0, [frame]
    AND r0, 1
    JNZ @near
    LD r0, [py]
    LD r1, [r6 + AC_Y]
    CMP r0, r1
    JEQ @near
    JLT @up
    ADD r1, 1
    JMP @store
@up:
    SUB r1, 1
@store:
    ST [r6 + AC_Y], r1
@near:
    LD r6, [ap]
    LD r0, [px]
    LD r1, [r6 + AC_X]
    SUB r0, r1
    CALL abs0
    CMP r0, 16
    JGE @done
    LD r0, [py]
    LD r1, [r6 + AC_Y]
    SUB r0, r1
    CALL abs0
    CMP r0, 16
    JGE @done
    CALL got_caught
@done:
    RET

act_pickup:
    CALL touching
    CMP r0, 0
    JEQ @done
    LD r6, [ap]
    LD r5, [r6 + AC_MODE]   ; pick-up id
    LDI r0, 0
    ST [r6 + AC_TYPE], r0
    MOV r0, r5
    ADD r0, F_PICK0
    PUSH r5
    CALL flag_set
    POP r5
    CMP r5, 0
    JNE @charge
    LDI r0, F_EMP           ; id 0: the EMP itself, with three charges
    CALL flag_set
    LD r0, [charges]
    ADD r0, 3
    JMP @store
@charge:
    LD r0, [charges]        ; id 1: one spare charge
    ADD r0, 1
@store:
    CMP r0, MAX_CHARGES
    JLE @ok
    LDI r0, MAX_CHARGES
@ok:
    ST [charges], r0
    LDI r0, SFX_PICKUP
    SYS SFX
    LD r6, [ap]
    LD r1, [r6 + AC_MODE]
    LDI r0, TK_TOUCH
    LDI r2, 0
    CALL fire_trigger
@done:
    RET

; ---- movement ---------------------------------------------------------------------------------
; r6 = actor: one step of its patrol (h/v back and forth, turner, square)
patrol:
    LD r6, [ap]
    LD r0, [r6 + AC_MODE]
    CMP r0, 2
    JEQ @turn
    CMP r0, 3
    JEQ @square
    CMP r0, 1
    JEQ @vertical
    ; horizontal: between columns P1 and P2
    LD r1, [r6 + AC_X]
    LD r2, [r6 + AC_DIR]
    CMP r2, DIR_W
    JEQ @west
    ADD r1, 1
    LD r3, [r6 + AC_P2]
    SHL r3, 3
    CMP r1, r3
    JLT @hstore
    LDI r2, DIR_W
    JMP @hstore
@west:
    SUB r1, 1
    LD r3, [r6 + AC_P1]
    SHL r3, 3
    CMP r1, r3
    JGT @hstore
    LDI r2, DIR_E
@hstore:
    ST [r6 + AC_X], r1
    ST [r6 + AC_DIR], r2
    RET
@vertical:
    LD r1, [r6 + AC_Y]
    LD r2, [r6 + AC_DIR]
    CMP r2, DIR_N
    JEQ @north
    ADD r1, 1
    LD r3, [r6 + AC_P2]
    SHL r3, 3
    CMP r1, r3
    JLT @vstore
    LDI r2, DIR_N
    JMP @vstore
@north:
    SUB r1, 1
    LD r3, [r6 + AC_P1]
    SHL r3, 3
    CMP r1, r3
    JGT @vstore
    LDI r2, DIR_S
@vstore:
    ST [r6 + AC_Y], r1
    ST [r6 + AC_DIR], r2
    RET
@turn:                      ; alternate between the initial direction and P1 every P2 x 15 frames
    LD r1, [r6 + AC_T]
    ADD r1, 1
    LD r3, [r6 + AC_P2]
    MUL r3, 15
    CMP r1, r3
    JLT @tstore
    LDI r1, 0
    LD r2, [r6 + AC_DIR]
    LD r3, [r6 + AC_D0]
    CMP r2, r3
    JNE @back
    LD r2, [r6 + AC_P1]
    JMP @tdir
@back:
    MOV r2, r3
@tdir:
    ST [r6 + AC_DIR], r2
@tstore:
    ST [r6 + AC_T], r1
    RET
@square:                    ; P1 cells per side: east, south, west, north
    LD r2, [r6 + AC_DIR]
    LD r0, [r6 + AC_X]
    LD r1, [r6 + AC_Y]
    LDB r3, [r2 + step_dx]
    SHL r3, 8
    SAR r3, 8
    ADD r0, r3
    LDB r3, [r2 + step_dy]
    SHL r3, 8
    SAR r3, 8
    ADD r1, r3
    ST [r6 + AC_X], r0
    ST [r6 + AC_Y], r1
    LD r0, [r6 + AC_CNT]
    ADD r0, 1
    LD r3, [r6 + AC_P1]
    SHL r3, 3
    CMP r0, r3
    JLT @sqstore
    LDI r0, 0
    ADD r2, 1               ; E -> S -> W -> N (clockwise)
    AND r2, 3
    ST [r6 + AC_DIR], r2
@sqstore:
    ST [r6 + AC_CNT], r0
    RET

; r0, r1 = target pixel: one pixel along the axis with the larger distance (if that way is free)
chase:
    LD r6, [ap]
    LD r2, [r6 + AC_X]
    LD r3, [r6 + AC_Y]
    SUB r0, r2              ; dx
    SUB r1, r3              ; dy
    MOV r4, r0
    CALL abs4
    MOV r5, r1
    CALL abs5
    CMP r4, r5
    JLT @vert
    CMP r0, 0
    JEQ @done
    LDI r4, 1
    LDI r7, DIR_E
    CMP r0, 0
    JGT @h
    LDI r4, -1
    LDI r7, DIR_W
@h:
    ADD r2, r4
    JMP @try
@vert:
    LDI r4, 1
    LDI r7, DIR_S
    CMP r1, 0
    JGT @v
    LDI r4, -1
    LDI r7, DIR_N
@v:
    ADD r3, r4
@try:
    ST [r6 + AC_DIR], r7
    PUSH r2
    PUSH r3
    MOV r0, r2
    MOV r1, r3
    CALL box_blocked
    POP r3
    POP r2
    CMP r0, 0
    JNE @done
    LD r6, [ap]
    ST [r6 + AC_X], r2
    ST [r6 + AC_Y], r3
@done:
    RET

; ---- sight ------------------------------------------------------------------------------------
; r6 = actor, r0 = range: walk its line of sight; caught if the player's cell is on it
look:
    PUSH r0
    LDI r1, 0
    ST [ray_mode], r1
    POP r0
    CALL ray
    LD r0, [ray_hit]
    CMP r0, 0
    JEQ @no
    CALL got_caught
@no:
    RET

; r6 = actor, r0 = range. From the actor's centre cell, step cell by cell in its direction until an
; opaque tile or the room edge. ray_mode 0: sets ray_hit if a cell is the player's; 1: draws the ray.
ray:
    LD r6, [ap]
    MOV r7, r0
    LDI r0, 0
    ST [ray_hit], r0
    LD r4, [r6 + AC_X]
    ADD r4, 4
    SAR r4, 3
    LD r5, [r6 + AC_Y]
    ADD r5, 4
    SAR r5, 3
    LD r3, [r6 + AC_DIR]
    LDB r2, [r3 + cell_dx]
    SHL r2, 8
    SAR r2, 8
    LDB r3, [r3 + cell_dy]
    SHL r3, 8
    SAR r3, 8
@step:
    CMP r7, 0
    JEQ @done
    SUB r7, 1
    ADD r4, r2
    ADD r5, r3
    CMP r4, 0
    JLT @done
    CMP r4, 15
    JGT @done
    CMP r5, 0
    JLT @done
    CMP r5, 14
    JGT @done
    MOV r0, r4
    MOV r1, r5
    CALL attr_at
    AND r0, A_OPAQUE
    JNZ @done
    LD r0, [ray_mode]
    CMP r0, 0
    JNE @draw
    LD r0, [pcx]
    CMP r0, r4
    JNE @step
    LD r0, [pcy]
    CMP r0, r5
    JNE @step
    LDI r0, 1
    ST [ray_hit], r0
    RET
@draw:
    PUSH r2
    PUSH r3
    MOV r0, r4
    SHL r0, 3
    ADD r0, 3
    MOV r1, r5
    SHL r1, 3
    ADD r1, ROOM_Y + 3
    LDI r2, 2
    LDI r3, 2
    LD r6, [ap]
    LD r6, [r6 + AC_TYPE]
    LDB r6, [r6 + ray_colour]
    PUSH r4
    MOV r4, r6
    SYS RECTFILL
    POP r4
    POP r3
    POP r2
    JMP @step
@done:
    RET

; r6 = actor: caught if its 8x8 body overlaps the player's collision box
contact:
    CALL touching
    CMP r0, 0
    JEQ @no
    CALL got_caught
@no:
    RET

; -> r0 = 1 if actor [ap] overlaps the player's collision box
touching:
    LD r6, [ap]
    LD r0, [px]
    ADD r0, PBOX_X
    LD r1, [py]
    ADD r1, PBOX_Y
    LDI r2, PBOX_W
    LDI r3, PBOX_H
    LD r4, [r6 + AC_X]
    ADD r4, 1
    LD r5, [r6 + AC_Y]
    ADD r5, 1
    LDI r6, 6
    LDI r7, 6
    SYS OVERLAP
    RET

got_caught:
    LD r0, [caught_t]
    CMP r0, 0
    JNE @already
    LDI r0, CAUGHT_FRAMES
    ST [caught_t], r0
    LD r0, [det_count]
    ADD r0, 1
    ST [det_count], r0
    LDI r0, SFX_ALARM
    SYS SFX
@already:
    RET

; After a detection: the room starts over — actors respawn, the player is back where they came in.
restart_room:
    LD r0, [room]
    CALL load_room
    LD r0, [enter_x]
    ST [px], r0
    LD r0, [enter_y]
    ST [py], r0
    LD r0, [enter_dir]
    ST [pdir], r0
    RET

; ---- the EMP ----------------------------------------------------------------------------------
; B: stun every machine within EMP_R pixels
use_emp:
    LDI r0, F_EMP
    CALL flag_test
    CMP r0, 0
    JEQ @no
    LD r0, [charges]
    CMP r0, 0
    JEQ @empty
    SUB r0, 1
    ST [charges], r0
    LDI r0, emp_uses
    CALL bump
    LDI r0, F_ROOM_EMP
    CALL flag_set
    LD r0, [room_emp]
    ADD r0, 1
    ST [room_emp], r0
    LDI r0, 16
    ST [emp_fx], r0
    LDI r0, SFX_EMP
    SYS SFX
    LDI r6, actors
    LD r7, [n_actors]
@each:
    CMP r7, 0
    JEQ @no
    LD r0, [r6 + AC_TYPE]
    LDB r0, [r0 + is_machine]
    CMP r0, 0
    JEQ @skip
    LD r0, [r6 + AC_X]
    LD r1, [px]
    SUB r0, r1
    CALL abs0
    CMP r0, EMP_R
    JGT @skip
    LD r0, [r6 + AC_Y]
    LD r1, [py]
    SUB r0, r1
    CALL abs0
    CMP r0, EMP_R
    JGT @skip
    LDI r0, EMP_STUN
    ST [r6 + AC_STUN], r0
@skip:
    ADD r6, ACT_SIZE
    SUB r7, 1
    JMP @each
@empty:
    LDI r0, SFX_EMPTY
    SYS SFX
@no:
    RET

; A on a charging station
recharge:
    LDI r0, F_EMP
    CALL flag_test
    CMP r0, 0
    JEQ @no
    LD r0, [charges]
    CMP r0, 3
    JGE @no
    LDI r0, 3
    ST [charges], r0
    LDI r0, SFX_PICKUP
    SYS SFX
@no:
    RET

abs0:
    CMP r0, 0
    JGE @ok
    NEG r0
@ok:
    RET
abs4:
    CMP r4, 0
    JGE @ok
    NEG r4
@ok:
    RET
abs5:
    CMP r5, 0
    JGE @ok
    NEG r5
@ok:
    RET

; ---- drawing ----------------------------------------------------------------------------------
draw_actors:
    LDI r0, 0
    ST [ai], r0
    LDI r0, actors
    ST [ap], r0
@loop:
    LD r0, [ai]
    LD r1, [n_actors]
    CMP r0, r1
    JGE @done
    LD r6, [ap]
    LD r5, [r6 + AC_TYPE]
    CMP r5, 0
    JEQ @next
    ; line of sight (watching types that are not stunned)
    LD r0, [r6 + AC_STUN]
    CMP r0, 0
    JNE @sprite
    LDB r0, [r5 + sight_range]
    CMP r0, 0
    JEQ @sprite
    LDI r1, 1
    ST [ray_mode], r1
    CALL ray
@sprite:
    LD r6, [ap]
    LD r5, [r6 + AC_TYPE]
    CMP r5, O_CAMERA
    JEQ @next               ; cameras are tiles
    LD r0, [r6 + AC_STUN]
    CMP r0, 0
    JEQ @visible
    LD r0, [frame]
    AND r0, 4
    JNZ @next               ; stunned: blink
@visible:
    LDB r0, [r5 + sprite_base]
    LD r1, [r6 + AC_DIR]
    LDB r1, [r1 + dir_pose]
    LDB r2, [r5 + has_poses]
    MUL r1, r2
    ADD r0, r1
    LDB r1, [r5 + uses_id]  ; NPCs and pick-ups: one sprite per id
    LD r2, [r6 + AC_MODE]
    MUL r1, r2
    ADD r0, r1
    SHL r0, 5
    ADD r0, spr_actors
    LD r1, [r6 + AC_X]
    LD r2, [r6 + AC_Y]
    ADD r2, ROOM_Y
    LDI r3, 0
    LD r4, [r6 + AC_DIR]
    CMP r4, DIR_W
    JNE @draw
    LDI r3, 1
@draw:
    SYS SPR
@next:
    LD r0, [ai]
    ADD r0, 1
    ST [ai], r0
    LD r0, [ap]
    ADD r0, ACT_SIZE
    ST [ap], r0
    JMP @loop
@done:
    RET

.data
;                none guard drone heavy hunter proto agent npc boss pickup camera
actor_logic: .word act_none, act_guard, act_drone, act_heavy, act_hunter, act_proto, act_agent, act_none, act_none, act_pickup, act_camera
is_machine:   .byte 0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1
sight_range:  .byte 0, GUARD_RANGE, DRONE_RANGE, HEAVY_RANGE, 0, 0, 0, 0, 0, 0, CAM_RANGE
ray_colour:   .byte 0, 14, 13, 9, 0, 0, 0, 0, 0, 0, 6
has_poses:    .byte 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0
sprite_base:  .byte 0, 0, 3, 4, 7, 8, 9, 10, 12, 13, 0
uses_id:      .byte 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0
dir_pose:     .byte 1, 2, 0, 2          ; N back, E side, S front, W side (flipped)
cell_dx:      .byte 0, 1, 0, -1
cell_dy:      .byte -1, 0, 1, 0
step_dx:      .byte 0, 1, 0, -1
step_dy:      .byte -1, 0, 1, 0
