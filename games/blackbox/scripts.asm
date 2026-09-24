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
    TR_END
trig_4_2:
    TR_USE 3, 3, scr_test14
    TR_END
scr_test14:
    S_SET F_L4
    S_EVENT EV_L4
    S_END
trig_4_4:
    TR_END
trig_4_3:
    TR_END
trig_4_6:
    TR_END
trig_4_5:
    TR_END
trig_5_1:
    TR_END
trig_5_2:
    TR_END
trig_5_3:
    TR_END
trig_5_4:
    TR_END
trig_5_5:
    TR_END
trig_5_6:
    TR_END
trig_6_1:
    TR_END
trig_6_2:
    TR_END
trig_6_3:
    TR_END
trig_6_4:
    TR_END
trig_6_5:
    TR_END
trig_7_1:
    TR_END
trig_7_2:
    TR_END
trig_7_3:
    TR_END
trig_7_4:
    TR_END
