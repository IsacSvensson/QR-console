; NADIR - sound (DESIGN §8): the effects with their channels and priorities, the music sequencer (the notes in
; xdata, one 4-byte COPY when a note starts), the choice of track and the threat cue. music_step runs once per
; frame after the game logic.
.code

.var snd_busy, 6                    ; per channel: frames an effect still owns it
.var snd_prio, 6                    ; per channel: that effect's priority
.var mus_cur                        ; the track playing (MUS_*)
.var mus_calm                       ; frames without an awake enemy left before STRID becomes DRÖNARE
.var thr_t                          ; frames to the next threat cue
.var mus_awake                      ; awake enemies at the end of the frame's logic
.var v_off, 6                       ; per voice: xdata offset (from mus_x) of its next note, 0xFFFF = silent
.var v_t, 6                         ; per voice: frames left of its note
.var v_buf, 4                       ; the note being read: Hz, step, klang << 4 | volume

.data
; per enemy kind (16 entries) and state: the effect when it enters that state (255: none) (DESIGN §8.1)
en_snd:
    .byte 255, SFX_KALERT, 255, 255, SFX_KLEAP, 255, SFX_KPAIN, SFX_KDEATH, 255, 255, 255, 255, 255, 255, 255, 255
    .byte 255, SFX_SALERT, 255, 255, 255, 255, SFX_SPAIN, SFX_SDEATH, SFX_SAIM, 255, 255, 255, 255, 255, 255, 255
.code

; At the start and at a restart (game_reset): the channels free, no cue pending, the START motif.
sound_reset:
    LDI r0, snd_busy
    LDI r1, 0
    LDI r2, 12
    SYS FILL                        ; snd_busy and snd_prio
    LDI r0, 0
    ST [thr_t], r0
    ST [mus_calm], r0
    LDI r0, MUS_START
    JMP set_music

; r0 = effect id: plays it if its channel is free or it ranks at least as high as the effect there (DESIGN §8.1).
; Preserves every register.
play_sfx:
    PUSH r1
    PUSH r2
    PUSH r3
    MOV r1, r0
    SHL r1, 2
    LDB r2, [r1 + sfx_meta]         ; channel
    SHL r2, 1
    LD r3, [r2 + snd_busy]
    CMP r3, 0
    JEQ @go
    LDB r3, [r1 + sfx_meta + 2]
    PUSH r0
    LD r0, [r2 + snd_prio]
    CMP r3, r0
    POP r0
    JB @skip                        ; a higher effect owns the channel
@go:
    SYS SFX
    LDB r3, [r1 + sfx_meta + 1]
    ST [r2 + snd_busy], r3
    LDB r3, [r1 + sfx_meta + 2]
    ST [r2 + snd_prio], r3
@skip:
    POP r3
    POP r2
    POP r1
    RET

; r5 = enemy, r0 = the state it enters: its effect, if that state has one. Preserves every register.
en_sound:
    PUSH r0
    PUSH r1
    LDB r1, [r5 + E_KIND]
    SHL r1, 4
    ADD r1, r0
    LDB r0, [r1 + en_snd]
    CMP r0, 255
    JEQ @none
    CALL play_sfx
@none:
    POP r1
    POP r0
    RET

; r0 = track: switches to it (all voices from their start) unless it is already playing. Clobbers r0-r2.
set_music:
    LD r1, [mus_cur]
    CMP r0, r1
    JEQ @same
    ST [mus_cur], r0
    SHL r0, 3
    ADD r0, mus_tracks
    LD r1, [r0]
    ST [v_off], r1
    LD r1, [r0 + 2]
    ST [v_off + 2], r1
    LD r1, [r0 + 4]
    ST [v_off + 4], r1
    LDI r1, 0
    ST [v_t], r1
    ST [v_t + 2], r1
    ST [v_t + 4], r1
@same:
    RET

; ---- once per frame, after the logic (DESIGN §8.2): the track, the threat cue, the voices, the channels
music_step:
    LDI r1, 0                       ; the awake enemies now, after the whole logic (the weapon too)
    LDI r5, enemies + E_ST
@aw:
    LDB r0, [r5]
    CMP r0, ST_IDLE
    JEQ @an
    CMP r0, ST_DEAD
    JEQ @an
    ADD r1, 1
@an:
    ADD r5, E_SIZE
    CMP r5, enemies + E_ST + NUM_ENEMIES * E_SIZE
    JB @aw
    ST [mus_awake], r1
    LD r0, [gstate]                 ; M31: the track choice and the cue only in play
    CMP r0, GS_PLAY
    JNE @voices
    LD r0, [dead]
    CMP r0, 0
    JNE @thr0                       ; dead: DÖD plays (set at the death), no cue
    LD r0, [mus_cur]
    CMP r0, MUS_START
    JEQ @sel
    CMP r0, MUS_DRONE
    JEQ @sel
    CMP r0, MUS_FIGHT
    JNE @thr
@sel:
    LD r1, [mus_awake]
    CMP r1, 0
    JEQ @calm
    LDI r1, MUS_CALM
    ST [mus_calm], r1
    LDI r0, MUS_FIGHT
    CALL set_music
    JMP @thr
@calm:
    CMP r0, MUS_FIGHT
    JNE @thr
    LD r1, [mus_calm]
    SUB r1, 1
    ST [mus_calm], r1
    JNZ @thr
    LDI r0, MUS_DRONE
    CALL set_music
    ; ---- the threat cue (DESIGN §8.3)
@thr:
    LD r0, [mus_awake]
    CMP r0, 0
    JEQ @thr0
    LD r0, [thr_t]
    CMP r0, 0
    JEQ @cue
    SUB r0, 1
    ST [thr_t], r0
    JNZ @voices
@cue:
    LDI r0, SFX_THREAT
    CALL play_sfx
    CALL threat_gap
    ST [thr_t], r0
    JMP @voices
@thr0:
    LDI r0, 0
    ST [thr_t], r0
    ; ---- the voices: voice k plays on channel k
@voices:
    LDI r6, 0                       ; 2 k
@v:
    LD r3, [r6 + v_off]
    CMP r3, 0xFFFF
    JEQ @vn
    LD r1, [r6 + v_t]
    CMP r1, 0
    JNE @dec
@fetch:
    LD r3, [r6 + v_off]
    LDI r1, mus_x >> 16
    LDI r2, mus_x & 0xFFFF
    ADD r2, r3
    JAE @nc
    ADD r1, 1
@nc:
    LDI r0, v_buf
    LDI r3, 4
    SYS COPY
    LDB r1, [v_buf + 2]             ; the step
    CMP r1, 0
    JNE @note
    LD r0, [v_buf]                  ; a marker
    CMP r0, 1
    JEQ @stop
    CMP r0, 2
    JEQ @next
    LD r0, [mus_cur]                ; again: from the voice's start
    SHL r0, 3
    ADD r0, r6
    LD r0, [r0 + mus_tracks]
    ST [r6 + v_off], r0
    JMP @fetch
@stop:
    LDI r0, 0xFFFF
    ST [r6 + v_off], r0
    JMP @vn
@next:
    LD r0, [mus_cur]                ; the successor track, then all voices again from voice 0
    SHL r0, 3
    LD r0, [r0 + mus_tracks + 6]
    CALL set_music
    JMP @voices
@note:
    ST [r6 + v_t], r1
    LD r0, [r6 + v_off]
    ADD r0, 4
    ST [r6 + v_off], r0
    LD r1, [v_buf]                  ; Hz (0: a rest)
    CMP r1, 0
    JEQ @dec
    LD r0, [r6 + snd_busy]
    CMP r0, 0
    JNE @dec                        ; an effect owns the channel: the note is not heard
    LDB r3, [v_buf + 3]
    MOV r2, r3
    SHR r2, 4                       ; klang
    JNZ @kl
    LDB r2, [v_buf + 2]             ; 0: the whole step
@kl:
    AND r3, 15
    MOV r0, r6
    SHR r0, 1
    SYS SOUND
@dec:
    LD r1, [r6 + v_t]
    SUB r1, 1
    ST [r6 + v_t], r1
@vn:
    ADD r6, 2
    CMP r6, 6
    JLT @v
    ; ---- the channels: an effect's time runs out
    LDI r6, 0
@ch:
    LD r0, [r6 + snd_busy]
    CMP r0, 0
    JEQ @cn
    SUB r0, 1
    ST [r6 + snd_busy], r0
@cn:
    ADD r6, 2
    CMP r6, 6
    JLT @ch
    RET

; -> r0 = the threat cue's interval: clamp(THREAT_MIN + THREAT_K floor(d / 256), THREAT_MIN, THREAT_MAX), d the
; octagonal distance to the nearest awake enemy (DESIGN §8.3). Clobbers r0-r2, r5.
threat_gap:
    LDI r2, 0xFFFF
    LDI r5, enemies
@e:
    CMP r5, enemies + NUM_ENEMIES * E_SIZE
    JAE @d
    LDB r0, [r5 + E_ST]
    CMP r0, ST_IDLE
    JEQ @en
    CMP r0, ST_DEAD
    JEQ @en
    LD r0, [cam_x]
    LD r1, [r5 + E_X]
    SUB r0, r1
    LD r1, [cam_y]
    PUSH r2
    LD r2, [r5 + E_Y]
    SUB r1, r2
    POP r2
    CALL octnorm
    CMP r0, r2
    JAE @en
    MOV r2, r0
@en:
    ADD r5, E_SIZE
    JMP @e
@d:
    SHR r2, 8
    MUL r2, THREAT_K
    ADD r2, THREAT_MIN
    CMP r2, THREAT_MAX
    JB @ok
    LDI r2, THREAT_MAX
@ok:
    MOV r0, r2
    RET
