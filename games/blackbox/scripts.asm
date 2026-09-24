; BLACKBOX — per-room triggers and scripts. Story content arrives in M15-M17; M13 wires the flags
; that open the way (LAYOUT.md 'gives').

; ---- event numbers for the test trace (S_EVENT) ----------------------------------------------
EV_D1 = 1
EV_D2 = 2
EV_D3 = 3
EV_D4 = 4
EV_D5 = 5
EV_D6 = 6
EV_D7 = 7
EV_D8 = 8
EV_D9 = 9
EV_D10 = 10
EV_D11 = 11
EV_D12 = 12
EV_D13 = 13
EV_D14 = 14
EV_D15 = 15
EV_D16 = 16
EV_D17 = 17
EV_D18 = 18
EV_D19 = 19
EV_D20 = 20
EV_L1 = 21
EV_L2 = 22
EV_L3 = 23
EV_L4 = 24
EV_L5 = 25
EV_L6 = 26
EV_L7 = 27
EV_L8 = 28
EV_L9 = 29
EV_L10 = 30
EV_P1 = 31
EV_P2 = 32
EV_P3 = 33
EV_P4 = 34
EV_P5 = 35
EV_P6 = 36
EV_P7 = 37
EV_P8 = 38
EV_C1 = 41                  ; access code shown for section n: EV_C1 + n - 1
EV_P1ASK = 50
EV_P2ASK = 51
EV_P4ASK = 52
EV_P5ASK = 53
EV_P6ASK = 54

.data
trig_0_1:
    TR_ENTER scr_intro
    TR_END
scr_intro:                  ; D1, once
    S_IFEV EV_D1, @done
    S_SAY box_D1_1
    S_SAY box_D1_2
    S_SAY box_D1_3
    S_SAY box_D1_4
    S_SAY box_D1_5
    S_SAY box_D1_6
    S_EVENT EV_D1
@done:
    S_END
trig_1_1:
    TR_END
trig_1_2:
    TR_USE 4, 3, scr_badge
    TR_END
scr_badge:                  ; D2: the reception terminal prints a badge that already has Eli's name
    S_IFEV EV_D2, @done
    S_SAY box_D2_1
    S_SAY box_D2_2
    S_SET F_BADGE
    S_EVENT EV_D2
@done:
    S_END
trig_1_3:
    TR_END
trig_1_4:
    TR_END
trig_2_1:
    TR_ENTER scr_code2
    TR_END
scr_code2:
    S_IFEV EV_C1 + 1, @done
    S_EVENT EV_C1 + 1
    S_CODE 2
@done:
    S_END
trig_2_2:
    TR_USE 4, 5, scr_copier
    TR_END
scr_copier:                 ; L1: the memo; reading it releases the grille (N)
    S_LOG log_L1
    S_SET F_L1
    S_EVENT EV_L1
    S_END
trig_2_3:
    TR_ENTER scr_mira1
    TR_END
scr_mira1:                  ; D3: somebody else is in the system
    S_IFEV EV_D3, @done
    S_SAY box_D3_1
    S_SAY box_D3_2
    S_SAY box_D3_3
    S_EVENT EV_D3
@done:
    S_END
trig_2_4:
    TR_TALK 0, scr_reyes
    TR_USE 11, 2, scr_reyes_notes
    TR_END
scr_reyes:                  ; D4: Dr. Reyes
    S_IFEV EV_D4, @again
    S_SAY box_D4_1
    S_SAY box_D4_2
    S_SAY box_D4_3
    S_SAY box_D4_4
    S_SAY box_D4_5
    S_EVENT EV_D4
    S_END
@again:
    S_SAY box_D4_4
    S_END
scr_reyes_notes:            ; L2 (optional): curiosity
    S_LOG log_L2
    S_IFEV EV_L2, @done
    S_PROF PROF_LOGS
    S_EVENT EV_L2
@done:
    S_END
trig_2_5:
    TR_END
trig_2_6:
    TR_ENTER scr_dirdoor
    TR_USE 5, 3, scr_keyboard
    TR_USE 10, 3, scr_safe
    TR_END
scr_dirdoor:
    S_SET F_DIRDOOR
    S_END
scr_keyboard:               ; the code taped under the keyboard (Dr. Reyes' hint)
    S_SET F_KEYNOTE
    S_SFX SFX_USE
    S_END
scr_safe:
    S_IFNOT F_KEYNOTE, @no
    S_SET F_CARD
    S_SFX SFX_PICKUP
    S_END
@no:
    S_SFX SFX_EMPTY
    S_END
trig_3_1:
    TR_ENTER scr_code3
    TR_USE 2, 2, scr_camindex
    TR_END
scr_code3:
    S_IFEV EV_C1 + 2, @done
    S_EVENT EV_C1 + 2
    S_CODE 3
@done:
    S_END
scr_camindex:               ; L3: the camera index; opens the stairwell
    S_LOG log_L3
    S_SET F_L3
    S_EVENT EV_L3
    S_END
trig_3_3:
    TR_STEP 255, 7, scr_turnleft
    TR_EXIT SIDE_W, scr_p1_left
    TR_EXIT SIDE_E, scr_p1_right
    TR_END
scr_turnleft:               ; P1 asked
    S_IFEV EV_P1ASK, @done
    S_EVENT EV_P1ASK
    S_BARK box_BARK_2
@done:
    S_END
scr_p1_left:                ; P1: the first exit taken decides (a prediction resolves once)
    S_IFHIT 1, @done
    S_IFEV EV_P1, @done
    S_PRED 1, F_TRUE
    S_PROF PROF_MIRA
    S_EVENT EV_P1
@done:
    S_END
scr_p1_right:
    S_IFEV EV_P1, @done
    S_PRED 1, F_FALSE
    S_EVENT EV_P1
@done:
    S_END
trig_3_2:
    TR_ENTER scr_armory
    TR_TOUCH 0, scr_emp
    TR_USE 10, 5, scr_shutter
    TR_END
scr_armory:                 ; P2 asked: "take the EMP. You will need it."
    S_IFEV EV_P2ASK, @done
    S_EVENT EV_P2ASK
    S_BARK box_BARK_1
@done:
    S_END
scr_emp:
    S_BARK box_BARK_8
    S_END
scr_shutter:
    S_SET F_SHUTTER
    S_SFX SFX_USE
    S_END
trig_3_4:
    TR_USE 3, 3, scr_alarmlog
    TR_USE 4, 3, scr_alarmlog
    TR_USE 5, 3, scr_alarmlog
    TR_END
scr_alarmlog:               ; D5 (only on the right-hand path): they knew
    S_IFEV EV_D5, @done
    S_SAY box_D5_1
    S_SAY box_D5_2
    S_SET F_ALARM
    S_EVENT EV_D5
@done:
    S_END
trig_3_5:
    TR_ENTER scr_level3
    TR_END
scr_level3:                 ; D6: security level 3
    S_IFEV EV_D6, @done
    S_SAY box_D6_1
    S_SAY box_D6_2
    S_EVENT EV_D6
@done:
    S_END
trig_4_1:
    TR_ENTER scr_code4
    TR_EXIT SIDE_N, scr_p2
    TR_END
scr_code4:
    S_IFEV EV_C1 + 3, @done
    S_EVENT EV_C1 + 3
    S_CODE 4
@done:
    S_END
scr_p2:                     ; P2: was the EMP used in this room?
    S_IFEV EV_P2, @done
    S_PRED 2, F_ROOM_EMP
    S_EVENT EV_P2
@done:
    S_END
trig_4_2:
    TR_USE 3, 3, scr_test14
    TR_END
scr_test14:                 ; L4: TEST 14; opens the control room
    S_LOG log_L4
    S_SET F_L4
    S_EVENT EV_L4
    S_END
trig_4_4:
    TR_USE 3, 2, scr_console
    TR_USE 4, 2, scr_console
    TR_USE 5, 2, scr_console
    TR_USE 6, 2, scr_console
    TR_USE 7, 2, scr_console
    TR_USE 8, 2, scr_console
    TR_USE 9, 2, scr_console
    TR_USE 10, 2, scr_console
    TR_END
scr_console:                ; D7 + P3: Mira asks for the access key
    S_IFEV EV_D7, @done
    S_SAY box_D7_1
    S_SAY box_D7_2
    S_ASK box_D7_3
    S_IFNOT F_ANSWER, @no
    S_SAY box_D7_4
    S_SET F_MIRA_DOOR
    S_PRED 3, F_TRUE
    S_PROF PROF_MIRA
    S_JMP @fin
@no:
    S_SAY box_D7_5
    S_PRED 3, F_FALSE
@fin:
    S_EVENT EV_D7
    S_EVENT EV_P3
@done:
    S_END
trig_4_3:
    TR_USE 4, 11, scr_brief
    TR_END
scr_brief:                  ; L5 (optional): the founding brief
    S_LOG log_L5
    S_IFEV EV_L5, @done
    S_PROF PROF_LOGS
    S_EVENT EV_L5
@done:
    S_END
trig_4_6:
    TR_END
trig_4_5:
    TR_ENTER scr_boss1
    TR_USE 1, 1, scr_panel_a
    TR_USE 14, 1, scr_panel_b
    TR_USE 4, 13, scr_panel_c
    TR_END
scr_boss1:                  ; D8 + P4 asked: "It will fire three times. Then turn."
    S_IFEV EV_P4ASK, @done
    S_EVENT EV_P4ASK
    S_SAY box_D8_1
    S_SAY box_D8_2
@done:
    S_END
scr_panel_a:
    S_HACK 0
    S_JMP scr_panel_done
scr_panel_b:
    S_HACK 1
    S_JMP scr_panel_done
scr_panel_c:
    S_HACK 2
scr_panel_done:
    S_IFNOT F_HACKED, @end
    S_PRED 4, F_P4OK
    S_EVENT EV_P4
    S_IFNOT F_LABCARD, @end
    S_IFEV EV_D8, @end
    S_SAY box_D8_3
    S_SAY box_D8_4
    S_EVENT EV_D8
@end:
    S_END
trig_5_1:
    TR_ENTER scr_code5
    TR_END
scr_code5:
    S_IFEV EV_C1 + 4, @done
    S_EVENT EV_C1 + 4
    S_CODE 5
@done:
    S_END
trig_5_2:
    TR_USE 8, 7, scr_archive
    TR_END
scr_archive:                ; L6 then D9: the test index
    S_LOG log_L6
    S_SET F_L6
    S_EVENT EV_L6
    S_IFEV EV_D9, @done
    S_SAY box_D9_1
    S_SAY box_D9_2
    S_EVENT EV_D9
@done:
    S_END
trig_5_3:
    TR_USE 7, 3, scr_test17
    TR_END
scr_test17:                 ; D10: Eli is the subject
    S_SAY box_D10_1
    S_SAY box_D10_2
    S_SAY box_D10_3
    S_EVENT EV_D10
    S_END
trig_5_4:
    TR_STEP 255, 4, scr_warn
    TR_EXIT SIDE_E, scr_p5
    TR_USE 4, 11, scr_incident
    TR_END
scr_warn:                   ; P5 asked — and ORACLE makes it true: the guard turns in exactly 3 s
    S_IFEV EV_P5ASK, @done
    S_EVENT EV_P5ASK
    S_BARK box_BARK_3
    S_ACTT 0, 180
@done:
    S_END
scr_p5:                     ; P5: past the guard without being detected after the warning?
    S_IFEV EV_P5, @done
    S_IFDET @miss
    S_PRED 5, F_TRUE
    S_PROF PROF_MIRA
    S_EVENT EV_P5
    S_END
@miss:
    S_PRED 5, F_FALSE
    S_EVENT EV_P5
@done:
    S_END
scr_incident:               ; L7 (optional)
    S_LOG log_L7
    S_IFEV EV_L7, @done
    S_PROF PROF_LOGS
    S_EVENT EV_L7
@done:
    S_END
trig_5_5:
    TR_USE 7, 6, scr_silence
    TR_END
scr_silence:                ; D11: Mira is gone
    S_IFEV EV_D11, @done
    S_SAY box_D11_1
    S_SAY box_D11_2
    S_SAY box_D11_3
    S_EVENT EV_D11
@done:
    S_END
trig_5_6:
    TR_USE 13, 7, scr_blast
    TR_USE 14, 7, scr_blast
    TR_END
scr_blast:                  ; the blast door opens only while the prototype is stunned
    S_IFSTUN 0, @go
    S_SFX SFX_EMPTY
    S_END
@go:
    S_WARP R_6_1
trig_6_1:
    TR_ENTER scr_61
    TR_STEP 12, 255, scr_p6ask
    TR_USE 11, 7, scr_p6read
    TR_EXIT SIDE_W, scr_p6
    TR_END
scr_61:                     ; access code, then D12: ORACLE speaks; the live figure appears
    S_IFEV EV_C1 + 5, @d12
    S_EVENT EV_C1 + 5
    S_CODE 6
@d12:
    S_IFEV EV_D12, @done
    S_SAY box_D12_1
    S_SAY box_D12_2
    S_SAY box_D12_3
    S_SET F_LIVE
    S_EVENT EV_D12
@done:
    S_END
scr_p6ask:
    S_IFEV EV_P6ASK, @done
    S_EVENT EV_P6ASK
    S_BARK box_BARK_4
@done:
    S_END
scr_p6read:                 ; P6: reading the message is what ORACLE predicted
    S_SAY box_BARK_4
    S_IF F_P6READ, @done
    S_SET F_P6READ
    S_PROF PROF_LOGS
@done:
    S_END
scr_p6:
    S_IFEV EV_P6, @done
    S_PRED 6, F_P6READ
    S_EVENT EV_P6
@done:
    S_END
trig_6_2:
    TR_END
trig_6_3:
    TR_USE 10, 5, scr_miramodel
    TR_END
scr_miramodel:              ; L8 (optional): how Mira was built
    S_LOG log_L8
    S_IFEV EV_L8, @done
    S_PROF PROF_LOGS
    S_EVENT EV_L8
@done:
    S_END
trig_6_4:
    TR_TALK 0, scr_hale
    TR_USE 3, 5, scr_printout
    TR_END
scr_hale:                   ; D13: the director already knows what Eli will say
    S_IFEV EV_D13, @again
    S_SAY box_D13_1
    S_SAY box_D13_2
    S_SAY box_D13_3
    S_SAY box_D13_4
    S_SAY box_D13_5
    S_SET F_HALE
    S_EVENT EV_D13
    S_END
@again:
    S_SAY box_D13_5
    S_END
scr_printout:               ; L9 (optional, after D13): the forecast of this conversation
    S_IFEV EV_D13, @read
    S_END
@read:
    S_LOG log_L9
    S_IFEV EV_L9, @done
    S_PROF PROF_LOGS
    S_EVENT EV_L9
@done:
    S_END
trig_6_5:
    TR_END
trig_7_1:
    TR_ENTER scr_71
    TR_USE 2, 2, scr_unit_a
    TR_USE 13, 2, scr_unit_b
    TR_USE 2, 10, scr_unit_c
    TR_USE 13, 10, scr_unit_d
    TR_END
scr_71:
    S_IFEV EV_C1 + 6, @d14
    S_EVENT EV_C1 + 6
    S_CODE 7
@d14:
    S_IFEV EV_D14, @done
    S_SAY box_D14_1
    S_EVENT EV_D14
@done:
    S_END
scr_unit_a:
    S_HACK 0
    S_END
scr_unit_b:
    S_HACK 1
    S_END
scr_unit_c:
    S_HACK 2
    S_END
scr_unit_d:
    S_HACK 3
    S_END
trig_7_2:
    TR_ENTER scr_fork
    TR_EXIT SIDE_W, scr_left
    TR_EXIT SIDE_E, scr_right
    TR_END
scr_fork:                   ; D15 + P7 asked
    S_IFEV EV_D15, @done
    S_SAY box_D15_1
    S_EVENT EV_D15
@done:
    S_END
scr_left:                   ; P7 hit: the expected path. Ending E1.
    S_SNAP
    S_PRED 7, F_TRUE
    S_EVENT EV_P7
    S_SET F_ENDING
    S_SAY box_E1_1
    S_SAY box_E1_2
    S_SAY box_D20_1
    S_EVENT EV_D20
    S_ENDING
scr_right:                  ; P7 miss: the truth
    S_IFEV EV_P7, @done
    S_PRED 7, F_FALSE
    S_EVENT EV_P7
@done:
    S_END
trig_7_3:
    TR_USE 7, 4, scr_core
    TR_USE 8, 4, scr_core
    TR_END
scr_core:                   ; D16 (with the protocol), D17 (Mira), then L10 opens the last door
    S_IFEV EV_D16, @log
    S_SAY box_D16_1
    S_SAY box_D16_2
    S_SAY box_D16_3
    S_SAY box_D16_4
    S_EVENT EV_D16
    S_SAY box_D17_1
    S_SAY box_D17_2
    S_IFHIT 3, @trusted
    S_SAY box_D17_4
    S_JMP @model
@trusted:
    S_SAY box_D17_3
@model:
    S_SAY box_D17_5
    S_EVENT EV_D17
@log:
    S_LOG log_L10
    S_SET F_L10
    S_EVENT EV_L10
    S_END
trig_7_4:
    TR_ENTER scr_last
    TR_USE 7, 6, scr_terminal
    TR_USE 1, 1, scr_cable
    TR_END
scr_last:                   ; D18: the last forecast
    S_IFEV EV_D18, @done
    S_SAY box_D18_1
    S_SAY box_D18_2
    S_EVENT EV_D18
@done:
    S_END
scr_terminal:               ; P8 by the menu: E2 (as forecast) or E3 (not)
    S_MENU box_D18_3
    S_SNAP
    S_PREDCH 8
    S_EVENT EV_P8
    S_SET F_ENDING
    S_IFHIT 8, @confirmed
    S_SAY box_D19_2
    S_JMP @epilogue
@confirmed:
    S_SAY box_D19_1
@epilogue:
    S_EVENT EV_D19
    S_IFCH CH_DELETE, @deleted
    S_IFCH CH_RELEASE, @released
    S_SAY box_E23_3
    S_JMP @accuracy
@deleted:
    S_SAY box_E23_1
    S_JMP @accuracy
@released:
    S_SAY box_E23_2
@accuracy:
    S_SAY box_D20_1
    S_EVENT EV_D20
    S_ENDING
scr_cable:                  ; P8 miss outside the model: PREDICTION ERROR (E4)
    S_SNAP
    S_PRED 8, F_FALSE
    S_EVENT EV_P8
    S_SAY box_D19_3
    S_SAY box_D19_4
    S_EVENT EV_D19
    S_SET F_ENDING
    S_SAY box_E4_1
    S_SAY box_E4_2
    S_SAY box_D20_1
    S_EVENT EV_D20
    S_ENDING
