; Things in a level (DESIGN.md §8): power-ups (walk onto them), nature-book entries (A next to them opens the page),
; building sites (A with wood builds), fallen trees (A gives wood, once per tree); the goal and the tally.
.code

; flowing water (DESIGN §1.3 S8): STREAM_FRAMES in it, AJ!
stream_hazard:
    LD r0, [mode]
    CMP r0, M_PLAY
    JNE @out
    LD r0, [cell_i]
    LDB r0, [r0 + cells]
    AND r0, 31
    CMP r0, CT_STREAM
    JNE @out
    LD r0, [stream_t]
    ADD r0, 1
    ST [stream_t], r0
    CMP r0, STREAM_FRAMES
    JB @done
    LDI r0, 0
    ST [stream_t], r0
    CALL aj
    RET
@out:
    LDI r0, 0
    ST [stream_t], r0
@done:
    RET

; level start: nothing taken, the obligatory controls' mask
objs_reset:
    LDI r0, 0
    ST [obj_taken], r0
    ST [n_harvest], r0
    ST [pw_t], r0
    ST [o_mask], r0
    LD r6, [lv_ptr]
    LDB r7, [r6 + LR_NCTRL]
    LD r6, [r6 + LR_CTRLS]
    LDI r4, 0
@k:
    CMP r4, r7
    JGE @done
    LDB r0, [r6 + 2]
    CMP r0, 0
    JNE @next
    LDI r1, 1
    SHL r1, r4
    LD r0, [o_mask]
    OR r0, r1
    ST [o_mask], r0
@next:
    ADD r6, 3
    ADD r4, 1
    JMP @k
@done:
    RET

; r6 = the k-th object's record (r0 = k)
obj_ptr:
    MUL r0, OBJ_REC
    LD r6, [lv_ptr]
    LD r6, [r6 + LR_OBJS]
    ADD r6, r0
    RET

; r6 = object record -> r0 = its cell index
obj_cell:
    LDB r0, [r6 + OB_R]
    LD r1, [lv_w]
    MUL r0, r1
    LDB r1, [r6 + OB_C]
    ADD r0, r1
    RET

; the feet entered a new cell: a power-up there is taken
obj_pickup:
    LD r7, [lv_ptr]
    LDB r7, [r7 + LR_NOBJ]
    LDI r5, 0
@k:
    CMP r5, r7
    JGE @done
    MOV r0, r5
    CALL obj_ptr
    LDB r0, [r6 + OB_KIND]
    CMP r0, OK_ITEM
    JNE @next
    LDI r1, 1
    SHL r1, r5
    LD r0, [obj_taken]
    AND r0, r1
    JNZ @next
    CALL obj_cell
    LD r2, [cell_i]
    CMP r0, r2
    JNE @next
    LD r0, [obj_taken]
    OR r0, r1
    ST [obj_taken], r0
    LDB r0, [r6 + OB_ARG]
    ST [pw], r0
    LDI r0, PW_FRAMES
    ST [pw_t], r0
    LDI r0, SFX_POWER
    SYS SFX
@next:
    ADD r5, 1
    JMP @k
@done:
    RET

; a power-up wears off (one set by a test hook, with no time, lasts)
pw_tick:
    LD r0, [pw_t]
    CMP r0, 0
    JEQ @done
    SUB r0, 1
    ST [pw_t], r0
    JNZ @done
    ST [pw], r0
@done:
    RET

; the cell Sixten faces -> [face_cell]; what A would do -> [a_label]
face_update:
    LD r0, [cell_i]
    LD r1, [face]
    LD r2, [lv_w]
    CMP r1, FACE_DN
    JNE @up
    ADD r0, r2
    JMP @set
@up:
    CMP r1, FACE_UP
    JNE @rt
    SUB r0, r2
    JMP @set
@rt:
    CMP r1, FACE_RT
    JNE @lt
    ADD r0, 1
    JMP @set
@lt:
    SUB r0, 1
@set:
    ST [face_cell], r0
    CALL a_find                     ; r0 = what (0 nothing, 1 side link, 2 entry, 3 build, 4 wood)
    SHL r0, 1
    LD r0, [r0 + a_labels]
    ST [a_label], r0
    RET

; what A does here -> r0 = 0 nothing, 1 a side view, 2 a nature-book entry, 3 a building site, 4 wood; r6 = its
; record (link, object) or r1 = the tree's cell
a_find:
    LD r6, [lv_ptr]                 ; a side view in front
    LDB r7, [r6 + LR_NLINK]
    LD r6, [r6 + LR_LINKS]
@link:
    CMP r7, 0
    JEQ @objs
    LD r1, [r6 + SL_CELL]
    LD r2, [face_cell]
    CMP r1, r2
    JNE @nl
    CALL link_open
    CMP r1, 0
    JEQ @nl
    LDI r0, 1
    RET
@nl:
    ADD r6, 8
    SUB r7, 1
    JMP @link
@objs:
    LD r7, [lv_ptr]                 ; an entry or a site here or in front
    LDB r7, [r7 + LR_NOBJ]
    LDI r5, 0
@k:
    CMP r5, r7
    JGE @tree
    MOV r0, r5
    CALL obj_ptr
    LDB r3, [r6 + OB_KIND]
    CMP r3, OK_ITEM
    JEQ @nk
    CALL obj_cell
    LD r1, [cell_i]
    CMP r0, r1
    JEQ @here
    LD r1, [face_cell]
    CMP r0, r1
    JNE @nk
@here:
    CMP r3, OK_ENTRY
    JNE @site
    LDI r0, 2
    RET
@site:
    LDI r1, 1                       ; a site not yet built, with enough wood
    SHL r1, r5
    LD r0, [obj_taken]
    AND r0, r1
    JNZ @nk
    LD r0, [wood]
    CMP r0, WOOD_PER_BUILD
    JLT @nk
    ST [tmp0], r5
    LDI r0, 3
    RET
@nk:
    ADD r5, 1
    JMP @k
@tree:
    LD r1, [cell_i]                 ; a fallen tree here or in front, not yet taken wood from
    CALL tree_ok
    CMP r0, 0
    JNE @wood
    LD r1, [face_cell]
    CALL tree_ok
    CMP r0, 0
    JEQ @nothing
@wood:
    LDI r0, 4
    RET
@nothing:
    LDI r0, 0
    RET

; r1 = cell -> r0 = 1 if it is a fallen tree not yet taken wood from (keeps r1)
tree_ok:
    LD r0, [lv_w]                   ; inside the level
    LD r2, [lv_h]
    MUL r0, r2
    CMP r1, r0
    JAE @no
    LDB r0, [r1 + cells]
    AND r0, 31
    CMP r0, CT_FALLEN
    JNE @no
    LD r2, [n_harvest]
@h:
    CMP r2, 0
    JEQ @yes
    SUB r2, 1
    MOV r0, r2
    SHL r0, 1
    LD r0, [r0 + harvest]
    CMP r0, r1
    JEQ @no
    JMP @h
@yes:
    LDI r0, 1
    RET
@no:
    LDI r0, 0
    RET

; A in play (after the side views): an entry's page, a building, wood
act_a:
    CALL a_find
    CMP r0, 2
    JNE @build
    LDB r0, [r6 + OB_ARG]
    CALL page_open
    RET
@build:
    CMP r0, 3
    JNE @wood
    LD r5, [tmp0]                   ; the site: its target cell becomes the new byte
    LDI r1, 1
    SHL r1, r5
    LD r0, [obj_taken]
    OR r0, r1
    ST [obj_taken], r0
    LD r0, [r6 + OB_TGT]
    LDB r1, [r6 + OB_ARG]
    STB [r0 + cells], r1
    LD r0, [wood]
    SUB r0, WOOD_PER_BUILD
    ST [wood], r0
    LDI r0, SFX_BUILD
    SYS SFX
    CALL view_reset
    RET
@wood:
    CMP r0, 4
    JNE @done
    LD r1, [cell_i]                 ; which tree
    CALL tree_ok
    CMP r0, 0
    JNE @take
    LD r1, [face_cell]
@take:
    LD r0, [n_harvest]
    CMP r0, MAX_HARVEST
    JGE @done
    MOV r2, r0
    SHL r2, 1
    ST [r2 + harvest], r1
    ADD r0, 1
    ST [n_harvest], r0
    LD r0, [wood]
    ADD r0, WOOD_PER_TREE
    ST [wood], r0
    LDI r0, SFX_WOOD
    SYS SFX
@done:
    RET

; the objects on the view: power-ups not taken, entries (their pictures)
draw_objs:
    LD r7, [lv_ptr]
    LDB r7, [r7 + LR_NOBJ]
    LDI r5, 0
@k:
    CMP r5, r7
    JGE @done
    MOV r0, r5
    CALL obj_ptr
    LDB r3, [r6 + OB_KIND]
    CMP r3, OK_ITEM
    JNE @entry
    LDI r1, 1
    SHL r1, r5
    LD r0, [obj_taken]
    AND r0, r1
    JNZ @next
    LDB r0, [r6 + OB_ARG]
    SHL r0, 1
    LD r0, [r0 + pw_sprites]
    JMP @draw
@entry:
    CMP r3, OK_ENTRY
    JNE @next
    LDB r0, [r6 + OB_ARG]
    SHL r0, 1
    LD r0, [r0 + nb_pics]
@draw:
    LDB r1, [r6 + OB_C]
    SHL r1, 5
    ADD r1, 12
    LD r2, [camx]
    SUB r1, r2
    LDB r2, [r6 + OB_R]
    SHL r2, 5
    ADD r2, 10 + PLAY_Y
    LD r3, [camy]
    SUB r2, r3
    LDI r3, 0
    SYS SPR
@next:
    ADD r5, 1
    JMP @k
@done:
    RET

; the goal: on the M cell with every obligatory control stamped
goal_check:
    LD r0, [cell_i]
    LDB r0, [r0 + cells]
    AND r0, 31
    CMP r0, CT_GOAL
    JNE @no
    LD r0, [stamped]
    LD r1, [o_mask]
    AND r0, r1
    CMP r0, r1
    JNE @no
    CALL level_done
@no:
    RET

; the level is done: its goals, the tally
level_done:
    LD r0, [n_stamped]
    ST [tally_c], r0
    LDI r0, 0                       ; the level's entries: how many, how many found
    ST [tally_e], r0
    ST [tally_n], r0
    LD r7, [lv_ptr]
    LDB r7, [r7 + LR_NOBJ]
    LDI r5, 0
@k:
    CMP r5, r7
    JGE @goals
    MOV r0, r5
    CALL obj_ptr
    LDB r0, [r6 + OB_KIND]
    CMP r0, OK_ENTRY
    JNE @nk
    LD r0, [tally_n]
    ADD r0, 1
    ST [tally_n], r0
    LDB r0, [r6 + OB_ARG]
    CALL book_has
    CMP r0, 0
    JEQ @nk
    LD r0, [tally_e]
    ADD r0, 1
    ST [tally_e], r0
@nk:
    ADD r5, 1
    JMP @k
@goals:
    LDI r2, 1                       ; done
    LD r0, [tally_c]
    LD r1, [lv_ptr]
    LDB r1, [r1 + LR_NCTRL]
    CMP r0, r1
    JNE @e
    OR r2, 2                        ; every control
@e:
    LD r0, [tally_e]
    LD r1, [tally_n]
    CMP r0, r1
    JNE @store
    OR r2, 4                        ; every entry
@store:
    LD r0, [level]
    LDB r1, [r0 + lv_goals]
    OR r1, r2
    STB [r0 + lv_goals], r1
    MOV r1, r0                      ; done
    SHR r1, 3
    AND r0, 7
    LDI r2, 1
    SHL r2, r0
    LDB r0, [r1 + lv_done]
    OR r0, r2
    STB [r1 + lv_done], r0
    LDI r0, M_TALLY
    ST [mode], r0
    LDI r0, SFX_GOAL
    SYS SFX
    RET

; r0 = entry index -> r0 = 1 if it is in the book
book_has:
    MOV r1, r0
    SHR r1, 3
    AND r0, 7
    LDB r1, [r1 + book]
    SHR r1, r0
    AND r1, 1
    MOV r0, r1
    RET

.data
a_labels:   .word t_look, t_enter, t_look, t_build, t_take
pw_sprites: .word 0, spr_cucumber, spr_chips, spr_chocolate
.code
