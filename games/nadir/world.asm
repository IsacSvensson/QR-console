; NADIR - the world (DESIGN §3.10, §3.12): key triggers, pickups and the doors' state machine, once per frame after
; the player.
.code

; Once: the door table from ROM (map.gen.asm).
world_init:
    LDI r0, doors
    LDI r1, 0
    LDI r2, door_init
    LDI r3, NUM_DOORS * DOOR_SIZE
    SYS COPY
    LDI r0, props
    LDI r1, 0
    LDI r2, prop_init
    LDI r3, NUM_PROPS * PROP_SIZE
    SYS COPY
    RET

world:
    ; ---- key triggers: standing in a key cell gives its bit
    LD r1, [cam_x]
    SHR r1, 8
    LD r2, [cam_y]
    SHR r2, 8
    SHL r2, 5
    ADD r2, r1                      ; the player's cell
    LDI r3, 0
@key:
    CMP r3, NUM_KEYS * 4
    JAE @doors
    LD r0, [r3 + key_tab]
    CMP r0, r2
    JNE @nextkey
    LD r0, [r3 + key_tab + 2]
    LD r1, [keys]
    OR r1, r0
    ST [keys], r1
@nextkey:
    ADD r3, 4
    JMP @key
@doors:
    ; ---- pickups (DESIGN §3.12): within P_RAD + PICK_HALF of the player on both axes
    LDB r6, [pnear]
    LDB r0, [pnear + 1]
    OR r6, r0
    LDB r0, [pnear + 2]
    OR r6, r0
    JZ @doors2
    LDI r6, props
@pick:
    CMP r6, props + NUM_PROPS * PROP_SIZE
    JAE @doors2
    LDI r7, pnear
    CALL in_set
    JZ @np
    LD r0, [cam_x]
    LD r1, [r6 + P_X]
    SUB r0, r1
    ADD r0, P_RAD + PICK_HALF - 1
    CMP r0, 2 * (P_RAD + PICK_HALF) - 1
    JAE @np
    LDB r0, [r6 + P_ALIVE]
    CMP r0, 0
    JEQ @np
    LDB r5, [r6 + P_TYPE]
    SHL r5, 4
    LDB r5, [r5 + spr_type + 3]     ; pick kind
    CMP r5, 0
    JEQ @np
    LD r0, [cam_y]
    LD r1, [r6 + P_Y]
    SUB r0, r1
    ADD r0, P_RAD + PICK_HALF - 1
    CMP r0, 2 * (P_RAD + PICK_HALF) - 1
    JAE @np
    CMP r5, 1                       ; only when needed (DESIGN §6.1): a medkit below HP_MAX, ammunition below AMMO_MAX
    JNE @am
    LD r0, [hp]
    CMP r0, HP_MAX
    JGE @np
    ADD r0, MED_HP
    CMP r0, HP_MAX
    JLE @h1
    LDI r0, HP_MAX
@h1:
    ST [hp], r0
    JMP @take
@am:
    LD r0, [w_res]
    CMP r0, AMMO_MAX
    JGE @np
    ADD r0, AMMO_PICK
    CMP r0, AMMO_MAX
    JLE @a1
    LDI r0, AMMO_MAX
@a1:
    ST [w_res], r0
@take:
    LDI r0, 0
    STB [r6 + P_ALIVE], r0
    LDI r1, picked_med
    CMP r5, 1
    JEQ @cnt
    LDI r1, picked_ammo
@cnt:
    LD r0, [r1]
    ADD r0, 1
    ST [r1], r0
@np:
    ADD r6, PROP_SIZE
    JMP @pick
@doors2:
    LDI r6, doors
@door:
    CMP r6, doors + NUM_DOORS * DOOR_SIZE
    JAE @done
    ; ---- near: the player within DOOR_REACH of the door's centre on both axes; allowed: no key or the key held
    LD r0, [r6 + D_CELL]
    MOV r1, r0
    AND r1, 31
    SHL r1, 8
    ADD r1, 128                     ; centre x
    SHR r0, 5
    SHL r0, 8
    ADD r0, 128                     ; centre y
    LDI r5, 0
    LD r2, [cam_x]
    SUB r2, r1
    ADD r2, DOOR_REACH - 1          ; |dx| < DOOR_REACH  <=>  dx + REACH - 1 in 0 .. 2 REACH - 2
    CMP r2, 2 * DOOR_REACH - 1
    JAE @far
    LD r2, [cam_y]
    SUB r2, r0
    ADD r2, DOOR_REACH - 1
    CMP r2, 2 * DOOR_REACH - 1
    JAE @far
    LDI r5, 1
@far:
    LDI r4, MAT_DOOR
    LDB r3, [r6 + D_KEY]
    CMP r3, 0
    JEQ @allowed
    LD r1, [keys]
    AND r1, r3
    JNZ @allowed
    LDI r4, MAT_LOCKEDDOOR
    LDI r5, 0                       ; locked: never "near and allowed"
@allowed:
    STB [r6 + D_MAT], r4
    ; ---- r5 = near and allowed; the state machine
    LDB r0, [r6 + D_STATE]
    CMP r0, 1
    JEQ @opening
    CMP r0, 2
    JEQ @open
    CMP r0, 3
    JEQ @closing
    CMP r5, 0                       ; closed
    JEQ @next
    LDI r0, 1
    STB [r6 + D_STATE], r0
    JMP @next
@opening:
    LD r1, [r6 + D_OPEN]
    ADD r1, DOOR_SPEED
    CMP r1, 256
    JLT @setopen
    LDI r1, 256
    LDI r0, 2
    STB [r6 + D_STATE], r0
    LDI r0, DOOR_WAIT
    STB [r6 + D_TIMER], r0
@setopen:
    ST [r6 + D_OPEN], r1
    JMP @next
@open:
    LDI r0, DOOR_WAIT
    CMP r5, 0
    JNE @settimer
    LDB r0, [r6 + D_TIMER]
    SUB r0, 1
    JNZ @settimer
    LDI r1, 3
    STB [r6 + D_STATE], r1
@settimer:
    STB [r6 + D_TIMER], r0
    JMP @next
@closing:
    CMP r5, 0
    JEQ @shut
    LDI r0, 1
    STB [r6 + D_STATE], r0
    JMP @next
@shut:
    LD r1, [r6 + D_OPEN]
    SUB r1, DOOR_SPEED
    CMP r1, 0
    JGT @setopen
    LDI r1, 0
    STB [r6 + D_STATE], r1
    JMP @setopen
@next:
    ADD r6, DOOR_SIZE
    JMP @door
@done:
    RET
