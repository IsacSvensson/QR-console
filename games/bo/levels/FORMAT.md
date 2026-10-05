# Level source format (`*.lvl`)

One text file per level. `tools/levels.ts` turns every file into the ROM level table (`levels.gen.asm`) and a
preview image (`<id>.png`). The tests read these files with their own reader (`test/bo/oracle.ts`) and compare
the engine's RAM against them. `#` starts a comment.

## Coordinates

- A level is up to 384 **columns** wide; a column is 8 px. Rows are counted **0–31 from the top**; the engine
  keeps all 32 rows of every column in RAM (`index = column × 32 + row`).
- Heights are counted in tiles **from the bottom**: ground of height `h` fills rows `32 − h … 31`.
  A 16-row level shows rows 16–31 (row 16 is behind the HUD); a 32-row level scrolls vertically.
- In the object list, a height `y` is the **bottom edge** of the object's lowest cell: an object at `y` occupies
  row `31 − y` and up. `g` means the ground height at the object's column, `g+2` two tiles above it.

## Header

```
name   UPPFARTEN      # shown on the level card
world  1              # 1..5: tiles, music, parallax
rows   16             # 16 or 32
start  6              # Bo's start column (he stands on the ground there)
music  1              # music track
```

## `terrain` — the ground profile, left to right

| Command | Columns | Meaning |
|---|---|---|
| `h N` | – | start height (only before the first segment) |
| `flat N` | N | flat ground |
| `up22 N` / `down22 N` | 2N | 22.5° hill, N steps of one tile over two columns |
| `up45 N` / `down45 N` | N | 45° hill, one tile per column |
| `gap N` | N | a pit: no ground at all (falling in costs a life) |
| `liquid N` | N | a pit with water (or chocolate) one tile below the ground line |
| `step D` | – | the height changes by D (−8..7, not 0): a wall up or a drop |
| `mat normal\|sand\|ice\|alt` | – | surface of the following flat columns (`alt` = the world's second ground, e.g. a lawn) |
| `liq water\|choc` | – | the liquid of the following `liquid` segments |

Every column below the surface is ground fill. Hills decelerate going up and accelerate going down
(DESIGN.md §3.4); a terrain crest launches Bo only where the ground ends.

## `objects` — sorted by column

Each line: `<column> <kind> <arguments>`. Objects are drawn over the terrain in file order.

| Kind | Arguments | Cells |
|---|---|---|
| `apples` | `y n` | a row of n apples from the column to the right |
| `column` | `y n` | a column of n apples upwards |
| `apple` | `y` | one apple (e.g. the one sticking out of a hedge) |
| `arc` | `v kind [n]` | apples along a jump that starts in this column at speed v (1/16 px per frame). kind `hold` (ollie, A held), `tap`, `r45`/`r22` (launched from the lip of a ramp that ends in this column), `r45a`/`r22a` (the same with A at the lip). One apple every 16 px, computed with the engine's physics (`tools/physics.ts`) |
| `block` | `y [w h]` | solid block(s) |
| `weak` | `y [w h]` | a weak obstacle: breaks when Bo lands on it (DESIGN §3.7) |
| `bounce` | `y [w h]` | trampoline / jelly |
| `bar` | `y [w h]` | low bar: solid in its upper half, crouch to pass under |
| `tile` | `name y [w h]` | any tile by name (decor) |
| `platform` | `y w` | a one-way plank (w ≥ 2) |
| `rail` | `y w` | a flat rail (w ≤ 16) |
| `raild` | `y n up\|down` | a diagonal rail of n cells |
| `ramp45` / `ramp45l` | `[n]` | a kicker on the ground, n tiles high, facing right / left; its back is a wall |
| `ramp22` / `ramp22l` | `[n]` | a 22.5° kicker (2 columns per tile of height) |
| `box` | `y apples\|apple\|pommes\|godis` | a box that breaks when landed on (`apple` = STORA ÄPPLET) |
| `star` | `y 1\|2\|3` | a star |
| `part` | `y` | the level's skate part |
| `flag` | – | a checkpoint flag on the ground |
| `goal` | – | the goal flag |
| `sign` | `right\|a\|b\|down` | a picture sign on the ground |
| `pickup` | `pommes\|godis y` | a power-up lying in the level |
| `prefab` | `name [y]` | a multi-tile pattern from `tools/prefabs.ts` (bottom-left at the column and y) |
| `fg` | `name y` | a foreground pattern drawn over Bo (sparse hedges hiding secrets); not part of the grid |
| `enemy` | `type [y]` | an enemy spawned when the camera comes near |

Apples (from any apple object) are only placed in cells that are still empty.

## ROM format (`levels.gen.asm`)

`level_table` has 12 bytes per level: terrain pointer, object pointer, width (words), start height, rows,
world, start column, music, 0.

**Terrain:** one byte per segment, `type << 5 | (length − 1)`: 0 flat, 1 up22 (length in steps), 2 down22,
3 up45, 4 down45, 5 gap, 6 liquid (longer segments are split). Type 7 is special, by its low 5 bits:
0–15 a step of `value − 8` tiles, 16–19 material normal/sand/ice/alt, 20–21 liquid water/chocolate, 31 end.

**Objects:** `column & 255`, `column >> 8 | type << 1`, `row`, `param`, then extra bytes; `255 255` ends the
list. `row` is the bottom row of the object. Types: 1 tile (param = code), 2 rectangle (param = code, extra
`(w−1) | (h−1) << 4`), 3 apples (param = count, then count − 1 bytes `dx << 4 | dy` with dy a signed nibble),
4 box (param = content: 0 apples, 1 big apple, 2 pommes, 3 godis), 5 star (param = star − 1), 6 part, 7 flag,
8 goal, 9 enemy (param = type), 10 foreground (param = prefab), 11 ramp (param = `(n−1) | kind << 4`, kinds
ramp45, ramp45l, ramp22, ramp22l), 12 diagonal rail (param = `(n−1) | down << 7`), 13 platform (param =
width), 14 sign (param = kind: right, a, b, down), 15 pick-up (param = tile code), 16 prefab (param = id).

## Classes

What each tile does is its class (`tools/tiles.ts`): EMPTY, SOLID, SLOPE, RAMP (a kicker: like a slope but
without deceleration), ONEWAY, RAIL, HAZARD, WEAK, BOX, BOUNCE, BAR, SAND, ICE, APPLE, STAR, PICKUP.
