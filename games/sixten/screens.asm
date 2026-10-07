; The screens around the game (DESIGN.md §10.1): title, world map (with the save code), tally, a nature-book page,
; the nature book. Each one draws its whole screen every frame.
.code

; ---- the title -------------------------------------------------------------------------------
; A: the world map; B: the level card (the test levels)
title_frame:
    SYS BTNP
    MOV r7, r0
    AND r0, BTN_A
    JZ @b
    CALL wmap_enter
    RET
@b:
    AND r7, BTN_B
    JZ @draw
    LDI r0, M_CARD
    ST [mode], r0
    RET
@draw:
    LDI r0, C_NAVY
    SYS CLS
    LDI r0, 0                       ; the ground
    LDI r1, 100
    LDI r2, 128
    LDI r3, 28
    LDI r4, C_GREEN
    SYS RECTFILL
    LDI r0, t_title1
    LDI r1, 43
    LDI r2, 18
    LDI r3, font_w
    CALL draw_text
    LDI r0, t_title2
    LDI r1, 34
    LDI r2, 30
    LDI r3, font_w
    CALL draw_text
    LDI r0, 96                      ; a little whirlwind over the field
    LDI r1, 104
    LDI r2, 2
    CALL draw_tromb
    LDI r0, spr_head_dn             ; Sixten
    LDI r1, 40
    LDI r2, 86
    LDI r3, 0
    SYS SPR
    LDI r0, spr_body_dn0
    LDI r2, 94
    SYS SPR
    LD r0, [tick]
    AND r0, 32
    JNZ @done
    LDI r0, t_start
    LDI r1, 37
    LDI r2, 112
    LDI r3, font_d
    CALL draw_text
@done:
    RET

; ---- the world map ---------------------------------------------------------------------------
; r0 = the world's level count -> into the world map; the save code is made for it
wmap_enter:
    LDI r0, M_WMAP
    ST [mode], r0
    CALL world_advance
    CALL code_make
    LDI r0, 0                       ; select the first level not done (or the last)
    ST [wm_sel], r0
@find:
    CALL wm_count
    LD r1, [wm_sel]
    SUB r0, 1
    CMP r1, r0
    JGE @done
    CALL wm_level
    CALL lv_is_done
    CMP r0, 0
    JEQ @done
    LD r0, [wm_sel]
    ADD r0, 1
    ST [wm_sel], r0
    JMP @find
@done:
    RET

; when every level of the world is done, the next world opens
world_advance:
    LD r0, [world]
    CMP r0, WORLDS
    JGT @done
    CALL wm_count
    CMP r0, 0
    JEQ @done
    MOV r5, r0
    LDI r6, 0
@k:
    CMP r6, r5
    JGE @all
    ST [wm_sel], r6
    CALL wm_level
    CALL lv_is_done
    CMP r0, 0
    JEQ @done
    ADD r6, 1
    JMP @k
@all:
    LD r0, [world]
    ADD r0, 1
    ST [world], r0
@done:
    RET

; r0 = the number of levels the current world has (so far)
wm_count:
    LD r0, [world]
    CMP r0, WORLDS
    JLE @in
    LDI r0, 0
    RET
@in:
    SUB r0, 1
    LDB r0, [r0 + world_count]
    RET

; r0 = the level index of [wm_sel] in the current world
wm_level:
    LD r0, [world]
    SUB r0, 1
    SHL r0, 2
    LD r1, [wm_sel]
    ADD r0, r1
    LDB r0, [r0 + world_levels]
    RET

; r0 = level index -> r0 = 1 if it is done (keeps r5, r6)
lv_is_done:
    MOV r1, r0
    SHR r1, 3
    AND r0, 7
    LDB r1, [r1 + lv_done]
    SHR r1, r0
    AND r1, 1
    MOV r0, r1
    RET

wmap_frame:
    SYS BTNP
    MOV r7, r0
    AND r0, BTN_B
    JZ @a
    LDI r0, M_BOOK
    ST [mode], r0
    RET
@a:
    CALL wm_count
    CMP r0, 0
    JEQ @draw
    MOV r5, r0
    MOV r0, r7
    AND r0, BTN_A
    JZ @lr
    CALL wm_level
    CALL level_start
    CALL draw_world
    RET
@lr:
    LD r6, [wm_sel]
    MOV r0, r7
    AND r0, BTN_RIGHT
    JZ @left
    ADD r6, 1                       ; the next level, if it is open (the one before it is done)
    CMP r6, r5
    JGE @draw
    ST [tmp0], r6
    SUB r6, 1
    ST [wm_sel], r6
    CALL wm_level
    CALL lv_is_done
    LD r6, [tmp0]
    CMP r0, 0
    JNE @store
    SUB r6, 1
    JMP @store
@left:
    MOV r0, r7
    AND r0, BTN_LEFT
    JZ @draw
    CMP r6, 0
    JEQ @draw
    SUB r6, 1
@store:
    ST [wm_sel], r6
@draw:
    LDI r0, C_DGREEN
    SYS CLS
    LDI r0, t_world                 ; "VÄRLD n NAME"
    LDI r1, 4
    LDI r2, 4
    LDI r3, font_w
    CALL draw_text
    LD r1, [world]
    CMP r1, WORLDS
    JLE @wn
    LDI r1, WORLDS
@wn:
    ADD r1, G_0
    STB [strbuf], r1
    LDI r1, 255
    STB [strbuf + 1], r1
    MOV r1, r0
    ADD r1, 6
    LDI r0, strbuf
    LDI r2, 4
    LDI r3, font_w
    CALL draw_text
    ADD r0, 6
    MOV r1, r0
    LD r0, [world]
    CMP r0, WORLDS
    JLE @wn2
    LDI r0, WORLDS
@wn2:
    SUB r0, 1
    SHL r0, 1
    LD r0, [r0 + world_names]
    LDI r2, 4
    LDI r3, font_w
    CALL draw_text
    CALL wm_count
    CMP r0, 0
    JNE @stops
    LDI r0, t_soon
    LDI r1, 4
    LDI r2, 56
    LDI r3, font_w
    CALL draw_text
    JMP @code
@stops:
    MOV r5, r0
    LD r0, [wm_sel]                 ; wm_stop moves wm_sel; it comes back after
    ST [sel_keep], r0
    LDI r0, 12                      ; the path between the stops
    LDI r1, 54
    LDI r2, 116
    LDI r3, 54
    LDI r4, C_KHAKI
    SYS LINE
    LDI r6, 0
@stop:
    CMP r6, r5
    JGE @name
    PUSH r5
    PUSH r6
    MOV r0, r6                      ; x = 16 + 32 k
    SHL r0, 5
    ADD r0, 16
    ST [cx0], r0
    CALL wm_stop
    POP r6
    POP r5
    ADD r6, 1
    JMP @stop
@name:
    LD r0, [sel_keep]
    ST [wm_sel], r0
    CALL wm_level                   ; the chosen level's name
    MUL r0, LV_REC
    ADD r0, level_table + LR_NAME
    LD r0, [r0]
    LDI r1, 4
    LDI r2, 84
    LDI r3, font_w
    CALL draw_text
@code:
    LDI r0, t_code
    LDI r1, 4
    LDI r2, 112
    LDI r3, font_w
    CALL draw_text
    LDI r0, code_str
    LDI r1, 34
    LDI r2, 112
    LDI r3, font_w
    CALL draw_text
    RET

; one stop on the world map: r6 = its place in the world, [cx0] = x. A square (white, filled when done; the chosen
; one blinks yellow), its number under it, and three marks for its goals (done, every control, every entry)
wm_stop:
    ST [wm_sel], r6
    CALL wm_level
    ST [tmp0], r0
    LD r1, [sel_keep]
    LDI r2, C_WHITE
    CMP r1, r6
    JNE @col
    LD r3, [tick]
    AND r3, 16
    JZ @col
    LDI r2, C_YELLOW
@col:
    MOV r4, r2                      ; a square: its outline
    LD r0, [cx0]
    SUB r0, 5
    LDI r1, 49
    LDI r2, 11
    LDI r3, 11
    SYS RECTFILL
    ADD r0, 1
    ADD r1, 1
    LDI r2, 9
    LDI r3, 9
    LDI r4, C_DGREEN
    SYS RECTFILL
    LD r0, [tmp0]
    CALL lv_is_done
    CMP r0, 0
    JEQ @num
    LD r0, [cx0]
    SUB r0, 3
    LDI r1, 51
    LDI r2, 7
    LDI r3, 7
    LDI r4, C_WHITE
    SYS RECTFILL
@num:
    LD r0, [world]                  ; "w-k"
    ADD r0, G_0
    STB [strbuf], r0
    LDI r0, G_DASH
    STB [strbuf + 1], r0
    ADD r6, 1
    ADD r6, G_0
    STB [strbuf + 2], r6
    LDI r0, 255
    STB [strbuf + 3], r0
    LDI r0, strbuf
    LD r1, [cx0]
    SUB r1, 9
    LDI r2, 62
    LDI r3, font_w
    CALL draw_text
    LD r0, [tmp0]                   ; the goals
    LDB r6, [r0 + lv_goals]
    LDI r5, 0
@goal:
    CMP r5, 3
    JGE @done
    LD r0, [cx0]
    SUB r0, 7
    MOV r1, r5
    MUL r1, 5
    ADD r0, r1
    LDI r1, 74
    LDI r2, 4
    LDI r3, 4
    LDI r4, C_DGREY
    MOV r7, r6
    SHR r7, r5
    AND r7, 1
    JZ @mark
    LDI r4, C_YELLOW
@mark:
    SYS RECTFILL
    ADD r5, 1
    JMP @goal
@done:
    RET

; ---- the tally --------------------------------------------------------------------------------
tally_frame:
    SYS BTNP
    AND r0, BTN_A
    JZ @draw
    CALL wmap_enter
    RET
@draw:
    LDI r0, C_DGREEN
    SYS CLS
    LD r0, [lv_ptr]
    LD r0, [r0 + LR_NAME]
    LDI r1, 4
    LDI r2, 8
    LDI r3, font_w
    CALL draw_text
    LDI r0, t_done
    LDI r1, 4
    LDI r2, 20
    LDI r3, font_w
    CALL draw_text
    LDI r0, t_tctrl                 ; controls n/N
    LDI r1, 4
    LDI r2, 44
    LD r3, [tally_c]
    LD r4, [lv_ptr]
    LDB r4, [r4 + LR_NCTRL]
    CALL tally_row
    LDI r0, t_tbook                 ; entries of the level found
    LDI r1, 4
    LDI r2, 58
    LD r3, [tally_e]
    LD r4, [tally_n]
    CALL tally_row
    LDI r0, t_thearts
    LDI r1, 4
    LDI r2, 72
    LD r3, [hearts]
    LDI r4, HEARTS
    CALL tally_row
    LD r0, [tick]
    AND r0, 32
    JNZ @done
    LDI r0, spr_btn_a
    LDI r1, 60
    LDI r2, 104
    LDI r3, 0
    SYS SPR
@done:
    RET

; r0 = label, r1 = x, r2 = y, r3 = n, r4 = of N: "LABEL n/N"
tally_row:
    PUSH r2
    PUSH r3
    PUSH r4
    LDI r3, font_w
    CALL draw_text
    POP r4
    POP r3
    ADD r3, G_0
    STB [strbuf], r3
    LDI r3, G_SLASH
    STB [strbuf + 1], r3
    ADD r4, G_0
    STB [strbuf + 2], r4
    LDI r3, 255
    STB [strbuf + 3], r3
    POP r2
    LDI r0, strbuf
    LDI r1, 88
    LDI r3, font_w
    CALL draw_text
    RET

; ---- a nature-book page ----------------------------------------------------------------------
; r0 = entry index: into the book (if new), its pages unpacked, the page shown
page_open:
    ST [page_e], r0
    LDI r1, 0
    ST [page_n], r1
    ST [page_new], r1
    CALL book_has
    CMP r0, 0
    JNE @old
    LDI r0, 1
    ST [page_new], r0
    LD r0, [page_e]                 ; into the book
    MOV r1, r0
    SHR r1, 3
    AND r0, 7
    LDI r2, 1
    SHL r2, r0
    LDB r0, [r1 + book]
    OR r0, r2
    STB [r1 + book], r0
    LDI r0, SFX_PLING
    SYS SFX
@old:
    LD r0, [page_e]
    SHL r0, 2
    LD r1, [r0 + nb_texts]
    LD r2, [r0 + nb_texts + 2]
    LDI r0, nbuf
    SYS UNPACK
    LDI r0, M_PAGE
    ST [mode], r0
    CALL draw_page
    RET

page_frame:
    SYS BTNP
    MOV r1, r0
    AND r0, BTN_B
    JNZ @close
    AND r1, BTN_A
    JZ @done
    LD r0, [page_n]
    ADD r0, 1
    ST [page_n], r0
    LDB r1, [nbuf]
    CMP r0, r1
    JLT @draw
@close:
    LDI r0, M_PLAY
    ST [mode], r0
    CALL draw_world
    RET
@draw:
    CALL draw_page
@done:
    RET

; the page over the play screen: its picture at 2x, its name, two lines of its text, what A does
draw_page:
    LDI r0, 4
    LDI r1, 36
    LDI r2, 120
    LDI r3, 88
    LDI r4, C_WHITE
    SYS RECTFILL
    LDI r4, C_NAVY
    SYS RECT
    LD r0, [page_e]                 ; the picture, 2 x
    SHL r0, 1
    LD r0, [r0 + nb_pics]
    LDI r1, 10
    LDI r2, 42
    CALL zoom_spr
    LD r0, [page_e]
    SHL r0, 1
    LD r0, [r0 + nb_names]
    LDI r1, 32
    LDI r2, 44
    LDI r3, font_d
    CALL draw_text
    LD r0, [page_new]
    CMP r0, 0
    JEQ @text
    LDI r0, t_new
    LDI r1, 98
    LDI r2, 54
    LDI r3, font_d
    CALL draw_text
@text:
    LD r0, [page_n]                 ; the page's two lines: skip 2 x page_n lines
    SHL r0, 1
    LDI r6, nbuf + 1
@skip:
    CMP r0, 0
    JEQ @lines
@to_end:
    LDB r1, [r6]
    ADD r6, 1
    CMP r1, 255
    JNE @to_end
    SUB r0, 1
    JMP @skip
@lines:
    PUSH r6
    MOV r0, r6
    LDI r1, 8
    LDI r2, 70
    LDI r3, font_d
    CALL draw_text
    POP r6
@to_end2:
    LDB r1, [r6]
    ADD r6, 1
    CMP r1, 255
    JNE @to_end2
    MOV r0, r6
    LDI r1, 8
    LDI r2, 82
    LDI r3, font_d
    CALL draw_text
    LDI r0, t_more                  ; A: more, or A: close on the last page
    LD r1, [page_n]
    ADD r1, 1
    LDB r2, [nbuf]
    CMP r1, r2
    JLT @hint
    LDI r0, t_close
@hint:
    LDI r1, 8
    LDI r2, 108
    LDI r3, font_d
    CALL draw_text
    RET

; r0 = an 8 x 8 sprite, r1, r2 = top-left: drawn at 2 x (one RECTFILL per opaque pixel)
zoom_spr:
    MOV r6, r0
    ST [cx0], r1
    ST [cy0], r2
    LDI r7, 0                       ; byte index (32 bytes, 2 pixels each)
@b:
    LDB r5, [r6]
    MOV r4, r5                      ; left pixel
    SHR r4, 4
    MOV r0, r7
    SHL r0, 1
    CALL zoom_px
    MOV r4, r5                      ; right pixel
    AND r4, 15
    MOV r0, r7
    SHL r0, 1
    ADD r0, 1
    CALL zoom_px
    ADD r6, 1
    ADD r7, 1
    CMP r7, 32
    JLT @b
    RET
; r0 = pixel index 0-63, r4 = colour (0 = transparent)
zoom_px:
    CMP r4, 0
    JEQ @done
    MOV r1, r0
    SHR r1, 3
    AND r0, 7
    SHL r0, 1
    LD r2, [cx0]
    ADD r0, r2
    SHL r1, 1
    LD r2, [cy0]
    ADD r1, r2
    LDI r2, 2
    LDI r3, 2
    SYS RECTFILL
@done:
    RET

; ---- the nature book ------------------------------------------------------------------------
; the current world's entries (found: picture and name; not yet: a question mark), and how many of all 40
book_frame:
    SYS BTNP
    AND r0, BTN_A | BTN_B
    JZ @draw
    LDI r0, M_WMAP
    ST [mode], r0
    RET
@draw:
    LDI r0, C_NAVY
    SYS CLS
    LDI r0, t_book
    LDI r1, 4
    LDI r2, 4
    LDI r3, font_w
    CALL draw_text
    MOV r5, r0                      ; "n/40"
    LDI r6, 0
    LDI r4, 0
@count:
    MOV r0, r6
    PUSH r4
    CALL book_has
    POP r4
    ADD r4, r0
    ADD r6, 1
    CMP r6, NB_COUNT
    JLT @count
    ADD r5, 6
    MOV r0, r4
    MOV r1, r5
    LDI r2, 6
    LDI r3, C_YELLOW
    SYS NUM
    LD r6, [world]                  ; the world's 8 entries
    CMP r6, WORLDS
    JLE @w
    LDI r6, WORLDS
@w:
    ST [tmp0], r6
    LDI r6, 0                       ; entry index
    LDI r7, 0                       ; shown so far
@e:
    CMP r6, NB_COUNT
    JGE @done
    LDB r0, [r6 + nb_world]
    LD r1, [tmp0]
    CMP r0, r1
    JNE @next
    PUSH r6
    PUSH r7
    MOV r0, r7                      ; place: two columns of four
    AND r0, 1
    MUL r0, 64
    ADD r0, 4
    ST [cx0], r0
    MOV r0, r7
    SHR r0, 1
    MUL r0, 24
    ADD r0, 20
    ST [cy0], r0
    MOV r0, r6
    CALL book_has
    CMP r0, 0
    JEQ @unknown
    POP r7
    POP r6
    PUSH r6
    PUSH r7
    MOV r0, r6
    SHL r0, 1
    LD r0, [r0 + nb_pics]
    LD r1, [cx0]
    LD r2, [cy0]
    LDI r3, 0
    SYS SPR
    MOV r0, r6
    SHL r0, 1
    LD r0, [r0 + nb_names]
    JMP @label
@unknown:
    LDI r0, nb_pic_unknown
    LD r1, [cx0]
    LD r2, [cy0]
    LDI r3, 0
    SYS SPR
    LDI r0, t_q
@label:
    LD r1, [cx0]
    ADD r1, 10
    LD r2, [cy0]
    SUB r2, 2
    LDI r3, font_w
    CALL draw_text
    POP r7
    POP r6
    ADD r7, 1
@next:
    ADD r6, 1
    JMP @e
@done:
    RET

.data
world_count:  .byte 4, 0, 0, 0, 0
world_levels: .byte LEVEL_1_1, LEVEL_1_2, LEVEL_1_3, LEVEL_1_4
              .fill 16
world_names:  .word t_wname1, t_wname2, t_wname3, t_wname4, t_wname5
.code
