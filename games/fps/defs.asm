; FPS spike: constants and game state (SPIKE.md §3). Positions are 8.8 fixed point in cells.

C_CEIL     = 1                  ; ceiling colour
C_FLOOR    = 3                  ; floor colour
C_HUD      = 1                  ; status bar background
C_HUD_LINE = 7
C_HELP     = 7
C_LABEL    = 10
C_VALUE    = 14
C_HURT     = 6

CELL_DOOR_V = 8                 ; a door in a north-south wall line (rays reach it through an x side)
CELL_DOOR_H = 9                 ; a door in an east-west wall line (through a y side)

TURN_SPEED = 8                  ; angle steps per frame (1024 = full turn)
MOVE_SPEED = 14                 ; 1/256 cells per frame, along the facing direction
RADIUS     = 80                 ; the player's collision half size, 1/256 cells
DOOR_PASS  = 240                ; a door this open (of 255) can be walked through
DOOR_STEP  = 4                  ; door opening per frame
DOOR_WAIT  = 180                ; frames a door stays open
NDOORS     = 4

FIRE_DELAY = 12
FLASH_TIME = 6
START_HP   = 100
START_AMMO = 50

E_IDLE  = 0
E_CHASE = 1
E_DEAD  = 2
E_HP    = 3
E_SPEED = 5
E_NEAR  = 320                   ; the enemy stops this close (1.25 cells, max norm)
E_WAKE  = 1536                  ; and wakes up when the player is this close (6 cells, |dx| + |dy|)
E_REACH = 400                   ; it hits from this close
E_ATTACK_DELAY = 50
E_DAMAGE = 5
PAIN_TIME = 12
HURT_TIME = 10

; ---- player ----
.var px                         ; position, 8.8 cells
.var py
.var ang                        ; 0..1023, 0 = east, increasing = turning right (clockwise on the map)
.var health
.var ammo
.var fire_cd
.var flash
.var hurt
.var btn
.var btnp

; ---- the camera of the image being rendered (taken when its first ray is cast) ----
.var cx
.var cy
.var cang
.var cfx                        ; fraction of cx (0..255)
.var cfy
.var cfx16                      ; fraction << 8
.var cfy16
.var cidx                       ; map cell of the camera
.var cdx                        ; direction (8.8 unit vector)
.var cdy
.var cplx                       ; camera plane (direction turned right, times 0.66)
.var cply

; ---- doors: cell, state, timer; dopen = how open each map cell's door is (0..255) ----
D_CELL  = 0
D_STATE = 2
D_TIMER = 4
D_SIZE  = 6
DS_CLOSED  = 0
DS_OPENING = 1
DS_OPEN    = 2
DS_CLOSING = 3
.var doors, NDOORS * D_SIZE
.var ndoors
.var map, 256
.var dopen, 256

; ---- the enemy ----
.var ex
.var ey
.var estate
.var ehp
.var epain
.var eatk
; its projection in the last image: visible, left x, top y, size index, depth
.var e_vis
.var e_left
.var e_top
.var e_size
.var e_depth

; ---- frame counters ----
.var images                     ; images presented since start
.var images_sec                 ; images presented in the current second
.var fps                        ; images presented in the last full second
.var tick
