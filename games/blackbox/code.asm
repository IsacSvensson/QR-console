; BLACKBOX — access codes (DESIGN.md §2.4): 8 characters from a 32-symbol alphabet = 40 bits.
; Bits, most significant first: section 3, pred_done 8, pred_hit 8, emp_uses 3, logs_read 3,
; mira_followed 3, charges 3, checksum 9. Each 5-bit symbol is XORed with a per-position key.
.code

; bit stream over code_bits[5]; code_pos = next bit (0..39)
bits_reset:
    LDI r0, 0
    ST [code_pos], r0
    ST [code_bits], r0
    ST [code_bits + 2], r0
    STB [code_bits + 4], r0
    RET

; r0 = value, r1 = number of bits (written most significant first)
put_bits:
@loop:
    CMP r1, 0
    JEQ @done
    SUB r1, 1
    MOV r2, r0
    SHR r2, r1
    AND r2, 1
    JZ @next
    LD r3, [code_pos]
    MOV r4, r3
    SHR r4, 3               ; byte
    AND r3, 7
    LDI r5, 128
    SHR r5, r3              ; bit within the byte, MSB first
    LDB r3, [r4 + code_bits]
    OR r3, r5
    STB [r4 + code_bits], r3
@next:
    LD r3, [code_pos]
    ADD r3, 1
    ST [code_pos], r3
    JMP @loop
@done:
    RET

; r1 = number of bits -> r0 = value (read most significant first)
get_bits:
    LDI r0, 0
@loop:
    CMP r1, 0
    JEQ @done
    SUB r1, 1
    SHL r0, 1
    LD r3, [code_pos]
    MOV r4, r3
    SHR r4, 3
    AND r3, 7
    LDB r2, [r4 + code_bits]
    SHL r2, r3
    AND r2, 128
    JZ @zero
    OR r0, 1
@zero:
    LD r3, [code_pos]
    ADD r3, 1
    ST [code_pos], r3
    JMP @loop
@done:
    RET

; checksum over the first 4 bytes (31 data bits + a zero): 9 bits
code_checksum:
    LDI r0, 0x5A
    LDI r2, 0
@loop:
    MUL r0, 3
    LDB r1, [r2 + code_bits]
    ADD r0, r1
    ADD r2, 1
    CMP r2, 4
    JLT @loop
    AND r0, 511
    RET

; r0 = section to resume at (1..7) -> code_text = 8 characters + 0
make_code:
    PUSH r0
    CALL bits_reset
    POP r0
    LDI r1, 3
    CALL put_bits
    LD r0, [pred_done]
    LDI r1, 8
    CALL put_bits
    LD r0, [pred_hit]
    LDI r1, 8
    CALL put_bits
    LD r0, [emp_uses]
    LDI r1, 3
    CALL put_bits
    LD r0, [logs_read]
    LDI r1, 3
    CALL put_bits
    LD r0, [mira_followed]
    LDI r1, 3
    CALL put_bits
    LD r0, [charges]
    LDI r1, 3
    CALL put_bits
    CALL code_checksum
    LDI r1, 9
    CALL put_bits
    LDI r0, 0
    ST [code_pos], r0
    LDI r6, 0
@sym:
    LDI r1, 5
    CALL get_bits
    LDB r1, [r6 + code_key]
    XOR r0, r1
    LDB r0, [r0 + code_alphabet]
    STB [r6 + code_text], r0
    ADD r6, 1
    CMP r6, 8
    JLT @sym
    LDI r0, 0
    STB [code_text + 8], r0
    RET

.data
code_alphabet: .byte "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
code_key:      .byte 19, 7, 28, 3, 22, 11, 30, 14
