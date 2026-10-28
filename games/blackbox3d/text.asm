; BLACKBOX — text: decoding (dictionary + placeholders), the dialogue box, the terminal, barks.
.code

; r0 = encoded text, r1 = destination -> decodes, zero-terminates; r1 = address of the terminator
decode_text:
    ST [txt_src], r0
    LDI r0, 0
    ST [pct_seq], r0
    ST [n_seq], r0
@loop:
    LD r0, [txt_src]
    LDB r2, [r0]
    ADD r0, 1
    ST [txt_src], r0
    CMP r2, 0
    JEQ @end
    CMP r2, 0x80
    JAE @word
    CMP r2, 6
    JAE @char
    PUSH r2                 ; placeholder 1..5
    SUB r2, 1
    SHL r2, 1
    LD r2, [r2 + placeholder_fns]
    CALL r2                 ; (r1 = destination in and out)
    POP r2
    JMP @loop
@char:
    STB [r1], r2
    ADD r1, 1
    JMP @loop
@word:
    SUB r2, 0x80
    SHL r2, 1
    LD r0, [r2 + dict_ptrs]
    CALL copy_str
    JMP @loop
@end:
    LDI r0, 0
    STB [r1], r0
    RET

; r0 = zero-terminated source, r1 = destination -> r1 advanced (no terminator written)
copy_str:
@loop:
    LDB r2, [r0]
    CMP r2, 0
    JEQ @done
    STB [r1], r2
    ADD r0, 1
    ADD r1, 1
    JMP @loop
@done:
    RET

; r0 = value, r1 = destination -> decimal digits, r1 advanced
put_num:
    LDI r3, 0
@div:
    MOV r2, r0
    MOD r2, 10
    ADD r2, '0'
    PUSH r2
    ADD r3, 1
    DIV r0, 10
    JNZ @div
@out:
    POP r2
    STB [r1], r2
    ADD r1, 1
    SUB r3, 1
    JNZ @out
    RET

; r0 = accuracy in tenths of a percent, r1 = destination -> "97.4%"
put_pct:
    PUSH r0
    DIV r0, 10
    CALL put_num
    LDI r2, '.'
    STB [r1], r2
    ADD r1, 1
    POP r0
    MOD r0, 10
    CALL put_num
    LDI r2, '%'
    STB [r1], r2
    ADD r1, 1
    RET

; ---- placeholders (r1 = destination) ----------------------------------------------------------
ph_guess:                   ; <X> ORACLE's forecast of the final choice
    PUSH r1
    CALL oracle_update
    POP r1
    LD r0, [final_guess]
    SHL r0, 1
    LD r0, [r0 + choice_names]
    CALL copy_str
    RET

ph_pct:                     ; <PCT> 1st: before the last action (in an ending) / current; 2nd: current
    LD r0, [pct_seq]
    ADD r0, 1
    ST [pct_seq], r0
    CMP r0, 1
    JNE @current
    LDI r0, F_ENDING
    PUSH r1
    CALL flag_test
    POP r1
    CMP r0, 0
    JEQ @current
    LD r0, [pct_before]
    JMP @put
@current:
    PUSH r1
    CALL accuracy
    POP r1
@put:
    CALL put_pct
    RET

ph_n:                       ; <N> 1st: predictions confirmed; 2nd: predictions resolved
    LD r0, [n_seq]
    ADD r0, 1
    ST [n_seq], r0
    LD r0, [pred_done]
    LD r2, [n_seq]
    CMP r2, 1
    JNE @count
    LD r2, [pred_hit]
    AND r0, r2
@count:
    PUSH r1
    CALL popcount
    POP r1
    CALL put_num
    RET

ph_protocol:                ; <PROTOCOL> one line per resolved prediction P1-P7, then the accuracy
    LDI r4, 0
@line:
    LDI r0, 1
    SHL r0, r4
    LD r2, [pred_done]
    AND r2, r0
    JZ @next
    PUSH r0
    PUSH r4
    MOV r0, r4
    ADD r0, 1
    LDI r2, '0'
    STB [r1], r2
    ADD r1, 1
    CALL put_num
    LDI r2, ' '
    STB [r1], r2
    ADD r1, 1
    POP r4
    PUSH r4
    MOV r0, r4
    SHL r0, 1
    LD r0, [r0 + proto_labels]
    MOV r5, r1
    CALL copy_str
    ADD r5, 15              ; pad the label to 15 characters (line: "NN " + 15 + result)
@pad:
    CMP r1, r5
    JAE @padded
    LDI r2, ' '
    STB [r1], r2
    ADD r1, 1
    JMP @pad
@padded:
    POP r4
    POP r0
    LD r2, [pred_hit]
    AND r2, r0
    LDI r0, s_confirmed
    JNZ @res
    LDI r0, s_failed
@res:
    PUSH r4
    CALL copy_str
    POP r4
    LDI r2, 10
    STB [r1], r2
    ADD r1, 1
@next:
    ADD r4, 1
    CMP r4, 7
    JLT @line
    LDI r2, 10
    STB [r1], r2
    ADD r1, 1
    LDI r0, s_accuracy
    CALL copy_str
    PUSH r1
    CALL accuracy
    POP r1
    CALL put_pct
    RET

ph_follows:                 ; <FOLLOWS> has the player surprised the system yet?
    LD r0, [pred_misses]
    CMP r0, 0
    LDI r0, s_follows
    JEQ @put
    LDI r0, s_deviates
@put:
    CALL copy_str
    RET

; ---- the dialogue box -------------------------------------------------------------------------
; r0 = box address (speaker byte, then encoded text), r2 = kind (BOX_SAY / BOX_ASK)
open_box:
    ST [box_kind], r2
    LDB r2, [r0]
    ST [box_spk], r2
    ADD r0, 1
    LDB r2, [r0]
    CMP r2, 4               ; <PROTOCOL> alone: shown on the terminal
    JEQ @protocol
    LDI r1, text_buf
    CALL decode_text
    SUB r1, text_buf
    ST [box_len], r1
    LDI r0, 0
    ST [reveal], r0
    LDI r0, M_DIALOG
    ST [mode], r0
    RET
@protocol:
    LDI r1, text_buf
    CALL decode_text
    LDI r0, 0
    ST [term_log], r0
    ST [term_page], r0
    LDI r0, 1
    ST [term_pages], r0
    LDI r0, M_TERM
    ST [mode], r0
    RET

mode_dialog:
    LD r0, [reveal]
    LD r1, [box_len]
    CMP r0, r1
    JGE @full
    ADD r0, 2               ; typewriter
    ST [reveal], r0
    LD r0, [pressed]
    AND r0, BTN_A
    JZ @draw
    LD r0, [box_len]        ; A: show everything at once
    ST [reveal], r0
    JMP @draw
@full:
    LD r2, [pressed]
    LD r0, [box_kind]
    CMP r0, BOX_ASK
    JEQ @ask
    CMP r0, BOX_MENU
    JEQ @menu
    AND r2, BTN_A
    JZ @draw
    JMP @close
@ask:
    MOV r0, r2
    AND r0, BTN_A
    JZ @no_a
    LDI r0, F_ANSWER
    CALL flag_set
    JMP @close
@no_a:
    AND r2, BTN_B
    JZ @draw
    LDI r0, F_ANSWER
    CALL flag_clr
@close:
    LDI r0, M_PLAY
    ST [mode], r0
@draw:
    CALL draw_play
    CALL draw_box
    LD r0, [box_kind]
    CMP r0, BOX_MENU
    JNE @done
    LD r1, [menu_sel]       ; the menu cursor
    MUL r1, 6
    ADD r1, BOX_Y + 9
    LDI r0, 50
    LDI r2, 3
    LDI r3, 5
    LDI r4, 14
    SYS RECTFILL
@done:
    RET
@menu:
    LD r1, [menu_sel]
    MOV r0, r2
    AND r0, BTN_UP
    JZ @m_down
    CMP r1, 0
    JEQ @m_down
    SUB r1, 1
@m_down:
    MOV r0, r2
    AND r0, BTN_DOWN
    JZ @m_store
    CMP r1, 2
    JGE @m_store
    ADD r1, 1
@m_store:
    ST [menu_sel], r1
    AND r2, BTN_A
    JZ @draw
    ST [menu_choice], r1
    JMP @close

draw_box:
    LDI r0, 0
    LDI r1, BOX_Y
    LDI r2, 128
    LDI r3, 128 - BOX_Y
    LDI r4, 0
    SYS RECTFILL
    LD r5, [box_spk]
    LDB r4, [r5 + speaker_colour]
    SYS RECT
    SHL r5, 1
    LD r0, [r5 + speaker_names]
    LDI r1, 3
    LDI r2, BOX_Y + 2
    MOV r3, r4
    SYS TEXT
    ; the text, revealed up to `reveal` characters
    LD r5, [reveal]
    LD r6, [box_len]
    CMP r5, r6
    JLT @partial
    MOV r5, r6
@partial:
    LDB r6, [r5 + text_buf]
    LDI r0, 0
    STB [r5 + text_buf], r0
    LDI r0, text_buf
    LDI r1, 3
    LDI r2, BOX_Y + 9
    LDI r3, 15
    SYS TEXT
    STB [r5 + text_buf], r6
    LD r0, [reveal]
    LD r1, [box_len]
    CMP r0, r1
    JLT @done
    SYS FRAME
    AND r0, 16
    JZ @done
    LDI r0, 121             ; "more" marker
    LDI r1, 122
    LDI r2, 3
    LDI r3, 2
    LDI r4, 15
    SYS RECTFILL
@done:
    RET

; ---- barks: one short box at the top while play continues --------------------------------------
; r0 = box address
open_bark:
    LDB r2, [r0]
    ST [bark_spk], r2
    ADD r0, 1
    LDI r1, bark_buf
    CALL decode_text
    LDI r0, BARK_FRAMES
    ST [bark_t], r0
    RET

draw_bark:
    LD r0, [bark_t]
    CMP r0, 0
    JEQ @done
    SUB r0, 1
    ST [bark_t], r0
    LDI r0, 0
    LDI r1, ROOM_Y
    LDI r2, 128
    LDI r3, 21
    LDI r4, 0
    SYS RECTFILL
    LD r5, [bark_spk]
    LDB r4, [r5 + speaker_colour]
    SYS RECT
    SHL r5, 1
    LD r0, [r5 + speaker_names]
    LDI r1, 3
    LDI r2, ROOM_Y + 2
    MOV r3, r4
    SYS TEXT
    LDI r0, bark_buf
    LDI r1, 3
    LDI r2, ROOM_Y + 8
    LDI r3, 15
    SYS TEXT
@done:
    RET

; ---- the terminal (logs, protocol) -------------------------------------------------------------
; r0 = log record: page count, then page pointers
open_log:
    ST [term_log], r0
    LDB r1, [r0]
    ST [term_pages], r1
    LDI r1, 0
    ST [term_page], r1
    CALL load_page
    LDI r0, M_TERM
    ST [mode], r0
    RET

load_page:
    LD r0, [term_log]
    LD r1, [term_page]
    SHL r1, 1
    ADD r0, r1
    LD r0, [r0 + 1]
    LDI r1, text_buf
    CALL decode_text
    RET

mode_term:
    LD r0, [pressed]
    AND r0, BTN_B
    JNZ @close
    LD r0, [pressed]
    AND r0, BTN_A
    JZ @draw
    LD r0, [term_page]
    ADD r0, 1
    LD r1, [term_pages]
    CMP r0, r1
    JGE @close
    ST [term_page], r0
    CALL load_page
    JMP @draw
@close:
    LDI r0, M_PLAY
    ST [mode], r0
    CALL draw_play
    RET
@draw:
    LDI r0, 0
    SYS CLS
    LDI r0, s_terminal
    LDI r1, 0
    LDI r2, 0
    LDI r3, 3
    SYS TEXT
    LDI r0, F_LIVE
    CALL flag_test
    CMP r0, 0
    JEQ @page
    LDI r0, s_oracle
    LDI r1, 84
    LDI r2, 0
    LDI r3, 6
    SYS TEXT
    CALL accuracy
    LDI r1, num_buf
    CALL put_pct
    LDI r0, 0
    STB [r1], r0
    LDI r0, num_buf
    LDI r1, 108
    LDI r2, 0
    LDI r3, 6
    SYS TEXT
@page:
    LDI r0, text_buf
    LDI r1, 0
    LDI r2, 7
    LDI r3, 11
    SYS TEXT
    LDI r0, s_term_keys
    LDI r1, 0
    LDI r2, 122
    LDI r3, 3
    SYS TEXT
    RET

.data
placeholder_fns: .word ph_guess, ph_pct, ph_n, ph_protocol, ph_follows
; one colour per speaker (text.gen.asm order: INCOMING ELI FILE HINT TERMINAL UNKNOWN DR.REYES ALARM LOG PA
; MIRA SYSTEM ORACLE DIRECTOR HALE PROTOCOL EPILOGUE)
speaker_colour: .byte 7, 13, 7, 3, 11, 11, 12, 6, 9, 11, 7, 6, 10, 6, 15
choice_names: .word s_delete, s_release, s_listen
s_delete:     .string "DELETE"
s_release:    .string "RELEASE"
s_listen:     .string "LISTEN"
proto_labels: .word pl_1, pl_2, pl_3, pl_4, pl_5, pl_6, pl_7
pl_1: .string "TURN LEFT"
pl_2: .string "USE THE EMP"
pl_3: .string "TRUST MIRA"
pl_4: .string "BOSS TIMING"
pl_5: .string "WAIT FOR GUARD"
pl_6: .string "READ MESSAGE"
pl_7: .string "TAKE LEFT PATH"
s_confirmed:  .string "CONFIRMED"
s_failed:     .string "FAILED"
s_accuracy:   .string "ACCURACY: "
s_follows:    .string "SUBJECT FOLLOWS MODEL."
s_deviates:   .string "SUBJECT DEVIATES."
s_terminal:   .string "AEGIS TERMINAL"
s_oracle:     .string "ORACLE"
s_term_keys:  .string "A: NEXT   B: EXIT"
