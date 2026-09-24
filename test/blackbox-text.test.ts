import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Design-time check for the BLACKBOX text (games/blackbox/DIALOGUE.md and LOGS.md): every dialogue box must fit
// the engine's dialogue box (1 header row + 5 rows of 31 characters), every log page the full-screen terminal
// (19 text rows of 32 characters), and everything must use only characters the built-in font has (ASCII 32–95).
const MAX_COLS = 31;
const MAX_ROWS = 5;
const LOG_COLS = 32;
const LOG_ROWS = 19;
const PLACEHOLDERS: Record<string, string> = { '<X>': 'RELEASE', '<PCT>': '97.4%', '<N>': '8', '<FOLLOWS>': 'SUBJECT FOLLOWS MODEL.' };

const doc = readFileSync(join(__dirname, '../games/blackbox/DIALOGUE.md'), 'utf8');
const blocks = [...doc.matchAll(/```box\n([\s\S]*?)```/g)].map((m) => m[1]!.replace(/\n$/, ''));
const boxes = blocks.flatMap((b) => b.split(/\n---\n/));
const logDoc = readFileSync(join(__dirname, '../games/blackbox/LOGS.md'), 'utf8');
const logs = [...logDoc.matchAll(/```log\n([\s\S]*?)```/g)].map((m) => m[1]!.replace(/\n$/, ''));
const pages = logs.flatMap((l) => l.split(/\n---\n/));

function fontProblems(where: string, line: string): string[] {
  const out: string[] = [];
  for (const ch of line) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 95) out.push(`${where}: character '${ch}' is not in the font`);
  }
  return out;
}

function expand(line: string) {
  let s = line;
  for (const [k, v] of Object.entries(PLACEHOLDERS)) s = s.split(k).join(v);
  return s;
}

describe('BLACKBOX dialogue text fits the engine', () => {
  it('has boxes', () => {
    expect(boxes.length).toBeGreaterThan(50);
  });

  it('every box: [HEADER] + at most 5 lines of at most 31 font characters', () => {
    const problems: string[] = [];
    for (const box of boxes) {
      const [header, ...lines] = box.split('\n');
      const where = `${header} "${lines.find((l) => l.trim()) ?? ''}"`;
      if (!/^\[[^\]]+\]$/.test(header ?? '')) problems.push(`${where}: header must be [SPEAKER]`);
      else if (header!.length > MAX_COLS) problems.push(`${where}: header longer than ${MAX_COLS}`);
      if (lines.length > MAX_ROWS) problems.push(`${where}: ${lines.length} lines (max ${MAX_ROWS})`);
      for (const raw of lines) {
        if (raw === '<PROTOCOL>') continue;
        const line = expand(raw);
        if (line.length > MAX_COLS) problems.push(`${where}: "${line}" is ${line.length} characters`);
        problems.push(...fontProblems(where, line));
      }
    }
    expect(problems).toEqual([]);
  });

  it('has about ten logs', () => {
    expect(logs.length).toBeGreaterThanOrEqual(8);
  });

  it('every log page: at most 19 lines of at most 32 font characters', () => {
    const problems: string[] = [];
    pages.forEach((page, i) => {
      const lines = page.split('\n');
      const where = `log page ${i + 1} "${lines[0]}"`;
      if (lines.length > LOG_ROWS) problems.push(`${where}: ${lines.length} lines (max ${LOG_ROWS})`);
      for (const raw of lines) {
        const line = expand(raw);
        if (line.length > LOG_COLS) problems.push(`${where}: "${line}" is ${line.length} characters`);
        problems.push(...fontProblems(where, line));
      }
    });
    expect(problems).toEqual([]);
  });

  it('reports the text budget', () => {
    const dialogue = boxes.flatMap((b) => b.split('\n').slice(1)).map(expand).join('\n');
    const logText = pages.map(expand).join('\n');
    const count = (t: string) => t.split(/\s+/).filter((w) => /[A-Z0-9]/.test(w)).length;
    console.log(
      `[blackbox text] dialogue: ${boxes.length} boxes, ${count(dialogue)} words, ${dialogue.length} B; ` +
        `logs: ${logs.length} logs, ${pages.length} pages, ${count(logText)} words, ${logText.length} B; ` +
        `total ${dialogue.length + logText.length} B uncompressed`,
    );
    expect(dialogue.length + logText.length).toBeLessThan(10 * 1024);
  });
});
