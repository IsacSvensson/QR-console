; BLACKBOX — character sprites (original art).
.data

; Eli Voss: cyan hoodie (d), peach face (c), dark hair (4), navy trousers (2)
spr_eli:
.sprite                     ; 0 down, frame 0
    ..4444..
    .4cccc4.
    ..c00c..
    .dddddd.
    d.dddd.d
    c.dddd.c
    ..2..2..
    ..2..2..
.sprite                     ; 1 down, frame 1
    ..4444..
    .4cccc4.
    ..c00c..
    .dddddd.
    d.dddd.d
    c.dddd.c
    ..2..2..
    .2....2.
.sprite                     ; 2 up, frame 0
    ..4444..
    .444444.
    ..4444..
    .dddddd.
    d.dddd.d
    c.dddd.c
    ..2..2..
    ..2..2..
.sprite                     ; 3 up, frame 1
    ..4444..
    .444444.
    ..4444..
    .dddddd.
    d.dddd.d
    c.dddd.c
    ..2..2..
    .2....2.
.sprite                     ; 4 side (east), frame 0
    ..4444..
    ..44ccc.
    ...c0c..
    ..dddd..
    ..dddd..
    ..dcdd..
    ..2..2..
    ..2..2..
.sprite                     ; 5 side (east), frame 1
    ..4444..
    ..44ccc.
    ...c0c..
    ..dddd..
    ..dddd..
    ..dcdd..
    ..2.2...
    ..2..2..

; actors (sprite_base / pose in actors.asm): 0-2 guard, 3 drone, 4-6 heavy, 7 hunter, 8 prototype,
; 9 agent, 10 Dr. Reyes, 11 Director Hale, 12 boss (placeholder until M17), 13 EMP, 14 spare charge
spr_actors:
.sprite                     ; 0 guard front
    ..2222..
    .288882.
    ..cccc..
    .222222.
    2.2e22.2
    c.2222.c
    ..2..2..
    ..0..0..
.sprite                     ; 1 guard back
    ..2222..
    .222222.
    ..2222..
    .222222.
    2.2222.2
    c.2222.c
    ..2..2..
    ..0..0..
.sprite                     ; 2 guard side (east)
    ..2222..
    ..28888.
    ...ccc..
    ..2222..
    ..2e22..
    ..2c22..
    ..2..2..
    ..0..0..
.sprite                     ; 3 drone
    a..aa..a
    .a.aa.a.
    ..7777..
    .7dddd7.
    .7d66d7.
    ..7777..
    .a....a.
    a......a
.sprite                     ; 4 heavy front
    .777777.
    7766667.
    .777777.
    77777777
    7.7777.7
    7.7777.7
    .77..77.
    .33..33.
.sprite                     ; 5 heavy back
    .777777.
    77777777
    .777777.
    77777777
    7.7777.7
    7.7777.7
    .77..77.
    .33..33.
.sprite                     ; 6 heavy side
    ..77777.
    ..77666.
    ..77777.
    .777777.
    .77777..
    .77777..
    .77..77.
    .33..33.
.sprite                     ; 7 hunter
    ........
    .77.....
    7667777.
    .7777777
    ..777777
    ..7..7.7
    ..7..7.7
    ........
.sprite                     ; 8 prototype
    ..aaaa..
    .a0dd0a.
    ..aaaa..
    aaaaaaaa
    a.a33a.a
    a.aaaa.a
    ..a..a..
    .aa..aa.
.sprite                     ; 9 ORACLE agent
    ..1111..
    .1ffff1.
    ..f00f..
    .111111.
    1.1111.1
    f.1111.f
    ..1..1..
    ..1..1..
.sprite                     ; 10 Dr. Reyes
    ..4444..
    .4cccc4.
    ..c00c..
    .ffffff.
    f.fbff.f
    c.ffff.c
    ..f..f..
    ..3..3..
.sprite                     ; 11 Director Hale
    ..aaaa..
    .acccca.
    ..c00c..
    .323323.
    3.3e33.3
    c.3333.c
    ..3..3..
    ..0..0..
.sprite                     ; 12 boss (placeholder)
    .666666.
    66000066
    60666606
    66666666
    6.6666.6
    6.6666.6
    .66..66.
    .66..66.
.sprite                     ; 13 EMP device
    ........
    ..8888..
    .8dddd8.
    .8d88d8.
    .8d88d8.
    .8dddd8.
    ..8888..
    ........
.sprite                     ; 14 spare charge
    ........
    ...dd...
    ..dddd..
    ..d88d..
    ..d88d..
    ..dddd..
    ...dd...
    ........
