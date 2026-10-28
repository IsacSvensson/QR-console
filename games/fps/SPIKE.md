# FPS SPIKE: can QR Console run a first-person shooter?

Part 4, milestone M26 (`PLAN.md`). This is a feasibility spike, not a game. It answers one question before anyone
commits to a full game: **can the unchanged QR Console VM draw a textured first-person view fast enough to play?**

**Answer (measured, §5): yes.** Rays 2 pixels wide give **30 images per second**, with every frame under 15 100 of
its 50 000 cycles. This needs no runtime change.

## 1. Why this is not a port of genesis-doom

The question that started this was whether [akiyan/genesis-doom](https://github.com/akiyan/genesis-doom), Doom on
the Mega Drive, could be ported. It cannot be ported as it is (DECISIONS D-039):

- It is C code derived from GBADoom (GPL v2). QR Console runs bytecode written in its own assembler (SPEC L6). There
  is no C compiler for the VM, and none is planned.
- It needs the Doom IWAD, which belongs to id Software. The shareware licence allows only unmodified redistribution.
  Doom is also a trademark.
- Doom draws with BSP trees: walls at any angle, floors at any height, several MB of data and 64 KB of RAM. The
  console has 32 KB of ROM (plus 256 KB of xdata), 32 KB of RAM, 128×128 pixels in 16 colours and 50 000 cycles
  per frame.

The spike is therefore **clean-room and original**. It uses a grid raycaster (Wolfenstein-style) written from scratch
in QR Console assembler, with its own art and map. No code or data comes from Doom, GBADoom or genesis-doom.

## 2. Content (`tools/art.ts`, `map.txt`)

### 2.1 Map

`map.txt` has 16 rows of 16 cells. The cell codes are:

| Char | Code | Meaning |
|---|---|---|
| `#` | 1 | brick wall |
| `%` | 2 | stone wall |
| `=` | 3 | tech wall |
| `\|` | 8 | door in a north–south wall line (`DOOR_V`) |
| `-` | 9 | door in an east–west wall line (`DOOR_H`) |
| `.` | 0 | floor |
| `P` | 0 | floor; the player's start, facing east |
| `E` | 0 | floor; the enemy's start |

The border must be wall.

### 2.2 Textures

Each wall code has a 16×16 texture (`TEXTURES`). Colour 0 is not allowed, because `MAP` does not draw it. A wall hit
on a **y side** (a face running east–west) uses the same picture shaded one step darker through the `DARK` table.
Texture column *u* runs along the wall in +x (y sides) or +y (x sides). Texture row *v* runs from top to bottom.

### 2.3 Doors

A door is a texture plane in the **middle** of its cell. It opens by sliding towards −y (`DOOR_V`) or −x
(`DOOR_H`). `dopen` in RAM holds how far each cell's door is open, from 0 to 255; a ray passes where the wall
fraction is < `dopen`/256.

A door opens with B when its cell lies one cell in front of the player. It opens by 4 per frame, stays open for 180
frames and then closes, but never onto the player. The player can walk through when it is open ≥ 240.

### 2.4 Enemy, gun

The enemy is a 16×16 picture with an `alive` and a `dead` pose. It is pre-scaled by nearest neighbour to the screen
sizes 8, 16, 24, 32, 48 and 64 px: pixel (x, y) of size s is source pixel (⌊16x/s⌋, ⌊16y/s⌋). It is stored packed in
xdata and unpacked into RAM at start. The gun (24×16) and its muzzle flash (24×8) live in ROM.

## 3. Engine

### 3.1 Camera

Positions are 8.8 fixed point in cells. Angles run 0..1023 for a full turn, where 0 is east and increasing turns
right (clockwise on the map, with y pointing down). The direction is `(cos8(a), sin8(a))`, where
`sin8(i) = round(256·sin(2πi/1024))` is the `sin_t` table and `cos8(a) = sin8(a + 256)`.

The camera plane is `(−P(sin8 a), P(cos8 a))` with `P(v) = v − ⌊(87·v + 128)/256⌋`. That is 169/256 ≈ 0.66 of v,
computed this way because `v·169` does not fit 16 bits. The field of view is 2·atan(0.66) ≈ 67°, and the focal
length is 97 px.

Ray c of n is at camera-plane position `cam7 = round(((2c+1)/n − 1)·128)` (1.7 fixed point). Its direction is
`dir + ⌊(plane·cam7 + 64)/128⌋`, per component, in 8.8 units. The camera is taken when an image's first ray is cast,
so every ray of the image uses the same camera.

### 3.2 The view buffer

The view is 128×96 pixels in a RAM buffer of 6 144 bytes, made of 16×12 tiles of 32 bytes. The tiles are stored
**in column order**: buffer tile `tx·12 + ty` is screen tile (tx, ty). So pixel (x, y) is at byte
`buf + (x>>3)·384 + y·4 + ((x>>1)&3)`, with the high nibble for even x. A pixel column is a run of bytes 4 apart.

`view_map` (ROM) maps screen tile (tx, ty) to buffer tile `1 + tx·12 + ty`, with tiles at `buf − 32` (tile 0 is
never drawn). One `MAP` call (8 cycles) puts the whole buffer on screen. Ceiling (colour 1, rows 0–47) and floor
(colour 3, rows 48–95) are filled with two `FILL`s per tile column.

### 3.3 Rays

The rays use DDA on the grid in 8.8:

- **Deltas.** The distance between x sides is `recip_t[|rdx|]` = min(32767, round(65536/|rdx|)).
- **First side distance.** This is `fraction·delta >> 8`, computed as two 8×8 products.
- **Tiny components.** A component of 0 or 1 (≤ 1/256) is handled apart. Its first side lies `fraction·256` away
  (saturated to 65535), or never for 0. Its delta is 32767. Capping both at a smaller value broke rays running
  almost along an axis; the oracle found this (D-040).
- **Stepping.** The DDA steps the nearer side (unsigned compare) until it reaches a non-zero cell.
- **Doors.** A `DOOR_V` cell reached through an x side, or a `DOOR_H` cell through a y side, is tested at its middle
  plane. The ray goes on if it leaves the cell first or meets the open part. A door cell reached any other way is
  drawn as a wall with the door texture.
- **Perpendicular distance.** This is `side − delta` for the side hit, or `side − delta/2` for a door, clamped to at
  least 64 (a quarter cell).
- **Wall fraction.** This is the low 16 bits of `(fraction of the camera) << 8 + perp · rd`, along the wall. Then
  `u = fraction >> 12`, and for a door `(fraction − open·256) >> 12`.
- **Wall height.** `h = ⌊97·256 / perp⌋`, at most 388.
- **Per-ray records.** Each ray stores `zb` (perp), `rh` (h), `rcell` (the cell) and `rtx` (u | side << 4) in RAM,
  for the sprites and for the tests.

### 3.4 Wall columns

A wall of height h is centred on row 48. Row y (0..95) shows the wall when `s = 16y + 8 − (768 − 8h)` lies in
[0, 16h). It then shows texel `v = ⌊s/h⌋` of texture column u, which is pixel-centre sampling. Other rows show
ceiling or floor.

`tables.ts` turns this rule into a **run list** for every h from 1 to 388: the first wall row, then pairs of
(texel, rows). The lists are packed in xdata and unpacked into RAM, 8 470 bytes.

### 3.5 Drawing a column, and the ray width

The texture column is copied to `scratch` with `COPY`. For each run, the texel byte is loaded and the **last `rows`
stores of an unrolled block** of 96 stores (`duffN.gen.asm`) are called, with the base register set so that they
land on the right rows. A run costs about 12 cycles plus 1 per row.

The ray width is a build option (`config.asm`):

- **1 px:** 128 rays. Each row is a read-modify-write of a nibble, 4 instructions.
- **2 px:** 64 rays. Each row is one `STB`. This is the shipped build.
- **4 px:** 32 rays. Each row is one `ST`.

`RAY_CHUNK` rays are cast per frame. The first chunk takes the camera and the last presents the image, so the
screen keeps the previous image in between.

### 3.6 Presenting

The buffer goes on screen with `MAP`. The enemy is drawn next:

- **Projection.** It is projected with the image's camera: depth = rel·dir and side = rel·(−dir y, dir x). Both use
  an 8.8×8.8 multiply exact to 1/128.
- **Screen position.** Its centre is at x = 64 + 97·side/depth, and its feet stand on the floor line 48 + h/2.
- **Size.** The size is the pre-scaled one nearest to 0.75·h.
- **Drawing.** It is drawn as columns of 8×8 tiles, one `MAP` each. A tile column is drawn only where the enemy is
  nearer than the wall at the ray through the middle of that column. Occlusion is therefore coarse, at 8-pixel
  granularity.
- **Pain.** It blinks while in pain.

After the enemy come the gun, the muzzle flash, a red frame when hurt, and the status bar (health, ammo, images per
second).

### 3.7 Error budget (what the tests allow)

The tests compare every ray against a floating-point cast from the same camera (§3.1). The engine's DDA arithmetic
may be off by `(2 + steps)/256 + 0.4 %·t` in the ray parameter t, so the oracle also casts the ray from the camera
moved by that much along each axis (9 casts).

The engine's hit must equal one of these casts in cell, side, distance and texture column. A small exception holds
at a texture edge: the next cell along the same wall line, with the same wall code, may be hit, because it shows the
same picture. Wall pixels, the presented screen, the enemy's tile columns and the gun are then compared **exactly**,
pixel for pixel, with what the art and §3.4–3.6 say.

## 4. The game around it

| Button | Action |
|---|---|
| UP / DOWN | walk |
| LEFT / RIGHT | turn |
| B + LEFT / RIGHT | strafe |
| B (pressed) | open the door ahead |
| A | fire; held fires every 12 frames |

The player starts with 100 health and 50 ammo, and has a collision box 0.31 cells half-wide.

The enemy wakes when the player is within 6 cells (|dx| + |dy|) or is shot. It then walks towards the player
(5/256 cells per frame per axis), stops 1.25 cells away and hits for 5 every 50 frames when within about 1.5 cells.
Three hits kill it. A hit counts when the enemy covers the middle of the last image and is nearer than the wall
there.

The game has no death, no levels, no pick-ups and no music. That is deliberate: this is a spike.

## 5. Measurements (`bench/fps.md`, `npm run test:fps`)

All of these are measured in the headless VM on the four recorded replays. None is a device measurement.

| | 1 px (128 rays) | **2 px (64 rays)** | 4 px (32 rays) |
|---|---:|---:|---:|
| Max cycles per whole image | 99 120 | **29 564** | 16 155 |
| Frames per image if a frame may use 25 000 cycles | 4 (15 /s) | **2 (30 /s)** | 1 (60 /s) |
| … if a frame may use the whole budget of 50 000 | 2 (30 /s) | 1 (60 /s) | 1 (60 /s) |

**Shipped build** (2 px, 32 rays per frame):

- **Speed:** 30.0 images/s, with at most 15 090 cycles per frame and 0 overruns.
- **Size:** ROM 12.8 KB of 32 KB, of which code is 4.2 KB. RAM holds 24.0 KB of variables, of which the view
  buffer is 6 KB.
- **Transfer:** the cartridge is 9.5 KB, which is a 56-frame QR loop (8.4 s).

Of an image's cycles, 56 % go to drawing wall columns and 40 % to the rays. Everything else (image set-up,
presenting, game logic) is under 4 %.

**Gate (PLAN M26):** ≥ 20 images/s with 2-pixel rays and no runtime change. **Passed.** ISA 3 is not needed for
this; see DECISIONS D-040.

## 6. If this becomes a game (proposal for the human)

The measurements leave room for a real game within the current VM.

- **Speed.** At 30 images/s a frame uses at most about 15 000 cycles. That leaves about 10 000 below the replays'
  25 000 ceiling, and 35 000 below the hard budget, for game logic and sprites.
- **ROM.** About 19 KB is still free.
- **xdata.** It can hold maps and sprite sheets, unpacked per level.

A possible Part 4:

1. **M27 (engine).** 32×32 maps per level in xdata, more wall textures (≈ 0.5 KB each with the shaded copy) and
   distance shading.
2. **M28 (enemies).** 3–4 enemy types with walk, attack, pain and death frames. Sprite sizes would be unpacked on
   demand, since RAM cannot hold them all. Exact per-ray occlusion would replace the 8-pixel tile columns.
3. **M29 (game).** Pick-ups (health, ammo, keys), keyed doors, death and restart, exit switch.
4. **M30 (content).** An episode of 4–6 levels, music, and a picture-code save.
5. **M31.** Delivery.

Things that would want a generic ISA 3 syscall later are a scaled sprite or texture-column blit. They are **not
needed** for the spike's frame rate. They might matter if a game wants 1-pixel rays or many large sprites; that is
the human's call (D-040).
