// Multi-tile patterns that levels place with `prefab <name>` (and `fg <name>` for foreground) — part of the level
// sources (FORMAT.md). Rows top to bottom; each cell a tile name from tiles.ts (T.* or TW.*), or '.' for nothing.
export const PREFABS: Record<string, string[][]> = {
  house: [
    ['.', 'ROOF_L', 'ROOF_M', 'ROOF_M', 'ROOF_R', '.'],
    ['ROOF_L', 'ROOF_M', 'ROOF_M', 'ROOF_M', 'ROOF_M', 'ROOF_R'],
    ['.', 'CORNER_L', 'WALL', 'WALL', 'CORNER_R', '.'],
    ['.', 'CORNER_L', 'WINDOW', 'WINDOW', 'CORNER_R', '.'],
    ['.', 'CORNER_L', 'DOOR_T', 'WALL', 'CORNER_R', '.'],
    ['.', 'CORNER_L', 'DOOR_B', 'WALL', 'CORNER_R', '.'],
  ],
  bin: [['BIN_TOP'], ['BIN']],
  bins2: [
    ['BIN_TOP', 'BIN_TOP'],
    ['BIN', 'BIN'],
  ],
  fence: [
    ['FENCE_T', 'FENCE_T', 'FENCE_T', 'FENCE_T'],
    ['FENCE', 'FENCE', 'FENCE', 'FENCE'],
  ],
  garage: [
    ['GARAGE_ROOF', 'GARAGE_ROOF', 'GARAGE_ROOF', 'GARAGE_ROOF', 'GARAGE_ROOF', 'GARAGE_ROOF', 'GARAGE_ROOF'],
    ['GARAGE_WALL', 'GARAGE_DOOR', 'GARAGE_DOOR', 'GARAGE_DOOR', 'GARAGE_DOOR', 'GARAGE_DOOR', 'GARAGE_WALL'],
    ['GARAGE_WALL', 'GARAGE_DOOR', 'GARAGE_DOOR', 'GARAGE_DOOR', 'GARAGE_DOOR', 'GARAGE_DOOR', 'GARAGE_WALL'],
  ],
  tree: [
    ['CROWN', 'CROWN', 'CROWN'],
    ['.', 'TRUNK', '.'],
    ['.', 'TRUNK', '.'],
  ],
  hedge: [
    ['HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE'],
    ['HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE'],
    ['HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE'],
  ],
  bush: [
    ['HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE'],
    ['HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE'],
    ['HEDGE', 'HEDGE', 'HEDGE', 'HEDGE', 'HEDGE'],
  ],
};
