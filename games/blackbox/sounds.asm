; BLACKBOX — sound effects and music. Original.
; SOUND defines an effect and records its channel and length, so the music knows which voice an effect
; interrupts and for how long (play_sfx). Effect: name, channel, Hz, frames, volume, sweep.
.macro SOUND name, ch, hz, frames, vol, sweep
.sfx name, ch, hz, frames, vol, sweep
.data
    .byte ch, frames
.endm

.data
sfx_meta:                   ; channel, frames per effect id (in .sfx order)
SOUND SFX_ALARM,  2, 900, 40, 12, -12
SOUND SFX_WAKE,   1, 300, 12, 9, 30
SOUND SFX_PICKUP, 1, 660, 8, 9, 40
SOUND SFX_EMP,    2, 1600, 24, 13, -60
SOUND SFX_EMPTY,  1, 180, 6, 6, 0
SOUND SFX_USE,    1, 520, 4, 7, 0
SOUND SFX_PULSE,  0, 1200, 10, 11, -60
SOUND SFX_DOWN,   0, 400, 40, 12, -8

; ---- music ------------------------------------------------------------------------------------
; A track is two voices; a voice is a list of (Hz word, frames byte) notes, Hz 0 = rest, frames 0 = loop.
MUS_NONE    = 0
MUS_AMBIENT = 1
MUS_ALARM   = 2
MUS_ORACLE  = 3
MUSIC_VOL   = 4
MUSIC_CH0   = 0             ; melody
MUSIC_CH1   = 1             ; bass

.macro N hz, frames
    .word hz
    .byte frames
.endm
.macro LOOP
    .word 0
    .byte 0
.endm

tracks:                     ; per track: melody, bass (track 0 = silence)
    .word 0, 0
    .word amb_mel, amb_bass
    .word alm_mel, alm_bass
    .word orc_mel, orc_bass

; ambient: a slow A-minor pulse, notes falling away into rests
amb_mel:
    N 220, 24
    N 262, 24
    N 330, 24
    N 0, 24
    N 294, 24
    N 262, 24
    N 247, 48
    N 0, 48
    N 220, 24
    N 262, 24
    N 349, 24
    N 0, 24
    N 330, 36
    N 294, 12
    N 262, 48
    N 0, 48
    LOOP
amb_bass:
    N 110, 96
    N 87, 96
    N 98, 96
    N 82, 96
    LOOP

; alarm (boss rooms): two notes a minor third apart, driven by a pulsing bass
alm_mel:
    N 440, 16
    N 523, 16
    N 440, 16
    N 523, 16
    N 466, 16
    N 554, 16
    N 466, 16
    N 587, 16
    LOOP
alm_bass:
    N 110, 8
    N 0, 8
    N 110, 8
    N 0, 8
    N 117, 8
    N 0, 8
    N 117, 8
    N 0, 8
    LOOP

; ORACLE: a semitone that never resolves, over a held low E
orc_mel:
    N 330, 48
    N 349, 48
    N 0, 24
    N 247, 36
    N 262, 60
    N 0, 48
    LOOP
orc_bass:
    N 82, 192
    N 87, 72
    LOOP

.code

; r0 = effect id: play it and mute the music on its channel for its length
play_sfx:
    PUSH r0
    SYS SFX
    POP r0
    SHL r0, 1
    LDB r1, [r0 + sfx_meta]
    LDB r2, [r0 + sfx_meta + 1]
    SHL r1, 1
    ST [r1 + sfx_busy], r2
    RET

; r0 = track: switch to it (restarting it) unless it is already playing
set_music:
    LD r1, [music_track]
    CMP r0, r1
    JEQ @same
    ST [music_track], r0
    LDI r1, 0
    ST [voice_t], r1
    ST [voice_t + 2], r1
    SHL r0, 2
    LD r1, [r0 + tracks]
    ST [voice_p], r1
    ST [voice_s], r1
    LD r1, [r0 + tracks + 2]
    ST [voice_p + 2], r1
    ST [voice_s + 2], r1
@same:
    RET

; once per frame
music_step:
    LDI r6, 0               ; voice (= its channel)
@voice:
    SHL r6, 1
    LD r0, [r6 + sfx_busy]  ; an effect owns this channel for now
    CMP r0, 0
    JEQ @free
    SUB r0, 1
    ST [r6 + sfx_busy], r0
@free:
    LD r0, [music_track]
    CMP r0, MUS_NONE
    JEQ @next
    LD r0, [r6 + voice_t]
    CMP r0, 0
    JEQ @note
    SUB r0, 1
    ST [r6 + voice_t], r0
    JNZ @next
@note:
    LD r1, [r6 + voice_p]
    LDB r2, [r1 + 2]
    CMP r2, 0
    JNE @play
    LD r1, [r6 + voice_s]   ; loop
    ST [r6 + voice_p], r1
    LDB r2, [r1 + 2]
@play:
    ST [r6 + voice_t], r2
    LD r3, [r1]
    ADD r1, 3
    ST [r6 + voice_p], r1
    CMP r3, 0
    JEQ @next               ; a rest
    LD r0, [r6 + sfx_busy]
    CMP r0, 0
    JNE @next               ; the effect keeps the channel; the music continues with the next note
    MOV r0, r6
    SHR r0, 1
    MOV r1, r3
    LDI r3, MUSIC_VOL
    SYS SOUND
@next:
    SHR r6, 1
    ADD r6, 1
    CMP r6, 2
    JLT @voice
    ; the noise channel is only used by effects; its busy counter still counts down
    LD r0, [sfx_busy + 4]
    CMP r0, 0
    JEQ @done
    SUB r0, 1
    ST [sfx_busy + 4], r0
@done:
    RET
