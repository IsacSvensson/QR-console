// Development aid: screenshots of a level as the VM draws it. Enters the level with the dbg_level hook, holds →
// (pushing) and writes .tmp/shot-<level>-<frame>.png at the given frames (scale 3).
// Run: npx tsx games/bo/tools/shot.ts <level id> <frame> [frame ...]
import { mkdirSync } from 'node:fs';
import { writeFramePng } from '@qrc/tools';
import { B, loadGame } from './bot';
import { LEVEL_ORDER, levelIds } from './lvl';

const [id, ...frames] = process.argv.slice(2);
const g = await loadGame(1);
const ids = levelIds();
const index = ids.indexOf(id!);
if (index < 0) throw new Error(`no level ${id} (have ${ids.join(', ')}; order ${LEVEL_ORDER.length})`);
const S = (n: string) => g.sym.get(n)!;
g.vm.step(0);
g.vm.write16(S('dbg_level'), index + 1);
const want = new Set(frames.map(Number));
const last = Math.max(...want);
mkdirSync('.tmp', { recursive: true });
for (let f = 1; f <= last; f++) {
  g.vm.step(g.vm.read16(S('mode')) === S('M_PLAY') ? B.R : 0);
  if (want.has(f)) {
    writeFramePng(`.tmp/shot-${id}-${f}.png`, g.vm.fb, 3);
    console.log(`.tmp/shot-${id}-${f}.png`);
  }
}
