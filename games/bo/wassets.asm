; The assets of each world (DESIGN.md §16.1, D-035): its music and its boss sprites, in xdata (ISA 2). When the
; world changes, the loader copies the world's block into RAM (wasset); the code reaches them through the RA_*
; addresses below, which are valid while that world is loaded.

RA_HEM_MEL   = wasset + (hem_mel - wa_1)
RA_HEM_BASS  = wasset + (hem_bass - wa_1)
RA_BOSS_GULL = wasset + (spr_boss_gull - wa_1)
RA_SKO_MEL   = wasset + (sko_mel - wa_2)
RA_SKO_BASS  = wasset + (sko_bass - wa_2)
RA_RABBIT    = wasset + (spr_rabbit - wa_2)
RA_STA_MEL   = wasset + (sta_mel - wa_3)
RA_STA_BASS  = wasset + (sta_bass - wa_3)
RA_DOZER     = wasset + (spr_dozer - wa_3)
RA_BUCKET    = wasset + (spr_bucket - wa_3)
RA_SANDPILE  = wasset + (spr_sandpile - wa_3)

.data
world_assets:                       ; per world: far address (hi, lo), length
    .word wa_1 >> 16, wa_1 & $FFFF, wa_1_end - wa_1
    .word wa_2 >> 16, wa_2 & $FFFF, wa_2_end - wa_2
    .word wa_3 >> 16, wa_3 & $FFFF, wa_3_end - wa_3

.xdata
; ---- World 1 HEMMA ----
wa_1:
; World 1, HEMMA: happy and simple, C major, a skipping rhythm
hem_mel:
    N 523, 12
    N 659, 12
    N 784, 12
    N 659, 12
    N 698, 12
    N 880, 12
    N 784, 24
    N 659, 12
    N 587, 12
    N 523, 12
    N 587, 12
    N 659, 24
    N 0, 12
    N 784, 12
    N 880, 12
    N 784, 12
    N 659, 12
    N 698, 12
    N 659, 12
    N 587, 12
    N 494, 12
    N 523, 36
    N 0, 12
    LOOP
hem_bass:
    N 131, 24
    N 196, 24
    N 175, 24
    N 196, 24
    N 131, 24
    N 196, 24
    N 147, 24
    N 196, 24
    N 131, 24
    N 165, 24
    N 175, 24
    N 147, 24
    N 196, 24
    N 147, 24
    N 131, 48
    LOOP
spr_boss_gull:                      ; 16 x 16: top-left, top-right, bottom-left, bottom-right (facing right)
.sprite
    ........
    ........
    aa......
    .aaa....
    ..aaaa..
    ...aaaaf
    ....ffff
    ...fffff
.sprite
    ........
    ....fff.
    ...ffff1
    ..fffff9
    .ffffff9
    ffffff..
    fffff...
    ffff....
.sprite
    ..ffffff
    .fffffff
    .ffffff.
    ..fffff.
    ...fff..
    ....9...
    ...99...
    ........
.sprite
    fff.....
    ff......
    f.......
    ........
    ........
    ..9.....
    .99.....
    ........
wa_1_end:

; ---- World 2 SKOGEN ----
wa_2:
; World 2, SKOGEN: bouncy, G major, short notes with rests
sko_mel:   ; 288 frames
    N 392, 6
    N 0, 6
    N 494, 6
    N 0, 6
    N 587, 6
    N 0, 6
    N 494, 6
    N 0, 6
    N 523, 6
    N 0, 6
    N 659, 6
    N 0, 6
    N 587, 12
    N 0, 12
    N 587, 6
    N 0, 6
    N 659, 6
    N 0, 6
    N 740, 6
    N 0, 6
    N 784, 6
    N 0, 6
    N 740, 6
    N 0, 6
    N 659, 6
    N 0, 6
    N 587, 12
    N 0, 12
    N 494, 6
    N 0, 6
    N 587, 6
    N 0, 6
    N 523, 6
    N 0, 6
    N 440, 6
    N 0, 6
    N 494, 6
    N 0, 6
    N 440, 6
    N 0, 6
    N 392, 24
    LOOP
sko_bass:   ; 288 frames
    N 98, 12
    N 0, 12
    N 147, 12
    N 0, 12
    N 131, 12
    N 0, 12
    N 196, 12
    N 0, 12
    N 147, 12
    N 0, 12
    N 220, 12
    N 0, 12
    N 98, 12
    N 0, 12
    N 147, 12
    N 0, 12
    N 131, 12
    N 0, 12
    N 196, 12
    N 0, 12
    N 147, 12
    N 0, 12
    N 98, 24
    LOOP

spr_rabbit:                         ; 16 x 16, facing right: sitting (4 sprites), then leaping (4 sprites)
.sprite
    ........
    ........
    ........
    ........
    ........
    ........
    ........
    ........
.sprite
    ..ff....
    .fcf.ff.
    .fcffcf.
    .fcfcf..
    ..fff...
    .ffffff.
    fffff0f.
    ffffffcf
.sprite
    ...fffff
    ..ffffff
    .fffffff
    .fffffff
    ffffffff
    afffffff
    .aa.ffa.
    ...fffaa
.sprite
    fffffff.
    ffffff..
    ffffaa..
    fffaa...
    fffa....
    ffaa....
    ffa.....
    fffa....
.sprite
    ........
    ........
    ........
    ........
    ........
    ...ffff.
    .fffffff
    ffffffff
.sprite
    ........
    ......f.
    ....fcf.
    ...fcf..
    ..fff...
    .fffff..
    fffff0f.
    fffffffc
.sprite
    afffffff
    .aafffff
    ...fffaa
    ..ffa...
    .ffa....
    ffa.....
    ........
    ........
.sprite
    ffffff..
    fffaa...
    aa......
    ........
    ........
    ........
    ........
    ........

wa_2_end:

; ---- World 3 STADEN ----
wa_3:
; World 3, STADEN: a funky syncopated bass, A minor pentatonic, a sparse tune above it
sta_mel:   ; 256 frames
    N 0, 16
    N 659, 8
    N 0, 8
    N 784, 8
    N 659, 8
    N 0, 16
    N 0, 16
    N 587, 8
    N 659, 8
    N 523, 8
    N 440, 8
    N 0, 16
    N 0, 16
    N 587, 8
    N 0, 8
    N 659, 8
    N 784, 8
    N 0, 16
    N 880, 16
    N 784, 8
    N 659, 8
    N 587, 16
    N 0, 16
    LOOP
sta_bass:   ; 256 frames
    N 110, 8
    N 0, 4
    N 110, 4
    N 220, 8
    N 0, 8
    N 196, 8
    N 0, 8
    N 165, 8
    N 196, 8
    N 110, 8
    N 0, 4
    N 110, 4
    N 220, 8
    N 0, 8
    N 262, 8
    N 247, 8
    N 220, 8
    N 196, 8
    N 147, 8
    N 0, 4
    N 147, 4
    N 294, 8
    N 0, 8
    N 262, 8
    N 0, 8
    N 220, 8
    N 196, 8
    N 165, 8
    N 0, 8
    N 165, 8
    N 196, 8
    N 220, 16
    N 0, 16
    LOOP
spr_dozer:                          ; 32 x 16, facing left: top row of 4 sprites, then the bottom row
.sprite
    ........
    ........
    ........
    ........
    ........
    ........
    ........
    ........
.sprite
    eeeeeeee
    e0000000
    e0dddddd
    e0dddddd
    e0dddddd
    e0000000
    eeeeeeee
    eeeeeeee
.sprite
    eeeeeeee
    00000000
    dd0eeeee
    dd0eeeee
    dd0eeeee
    00eeeeee
    eeeeeeee
    eeeeeeee
.sprite
    eeeeeeee
    00000e0e
    eeeeee0e
    eeeeeeee
    eeeeeeee
    eeeeeeee
    eeeeeeee
    eeeeeeee
.sprite
    a7....7e
    a7...7.e
    a7..7..e
    a7.7...e
    a77....3
    a7.....3
    a7.....3
    a77777.e
.sprite
    eeeeeeee
    eeeeeeee
    eeeeeeee
    33333333
    a0a0a0a0
    0a0a0a0a
    a0a0a0a0
    33333333
.sprite
    eeeeeeee
    eeeeeeee
    eeeeeeee
    33333333
    a0a0a0a0
    0a0a0a0a
    a0a0a0a0
    33333333
.sprite
    eeeeeeee
    eeeeeeee
    eeeeeeee
    333333e.
    a0a0a03.
    0a0a0a3.
    a0a0a03.
    333333..
spr_bucket:                         ; the raised bucket, 8 x 16 (phases 2 and 3)
.sprite
    .a7777a.
    a777777a
    a7....7a
    a7....7a
    .a7..7a.
    ...77...
    ...77...
    ...77...
.sprite
    ...77...
    ...77...
    ...77...
    ...77...
    ...77...
    ...77...
    ...77...
    ...77...
spr_sandpile:
.sprite
    ........
    ........
    ........
    ...99...
    ..9e99..
    .99999e.
    9e999999
    99999999
wa_3_end:
.code
