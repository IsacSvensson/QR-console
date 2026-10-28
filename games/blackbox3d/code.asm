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

; ---- entering a code --------------------------------------------------------------------------
; code_text (8 characters) -> code_ok = 1 and the state restored (resume_section = section), or code_ok = 0
decode_code:
    LDI r0, 0
    ST [code_ok], r0
    CALL bits_reset
    LDI r6, 0
@sym:
    LDB r2, [r6 + code_text]
    LDI r3, 0               ; position in the alphabet
@find:
    LDB r4, [r3 + code_alphabet]
    CMP r4, r2
    JEQ @found
    ADD r3, 1
    CMP r3, 32
    JLT @find
    RET                     ; not a code character
@found:
    LDB r4, [r6 + code_key]
    XOR r3, r4
    MOV r0, r3
    LDI r1, 5
    PUSH r6
    CALL put_bits
    POP r6
    ADD r6, 1
    CMP r6, 8
    JLT @sym
    ; the checksum covers the first 31 bits (bit 32 belongs to the checksum itself)
    LDB r0, [code_bits + 3]
    PUSH r0
    AND r0, 0xFE
    STB [code_bits + 3], r0
    CALL code_checksum
    MOV r5, r0
    POP r0
    STB [code_bits + 3], r0
    LDI r0, 0
    ST [code_pos], r0
    LDI r1, 3
    CALL get_bits
    ST [dc_section], r0
    LDI r1, 8
    CALL get_bits
    ST [dc_done], r0
    LDI r1, 8
    CALL get_bits
    ST [dc_hit], r0
    LDI r1, 3
    CALL get_bits
    ST [dc_emp], r0
    LDI r1, 3
    CALL get_bits
    ST [dc_logs], r0
    LDI r1, 3
    CALL get_bits
    ST [dc_mira], r0
    LDI r1, 3
    CALL get_bits
    ST [dc_charges], r0
    LDI r1, 9
    PUSH r5
    CALL get_bits
    POP r5
    CMP r0, r5
    JNE @bad
    LD r0, [dc_section]     ; plausibility: section 2..7, at most 4 charges, hits only among resolved
    CMP r0, 2
    JLT @bad
    CMP r0, 7
    JGT @bad
    LD r0, [dc_charges]
    CMP r0, MAX_CHARGES
    JGT @bad
    LD r0, [dc_hit]
    LD r1, [dc_done]
    XOR r1, -1
    AND r0, r1
    JNZ @bad
    LDI r0, 1
    ST [code_ok], r0
@bad:
    RET

; resume from the decoded fields: a fresh game, then everything the earlier sections imply
resume_game:
    CALL new_state
    LD r0, [dc_done]
    ST [pred_done], r0
    LD r0, [dc_hit]
    ST [pred_hit], r0
    LD r0, [dc_emp]
    ST [emp_uses], r0
    LD r0, [dc_logs]
    ST [logs_read], r0
    LD r0, [dc_mira]
    ST [mira_followed], r0
    LD r0, [dc_charges]
    ST [charges], r0
    CALL oracle_update
    LD r5, [dc_section]
    LDI r6, 2               ; flags of every section before the one we resume in
@sec:
    CMP r6, r5
    JGT @enter
    MOV r1, r6
    SHL r1, 1
    LD r4, [r1 + section_flags - 4]
@flag:
    LDB r0, [r4]
    CMP r0, 255
    JEQ @next
    PUSH r4
    PUSH r5
    PUSH r6
    CALL flag_set
    POP r6
    POP r5
    POP r4
    ADD r4, 1
    JMP @flag
@next:
    MOV r0, r6              ; that section's code has been shown
    ADD r0, EV_C1 - 1
    PUSH r5
    PUSH r6
    CALL event_set
    POP r6
    POP r5
    ADD r6, 1
    JMP @sec
@enter:
    LDI r0, M_PLAY
    ST [mode], r0
    MOV r1, r5
    LDB r0, [r1 + section_start - 2]
    CALL enter_room_at_arrival
    RET

; the access-code screen (from the title with B)
mode_code:
    LD r2, [pressed]
    LD r5, [code_cur]
    MOV r0, r2
    AND r0, BTN_LEFT
    JZ @no_l
    CMP r5, 0
    JEQ @no_l
    SUB r5, 1
@no_l:
    MOV r0, r2
    AND r0, BTN_RIGHT
    JZ @no_r
    CMP r5, 7
    JGE @no_r
    ADD r5, 1
@no_r:
    ST [code_cur], r5
    LDB r3, [r5 + code_sel]
    MOV r0, r2
    AND r0, BTN_UP
    JZ @no_u
    ADD r3, 1
@no_u:
    MOV r0, r2
    AND r0, BTN_DOWN
    JZ @no_d
    SUB r3, 1
@no_d:
    AND r3, 31
    STB [r5 + code_sel], r3
    LDB r3, [r3 + code_alphabet]
    STB [r5 + code_text], r3
    MOV r0, r2
    AND r0, BTN_B
    JZ @no_b
    LDI r0, M_TITLE
    ST [mode], r0
    RET
@no_b:
    AND r2, BTN_A
    JZ @draw
    CALL submit_code
    RET
@draw:
    LDI r0, 0
    SYS CLS
    LDI r0, s_enter_code
    LDI r1, 42
    LDI r2, 44
    LDI r3, 7
    SYS TEXT
    LDI r0, 0
    STB [code_text + 8], r0
    LDI r0, code_text
    LDI r1, 48
    LDI r2, 58
    LDI r3, 15
    SYS TEXT
    LD r0, [code_cur]       ; cursor under the current character
    SHL r0, 2
    ADD r0, 48
    LDI r1, 64
    LDI r2, 3
    LDI r3, 1
    LDI r4, 14
    SYS RECTFILL
    LD r0, [code_msg]
    CMP r0, 0
    JEQ @keys
    SUB r0, 1
    ST [code_msg], r0
    LDI r0, s_invalid
    LDI r1, 40
    LDI r2, 76
    LDI r3, 6
    SYS TEXT
@keys:
    LDI r0, s_code_keys
    LDI r1, 8
    LDI r2, 110
    LDI r3, 3
    SYS TEXT
    RET

submit_code:
    CALL decode_code
    LD r0, [code_ok]
    CMP r0, 0
    JNE @ok
    LDI r0, 90
    ST [code_msg], r0
    LDI r0, SFX_EMPTY
    CALL play_sfx
    RET
@ok:
    CALL resume_game
    RET

; title: B opens the code screen with the code "AAAAAAAA"
open_code_screen:
    LDI r6, 0
@clear:
    LDI r0, 0
    STB [r6 + code_sel], r0
    LDB r0, [code_alphabet]
    STB [r6 + code_text], r0
    ADD r6, 1
    CMP r6, 8
    JLT @clear
    LDI r0, 0
    ST [code_cur], r0
    ST [code_msg], r0
    LDI r0, M_CODE
    ST [mode], r0
    RET

.data
; first room of each section 2..7
section_start: .byte R_2_1, R_3_1, R_4_1, R_5_1, R_6_1, R_7_1
; flags earned in the sections before section n (n = 2..7), each list ends with 255
section_flags: .word sf2, sf3, sf4, sf5, sf6, sf7
sf2: .byte F_BADGE, 255
sf3: .byte F_L1, F_KEYNOTE, F_CARD, F_DIRDOOR, 255
sf4: .byte F_L3, F_EMP, F_SHUTTER, F_PICK0, F_PICK1, 255
sf5: .byte F_L4, F_LABCARD, 255
sf6: .byte F_L6, 255
sf7: .byte F_HALE, F_LIVE, 255
s_enter_code: .string "ACCESS CODE"
s_invalid:    .string "INVALID CODE"
s_code_keys:  .string "ARROWS: EDIT  A: OK  B: BACK"
