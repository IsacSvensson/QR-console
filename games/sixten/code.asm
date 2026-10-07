; The save code (DESIGN.md §10.2): 50 bits = the world (3, highest bit first) + the nature book (40: entry 1 first) +
; a checksum (7: the sum of (i + 1) over the set bits i = 0..42, mod 128), as 10 characters of 32: character j is
; bits 5j..5j+4 (highest first) XOR (7j + 3) mod 32, in the alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789.
; Entering a code is M32; the world map shows the code of the current state.
.code

code_make:
    LDI r0, code_bits
    LDI r1, 0
    LDI r2, 8
    SYS FILL
    LDI r6, 0                       ; the world: bits 0-2
@w:
    LD r1, [world]
    LDI r2, 2
    SUB r2, r6
    SHR r1, r2
    AND r1, 1
    MOV r0, r6
    CALL put_bit
    ADD r6, 1
    CMP r6, 3
    JLT @w
    LDI r6, 0                       ; the book: bits 3-42
@b:
    MOV r0, r6
    CALL book_has
    MOV r1, r0
    MOV r0, r6
    ADD r0, 3
    CALL put_bit
    ADD r6, 1
    CMP r6, NB_COUNT
    JLT @b
    LDI r6, 0                       ; the checksum
    LDI r7, 0
@s:
    MOV r0, r6
    CALL get_bit
    CMP r0, 0
    JEQ @ns
    ADD r7, r6
    ADD r7, 1
@ns:
    ADD r6, 1
    CMP r6, 43
    JLT @s
    AND r7, 127
    LDI r6, 0                       ; bits 43-49
@c:
    MOV r1, r7
    LDI r2, 6
    SUB r2, r6
    SHR r1, r2
    AND r1, 1
    MOV r0, r6
    ADD r0, 43
    CALL put_bit
    ADD r6, 1
    CMP r6, 7
    JLT @c
    LDI r6, 0                       ; the characters
@ch:
    LDI r5, 0
    LDI r7, 0
@bit:
    MOV r0, r6
    MUL r0, 5
    ADD r0, r7
    CALL get_bit
    SHL r5, 1
    OR r5, r0
    ADD r7, 1
    CMP r7, 5
    JLT @bit
    MOV r0, r6
    MUL r0, 7
    ADD r0, 3
    AND r0, 31
    XOR r5, r0
    LDB r0, [r5 + code_alpha]
    STB [r6 + code_str], r0
    ADD r6, 1
    CMP r6, 10
    JLT @ch
    LDI r0, 255
    STB [code_str + 10], r0
    RET

; r0 = bit index, r1 = 0/1: set it (the bits start cleared)
put_bit:
    CMP r1, 0
    JEQ @done
    MOV r2, r0
    SHR r2, 3
    AND r0, 7
    LDI r3, 128
    SHR r3, r0
    LDB r0, [r2 + code_bits]
    OR r0, r3
    STB [r2 + code_bits], r0
@done:
    RET

; r0 = bit index -> r0 = the bit
get_bit:
    MOV r2, r0
    SHR r2, 3
    AND r0, 7
    LDI r3, 7
    SUB r3, r0
    LDB r0, [r2 + code_bits]
    SHR r0, r3
    AND r0, 1
    RET
