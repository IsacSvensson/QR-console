; NADIR - trigonometry from the half-step quarter-wave table sin_h (tables.gen.asm).
.code

; r0 = angle (u12, any value; only the low 12 bits count) -> r0 = sin(angle), s1.14. Clobbers r1.
sin_a:
    AND r0, 4095
    MOV r1, r0
    AND r0, 1023
    CMP r1, 1024
    JB @q0
    CMP r1, 2048
    JB @q1
    CMP r1, 3072
    JB @q2
    XOR r0, 1023            ; q3: -sin_h(1023 - k)
    SHL r0, 1
    LD r0, [r0 + sin_h]
    NEG r0
    RET
@q0:
    SHL r0, 1
    LD r0, [r0 + sin_h]
    RET
@q1:
    XOR r0, 1023            ; q1: sin_h(1023 - k)
    SHL r0, 1
    LD r0, [r0 + sin_h]
    RET
@q2:
    SHL r0, 1               ; q2: -sin_h(k)
    LD r0, [r0 + sin_h]
    NEG r0
    RET

; r0 = angle -> r0 = cos(angle), s1.14. Clobbers r1.
cos_a:
    ADD r0, 1024
    JMP sin_a
