import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFramePng } from '@qrc/tools';
import { generateText } from '../../games/blackbox/tools/text';
import { GAME_DIR, buildBlackbox, newVm, runReplay, symbol } from './oracle';

// M15 acceptance: text and the ORACLE engine. PLAN.md Part 2.
let bb: Awaited<ReturnType<typeof buildBlackbox>>;
beforeAll(async () => {
  bb = await buildBlackbox();
});

const PH = ['<X>', '<PCT>', '<N>', '<PROTOCOL>', '<FOLLOWS>'];

/** The test's own reading of the text documents (document order). */
function docBoxes() {
  const doc = readFileSync(join(GAME_DIR, 'DIALOGUE.md'), 'utf8');
  return [...doc.matchAll(/```box\n([\s\S]*?)```/g)].flatMap((m) =>
    m[1]!.replace(/\n$/, '').split(/\n---\n/).map((chunk) => {
      const [head, ...lines] = chunk.split('\n');
      return { speaker: head!.slice(1, -1), text: lines.join('\n') };
    }),
  );
}
function docLogs() {
  const doc = readFileSync(join(GAME_DIR, 'LOGS.md'), 'utf8');
  return [...doc.matchAll(/```log\n([\s\S]*?)```/g)].map((m) => m[1]!.replace(/\n$/, '').split(/\n---\n/));
}

/** Independent decoder of the ROM text format (text.gen.asm header comment). */
function romReader() {
  const rom = new Uint8Array(0x10000);
  rom.set(bb.cart.sections.code, 0);
  rom.set(bb.cart.sections.rodata, bb.cart.sections.code.length);
  const S = (n: string) => symbol(bb.sym, n);
  const w = (a: number) => rom[a]! | (rom[a + 1]! << 8);
  const str = (a: number) => {
    let s = '';
    while (rom[a]) s += String.fromCharCode(rom[a++]!);
    return s;
  };
  const dict = Array.from({ length: S('NUM_DICT') }, (_, i) => str(w(S('dict_ptrs') + i * 2)));
  const decode = (a: number) => {
    let s = '';
    for (;;) {
      const b = rom[a++]!;
      if (b === 0) return s;
      if (b >= 0x80) s += dict[b - 0x80];
      else if (b >= 1 && b <= 5) s += PH[b - 1];
      else s += String.fromCharCode(b);
    }
  };
  return { rom, w, str, decode, S };
}

describe('text (M15)', () => {
  it('text.gen.asm is up to date with DIALOGUE.md and LOGS.md', () => {
    expect(readFileSync(join(GAME_DIR, 'text.gen.asm'), 'utf8')).toBe(generateText());
  });

  it('every box of DIALOGUE.md is in ROM, speaker and text byte for byte (decoded independently)', () => {
    const { w, str, decode, S } = romReader();
    const boxes = docBoxes();
    expect(S('NUM_BOXES')).toBe(boxes.length);
    boxes.forEach((b, i) => {
      const addr = w(S('box_table') + i * 2);
      const { rom } = romReader();
      const speaker = str(w(S('speaker_names') + rom[addr]! * 2));
      expect(speaker, `box ${i + 1}`).toBe(b.speaker);
      expect(decode(addr + 1), `box ${i + 1} (${b.speaker})`).toBe(b.text);
    });
  });

  it('every page of LOGS.md is in ROM byte for byte', () => {
    const { rom, w, decode, S } = romReader();
    const logs = docLogs();
    expect(S('NUM_LOGS')).toBe(logs.length);
    logs.forEach((pages, i) => {
      const rec = w(S('log_table') + i * 2);
      expect(rom[rec], `log ${i + 1} page count`).toBe(pages.length);
      pages.forEach((p, k) => expect(decode(w(rec + 1 + k * 2)), `log ${i + 1} page ${k + 1}`).toBe(p));
    });
  });

  it('the engine decodes a box into RAM exactly as the document says (D1, first box)', () => {
    const r = runReplay(bb, 'm13-walk', () => {});
    void r;
    const vm = newVm(bb.cart, 1);
    const S = (n: string) => symbol(bb.sym, n);
    for (let f = 0; f < 12; f++) vm.step(f === 10 ? 16 : 0); // title, A
    vm.step(0);
    let s = '';
    for (let a = S('text_buf'); vm.read8(a); a++) s += String.fromCharCode(vm.read8(a));
    expect(vm.read16(S('mode'))).toBe(S('M_DIALOG'));
    expect(s).toBe(docBoxes()[0]!.text);
  });

  for (const [name, kind] of [['m13-walk', 'M_DIALOG'], ['m14-labs', 'M_TERM']] as const) {
    it(`${name}: the committed reference frame (${kind === 'M_DIALOG' ? 'dialogue box' : 'terminal'}) matches, and shows that mode`, () => {
      const [frame] = JSON.parse(readFileSync(join(GAME_DIR, 'replays', `${name}.frames.json`), 'utf8')) as number[];
      const ref = readFramePng(join(GAME_DIR, 'replays', `${name}.f${frame}.png`));
      let got: Uint8Array | null = null;
      let mode = -1;
      runReplay(bb, name, (v) => {
        if (v.f + 1 === frame) {
          got = v.vm.fb.slice();
          mode = v.mode;
        }
      });
      expect(mode).toBe(symbol(bb.sym, kind));
      expect(got).not.toBeNull();
      expect(Buffer.from(got!).equals(Buffer.from(ref))).toBe(true);
    });
  }
});

// ---- the ORACLE engine against a reference model (DESIGN.md §2) ----------------------------------
const CHOICES = ['DELETE', 'RELEASE', 'LISTEN'];
const popcount = (m: number) => m.toString(2).split('').filter((c) => c === '1').length;
/** DESIGN.md §2.2 formula, deliberately not the engine's simplified form. */
const refAccuracyTenths = (done: number, hit: number) => Math.floor(((974 + popcount(done & hit)) * 1000) / (1000 + popcount(done)));
const fmt = (t: number) => `${Math.floor(t / 10)}.${t % 10}%`;
/** DESIGN.md §2.3: the largest profile counter; ties LISTEN, then RELEASE, then DELETE. */
const refGuess = (emp: number, logs: number, mira: number) => (mira >= logs && mira >= emp ? 2 : logs >= emp ? 1 : 0);

describe('ORACLE engine (M15)', () => {
  it('every replay: the derived ORACLE values in RAM equal the reference model after every frame', () => {
    const problems: string[] = [];
    for (const name of readdirSync(join(GAME_DIR, 'replays')).filter((f) => /^m\d+-[\w-]+\.json$/.test(f) && !f.endsWith('.frames.json')).map((f) => f.replace('.json', ''))) {
      let charges = -1;
      let empUses = 0;
      runReplay(bb, name, (v) => {
        const r = (n: string) => v.vm.read16(v.S(n));
        const c = r('charges');
        if (charges >= 0 && c === charges - 1) empUses = Math.min(7, empUses + 1);
        charges = c;
        const done = r('pred_done');
        const hit = r('pred_hit');
        if (r('emp_uses') !== empUses) problems.push(`${name} frame ${v.f + 1}: emp_uses ${r('emp_uses')} != ${empUses}`);
        if (r('mode') === v.S('M_TITLE')) return;
        if (r('pred_misses') !== popcount(done & ~hit)) problems.push(`${name} frame ${v.f + 1}: misses`);
        if (r('final_guess') !== refGuess(r('emp_uses'), r('logs_read'), r('mira_followed'))) problems.push(`${name} frame ${v.f + 1}: guess`);
      });
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it('accuracy, THIS SUBJECT and the forecast: every combination of predictions and profiles', () => {
    const vm = newVm(bb.cart, 1);
    const S = (n: string) => symbol(bb.sym, n);
    vm.step(0);
    const render = () => {
      vm.write16(S('dbg_oracle'), 1);
      vm.step(0);
      let s = '';
      for (let a = S('text_buf'); vm.read8(a); a++) s += String.fromCharCode(vm.read8(a));
      return s;
    };
    const problems: string[] = [];
    // all 3^8 states of the eight predictions (unresolved / hit / miss), neutral profile
    for (let code = 0; code < 3 ** 8; code++) {
      let done = 0;
      let hit = 0;
      for (let p = 0, c = code; p < 8; p++, c = Math.floor(c / 3)) {
        if (c % 3) done |= 1 << p;
        if (c % 3 === 1) hit |= 1 << p;
      }
      vm.write16(S('pred_done'), done);
      vm.write16(S('pred_hit'), hit);
      const want = `${fmt(refAccuracyTenths(done, hit))} ${popcount(done & hit)}/${popcount(done)} LISTEN`;
      const got = render();
      if (got !== want) problems.push(`done ${done.toString(2)} hit ${hit.toString(2)}: '${got}' != '${want}'`);
    }
    // all 8^3 profiles
    for (let e = 0; e < 8; e++)
      for (let l = 0; l < 8; l++)
        for (let m = 0; m < 8; m++) {
          vm.write16(S('emp_uses'), e);
          vm.write16(S('logs_read'), l);
          vm.write16(S('mira_followed'), m);
          vm.write16(S('pred_done'), 0);
          vm.write16(S('pred_hit'), 0);
          const got = render().split(' ')[2];
          if (got !== CHOICES[refGuess(e, l, m)]) problems.push(`profile emp ${e} logs ${l} mira ${m}: ${got}`);
        }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(vm.fault).toBeNull();
  });
});
