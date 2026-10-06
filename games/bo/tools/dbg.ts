// Development aid: runs a route, then replays the recorded inputs and prints frames [from, to] with Bo's state
// and the actors of `type`. Run: npx tsx games/bo/tools/dbg.ts <route> <from> <to> [type]
import { Bot, loadGame } from './bot';
import { ROUTES } from './routes';

const [name, fromS, toS, typeS] = process.argv.slice(2);
const from = Number(fromS ?? 0);
const to = Number(toS ?? 1e9);
const type = Number(typeS ?? 0);
const r = ROUTES[name!]!;
const g = await loadGame(r.seed);
const bot = new Bot(g.vm, g.sym);
try {
  r.run(bot);
} catch (e) {
  console.log('ERR', (e as Error).message);
}
const h = await loadGame(r.seed);
const b2 = new Bot(h.vm, h.sym);
for (let f = 0; f < bot.inputs.length; f++) {
  b2.vm.step(bot.inputs[f]!);
  if (f + 1 < from || f + 1 > to) continue;
  const base = b2.S('actors');
  const acts: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = base + i * 22;
    const t = b2.vm.read16(a);
    if (t && (!type || t === type)) acts.push(`${t}:${b2.vm.read16(a + 2) >> 4},${((b2.vm.read16(a + 4) << 16) >> 16) >> 4}/${b2.vm.read16(a + 10)}`);
  }
  console.log(f + 1, 'btn', bot.inputs[f], 'x', b2.x, 'foot', b2.foot, 'vx', b2.vx, 'vy', b2.vy, 'st', b2.state, 'hel', b2.u('helmet'), 'inv', b2.u('inv_t'), 'lives', b2.u('lives'), 'ev', b2.u('ev_n'), b2.u('ev_kind'), b2.u('ev_type'), acts.join(' '));
}
