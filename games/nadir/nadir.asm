; NADIR - a first-person shooter for QR Console (games/nadir/DESIGN.md, PLAN.md Part 4).
; Main file: the generated data, the engine and the frame loop. M27: the player, doors and masked walls in the
; whole level (the feel build).
.title "NADIR"

.include "tables.gen.asm"
.include "textures.gen.asm"
.include "bg.gen.asm"
.include "map.gen.asm"
.include "floor.gen.asm"
.include "defs.asm"
.include "math.asm"
.include "player.asm"
.include "world.asm"
.include "light.asm"
.include "ray.asm"
.include "walls.asm"
.include "floor.asm"
.code

init:
    FARCOPY texram, tex_x, TEX_BYTES
    FARCOPY coderam, code_x, CODE_BYTES
    FARCOPY bgram, bg_x, BG_BYTES
    FARCOPY map, map_x, MAP_CELLS
    FARCOPY lmap, lmap_x, MAP_CELLS
    FARCOPY zmap, zmap_x, MAP_CELLS
    CALL world_init
    CALL ray_init
    LDI r0, POSE_START
    ST [dbg_pose], r0
    RET

update:
    LD r0, [tick]
    ADD r0, 1
    ST [tick], r0
    SYS BTN
    ST [btn], r0
    SYS BTNP
    ST [btnp], r0
    CALL player
    CALL world
    ; ---- adaptive pacing (DESIGN §3.11): an image whose rays met many masked planes is drawn in the next frame
    LD r0, [pace]
    CMP r0, 0
    JEQ @image
    LDI r0, 0
    ST [pace], r0
    JMP @draw
@image:
    CALL ray_frame
    CALL light_frame
    CALL cast_all
    LD r0, [mcount]
    CMP r0, PACE_MCOLS
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
    CALL draw_masks
    RET
