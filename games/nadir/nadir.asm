; NADIR - a first-person shooter for QR Console (games/nadir/DESIGN.md, PLAN.md Part 4).
; Main file: the generated data, the engine and the frame loop. M26: the renderer prototype.
.title "NADIR"

.include "tables.gen.asm"
.include "textures.gen.asm"
.include "bg.gen.asm"
.include "map.gen.asm"
.include "floor.gen.asm"
.include "defs.asm"
.include "math.asm"
.include "camera.asm"
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
    CALL camera
    CALL ray_frame
    CALL light_frame
    CALL draw_bg
    CALL floor_lines
    CALL draw_lamps
    CALL cast_all
    CALL draw_walls
    RET
