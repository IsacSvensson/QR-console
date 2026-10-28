; BLACKBOX — the ORACLE engine (DESIGN.md §2): predictions about the player, measured.
.code

; accuracy in tenths of a percent: (974 + correct) / (1000 + count), exactly 974 - misses for count <= 21
accuracy:
    LD r0, [pred_misses]
    NEG r0
    ADD r0, BASE_ACCURACY
    RET

; r0 = bit mask -> r0 = number of set bits
popcount:
    LDI r1, 0
@loop:
    CMP r0, 0
    JEQ @done
    MOV r2, r0
    AND r2, 1
    ADD r1, r2
    SHR r0, 1
    JMP @loop
@done:
    MOV r0, r1
    RET

; derived values: misses, and the final forecast from the player's profile
oracle_update:
    LD r0, [pred_hit]
    XOR r0, -1
    LD r1, [pred_done]
    AND r0, r1
    CALL popcount
    ST [pred_misses], r0
    ; forecast: the largest profile counter; ties: LISTEN, then RELEASE, then DELETE
    LDI r2, CH_LISTEN
    LD r3, [mira_followed]
    LD r0, [logs_read]
    CMP r0, r3
    JLE @emp
    LDI r2, CH_RELEASE
    MOV r3, r0
@emp:
    LD r0, [emp_uses]
    CMP r0, r3
    JLE @set
    LDI r2, CH_DELETE
@set:
    ST [final_guess], r2
    RET

; r0 = prediction 1..8, r1 = 1 hit / 0 miss. A prediction is resolved once; later calls change nothing.
resolve_pred:
    SUB r0, 1
    LDI r2, 1
    SHL r2, r0
    LD r3, [pred_done]
    MOV r4, r3
    AND r4, r2
    JNZ @done
    OR r3, r2
    ST [pred_done], r3
    CMP r1, 0
    JEQ @miss
    LD r3, [pred_hit]
    OR r3, r2
    ST [pred_hit], r3
@miss:
    CALL oracle_update
@done:
    RET

; r0 = profile counter address: +1, saturating at 7 (3 bits in the access code); the forecast follows
bump:
    LD r1, [r0]
    CMP r1, 7
    JGE @done
    ADD r1, 1
    ST [r0], r1
@done:
    CALL oracle_update
    RET
