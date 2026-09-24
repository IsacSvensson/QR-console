// Generates ../text.gen.asm from DIALOGUE.md and LOGS.md: speakers, a word dictionary, every dialogue box
// and every log page, compressed. Byte codes in encoded text:
//   0 end · 1..5 placeholders (<X> <PCT> <N> <PROTOCOL> <FOLLOWS>) · 10 newline · 32..95 characters
//   0x80.. dictionary entry (index + 0x80)
// Run: npx tsx games/blackbox/tools/text.ts   (prints the size comparison that chose the packing)
import { readFileSync, writeFileSync } from 'node:fs';

export const PLACEHOLDERS = ['<X>', '<PCT>', '<N>', '<PROTOCOL>', '<FOLLOWS>'];
const doc = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

export interface Box {
  key: string; // e.g. D7_3
  speaker: string;
  lines: string[];
}
export interface Log {
  key: string; // e.g. L4
  pages: string[][];
}

/** Boxes in document order, named <section>_<n>: D1..D20, BARK, E1, E23, E4. */
export function parseBoxes(): Box[] {
  const out: Box[] = [];
  let section = '';
  let n = 0;
  const lines = doc('DIALOGUE.md').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const d = /^### (D\d+) /.exec(l) ?? /^### (E\d)/.exec(l);
    if (d) {
      section = d[1] === 'E2' ? 'E23' : d[1]!;
      n = 0;
    } else if (/^## 3\./.test(l)) {
      section = 'BARK';
      n = 0;
    } else if (/^### E2 \/ E3/.test(l)) {
      section = 'E23';
      n = 0;
    }
    if (l === '```box') {
      const body: string[] = [];
      for (i++; lines[i] !== '```'; i++) body.push(lines[i]!);
      for (const chunk of body.join('\n').split(/\n---\n/)) {
        const [head, ...text] = chunk.split('\n');
        out.push({ key: `${section}_${++n}`, speaker: head!.slice(1, -1), lines: text });
      }
    }
  }
  return out;
}

export function parseLogs(): Log[] {
  const out: Log[] = [];
  const lines = doc('LOGS.md').split('\n');
  let key = '';
  for (let i = 0; i < lines.length; i++) {
    const m = /^### (L\d+) /.exec(lines[i]!);
    if (m) key = m[1]!;
    if (lines[i] === '```log') {
      const body: string[] = [];
      for (i++; lines[i] !== '```'; i++) body.push(lines[i]!);
      out.push({ key, pages: body.join('\n').split(/\n---\n/).map((p) => p.split('\n')) });
    }
  }
  return out;
}

function plain(s: string): string {
  let t = s;
  PLACEHOLDERS.forEach((p, i) => (t = t.split(p).join(String.fromCharCode(i + 1))));
  return t;
}

/** Greedy dictionary: repeatedly take the substring that saves most bytes (entry costs its length + 3). */
export function buildDictionary(texts: string[], withSpaces: boolean, max = 128): string[] {
  let work = texts.slice();
  const dict: string[] = [];
  for (let k = 0; k < max; k++) {
    const count = new Map<string, number>();
    for (const t of work) {
      for (const m of t.matchAll(/[A-Z0-9']{2,}/g)) {
        const w = m[0];
        const cands = [w];
        if (withSpaces) {
          if (t[m.index! + w.length] === ' ') cands.push(`${w} `);
          if (t[m.index! - 1] === ' ') cands.push(` ${w}`);
        }
        for (const c of cands) count.set(c, (count.get(c) ?? 0) + 1);
      }
    }
    let best = '';
    let bestSave = 0;
    for (const [c, n] of count) {
      const save = n * (c.length - 1) - (c.length + 3);
      if (save > bestSave || (save === bestSave && c < best)) [best, bestSave] = [c, save];
    }
    if (bestSave <= 0) break;
    dict.push(best);
    work = work.map((t) => t.split(best).join('\x7f'));
  }
  return dict;
}

export function encode(text: string, dict: string[]): number[] {
  const t = plain(text);
  const byFirst = new Map<string, number[]>();
  dict.forEach((w, i) => byFirst.set(w[0]!, [...(byFirst.get(w[0]!) ?? []), i]));
  for (const list of byFirst.values()) list.sort((a, b) => dict[b]!.length - dict[a]!.length);
  const out: number[] = [];
  for (let i = 0; i < t.length; ) {
    const hit = (byFirst.get(t[i]!) ?? []).find((d) => t.startsWith(dict[d]!, i));
    if (hit !== undefined) {
      out.push(0x80 + hit);
      i += dict[hit]!.length;
    } else {
      const c = t.charCodeAt(i);
      if (!(c === 10 || (c >= 1 && c <= 5) || (c >= 32 && c <= 95))) throw new Error(`cannot encode '${t[i]}'`);
      out.push(c);
      i++;
    }
  }
  out.push(0);
  return out;
}

export function generateText(report = false): string {
  const boxes = parseBoxes();
  const logs = parseLogs();
  const texts = [...boxes.map((b) => b.lines.join('\n')), ...logs.flatMap((l) => l.pages.map((p) => p.join('\n')))];
  const raw = texts.reduce((n, t) => n + plain(t).length + 1, 0);
  const variants = [false, true].map((withSpaces) => {
    const dict = buildDictionary(texts.map(plain), withSpaces);
    const body = texts.reduce((n, t) => n + encode(t, dict).length, 0);
    const dictBytes = dict.reduce((n, w) => n + w.length + 1, 0) + dict.length * 2;
    return { withSpaces, dict, total: body + dictBytes };
  });
  const best = variants.reduce((a, b) => (b.total < a.total ? b : a));
  if (report) {
    console.log(`text: ${texts.length} boxes/pages; raw ${raw} B; words-only dictionary ${variants[0]!.total} B; words+spaces ${variants[1]!.total} B -> using ${best.withSpaces ? 'words+spaces' : 'words-only'} (${best.dict.length} entries)`);
  }
  const speakers = [...new Set(boxes.map((b) => b.speaker))];
  const L = ['; GENERATED by games/blackbox/tools/text.ts from DIALOGUE.md and LOGS.md — do not edit.', ''];
  L.push(`NUM_BOXES = ${boxes.length}`, `NUM_LOGS = ${logs.length}`, `NUM_SPEAKERS = ${speakers.length}`, `NUM_DICT = ${best.dict.length}`);
  speakers.forEach((s, i) => L.push(`SP_${s.replace(/[^A-Z]/g, '_')} = ${i}`));
  L.push('', '.data', 'speaker_names:', `    .word ${speakers.map((_, i) => `spk_${i}`).join(', ')}`);
  speakers.forEach((s, i) => L.push(`spk_${i}: .string "${s}"`));
  L.push('dict_ptrs:');
  for (let i = 0; i < best.dict.length; i += 8) L.push(`    .word ${best.dict.slice(i, i + 8).map((_, j) => `dict_${i + j}`).join(', ')}`);
  best.dict.forEach((w, i) => L.push(`dict_${i}: .string "${w}"`));
  L.push('; every box in DIALOGUE.md order', 'box_table:');
  for (let i = 0; i < boxes.length; i += 8) L.push(`    .word ${boxes.slice(i, i + 8).map((b) => `box_${b.key}`).join(', ')}`);
  for (const b of boxes) {
    const enc = encode(b.lines.join('\n'), best.dict);
    L.push(`box_${b.key}:`, `    .byte SP_${b.speaker.replace(/[^A-Z]/g, '_')}`);
    for (let i = 0; i < enc.length; i += 20) L.push(`    .byte ${enc.slice(i, i + 20).join(', ')}`);
  }
  L.push('; every log in LOGS.md order: page count, then one word per page', 'log_table:', `    .word ${logs.map((l) => `log_${l.key}`).join(', ')}`);
  for (const l of logs) {
    L.push(`log_${l.key}:`, `    .byte ${l.pages.length}`, `    .word ${l.pages.map((_, p) => `log_${l.key}_p${p + 1}`).join(', ')}`);
    l.pages.forEach((p, k) => {
      const enc = encode(p.join('\n'), best.dict);
      L.push(`log_${l.key}_p${k + 1}:`);
      for (let i = 0; i < enc.length; i += 20) L.push(`    .byte ${enc.slice(i, i + 20).join(', ')}`);
    });
  }
  return L.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = new URL('../text.gen.asm', import.meta.url);
  writeFileSync(out, generateText(true));
  console.log(`wrote ${out.pathname}`);
}
