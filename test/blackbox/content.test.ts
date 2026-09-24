import { beforeAll, describe, expect, it } from 'vitest';
import { buildBlackbox, runReplay, type FrameView } from './oracle';

// M16 acceptance: content of sections 0-3. PLAN.md Part 2.
let bb: Awaited<ReturnType<typeof buildBlackbox>>;
beforeAll(async () => {
  bb = await buildBlackbox();
});

// ---- access codes: an independent encoder (DESIGN.md §2.4, code.asm header) ---------------------
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const KEY = [19, 7, 28, 3, 22, 11, 30, 14];
export function referenceCode(f: { section: number; done: number; hit: number; emp: number; logs: number; mira: number; charges: number }): string {
  const bits: number[] = [];
  const put = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1);
  };
  put(f.section, 3);
  put(f.done, 8);
  put(f.hit, 8);
  put(f.emp, 3);
  put(f.logs, 3);
  put(f.mira, 3);
  put(f.charges, 3);
  const bytes = [0, 1, 2, 3].map((b) => bits.slice(b * 8, b * 8 + 8).concat([0, 0, 0, 0, 0, 0, 0, 0]).slice(0, 8).reduce((a, x) => (a << 1) | x, 0));
  const chk = bytes.reduce((a, b) => (a * 3 + b) & 0xffff, 0x5a) & 511;
  put(chk, 9);
  return KEY.map((k, i) => ALPHABET[bits.slice(i * 5, i * 5 + 5).reduce((a, x) => (a << 1) | x, 0) ^ k]).join('');
}

function textBuf(v: FrameView) {
  let s = '';
  for (let a = v.S('text_buf'); v.vm.read8(a); a++) s += String.fromCharCode(v.vm.read8(a));
  return s;
}
const ev = (v: FrameView, n: number) => ((v.vm.read8(v.S('events') + (n >> 3)) >> (n & 7)) & 1) === 1;

interface RunSummary {
  rooms: string[];
  codes: { room: string; shown: string; expected: string }[];
  final: FrameView;
}
function play(name: string): RunSummary {
  const rooms: string[] = [];
  const codes: RunSummary['codes'] = [];
  let last: FrameView | null = null;
  let prevMode = -1;
  runReplay(bb, name, (v) => {
    if (rooms[rooms.length - 1] !== v.room.id && v.mode !== v.S('M_TITLE')) rooms.push(v.room.id);
    if (v.mode === v.S('M_DIALOG') && prevMode !== v.S('M_DIALOG')) {
      const t = textBuf(v);
      if (t.startsWith('ACCESS CODE')) {
        const r = (n: string) => v.vm.read16(v.S(n));
        const section = Number(v.room.id.split('.')[0]);
        codes.push({ room: v.room.id, shown: t.trim().split(/\s+/).pop()!, expected: referenceCode({ section, done: r('pred_done'), hit: r('pred_hit'), emp: r('emp_uses'), logs: r('logs_read'), mira: r('mira_followed'), charges: r('charges') }) });
      }
    }
    prevMode = v.mode;
    last = v;
  });
  return { rooms, codes, final: last! };
}

describe('sections 0-3 (M16)', () => {
  const LAYOUT_FLAGS = ['BADGE', 'L1', 'KEYNOTE', 'CARD', 'DIRDOOR', 'L3', 'EMP', 'SHUTTER'];

  it('m16-left: obeys Mira at P1 (hit), reads L2 (curiosity), never sees D5; every flag of sections 1-3; ends on the lift down', () => {
    const r = play('m16-left');
    const v = r.final;
    const S = v.S;
    for (const f of LAYOUT_FLAGS) expect(v.flag(f), f).toBe(true);
    for (const e of ['D1', 'D2', 'D3', 'D4', 'D6', 'L1', 'L2', 'L3', 'P1']) expect(ev(v, S(`EV_${e}`)), e).toBe(true);
    expect(ev(v, S('EV_D5')), 'D5 is only on the right-hand path').toBe(false);
    expect(ev(v, S('EV_P2ASK')), 'P2 asked in the armory').toBe(true);
    expect(v.vm.read16(S('pred_done')) & 1).toBe(1);
    expect(v.vm.read16(S('pred_hit')) & 1).toBe(1);
    expect(v.vm.read16(S('mira_followed'))).toBe(1);
    expect(v.vm.read16(S('logs_read'))).toBe(1);
    const i33 = r.rooms.indexOf('3.3');
    expect(r.rooms[i33 + 1]).toBe('3.2');
    expect(r.rooms[r.rooms.length - 1]).toBe('4.1');
  });

  it('m16-right: goes right first (P1 miss), sees D5 in the alarm centre, still reaches the lift', () => {
    const r = play('m16-right');
    const v = r.final;
    const S = v.S;
    for (const f of LAYOUT_FLAGS) expect(v.flag(f), f).toBe(true);
    expect(ev(v, S('EV_D5'))).toBe(true);
    expect(ev(v, S('EV_P1'))).toBe(true);
    expect(v.vm.read16(S('pred_done')) & 1).toBe(1);
    expect(v.vm.read16(S('pred_hit')) & 1).toBe(0);
    expect(v.vm.read16(S('mira_followed'))).toBe(0);
    expect(v.vm.read16(S('logs_read'))).toBe(0);
    const i33 = r.rooms.indexOf('3.3');
    expect(r.rooms.slice(i33, i33 + 4)).toEqual(['3.3', '3.4', '3.3', '3.2']);
    expect(r.rooms[r.rooms.length - 1]).toBe('4.1');
  });

  for (const name of ['m16-left', 'm16-right']) {
    it(`${name}: access codes for sections 2, 3 and 4 are shown on entering them, each equal to the reference encoding`, () => {
      const r = play(name);
      expect(r.codes.map((c) => c.room)).toEqual(['2.1', '3.1', '4.1']);
      for (const c of r.codes) expect(c.shown, c.room).toBe(c.expected);
    });
  }
});
