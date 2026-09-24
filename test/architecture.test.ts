import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC.md §3 dependency rules, checked over every source and test file of each package.
const ALLOWED: Record<string, string[]> = {
  cartridge: [],
  transport: [],
  vm: ['cartridge'],
  asm: ['cartridge'],
  qr: ['transport'],
};
const PURE = ['cartridge', 'transport', 'vm', 'asm'];
const root = join(__dirname, '..');

function tsFiles(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (e === 'node_modules') continue;
    if (statSync(p).isDirectory()) out = out.concat(tsFiles(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

function imports(src: string): string[] {
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  const out: string[] = [];
  for (const m of src.matchAll(re)) out.push((m[1] ?? m[2] ?? m[3])!);
  return out;
}

describe('package dependency rules (SPEC §3)', () => {
  for (const [pkg, allowed] of Object.entries(ALLOWED)) {
    it(`${pkg} imports only ${JSON.stringify(allowed)}`, () => {
      const bad: string[] = [];
      for (const f of tsFiles(join(root, 'packages', pkg))) {
        for (const spec of imports(readFileSync(f, 'utf8'))) {
          const m = /^@qrc\/([\w-]+)/.exec(spec);
          if (m && m[1] !== pkg && !allowed.includes(m[1]!)) bad.push(`${relative(root, f)} -> ${spec}`);
          if (spec.includes('packages/')) bad.push(`${relative(root, f)} -> ${spec} (path import)`);
        }
      }
      expect(bad).toEqual([]);
    });
  }

  for (const pkg of PURE) {
    it(`${pkg}/src has no Node built-ins or DOM access`, () => {
      const bad: string[] = [];
      for (const f of tsFiles(join(root, 'packages', pkg, 'src'))) {
        const src = readFileSync(f, 'utf8');
        for (const spec of imports(src)) {
          if (spec.startsWith('node:') || ['fs', 'path', 'zlib', 'crypto', 'os'].includes(spec)) bad.push(`${relative(root, f)} -> ${spec}`);
        }
        if (/\b(document|window|navigator|HTMLCanvasElement|process\.)\b/.test(src.replace(/\/\/.*$/gm, ''))) {
          bad.push(`${relative(root, f)} references DOM/process`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
});
