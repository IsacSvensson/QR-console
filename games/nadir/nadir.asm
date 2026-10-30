; NADIR - a first-person shooter for QR Console (games/nadir/DESIGN.md, PLAN.md Part 4).
; Main file: the generated data, the engine and the frame loop. M27: the player, doors and masked walls in the
; whole level (the feel build). M28: sprites and 3D boxes. M29: the weapon, Kryp, health, death and restart.
.title "NADIR"

.include "tables.gen.asm"
.include "textures.gen.asm"
.include "bg.gen.asm"
.include "map.gen.asm"
.include "sprites.gen.asm"
.include "weapon.gen.asm"
.include "floor.gen.asm"
.include "defs.asm"
.include "math.asm"
.include "player.asm"
.include "world.asm"
.include "light.asm"
.include "ray.asm"
.include "walls.asm"
.include "floor.asm"
.include "sprites.asm"
.include "boxes.asm"
.include "enemies.asm"
.include "weapon.asm"
.include "game.asm"
.code

init:
    FARCOPY texram, tex_x, TEX_BYTES
    FARCOPY coderam, code_x, CODE_BYTES
    FARCOPY bgram, bg_x, BG_BYTES
    FARCOPY map, map_x, MAP_CELLS
    FARCOPY lmap, lmap_x, MAP_CELLS
    FARCOPY zmap, zmap_x, MAP_CELLS
    CALL ray_init
    LDI r0, 1                       ; control scheme S1 (DESIGN §5): B + LEFT/RIGHT walks sideways
    ST [ctl_s1], r0
    JMP game_reset

update:
    LD r0, [tick]
    ADD r0, 1
    ST [tick], r0
    SYS BTN
    ST [btn], r0
    SYS BTNP
    ST [btnp], r0
    CALL game_frame
    ; ---- adaptive pacing (DESIGN §3.11): an image whose estimated cost is high is drawn in the next frame (pace = 1);
    ; when the rays alone reach PACE_HEAVY, the sprites are chosen in the next frame and it is drawn in the third
    ; (pace = 2, then 1)
    LD r0, [pace]
    CMP r0, 0
    JEQ @image
    CMP r0, 2
    JNE @p1
    CALL spr_frame                  ; a heavy image's second frame: the sprites only
    LDI r0, 1
    ST [pace], r0
    RET
@p1:
    LDI r0, 0
    ST [pace], r0
    JMP @draw
@image:
    CALL ray_frame
    CALL light_frame
    CALL cast_all
    LD r0, [ncast]                  ; the estimate of this image's cost
    MUL r0, PACE_W_CAST
    LD r1, [mcount]
    MUL r1, PACE_W_MASK
    ADD r0, r1
    LD r1, [dbg_flags]
    AND r1, FL_NOPACE
    JNZ @spr
    CMP r0, PACE_HEAVY
    JB @spr
    LDI r0, 2
    ST [pace], r0
    RET
@spr:
    PUSH r0
    CALL spr_frame
    POP r0
    LD r1, [spr_rects]
    MUL r1, PACE_W_RECT
    ADD r0, r1
    CMP r0, PACE_EST
    JB @draw
    LD r0, [dbg_flags]
    AND r0, FL_NOPACE
    JNZ @draw
    LDI r0, 1
    ST [pace], r0
    RET
@draw:
    CALL draw_bg
    CALL floor_lines
    CALL draw_lamps
    CALL draw_walls
    LDI r0, 0
    CALL draw_masks
    CALL draw_sprites
    LDI r0, 1
    CALL draw_masks
    JMP draw_weapon
