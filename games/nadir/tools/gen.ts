// npm run nadir:gen — writes every generated file of games/nadir from DESIGN.md, art/ and levels/.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bgAsm } from './bg';
import { floorAsm } from './floorgen';
import { mapAsm, mapPng, readMap } from './maps';
import { spritesAsm, spritesPng, compileAll } from './sprites';
import { tablesAsm } from './tables';
import { previewPng, readMaterials, texturesAsm } from './textures';
import { GAME_DIR, isMain } from './util';
import { musicAsm } from './music';
import { weaponAsm } from './weapon';

export function generated(): Record<string, string | Buffer> {
  const mats = readMaterials();
  const map = readMap('nadir');
  const sprites = compileAll();
  return {
    'tables.gen.asm': tablesAsm(),
    'textures.gen.asm': texturesAsm(mats),
    'bg.gen.asm': bgAsm(),
    'floor.gen.asm': floorAsm(),
    'map.gen.asm': mapAsm(map),
    'sprites.gen.asm': spritesAsm(sprites),
    'weapon.gen.asm': weaponAsm(),
    'music.gen.asm': musicAsm(),
    'art/sprites.png': spritesPng(sprites.filter((s) => !s.box)),
    'art/textures.png': previewPng(mats),
    'levels/nadir.png': mapPng(map),
  };
}

if (isMain(import.meta.url))
  for (const [file, data] of Object.entries(generated())) {
    writeFileSync(join(GAME_DIR, file), data);
    console.log(`wrote games/nadir/${file}`);
  }
