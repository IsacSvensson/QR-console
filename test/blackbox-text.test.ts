import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Design-time check for games/blackbox/DIALOGUE.md: every text box must fit the engine's dialogue box
// (1 header row + 5 rows of 31 characters) and use only characters the built-in font has (ASCII 32–95).
const MAX_COLS = 31;
const MAX_ROWS = 5;
const PLACEHOLDERS: Record<string, string> = { '<X>': 'RELEASE', '<PCT>': '97.4%', '<N>': '8' };

const doc = readFileSync(join(__dirname, '../games/blackbox/DIALOGUE.md'), 'utf8');
const blocks = [...doc.matchAll(/```box\n([\s\S]*?)```/g)].map((m) => m[1]!.replace(/\n$/, ''));
const boxes = blocks.flatMap((b) => b.split(/\n---\n/));

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
        for (const ch of line) {
          const c = ch.charCodeAt(0);
          if (c < 32 || c > 95) problems.push(`${where}: character '${ch}' is not in the font`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('reports the text budget', () => {
    const text = boxes.flatMap((b) => b.split('\n').slice(1)).map(expand).join('\n');
    const words = text.split(/\s+/).filter((w) => /[A-Z0-9]/.test(w)).length;
    console.log(`[blackbox text] ${boxes.length} boxes, ${words} words, ${text.length} characters (uncompressed, one byte each)`);
    expect(text.length).toBeLessThan(8 * 1024);
  });
});
