; Music (DESIGN.md §15): World 1's loop, one note every 10 frames on square channel 1 (every 7 with chips).
.code

music_tick:
    LD r0, [mus_t]
    CMP r0, 0
    JEQ @step
    SUB r0, 1
    ST [mus_t], r0
    RET
@step:
    LDI r0, 10
    LD r1, [pw]
    CMP r1, PW_CHIPS
    JNE @tempo
    LDI r0, 7
@tempo:
    ST [mus_t], r0
    LD r6, [mus_i]
    MOV r0, r6
    ADD r0, 1
    AND r0, 31
    ST [mus_i], r0
    SHL r6, 1
    LD r1, [r6 + tune_w1]
    CMP r1, 0
    JEQ @rest
    LDI r0, 1
    LDI r2, 8
    LDI r3, 3
    SYS SOUND
@rest:
    RET

.data
tune_w1:
    .word 659, 784, 880, 784, 659, 0, 587, 659
    .word 523, 587, 659, 784, 880, 0, 784, 0
    .word 659, 784, 880, 1047, 880, 784, 659, 0
    .word 587, 659, 587, 523, 587, 0, 523, 0
.code
