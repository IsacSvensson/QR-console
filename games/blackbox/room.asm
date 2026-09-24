; BLACKBOX — rooms: loading, locks, tile lookup, flags, transitions. Room format: DESIGN.md §3.1.
.code

; r0 = room index. Unpacks the room into room_buf and sets the room variables.
load_room:
    ST [room], r0
    MUL r0, ROOM_REC
    ADD r0, room_table
    ST [room_rec], r0
    LD r1, [r0 + RR_RLE]
    LDI r2, 0
@run:                       ; RLE: high nibble = run length - 1, low nibble = tile code
    LDB r3, [r1]
    ADD r1, 1
    MOV r4, r3
    SHR r4, 4
    ADD r4, 1
    AND r3, 15
@fill:
    STB [r2 + room_buf], r3
    ADD r2, 1
    SUB r4, 1
    JNZ @fill
    CMP r2, RLE_TILES
    JLT @run
    CALL autotile
    CALL apply_locks
    LD r0, [room_rec]
    LDB r1, [r0 + RR_TSET]
    LDB r2, [r1 + floor_colors]
    ST [floor_col], r2
    SHL r1, 1
    LD r2, [r1 + tileset_ptrs]
    ST [tileset], r2
    LDI r0, 0
    ST [trig_fired], r0
    ST [room_emp], r0
    LDI r0, F_ROOM_EMP
    CALL flag_clr
    CALL spawn_actors
    ; music: the zone's track; the boss rooms play the alarm; ORACLE's theme from the core airlock on
    LD r0, [room_rec]
    LDB r0, [r0 + RR_ZONE]
    LDB r0, [r0 + zone_music]
    LD r1, [room]
    CMP r1, R_6_5
    JNE @not_airlock
    LDI r0, MUS_ORACLE
@not_airlock:
    CMP r1, R_4_5
    JEQ @alarm
    CMP r1, R_7_1
    JNE @set
@alarm:
    LDI r0, MUS_ALARM
@set:
    CALL set_music
    RET

; A wall with something other than wall below it shows its front face.
autotile:
    LDI r2, 0
@loop:
    LDB r0, [r2 + room_buf]
    CMP r0, T_WALL
    JNE @next
    CMP r2, RLE_TILES - 16
    JAE @next
    LDB r1, [r2 + room_buf + 16]
    CMP r1, T_WALL
    JEQ @next
    LDI r0, T_WALLFACE
    STB [r2 + room_buf], r0
@next:
    ADD r2, 1
    CMP r2, RLE_TILES
    JLT @loop
    RET

; Opens the locked doors (T_LOCKED -> T_DOOR) on every side whose lock flag is set.
apply_locks:
    LDI r6, 0               ; side
@side:
    LD r0, [room_rec]
    ADD r0, r6
    LDB r0, [r0 + RR_LOCK]
    CMP r0, EXIT_NONE
    JEQ @next
    CALL flag_test
    CMP r0, 0
    JEQ @next
    LDB r2, [r6 + side_start]
    LDB r3, [r6 + side_stride]
    LDB r4, [r6 + side_count]
@cell:
    LDB r0, [r2 + room_buf]
    CMP r0, T_LOCKED
    JNE @skip
    LDI r0, T_DOOR
    STB [r2 + room_buf], r0
@skip:
    ADD r2, r3
    SUB r4, 1
    JNZ @cell
@next:
    ADD r6, 1
    CMP r6, 4
    JLT @side
    RET

; r0 = cell x, r1 = cell y -> r0 = tile code (outside the room: floor, so doorways lead out)
tile_at:
    CMP r0, 0
    JLT @out
    CMP r0, 16
    JGE @out
    CMP r1, 0
    JLT @out
    CMP r1, 15
    JGE @out
    SHL r1, 4
    ADD r1, r0
    LDB r0, [r1 + room_buf]
    RET
@out:
    LDI r0, T_FLOOR
    RET

; r0 = cell x, r1 = cell y -> r0 = attributes (A_SOLID | A_OPAQUE | A_USE)
attr_at:
    CALL tile_at
    LDB r0, [r0 + tile_attr]
    RET

; ---- flags and events: r0 = bit number ---------------------------------------------------------
flag_test:                  ; -> r0 = 1 if set
    MOV r1, r0
    SHR r1, 3
    LDB r1, [r1 + flags]
    AND r0, 7
    SHR r1, r0
    AND r1, 1
    MOV r0, r1
    RET

flag_set:
    MOV r1, r0
    SHR r1, 3
    AND r0, 7
    LDI r2, 1
    SHL r2, r0
    LDB r0, [r1 + flags]
    OR r0, r2
    STB [r1 + flags], r0
    RET

flag_clr:
    MOV r1, r0
    SHR r1, 3
    AND r0, 7
    LDI r2, 1
    SHL r2, r0
    XOR r2, -1
    LDB r0, [r1 + flags]
    AND r0, r2
    STB [r1 + flags], r0
    RET

event_set:
    MOV r1, r0
    SHR r1, 3
    AND r0, 7
    LDI r2, 1
    SHL r2, r0
    LDB r0, [r1 + events]
    OR r0, r2
    STB [r1 + events], r0
    RET

event_test:                 ; -> r0 = 1 if the event has happened
    MOV r1, r0
    SHR r1, 3
    LDB r1, [r1 + events]
    AND r0, 7
    SHR r1, r0
    AND r1, 1
    MOV r0, r1
    RET

; ---- entering rooms ---------------------------------------------------------------------------
; r0 = room: load it and run its ENTER trigger
enter_room:
    LDI r1, 0
    ST [room_det], r1
    CALL load_room
    LDI r0, TK_ENTER
    LDI r1, 0
    LDI r2, 0
    CALL fire_trigger
    RET

; r0 = room: enter it at its arrival point (next to the lift, or '@')
enter_room_at_arrival:
    CALL enter_room
place_at_arrival:
    LD r0, [room_rec]
    LDB r1, [r0 + RR_ARRX]
    LDB r2, [r0 + RR_ARRY]
    CMP r1, EXIT_NONE
    JNE @place
    LDI r1, 7               ; rooms without an arrival point (only used by the test hook)
    LDI r2, 7
@place:
    SHL r1, 3
    SHL r2, 3
    ST [px], r1
    ST [py], r2
    JMP remember_entry

; r0 = side (SIDE_*): leave through that side's doorway
leave_room:
    MOV r6, r0
    LDI r0, TK_EXIT
    MOV r1, r6
    LDI r2, 0
    PUSH r6
    CALL fire_trigger       ; EXIT scripts run to completion here (non-blocking commands only)
    POP r6
    LD r0, [room_rec]
    ADD r0, r6
    LDB r0, [r0 + RR_EXIT]
    CMP r0, EXIT_NONE
    JEQ @stay
    CMP r0, EXIT_END
    JEQ @stay               ; endings arrive in M17
    PUSH r6
    CALL enter_room         ; (clobbers r0-r7)
    POP r6
    ; appear just inside the opposite doorway, same row/column (doorways are aligned: LAYOUT.md)
    CMP r6, SIDE_W
    JNE @not_w
    LDI r0, PX_MAX - 1
    ST [px], r0
    JMP remember_entry
@not_w:
    CMP r6, SIDE_E
    JNE @not_e
    LDI r0, 1
    ST [px], r0
    JMP remember_entry
@not_e:
    CMP r6, SIDE_N
    JNE @not_n
    LDI r0, PY_MAX - 1
    ST [py], r0
    JMP remember_entry
@not_n:
    LDI r0, 1
    ST [py], r0
    JMP remember_entry
@stay:                      ; no exit this way: step back inside
    LD r0, [px]
    CALL clamp_x
    ST [px], r0
    LD r0, [py]
    CALL clamp_y
    ST [py], r0
    RET

; the restart point after a detection
remember_entry:
    LD r0, [px]
    ST [enter_x], r0
    LD r0, [py]
    ST [enter_y], r0
    LD r0, [pdir]
    ST [enter_dir], r0
    RET

clamp_x:
    CMP r0, 0
    JGE @lo
    LDI r0, 0
@lo:
    CMP r0, PX_MAX
    JLE @hi
    LDI r0, PX_MAX
@hi:
    RET

clamp_y:
    CMP r0, 0
    JGE @lo
    LDI r0, 0
@lo:
    CMP r0, PY_MAX
    JLE @hi
    LDI r0, PY_MAX
@hi:
    RET

; Use the room's lift / blast door.
use_warp:
    LD r0, [room_rec]
    LDB r1, [r0 + RR_WARP]
    CMP r1, EXIT_NONE
    JEQ @no
    CMP r1, EXIT_END
    JEQ @no
    LDB r0, [r0 + RR_WFLAG]
    CMP r0, EXIT_NONE
    JEQ @go
    PUSH r1
    CALL flag_test
    POP r1
    CMP r0, 0
    JEQ @no
@go:
    MOV r0, r1
    CALL enter_room_at_arrival
@no:
    RET

.data
; border cells of each side (room record order N, S, E, W)
side_start:  .byte 0, 224, 15, 0
side_stride: .byte 1, 1, 16, 16
side_count:  .byte 16, 16, 15, 15
zone_music:  .byte MUS_AMBIENT, MUS_AMBIENT, MUS_AMBIENT, MUS_AMBIENT, MUS_AMBIENT, MUS_AMBIENT, MUS_AMBIENT, MUS_ORACLE
