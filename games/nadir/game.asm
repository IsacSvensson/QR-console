; NADIR - the game around the player (DESIGN §6.5): the start state, health, death and the restart.
.code

.var hp                             ; health (signed: may go below 0 on the killing hit)
.var dead                           ; frames until the restart (0 = alive)
.var hits_taken                     ; enemy hits on the player
.var restarts                       ; restarts after a death (not reset by a restart)

; The start state, at the start and at a restart: doors, props, enemies, the player at the start pose, keys,
; weapon, health and counters (except tick and restarts).
game_reset:
    CALL world_init
    CALL enemies_init
    CALL fx_reset
    CALL sound_reset
    LDI r0, 0
    ST [keys], r0
    ST [picked_med], r0
    ST [picked_ammo], r0
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
    ST [shots], r0
    ST [hits_taken], r0
    ST [dead], r0
    ST [noise], r0
    LDI r0, MAG
    ST [w_mag], r0
    LDI r0, AMMO_START
    ST [w_res], r0
    LDI r0, HP_MAX
    ST [hp], r0
    LDI r0, POSE_START
    ST [dbg_pose], r0
    RET

; Per frame, the logic in DESIGN §6's order: the effects' timers, the player (not while dead), the barrels that
; explode, the enemies, acid balls and particles, the weapon (not while dead), the world; then death and restart.
; nonzero when this frame's logic fired the weapon or exploded a barrel: no image is drawn in it (DESIGN §3.11)
.var lg_heavy
game_frame:
    LDI r0, 0
    ST [lg_heavy], r0
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
