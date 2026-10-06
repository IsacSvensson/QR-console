; Sound effects (DESIGN.md §15). Noise channel 2 for the board (pop, landing, brake, grind, wheel clicks),
; square channel 1 for everything else; channel 0 and the rest of 1 belong to the music (M25).
; .sfx NAME, channel, Hz, frames, volume, sweep
.sfx SFX_POP,    2, 1400, 6, 10, 120
.sfx SFX_LAND,   2, 300, 5, 9, -20
.sfx SFX_BRAKE,  2, 900, 10, 6, -30
.sfx SFX_GRIND,  2, 2600, 32, 5, 0
.sfx SFX_CLICK,  2, 2400, 2, 5, 0
.sfx SFX_BREAK,  2, 600, 10, 11, -40
.sfx SFX_TRICK,  1, 300, 8, 7, 60
.sfx SFX_STAR,   1, 784, 18, 10, 40
.sfx SFX_POWER,  1, 392, 24, 10, 30
.sfx SFX_BOING,  1, 200, 14, 10, 40
.sfx SFX_FLAG,   1, 659, 16, 9, 20
.sfx SFX_COMBO,  1, 523, 12, 9, 60
.sfx SFX_AJ,     1, 700, 20, 11, -30
.sfx SFX_BUMP,   1, 180, 8, 8, -10
.sfx SFX_POFF,   2, 1000, 8, 10, -80
.sfx SFX_SPLASH, 2, 500, 20, 11, -15
