import { serializeCartridge } from '@qrc/cartridge';
import { BUTTONS, ISA_VERSION, MEMORY, NO_ENTRY, OPCODES, SYSCALLS } from './isa';

// Syntax reference: ../ASM.md

export class AsmError extends Error {
  constructor(
    message: string,
    readonly file: string,
    readonly line: number,
    readonly via?: string,
  ) {
    super(`${file}:${line}: ${message}${via ? ` (${via})` : ''}`);
    this.name = 'AsmError';
  }
}

/** One line of the listing: where it came from and what it produced. */
export interface ListingLine {
  /** Absolute ROM address of the first byte (or of the label, for label-only lines). */
  address: number;
  bytes: Uint8Array;
  file: string;
  line: number;
  text: string;
}

export interface AssembleOptions {
  file?: string;
  /**
   * Returns the source of an included file (same directory as the main file). The assembler itself never
   * touches a file system; tools supply this. Without it, `.include` is an error.
   */
  resolveInclude?: (name: string) => string;
}

export interface AsmResult {
  title: string;
  sections: { code: Uint8Array; rodata: Uint8Array; sound: Uint8Array };
  /** All resolved symbols: labels (absolute addresses), constants, RAM variables, sfx ids. */
  symbols: Map<string, number>;
  /** Kind of every symbol in `symbols`. */
  symbolKinds: Map<string, 'label' | 'var' | 'const'>;
  listing: ListingLine[];
}

type SectionName = 'code' | 'rodata';

interface Ctx {
  file: string;
  line: number;
  scope: string;
  via?: string;
}

/** A source line after .include and macro expansion. */
interface SrcLine {
  text: string;
  file: string;
  line: number;
  via?: string;
}

interface Item {
  section: SectionName;
  offset: number;
  size: number;
  ctx: Ctx;
  emit: (out: Uint8Array, at: number, ev: (e: string) => number) => void;
}

type SymDef =
  | { kind: 'value'; value: number; isVar?: boolean }
  | { kind: 'label'; section: SectionName; offset: number }
  | { kind: 'expr'; expr: string; ctx: Ctx };

const REG = /^r([0-7])$/i;
const IDENT = /^[A-Za-z_@][\w@.]*$/;

const ALU = ['MOV', 'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'AND', 'OR', 'XOR', 'SHL', 'SHR', 'SAR', 'CMP'] as const;
const COND_JUMPS: Record<string, number> = {
  JZ: OPCODES.JZ,
  JEQ: OPCODES.JZ,
  JNZ: OPCODES.JNZ,
  JNE: OPCODES.JNZ,
  JLT: OPCODES.JLT,
  JGE: OPCODES.JGE,
  JGT: OPCODES.JGT,
  JLE: OPCODES.JLE,
  JB: OPCODES.JB,
  JAE: OPCODES.JAE,
};

/** Split on commas that are not inside quotes or brackets. */
function splitOperands(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quote) {
      cur += ch;
      if (ch === '\\') cur += s[++i] ?? '';
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === '[' || ch === '(') {
      depth++;
      cur += ch;
    } else if (ch === ']' || ch === ')') {
      depth--;
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

/** Remove a trailing ';' comment, respecting quotes. */
function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ';') return line.slice(0, i);
  }
  return line;
}

function parseString(lit: string, fail: (m: string) => never): number[] {
  if (!/^".*"$/.test(lit)) fail(`expected a string literal, got ${lit}`);
  const body = lit.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    let ch = body[i]!;
    if (ch === '\\') {
      const e = body[++i];
      ch = e === 'n' ? '\n' : e === '0' ? '\0' : e === 't' ? '\t' : (e ?? '');
    }
    const code = ch.charCodeAt(0);
    if (code > 127) fail('only ASCII is allowed in strings');
    bytes.push(code);
  }
  return bytes;
}

// ---- constant expressions: + - * / % & | ^ << >> ~ unary-, parentheses ------------------------
function evaluate(expr: string, lookup: (name: string) => number, fail: (m: string) => never): number {
  const tokens = expr.match(/0x[0-9a-f]+|\$[0-9a-f]+|0b[01]+|\d+|'(?:\\.|[^'])'|[A-Za-z_@][\w@.]*|<<|>>|[-+*/%&|^~()]|\S/gi) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const binary = (ops: string[], sub: () => number, apply: (op: string, a: number, b: number) => number) => (): number => {
    let v = sub();
    while (peek() !== undefined && ops.includes(peek()!)) {
      const op = next()!;
      v = apply(op, v, sub());
    }
    return v;
  };
  const primary = (): number => {
    const t = next();
    if (t === undefined) fail(`incomplete expression: ${expr}`);
    if (t === '(') {
      const v = or();
      if (next() !== ')') fail(`missing ')' in ${expr}`);
      return v;
    }
    if (t === '-') return -primary();
    if (t === '+') return primary();
    if (t === '~') return ~primary();
    if (/^0x/i.test(t)) return parseInt(t.slice(2), 16);
    if (t.startsWith('$')) return parseInt(t.slice(1), 16);
    if (/^0b/i.test(t)) return parseInt(t.slice(2), 2);
    if (/^\d/.test(t)) return parseInt(t, 10);
    if (t.startsWith("'")) {
      const inner = t.slice(1, -1);
      return inner === '\\n' ? 10 : inner === "\\'" ? 39 : inner === '\\\\' ? 92 : inner.charCodeAt(0);
    }
    if (IDENT.test(t)) return lookup(t);
    return fail(`unexpected '${t}' in expression: ${expr}`);
  };
  const mul = binary(['*', '/', '%'], primary, (op, a, b) => {
    if (op !== '*' && b === 0) fail(`division by zero in ${expr}`);
    return op === '*' ? a * b : op === '/' ? Math.trunc(a / b) : a % b;
  });
  const add = binary(['+', '-'], mul, (op, a, b) => (op === '+' ? a + b : a - b));
  const shift = binary(['<<', '>>'], add, (op, a, b) => (op === '<<' ? a << b : a >> b));
  const and = binary(['&'], shift, (_, a, b) => a & b);
  const xor = binary(['^'], and, (_, a, b) => a ^ b);
  const or: () => number = binary(['|'], xor, (_, a, b) => a | b);
  if (tokens.length === 0) fail('empty expression');
  const v = or();
  if (i !== tokens.length) fail(`unexpected '${tokens[i]}' in expression: ${expr}`);
  return v;
}

const INCLUDE_NAME = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;
const MAX_DEPTH = 16;

interface Macro {
  name: string;
  params: string[];
  body: SrcLine[];
}

/**
 * Expands `.include "file"` and `.macro NAME p1, p2 … .endm` into a flat list of source lines, each
 * remembering where it came from. Macro bodies substitute parameters as whole words, and every `@@name`
 * becomes a local label unique to that expansion.
 */
function preprocess(source: string, file: string, resolveInclude: AssembleOptions['resolveInclude']): SrcLine[] {
  const out: SrcLine[] = [];
  const macros = new Map<string, Macro>();
  let expansion = 0;
  const reserved = new Set([...Object.keys(OPCODES), 'LDI', ...Object.keys(COND_JUMPS)]);

  const failAt = (l: SrcLine, m: string): never => {
    throw new AsmError(m, l.file, l.line, l.via);
  };

  const emit = (lines: SrcLine[], stack: string[], depth: number) => {
    if (depth > MAX_DEPTH) failAt(lines[0] ?? { text: '', file, line: 0 }, 'includes/macros nested too deeply');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      const code = stripComment(l.text).trim();
      const head = code.split(/\s+/)[0]?.toUpperCase() ?? '';
      if (head === '.INCLUDE') {
        const m = /^\.include\s+"([^"]*)"\s*$/i.exec(code);
        if (!m) failAt(l, '.include "file.asm"');
        const name = m![1]!;
        if (!INCLUDE_NAME.test(name)) failAt(l, `.include: '${name}' must be a plain file name in the same directory (no paths)`);
        if (!resolveInclude) failAt(l, '.include is not available here (no include resolver)');
        if (stack.includes(name)) failAt(l, `.include cycle: ${[...stack, name].join(' -> ')}`);
        let src: string;
        try {
          src = resolveInclude!(name);
        } catch (e) {
          return failAt(l, `.include: cannot read '${name}': ${(e as Error).message}`);
        }
        emit(src.split(/\r?\n/).map((text, k) => ({ text, file: name, line: k + 1 })), [...stack, name], depth + 1);
        continue;
      }
      if (head === '.MACRO') {
        const m = /^\.macro\s+([A-Za-z_][\w]*)\s*(.*)$/i.exec(code);
        if (!m) failAt(l, '.macro NAME [param, …]');
        const name = m![1]!.toUpperCase();
        if (reserved.has(name) || name.startsWith('.')) failAt(l, `macro name '${m![1]}' is an instruction`);
        if (macros.has(name)) failAt(l, `macro '${m![1]}' already defined`);
        const params = m![2]!.trim() ? m![2]!.split(',').map((p) => p.trim()) : [];
        for (const p of params) if (!/^[A-Za-z_]\w*$/.test(p)) failAt(l, `bad macro parameter '${p}'`);
        const body: SrcLine[] = [];
        let j = i + 1;
        for (; j < lines.length; j++) {
          const h = stripComment(lines[j]!.text).trim().split(/\s+/)[0]?.toUpperCase();
          if (h === '.ENDM') break;
          if (h === '.MACRO') failAt(lines[j]!, 'macros cannot be defined inside macros');
          body.push(lines[j]!);
        }
        if (j >= lines.length) failAt(l, `.macro ${m![1]} without .endm`);
        macros.set(name, { name: m![1]!, params, body });
        i = j;
        continue;
      }
      if (head === '.ENDM') failAt(l, '.endm without .macro');

      // macro invocation, possibly after labels
      const lm = /^((?:[A-Za-z_@][\w@.]*:\s*)*)(\S+)\s*(.*)$/.exec(code);
      const call = lm ? macros.get(lm[2]!.toUpperCase()) : undefined;
      if (lm && call && !/^[A-Za-z_][\w.]*\s*=/.test(code)) {
        if (lm[1]) out.push({ ...l, text: lm[1] });
        const args = splitOperands(lm[3]!);
        if (args.length !== call.params.length) failAt(l, `macro ${call.name} takes ${call.params.length} argument(s), got ${args.length}`);
        const id = ++expansion;
        const via = `in macro ${call.name} expanded at ${l.file}:${l.line}`;
        const body = call.body.map((b) => {
          let text = b.text.replace(/@@([A-Za-z_]\w*)/g, (_, n: string) => `@${n}__m${id}`);
          call.params.forEach((p, k) => {
            text = text.replace(new RegExp(`(?<![\\w@.])${p}(?![\\w])`, 'g'), () => args[k]!);
          });
          return { text, file: b.file, line: b.line, via };
        });
        emit(body, stack, depth + 1);
        continue;
      }
      out.push(l);
    }
  };
  emit(source.split(/\r?\n/).map((text, k) => ({ text, file, line: k + 1 })), [file], 0);
  return out;
}

export function assemble(source: string, opts: AssembleOptions = {}): AsmResult {
  const file = opts.file ?? '<source>';
  const lines = preprocess(source, file, opts.resolveInclude);
  const listingRaw: { section: SectionName; offset: number; size: number; src: SrcLine }[] = [];
  const syms = new Map<string, SymDef>();
  const items: Item[] = [];
  const size: Record<SectionName, number> = { code: 4, rodata: 0 }; // code starts with the vector table
  const sfx: { ctx: Ctx; args: string[] }[] = [];
  let section: SectionName = 'code';
  let scope = '';
  let title = '';
  let ramNext: number = MEMORY.RAM_START;

  for (const [k, v] of Object.entries(SYSCALLS)) syms.set(k, { kind: 'value', value: v });
  for (const [k, v] of Object.entries(BUTTONS)) syms.set(`BTN_${k}`, { kind: 'value', value: v });
  syms.set('RAM_START', { kind: 'value', value: MEMORY.RAM_START });
  const builtins = new Set(syms.keys());

  let ctx: Ctx = { file, line: 0, scope: '' };
  const fail = (m: string): never => {
    throw new AsmError(m, ctx.file, ctx.line, ctx.via);
  };
  const qualify = (name: string, sc: string) => (name.startsWith('@') ? `${sc}${name}` : name);
  const define = (name: string, def: SymDef) => {
    const q = qualify(name, scope);
    if (builtins.has(q)) fail(`'${q}' is a built-in name`);
    if (syms.has(q)) fail(`duplicate symbol '${q}'`);
    syms.set(q, def);
  };

  // Symbol resolution (lazy, so constants may refer to labels defined later).
  const bases: Record<SectionName, number> = { code: 0, rodata: 0 };
  let basesReady = false;
  const resolving = new Set<string>();
  const resolve = (name: string, sc: string, at: Ctx): number => {
    const q = qualify(name, sc);
    const def = syms.get(q);
    if (!def) throw new AsmError(`undefined symbol '${q}'`, at.file, at.line, at.via);
    if (def.kind === 'value') return def.value;
    if (def.kind === 'label') {
      if (!basesReady) throw new AsmError(`'${q}' is a label; its address is not known yet here`, at.file, at.line, at.via);
      return bases[def.section] + def.offset;
    }
    if (resolving.has(q)) throw new AsmError(`circular definition of '${q}'`, at.file, at.line, at.via);
    resolving.add(q);
    try {
      return evalAt(def.expr, def.ctx);
    } finally {
      resolving.delete(q);
    }
  };
  const evalAt = (expr: string, at: Ctx): number => {
    const f = (m: string): never => {
      throw new AsmError(m, at.file, at.line, at.via);
    };
    return evaluate(expr, (n) => resolve(n, at.scope, at), f);
  };

  let currentSrc: SrcLine = { text: '', file, line: 0 };
  const emitItem = (sz: number, emit: Item['emit']) => {
    items.push({ section, offset: size[section], size: sz, ctx: { ...ctx }, emit });
    listingRaw.push({ section, offset: size[section], size: sz, src: currentSrc });
    size[section] += sz;
  };

  const reg = (s: string): number | null => {
    const m = REG.exec(s.trim());
    return m ? Number(m[1]) : null;
  };
  const needReg = (s: string | undefined, what: string): number => {
    const r = s === undefined ? null : reg(s);
    if (r === null) fail(`${what}: expected a register r0..r7, got '${s ?? ''}'`);
    return r!;
  };
  const imm16 = (v: number, expr: string): number => {
    if (v < -32768 || v > 65535) fail(`value ${v} of '${expr}' does not fit in 16 bits`);
    return v & 0xffff;
  };
  const insn = (op: number, a: number, b: number, I: boolean, immExpr: string | null) => {
    emitItem(4, (out, at, ev) => {
      out[at] = op;
      out[at + 1] = (a & 7) | ((b & 7) << 3) | (I ? 0x80 : 0);
      const v = immExpr === null ? 0 : imm16(ev(immExpr), immExpr);
      out[at + 2] = v & 0xff;
      out[at + 3] = v >>> 8;
    });
  };
  /** [rN], [rN + e], [rN - e], [e] */
  const memOperand = (s: string | undefined): { base: number | null; expr: string } => {
    const m = s ? /^\[(.*)\]$/.exec(s.trim()) : null;
    if (!m) fail(`expected a memory operand like [r1 + 4] or [label], got '${s ?? ''}'`);
    const inner = m![1]!.trim();
    const rm = /^(r[0-7])\s*(?:([+-])\s*(.+))?$/i.exec(inner);
    if (rm) return { base: Number(rm[1]!.slice(1)), expr: rm[3] ? (rm[2] === '-' ? `-(${rm[3]})` : rm[3]) : '0' };
    return { base: null, expr: inner };
  };

  for (let li = 0; li < lines.length; li++) {
    currentSrc = lines[li]!;
    ctx = { file: currentSrc.file, line: currentSrc.line, scope, via: currentSrc.via };
    let text = stripComment(currentSrc.text).trim();
    if (!text) continue;

    // labels (possibly several) at line start
    let lm: RegExpExecArray | null;
    while ((lm = /^([A-Za-z_@][\w@.]*):/.exec(text))) {
      const name = lm[1]!;
      if (!name.startsWith('@')) {
        scope = name;
        ctx.scope = scope;
      }
      define(name, { kind: 'label', section, offset: size[section] });
      text = text.slice(lm[0].length).trim();
      if (!text) listingRaw.push({ section, offset: size[section], size: 0, src: currentSrc });
    }
    if (!text) continue;

    // NAME = expr
    const eq = /^([A-Za-z_][\w.]*)\s*=\s*(.+)$/.exec(text);
    if (eq) {
      define(eq[1]!, { kind: 'expr', expr: eq[2]!, ctx: { ...ctx } });
      continue;
    }

    const sp = text.search(/\s/);
    const head = (sp < 0 ? text : text.slice(0, sp)).toUpperCase();
    const rest = sp < 0 ? '' : text.slice(sp + 1).trim();
    const ops = splitOperands(rest);
    const ev = (e: string) => evalAt(e, ctx);

    if (head.startsWith('.')) {
      switch (head) {
        case '.CODE':
          section = 'code';
          break;
        case '.DATA':
        case '.RODATA':
          section = 'rodata';
          break;
        case '.TITLE':
          title = String.fromCharCode(...parseString(rest, fail));
          break;
        case '.CONST': {
          const m = /^([A-Za-z_][\w.]*)\s*,?\s*(.+)$/.exec(rest);
          if (!m) fail('.const NAME expr');
          define(m![1]!, { kind: 'expr', expr: m![2]!, ctx: { ...ctx } });
          break;
        }
        case '.VAR': {
          const [name, szExpr] = ops;
          if (!name || !IDENT.test(name)) fail('.var NAME [size]');
          const n = szExpr ? ev(szExpr) : 2;
          if (n < 1) fail('.var size must be >= 1');
          if (ramNext + n > 0x10000) fail('out of RAM');
          define(name!, { kind: 'value', value: ramNext, isVar: true });
          ramNext += n;
          break;
        }
        case '.BYTE': {
          const c = { ...ctx };
          const parts: ({ str: number[] } | { expr: string })[] = ops.map((o) => (o.startsWith('"') ? { str: parseString(o, fail) } : { expr: o }));
          const n = parts.reduce((acc, p) => acc + ('str' in p ? p.str.length : 1), 0);
          emitItem(n, (out, at, evx) => {
            for (const p of parts) {
              if ('str' in p) for (const b of p.str) out[at++] = b;
              else {
                const v = evx(p.expr);
                if (v < -128 || v > 255) throw new AsmError(`byte value ${v} out of range`, c.file, c.line);
                out[at++] = v & 0xff;
              }
            }
          });
          break;
        }
        case '.WORD':
          emitItem(ops.length * 2, (out, at, evx) => {
            for (const o of ops) {
              const v = imm16(evx(o), o);
              out[at++] = v & 0xff;
              out[at++] = v >>> 8;
            }
          });
          break;
        case '.STRING': {
          const bytes = parseString(rest, fail);
          emitItem(bytes.length + 1, (out, at) => out.set([...bytes, 0], at));
          break;
        }
        case '.FILL': {
          const n = ev(ops[0] ?? fail('.fill COUNT [, VALUE]'));
          const valExpr = ops[1] ?? '0';
          emitItem(n, (out, at, evx) => out.fill(evx(valExpr) & 0xff, at, at + n));
          break;
        }
        case '.SPRITE': {
          // next 8 non-empty lines: 8 chars each of '.' (0) or hex digit (palette index)
          const rows: string[] = [];
          while (rows.length < 8) {
            li++;
            if (li >= lines.length) fail('.sprite needs 8 rows of 8 pixels');
            const row = stripComment(lines[li]!.text).trim();
            if (!row) continue;
            ctx = { file: lines[li]!.file, line: lines[li]!.line, scope, via: lines[li]!.via };
            if (!/^[.0-9a-fA-F]{8}$/.test(row)) fail(`sprite row must be 8 chars of '.' or 0-F, got '${row}'`);
            rows.push(row);
          }
          const bytes = new Uint8Array(32);
          rows.forEach((row, y) => {
            for (let x = 0; x < 8; x++) {
              const ch = row[x]!;
              const c = ch === '.' ? 0 : parseInt(ch, 16);
              bytes[y * 4 + (x >> 1)]! |= x & 1 ? c : c << 4;
            }
          });
          emitItem(32, (out, at) => out.set(bytes, at));
          break;
        }
        case '.SFX': {
          // .sfx NAME, channel, freq, duration, volume [, sweep]
          const [name, ...args] = ops;
          if (!name || !IDENT.test(name) || args.length < 4 || args.length > 5) fail('.sfx NAME, channel, freq, duration, volume [, sweep]');
          define(name!, { kind: 'value', value: sfx.length });
          sfx.push({ ctx: { ...ctx }, args });
          break;
        }
        default:
          fail(`unknown directive ${head}`);
      }
      continue;
    }

    // instructions
    const expectN = (n: number) => {
      if (ops.length !== n) fail(`${head} takes ${n} operand(s), got ${ops.length}`);
    };
    if (head === 'NOP' || head === 'RET') {
      expectN(0);
      insn(OPCODES[head], 0, 0, false, null);
    } else if (head === 'LDI') {
      expectN(2);
      insn(OPCODES.MOV, needReg(ops[0], head), 0, true, ops[1]!);
    } else if ((ALU as readonly string[]).includes(head)) {
      expectN(2);
      const a = needReg(ops[0], head);
      const b = reg(ops[1]!);
      insn(OPCODES[head as (typeof ALU)[number]], a, b ?? 0, b === null, b === null ? ops[1]! : null);
    } else if (head === 'NEG' || head === 'PUSH' || head === 'POP') {
      expectN(1);
      insn(OPCODES[head], needReg(ops[0], head), 0, false, null);
    } else if (head === 'LD' || head === 'LDB') {
      expectN(2);
      const m = memOperand(ops[1]);
      insn(OPCODES[head], needReg(ops[0], head), m.base ?? 0, m.base === null, m.expr);
    } else if (head === 'ST' || head === 'STB') {
      expectN(2);
      const m = memOperand(ops[0]);
      insn(OPCODES[head], needReg(ops[1], head), m.base ?? 0, m.base === null, m.expr);
    } else if (head === 'JMP' || head === 'CALL') {
      expectN(1);
      const b = reg(ops[0]!);
      insn(OPCODES[head], 0, b ?? 0, b === null, b === null ? ops[0]! : null);
    } else if (head in COND_JUMPS) {
      expectN(1);
      if (reg(ops[0]!) !== null) fail(`${head} takes a label, not a register`);
      insn(COND_JUMPS[head]!, 0, 0, true, ops[0]!);
    } else if (head === 'SYS') {
      expectN(1);
      insn(OPCODES.SYS, 0, 0, true, ops[0]!);
    } else {
      fail(`unknown instruction '${head}'`);
    }
  }

  // ---- layout and pass 2 --------------------------------------------------------------------
  const soundSize = sfx.length ? 1 + sfx.length * 8 : 0;
  bases.code = 0;
  bases.rodata = size.code;
  basesReady = true;
  if (size.code + size.rodata + soundSize > MEMORY.ROM_END) {
    throw new AsmError(`ROM too large: ${size.code + size.rodata + soundSize} bytes (max ${MEMORY.ROM_END})`, file, lines.length ? lines[lines.length - 1]!.line : 0);
  }
  const out = { code: new Uint8Array(size.code), rodata: new Uint8Array(size.rodata), sound: new Uint8Array(soundSize) };
  for (const it of items) it.emit(out[it.section], it.offset, (e) => evalAt(e, it.ctx));

  const entry = (name: string) => (syms.has(name) ? resolve(name, '', { file, line: 0, scope: '' }) : NO_ENTRY);
  if (!syms.has('update')) throw new AsmError("missing required label 'update' (per-frame entry point)", file, lines.length ? lines[lines.length - 1]!.line : 0);
  const init = entry('init');
  const update = entry('update');
  out.code.set([init & 0xff, init >>> 8, update & 0xff, update >>> 8], 0);

  if (sfx.length > 255) throw new AsmError('at most 255 sound effects', file, lines.length ? lines[lines.length - 1]!.line : 0);
  if (soundSize) {
    out.sound[0] = sfx.length;
    sfx.forEach(({ ctx: c, args }, i) => {
      const [ch, freq, dur, vol, sweep] = args.map((a) => evalAt(a, c)) as [number, number, number, number, number | undefined];
      const at = 1 + i * 8;
      if (ch! < 0 || ch! > 2) throw new AsmError('sfx channel must be 0, 1 (square) or 2 (noise)', c.file, c.line);
      if (dur! < 0 || dur! > 255) throw new AsmError('sfx duration must be 0..255 frames', c.file, c.line);
      out.sound[at] = ch!;
      out.sound[at + 1] = vol! & 15;
      out.sound[at + 2] = dur!;
      out.sound[at + 3] = 0;
      out.sound[at + 4] = freq! & 0xff;
      out.sound[at + 5] = (freq! >>> 8) & 0xff;
      const sw = (sweep ?? 0) & 0xffff;
      out.sound[at + 6] = sw & 0xff;
      out.sound[at + 7] = sw >>> 8;
    });
  }

  const symbols = new Map<string, number>();
  const symbolKinds = new Map<string, 'label' | 'var' | 'const'>();
  for (const [k, def] of syms) {
    if (builtins.has(k)) continue;
    symbols.set(k, def.kind === 'value' ? def.value : resolve(k, '', { file, line: 0, scope: '' }));
    symbolKinds.set(k, def.kind === 'label' ? 'label' : def.kind === 'value' && def.isVar ? 'var' : 'const');
  }
  const listing: ListingLine[] = listingRaw.map((l) => ({
    address: bases[l.section] + l.offset,
    bytes: out[l.section].slice(l.offset, l.offset + l.size),
    file: l.src.file,
    line: l.src.line,
    text: l.src.text,
  }));
  return { title, sections: out, symbols, symbolKinds, listing };
}

/** Symbol file: one `ADDR KIND NAME` line per symbol, sorted by value then name. */
export function formatSymbols(asm: AsmResult): string {
  return [...asm.symbols]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([name, v]) => `${(v & 0xffff).toString(16).padStart(4, '0')} ${asm.symbolKinds.get(name)!.padEnd(5)} ${name}`)
    .join('\n') + '\n';
}

/** Listing: address, up to 8 bytes in hex, file:line, source text. */
export function formatListing(asm: AsmResult): string {
  return asm.listing
    .map((l) => {
      const hex = Array.from(l.bytes.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join(' ') + (l.bytes.length > 8 ? ' …' : '');
      return `${l.address.toString(16).padStart(4, '0')}  ${hex.padEnd(25)} ${`${l.file}:${l.line}`.padEnd(22)} ${l.text.trimEnd()}`;
    })
    .join('\n') + '\n';
}

export async function buildCartridge(source: string, opts: AssembleOptions & { title?: string; compression?: 'none' | 'deflate-raw' | 'auto' } = {}): Promise<{ bytes: Uint8Array; asm: AsmResult }> {
  const asm = assemble(source, opts);
  const bytes = await serializeCartridge({
    title: opts.title ?? (asm.title || 'UNTITLED'),
    isaVersion: ISA_VERSION,
    sections: asm.sections,
    compression: opts.compression ?? 'auto',
  });
  return { bytes, asm };
}
