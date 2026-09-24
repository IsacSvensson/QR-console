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

.data
trig_0_1:
    TR_END
trig_1_1:
    TR_END
trig_1_2:
    TR_USE 4, 3, scr_badge
    TR_END
scr_badge:
    S_SET F_BADGE
    S_EVENT EV_D2
    S_END
trig_1_3:
    TR_END
trig_1_4:
    TR_END
trig_2_1:
    TR_END
trig_2_2:
    TR_END
trig_2_3:
    TR_END
trig_2_4:
    TR_END
trig_2_5:
    TR_END
trig_2_6:
    TR_END
trig_3_1:
    TR_END
trig_3_3:
    TR_END
trig_3_2:
    TR_END
trig_3_4:
    TR_END
trig_3_5:
    TR_END
trig_4_1:
    TR_END
trig_4_2:
    TR_END
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
