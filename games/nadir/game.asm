; NADIR - the game around the player (DESIGN §6.5): the start state, health, death and the restart.
.code

.var hp                             ; health (signed: may go below 0 on the killing hit)
.var dead                           ; frames until the restart (0 = alive)
.var hits_taken                     ; enemy hits on the player
.var restarts                       ; restarts after a death (not reset by a restart)
; M31 (DESIGN §6.5, LEVEL.md)
.var obj                            ; objectives done
.var won                            ; 1 once the last objective is done
.var kills                          ; enemies killed
.var sec_bits                       ; secrets found (bit per secret)
.var msg_t                          ; frames the next objective's text is still shown
.var play_f                         ; the time in play (not reset by a restart): frames of the second
.var play_s                         ; and seconds

.data
; the checkpoint's snapshot (DESIGN §6.5): RAM address, bytes; saved one after another into snap
snap_tab:
    .word enemies, NUM_ENEMIES * E_SIZE
    .word props, (NUM_PROPS + NUM_ENEMIES) * PROP_SIZE
    .word bar_hp, NUM_PROPS
    .word bar_boom, NUM_PROPS
    .word doors, NUM_DOORS * DOOR_SIZE
    .word hp, 2
    .word w_mag, 2
    .word w_res, 2
    .word keys, 2
    .word picked_med, 2
    .word picked_ammo, 2
    .word obj, 2
    .word kills, 2
    .word sec_bits, 2
    .word shots, 2
    .word shots_hit, 2
snap_end:
SNAP_BYTES = NUM_ENEMIES * E_SIZE + (NUM_PROPS + NUM_ENEMIES) * PROP_SIZE + 2 * NUM_PROPS + NUM_DOORS * DOOR_SIZE + 22
.code
.var snap, SNAP_BYTES

; the snapshot: every snap_tab region into snap (r5 = 0) or back (r5 = 1). Clobbers r0-r7.
snap_copy:
    LDI r6, snap_tab
    LDI r7, snap
@r:
    CMP r6, snap_end
    JAE @done
    LD r4, [r6]                     ; the region
    LD r3, [r6 + 2]
    CMP r5, 0
    JNE @back
    MOV r0, r7                      ; save: region -> snap (a far address below XDATA_BASE is memory)
    LDI r1, 0
    MOV r2, r4
    JMP @c
@back:
    MOV r0, r4                      ; restore: snap -> region
    LDI r1, 0
    MOV r2, r7
@c:
    PUSH r3
    SYS COPY
    POP r3
    ADD r7, r3
    ADD r6, 4
    JMP @r
@done:
    RET
snap_save:
    LDI r5, 0
    JMP snap_copy

; after a death past the checkpoint: the snapshot back, the player at the checkpoint pose, the effects, the weapon's
; state and the player's motion as at the start (DESIGN §6.5).
respawn:
    LDI r5, 1
    CALL snap_copy
    CALL fx_reset
    CALL sound_reset
    CALL game_motion
    LDI r0, MSG_FRAMES
    ST [msg_t], r0
    LD r0, [obj]
    ST [msg_k], r0
    LDI r0, POSE_CHECKPOINT
    ST [dbg_pose], r0
    RET

; The start state, at the start and at a restart: doors, props, enemies, the player at the start pose, keys,
; weapon, health and counters (except tick and restarts).
game_reset:
    CALL world_init
    CALL enemies_init
    CALL fx_reset
    CALL sound_reset
    CALL game_motion
    LDI r0, 0
    ST [keys], r0
    ST [picked_med], r0
    ST [picked_ammo], r0
    ST [obj], r0
    ST [won], r0
    ST [kills], r0
    ST [sec_bits], r0
    ST [shots_hit], r0
    ST [shots], r0
    ST [hits_taken], r0
    ST [msg_k], r0
    LDI r0, MSG_FRAMES
    ST [msg_t], r0
    LDI r0, MAG
    ST [w_mag], r0
    LDI r0, AMMO_START
    ST [w_res], r0
    LDI r0, HP_MAX
    ST [hp], r0
    LDI r0, POSE_START
    ST [dbg_pose], r0
    RET

; the player's motion, the weapon's state and the death timer as at the start (game_reset, respawn)
game_motion:
    LDI r0, 0
    ST [walk_v], r0
    ST [turn_k], r0
    ST [turn_dir], r0
    ST [tap_dir], r0
    ST [tap_tick], r0
    ST [dash_n], r0
    ST [dash_dir], r0
    ST [bob_ph], r0
    ST [bob], r0
    ST [w_state], r0
    ST [w_t], r0
    ST [w_flash], r0
    ST [dead], r0
    ST [noise], r0
    RET

; Per frame, the logic in DESIGN §6's order: the effects' timers, the player (not while dead), the barrels that
; explode, the enemies, acid balls and particles, the weapon (not while dead), the world; then death and restart.
; nonzero when this frame's logic fired the weapon or exploded a barrel: no image is drawn in it (DESIGN §3.11)
.var lg_heavy
game_frame:
    LDI r0, 0
    ST [lg_heavy], r0
    LD r0, [play_f]                 ; M31: the time in play (the statistics), in seconds and frames
    ADD r0, 1
    CMP r0, 60
    JB @pf
    LD r0, [play_s]
    ADD r0, 1
    ST [play_s], r0
    LDI r0, 0
@pf:
    ST [play_f], r0
    LD r0, [msg_t]
    CMP r0, 0
    JEQ @m0
    SUB r0, 1
    ST [msg_t], r0
@m0:
    CALL fx_timers
    LD r0, [dead]
    CMP r0, 0
    JEQ @alive
    SUB r0, 1                       ; dead: the horizon sinks 1 px per 4 frames (at most 16)
    ST [dead], r0
    JNZ @sink
    LD r0, [restarts]
    ADD r0, 1
    ST [restarts], r0
    LD r0, [obj]                    ; past the checkpoint: back to it (DESIGN §6.5)
    CMP r0, CHECK_OBJ
    JGE respawn
    JMP game_reset
@sink:
    LDI r1, DEATH_FRAMES
    SUB r1, r0
    SHR r1, 2
    CMP r1, 16
    JB @b
    LDI r1, 16
@b:
    ST [bob], r1
    CALL fx_booms
    CALL enemies_frame
    CALL fx_frame
    JMP world
@alive:
    CALL player
    CALL fx_booms
    CALL enemies_frame
    CALL fx_frame
    LD r0, [hp]
    CMP r0, 1
    JGE @live
    LDI r0, DEATH_FRAMES
    ST [dead], r0
    LDI r0, SFX_PDEATH
    CALL play_sfx
    LDI r0, MUS_DEATH
    CALL set_music
    JMP world
@live:
    CALL weapon_frame
    JMP world
