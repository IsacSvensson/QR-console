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
  // World 2 SKOGEN
  stump2: [['STUMP_T'], ['STUMP']],
  stump3: [['STUMP_T'], ['STUMP'], ['STUMP']],
  spruce: [
    ['.', 'SPRUCE_T', '.'],
    ['.', 'SPRUCE', '.'],
    ['SPRUCE_T', 'SPRUCE', 'SPRUCE_T'],
    ['.', 'TRUNK', '.'],
  ],
  basket: [['BASKET']],
  carrots: [['CARROTS', 'CARROTS', 'CARROTS', 'CARROTS']],
  // World 4 SNÖ
  snowspruce: [['SPRUCE_ST'], ['SPRUCE_S']],
  cabin: [
    ['CABIN_T', 'CABIN_T'],
    ['CABIN', 'CABIN'],
  ],
  // World 5 GODISLANDET
  lollipop: [['LOLLI'], ['LOLLI_S'], ['LOLLI_S']],
  nest: [['NEST', 'NEST', 'NEST']],
  // World 3 STADEN
  car: [
    ['CARR_L', 'CARR_M', 'CARR_R'],
    ['CARB_L', 'CARB_M', 'CARB_R'],
  ],
  shop: [
    ['BRICK', 'LITWIN', 'BRICK', 'LITWIN', 'BRICK'],
    ['BRICK', 'BRICK', 'BRICK', 'BRICK', 'BRICK'],
    ['AWNING', 'AWNING', 'AWNING', 'AWNING', 'AWNING'],
    ['SHOP_WIN', 'SHOP_WIN', 'SHOP_DOOR', 'SHOP_WIN', 'SHOP_WIN'],
  ],
  lamp: [['LAMP_T'], ['LAMP'], ['LAMP']],
  scaffold: [
    ['SCAFF', 'SCAFF', 'SCAFF', 'SCAFF'],
    ['SCAFF_POST', '.', '.', 'SCAFF_POST'],
    ['SCAFF', 'SCAFF', 'SCAFF', 'SCAFF'],
    ['SCAFF_POST', '.', '.', 'SCAFF_POST'],
  ],
};
