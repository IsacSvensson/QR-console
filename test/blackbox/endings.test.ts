import { beforeAll, describe, expect, it } from 'vitest';
import { buildBlackbox, runReplay, type FrameView } from './oracle';

// M17 acceptance: sections 4-7, the bosses, the four endings. PLAN.md Part 2.
let bb: Awaited<ReturnType<typeof buildBlackbox>>;
beforeAll(async () => {
  bb = await buildBlackbox();
});

const popcount = (m: number) => m.toString(2).split('').filter((c) => c === '1').length;
/** DESIGN.md §2.2, deliberately the long form */
const acc = (done: number, hit: number) => Math.floor(((974 + popcount(done & hit)) * 1000) / (1000 + popcount(done)));
const fmt = (t: number) => `${Math.floor(t / 10)}.${t % 10}%`;

function textBuf(v: FrameView) {
  let s = '';
  for (let a = v.S('text_buf'); v.vm.read8(a); a++) s += String.fromCharCode(v.vm.read8(a));
  return s;
}
const ev = (v: FrameView, n: number) => ((v.vm.read8(v.S('events') + (n >> 3)) >> (n & 7)) & 1) === 1;

interface Played {
  final: FrameView;
  boxes: string[]; // every dialogue text shown, in order
  masksBeforeLast: { done: number; hit: number } | null;
  events: Set<string>;
}
function play(name: string): Played {
  const boxes: string[] = [];
  let prevMode = -1;
  let prevDone = 0;
  let prevHit = 0;
  let masksBeforeLast: Played['masksBeforeLast'] = null;
  let final: FrameView | null = null;
  const events = new Set<string>();
  runReplay(bb, name, (v) => {
    const r = (n: string) => v.vm.read16(v.S(n));
    if (v.mode === v.S('M_DIALOG') && (prevMode !== v.S('M_DIALOG') || r('reveal') === 0)) {
      const t = textBuf(v);
      if (boxes[boxes.length - 1] !== t) boxes.push(t);
    }
    // the masks just before the last prediction resolves (the ending's "before")
    if (r('pred_done') !== prevDone) {
      masksBeforeLast = { done: prevDone, hit: prevHit };
      prevDone = r('pred_done');
      prevHit = r('pred_hit');
    }
    prevMode = v.mode;
    final = v;
  });
  const v = final!;
  for (let i = 1; i <= 20; i++) if (ev(v, v.S(`EV_D${i}`))) events.add(`D${i}`);
  for (let i = 1; i <= 10; i++) if (ev(v, v.S(`EV_L${i}`))) events.add(`L${i}`);
  for (let i = 1; i <= 8; i++) if (ev(v, v.S(`EV_P${i}`))) events.add(`P${i}`);
  return { final: v, boxes, masksBeforeLast, events };
}

/** The accuracy screen (D20) as DESIGN.md §2.2 says it must read. */
function expectedAccuracyScreen(before: { done: number; hit: number }, done: number, hit: number) {
  return `PREDICTION ACCURACY\n\n${fmt(acc(before.done, before.hit))} ... ${fmt(acc(done, hit))}\n\nTHIS SUBJECT: ${popcount(done & hit)}/${popcount(done)}`;
}

const cache = new Map<string, Played>();
const run = (n: string) => cache.get(n) ?? (cache.set(n, play(n)), cache.get(n)!);

describe('the four endings (M17)', () => {
  it('R1 obedient: every prediction comes true, LEFT at the fork -> ending E1, accuracy 97.4 %', () => {
    const p = run('m17-obedient');
    const r = (n: string) => p.final.vm.read16(p.final.S(n));
    expect(r('mode')).toBe(p.final.S('M_ENDING'));
    expect(r('pred_done')).toBe(0b1111111); // P1-P7
    expect(r('pred_hit')).toBe(0b1111111);
    expect(acc(r('pred_done'), r('pred_hit'))).toBe(974);
    expect(p.events.has('D16'), 'LEFT never learns the truth').toBe(false);
    const screen = p.boxes[p.boxes.length - 1]!;
    expect(screen).toBe(expectedAccuracyScreen(p.masksBeforeLast!, r('pred_done'), r('pred_hit')));
    expect(screen).toContain('97.4% ... 97.4%');
    expect(p.boxes).toContain('EXPERIMENT COMPLETE.\nPREDICTION CONFIRMED.');
  });

  it('R2 refuses Mira, goes right, pulls the cable -> E4 PREDICTION ERROR; before/after and THIS SUBJECT match the model', () => {
    const p = run('m17-cable');
    const r = (n: string) => p.final.vm.read16(p.final.S(n));
    expect(r('mode')).toBe(p.final.S('M_ENDING'));
    expect(r('pred_done')).toBe(0xff);
    expect((r('pred_hit') >> 7) & 1, 'P8 missed').toBe(0);
    expect(r('pred_hit') & 0b100, 'P3 (trust Mira) missed').toBe(0);
    expect(p.boxes.some((b) => b.includes('PREDICTION ERROR'))).toBe(true);
    expect(p.boxes).toContain("NO.\n\nYOU KNOW WHAT YOU EXPECT\nME TO CHOOSE.");
    expect(p.boxes[p.boxes.length - 1]).toBe(expectedAccuracyScreen(p.masksBeforeLast!, r('pred_done'), r('pred_hit')));
  });

  it('R3 chooses what ORACLE forecast -> E2 PREDICTION CONFIRMED; R4 chooses otherwise -> E3 RECALIBRATING', () => {
    for (const [name, confirmed] of [['m17-forecast', true], ['m17-other', false]] as const) {
      const p = run(name);
      const r = (n: string) => p.final.vm.read16(p.final.S(n));
      expect(r('mode'), name).toBe(p.final.S('M_ENDING'));
      expect((r('pred_hit') >> 7) & 1, name).toBe(confirmed ? 1 : 0);
      expect(p.boxes, name).toContain(confirmed ? 'PREDICTION CONFIRMED.' : 'UNEXPECTED.\nRECALIBRATING.');
      // ORACLE's forecast line named the choice it expected
      const forecast = ['DELETE', 'RELEASE', 'LISTEN'][r('final_guess')]!;
      expect(p.boxes, name).toContain(`YOU WILL SELECT ${forecast}.`);
      expect(p.boxes[p.boxes.length - 1], name).toBe(expectedAccuracyScreen(p.masksBeforeLast!, r('pred_done'), r('pred_hit')));
    }
  });

  it('together the full playthroughs (plus the M16 right-hand run) reach every D1-D20, L1-L10 and P1-P8', () => {
    const all = new Set<string>();
    for (const n of ['m17-obedient', 'm17-cable', 'm17-forecast', 'm17-other', 'm16-right']) for (const e of run(n).events) all.add(e);
    const want = [...Array.from({ length: 20 }, (_, i) => `D${i + 1}`), ...Array.from({ length: 10 }, (_, i) => `L${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `P${i + 1}`)];
    expect(want.filter((e) => !all.has(e))).toEqual([]);
  });

  it('the ROM fits in 32 KB', () => {
    const rom = bb.cart.sections.code.length + bb.cart.sections.rodata.length + bb.cart.sections.sound.length;
    console.log(`[size] blackbox ROM ${rom} B of 32768 (${Math.round((rom / 32768) * 100)} %), cartridge ${bb.bytes.length} B`);
    expect(rom).toBeLessThanOrEqual(32768);
  });
});
