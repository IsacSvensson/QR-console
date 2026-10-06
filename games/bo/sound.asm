; Sound effects and music (DESIGN.md §15). Noise channel 2 for the board (pop, landing, brake, grind, wheel clicks),
; square channel 1 for the other effects; the music plays a melody on channel 0 and a bass on channel 1.
; An effect takes its channel for its length (play_sfx) and the music continues afterwards.
; With pommes the music plays 1.5 times faster: every note lasts 2/3 of its frames.
.macro SOUND name, ch, hz, frames, vol, sweep
.sfx name, ch, hz, frames, vol, sweep
.data
    .byte ch, frames
.endm

.data
sfx_meta:                   ; channel, frames per effect id (in .sfx order)
SOUND SFX_POP,    2, 1400, 6, 10, 120
SOUND SFX_LAND,   2, 300, 5, 9, -20
SOUND SFX_BRAKE,  2, 900, 10, 6, -30
SOUND SFX_GRIND,  2, 2600, 32, 5, 0
SOUND SFX_CLICK,  2, 2400, 2, 5, 0
SOUND SFX_BREAK,  2, 600, 10, 11, -40
SOUND SFX_TRICK,  1, 300, 8, 7, 60
SOUND SFX_STAR,   1, 784, 18, 10, 40
SOUND SFX_POWER,  1, 392, 24, 10, 30
SOUND SFX_BOING,  1, 200, 14, 10, 40
SOUND SFX_FLAG,   1, 659, 16, 9, 20
SOUND SFX_COMBO,  1, 523, 12, 9, 60
SOUND SFX_AJ,     1, 700, 20, 11, -30
SOUND SFX_BUMP,   1, 180, 8, 8, -10
SOUND SFX_POFF,   2, 1000, 8, 10, -80
SOUND SFX_SPLASH, 2, 500, 20, 11, -15
SOUND SFX_SKRII,  1, 1800, 24, 9, -40
SOUND SFX_THROW,  1, 400, 6, 6, 80
.code

; r0 = effect id: play it and keep the music off its channel for its length
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

; the apple pling (rising per apple of a row): r1 = Hz, on channel 1
apple_pling:
    LDI r0, 1
    LDI r2, 6
    LDI r3, 9
    SYS SOUND
    LDI r0, 6
    ST [sfx_busy + 2], r0
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
    LDI r6, 0                       ; voice (= its channel)
@voice:
    SHL r6, 1
    LD r0, [r6 + sfx_busy]          ; an effect owns this channel for now
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
    LD r1, [r6 + voice_s]           ; loop
    ST [r6 + voice_p], r1
    LDB r2, [r1 + 2]
@play:
    LD r0, [pw_kind]                ; pommes: 1.5 times faster
    CMP r0, PW_POMMES
    JNE @len
    SHL r2, 1
    DIV r2, 3
    CMP r2, 0
    JNE @len
    LDI r2, 1
@len:
    ST [r6 + voice_t], r2
    LD r3, [r1]
    ADD r1, 3
    ST [r6 + voice_p], r1
    CMP r3, 0
    JEQ @next                       ; a rest
    LD r0, [r6 + sfx_busy]
    CMP r0, 0
    JNE @next                       ; the effect keeps the channel; the music continues with the next note
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
    LD r0, [sfx_busy + 4]           ; the noise channel: only effects
    CMP r0, 0
    JEQ @done
    SUB r0, 1
    ST [sfx_busy + 4], r0
@done:
    RET

; ---- music ------------------------------------------------------------------------------------
; A track is two voices; a voice is a list of (Hz word, frames byte) notes, Hz 0 = rest, frames 0 = loop.
MUS_NONE  = 0
MUS_HEMMA = 1
MUS_SKOGEN = 2
MUS_STADEN = 3
MUSIC_VOL = 4

.macro N hz, frames
    .word hz
    .byte frames
.endm
.macro LOOP
    .word 0
    .byte 0
.endm

.data
tracks:                     ; per track: melody, bass
    .word 0, 0
    .word RA_HEM_MEL, RA_HEM_BASS   ; in the world's assets (wassets.asm)
    .word RA_SKO_MEL, RA_SKO_BASS
    .word RA_STA_MEL, RA_STA_BASS


.code
