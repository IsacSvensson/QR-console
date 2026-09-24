import { type Cartridge, sha256, toHex } from '@qrc/cartridge';
import { CELL_H, CELL_W, GLYPH_H, GLYPH_W, glyph } from './font';
import { CYCLES_PER_FRAME, ISA_VERSION, MEMORY, NO_ENTRY, OPCODES as O, SCREEN, SYSCALLS as S, SYSCALL_CYCLES } from './isa';

/** One sound event produced during a frame. Backends (WebAudio) turn these into sound. */
export interface AudioCommand {
  /** 0, 1 = square wave; 2 = noise. */
  channel: number;
  /** Frequency in Hz (integer). For noise: pseudo "pitch" of the noise generator. */
  freq: number;
  /** Length in frames (1/60 s). */
  duration: number;
  /** 0..15 */
  volume: number;
  /** Frequency change in Hz per frame (signed). */
  sweep: number;
}

export interface VMOptions {
  /** RNG seed (uint32). Same cartridge + seed + inputs => identical state. */
  seed?: number;
  cyclesPerFrame?: number;
}

export class VMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VMError';
  }
}

export interface RomImage {
  isaVersion: number;
  code: Uint8Array;
  rodata: Uint8Array;
  sound: Uint8Array;
}

const s16 = (v: number) => (v << 16) >> 16;

export class VM {
  readonly mem = new Uint8Array(0x10000);
  readonly fb = new Uint8Array(SCREEN * SCREEN);
  readonly regs = new Uint16Array(8);
  pc = 0;
  sp = 0;
  // flags
  z = false;
  n = false;
  c = false;
  v = false;

  /** Frames completed. */
  frame = 0;
  /** Frames whose entry point exceeded the cycle budget. */
  overruns = 0;
  /** Set on an illegal instruction; the VM then stops executing (every later frame is a no-op). */
  fault: string | null = null;
  cyclesLastFrame = 0;
  audio: AudioCommand[] = [];

  private rng: number;
  private held = 0;
  private pressed = 0;
  private readonly soundBase: number;
  private readonly soundLen: number;
  private readonly budget: number;
  private readonly initEntry: number;
  private readonly updateEntry: number;

  constructor(rom: RomImage, opts: VMOptions = {}) {
    if (rom.isaVersion !== ISA_VERSION) {
      throw new VMError(`unsupported ISA version ${rom.isaVersion} (this VM runs ISA ${ISA_VERSION})`);
    }
    const romSize = rom.code.length + rom.rodata.length + rom.sound.length;
    if (romSize > MEMORY.ROM_END) throw new VMError(`ROM is ${romSize} bytes; max ${MEMORY.ROM_END}`);
    if (rom.code.length < 4) throw new VMError('code section too short for the vector table');
    this.mem.set(rom.code, 0);
    this.mem.set(rom.rodata, rom.code.length);
    this.soundBase = rom.code.length + rom.rodata.length;
    this.soundLen = rom.sound.length;
    this.mem.set(rom.sound, this.soundBase);
    this.initEntry = this.read16(MEMORY.VECTOR_INIT);
    this.updateEntry = this.read16(MEMORY.VECTOR_UPDATE);
    this.rng = (opts.seed ?? 1) >>> 0 || 0x9e3779b9;
    this.budget = opts.cyclesPerFrame ?? CYCLES_PER_FRAME;
  }

  static fromCartridge(cart: Cartridge, opts?: VMOptions): VM {
    return new VM({ isaVersion: cart.header.isaVersion, ...cart.sections }, opts);
  }

  // ---- memory -------------------------------------------------------------------------------
  read8(a: number): number {
    return this.mem[a & 0xffff]!;
  }
  read16(a: number): number {
    return this.mem[a & 0xffff]! | (this.mem[(a + 1) & 0xffff]! << 8);
  }
  write8(a: number, v: number) {
    a &= 0xffff;
    if (a >= MEMORY.RAM_START) this.mem[a] = v & 0xff; // writes to ROM are ignored
  }
  write16(a: number, v: number) {
    this.write8(a, v);
    this.write8(a + 1, v >>> 8);
  }
  private push(v: number) {
    this.sp = (this.sp - 2) & 0xffff;
    this.write16(this.sp, v);
  }
  private pop(): number {
    const v = this.read16(this.sp);
    this.sp = (this.sp + 2) & 0xffff;
    return v;
  }

  // ---- frame loop ---------------------------------------------------------------------------
  /**
   * Runs one 60 Hz frame with the given button bitmask (BUTTONS). On the very first frame the
   * cartridge's init entry runs first (own budget). Returns the audio commands of this frame.
   */
  step(buttons: number): AudioCommand[] {
    this.audio = [];
    this.pressed = buttons & ~this.held & 0x3f;
    this.held = buttons & 0x3f;
    if (this.frame === 0 && this.initEntry !== NO_ENTRY) this.run(this.initEntry);
    if (this.updateEntry !== NO_ENTRY) this.run(this.updateEntry);
    this.frame++;
    return this.audio;
  }

  /** Calls `entry` with an empty stack and zeroed registers; returns when it RETs or the budget runs out. */
  private run(entry: number) {
    if (this.fault) return;
    this.regs.fill(0);
    this.sp = 0;
    this.pc = entry;
    let cycles = 0;
    const budget = this.budget;
    const mem = this.mem;
    const r = this.regs;
    while (cycles < budget) {
      cycles++;
      const pc = this.pc;
      const op = mem[pc]!;
      const m = mem[(pc + 1) & 0xffff]!;
      const imm = mem[(pc + 2) & 0xffff]! | (mem[(pc + 3) & 0xffff]! << 8);
      this.pc = (pc + 4) & 0xffff;
      const a = m & 7;
      const b = (m >>> 3) & 7;
      const I = m & 0x80;
      const src = I ? imm : r[b]!;
      const addr = I ? imm : (r[b]! + imm) & 0xffff;
      switch (op) {
        case O.NOP:
          break;
        case O.MOV:
          r[a] = src;
          break;
        case O.LD:
          r[a] = this.read16(addr);
          break;
        case O.LDB:
          r[a] = mem[addr]!;
          break;
        case O.ST:
          this.write16(addr, r[a]!);
          break;
        case O.STB:
          this.write8(addr, r[a]!);
          break;
        case O.ADD: {
          const x = r[a]!;
          const res = x + src;
          r[a] = res;
          this.setZN(res & 0xffff);
          this.c = res > 0xffff;
          this.v = ((x ^ res) & (src ^ res) & 0x8000) !== 0;
          break;
        }
        case O.SUB:
        case O.CMP: {
          const x = r[a]!;
          const res = (x - src) & 0xffff;
          if (op === O.SUB) r[a] = res;
          this.setZN(res);
          this.c = x < src;
          this.v = ((x ^ src) & (x ^ res) & 0x8000) !== 0;
          break;
        }
        case O.MUL:
          r[a] = Math.imul(r[a]!, src);
          this.logic(r[a]!);
          break;
        case O.DIV: {
          const d = s16(src);
          r[a] = d === 0 ? 0 : Math.trunc(s16(r[a]!) / d);
          this.logic(r[a]!);
          break;
        }
        case O.MOD: {
          const d = s16(src);
          r[a] = d === 0 ? 0 : s16(r[a]!) % d;
          this.logic(r[a]!);
          break;
        }
        case O.AND:
          r[a] = r[a]! & src;
          this.logic(r[a]!);
          break;
        case O.OR:
          r[a] = r[a]! | src;
          this.logic(r[a]!);
          break;
        case O.XOR:
          r[a] = r[a]! ^ src;
          this.logic(r[a]!);
          break;
        case O.SHL:
          r[a] = r[a]! << (src & 15);
          this.logic(r[a]!);
          break;
        case O.SHR:
          r[a] = r[a]! >>> (src & 15);
          this.logic(r[a]!);
          break;
        case O.SAR:
          r[a] = s16(r[a]!) >> (src & 15);
          this.logic(r[a]!);
          break;
        case O.NEG:
          r[a] = -r[a]!;
          this.logic(r[a]!);
          break;
        case O.JMP:
          this.pc = src;
          break;
        case O.JZ:
          if (this.z) this.pc = imm;
          break;
        case O.JNZ:
          if (!this.z) this.pc = imm;
          break;
        case O.JLT:
          if (this.n !== this.v) this.pc = imm;
          break;
        case O.JGE:
          if (this.n === this.v) this.pc = imm;
          break;
        case O.JGT:
          if (!this.z && this.n === this.v) this.pc = imm;
          break;
        case O.JLE:
          if (this.z || this.n !== this.v) this.pc = imm;
          break;
        case O.JB:
          if (this.c) this.pc = imm;
          break;
        case O.JAE:
          if (!this.c) this.pc = imm;
          break;
        case O.CALL:
          this.push(this.pc);
          this.pc = src;
          break;
        case O.RET:
          if (this.sp === 0) {
            this.cyclesLastFrame = cycles;
            return; // returned from the entry point: frame done
          }
          this.pc = this.pop();
          break;
        case O.PUSH:
          this.push(r[a]!);
          break;
        case O.POP:
          r[a] = this.pop();
          break;
        case O.SYS:
          cycles += SYSCALL_CYCLES - 1;
          this.syscall(imm);
          if (this.fault) return;
          break;
        default:
          this.fault = `illegal opcode 0x${op.toString(16)} at 0x${pc.toString(16)}`;
          return;
      }
    }
    // Budget exhausted: the frame ends here, deterministically. Next frame starts the entry afresh.
    this.cyclesLastFrame = cycles;
    this.overruns++;
  }

  private setZN(v: number) {
    this.z = v === 0;
    this.n = (v & 0x8000) !== 0;
  }
  private logic(v: number) {
    this.setZN(v & 0xffff);
    this.c = false;
    this.v = false;
  }

  // ---- syscalls -----------------------------------------------------------------------------
  private syscall(n: number) {
    const r = this.regs;
    switch (n) {
      case S.CLS:
        this.fb.fill(r[0]! & 15);
        break;
      case S.PSET:
        this.pset(s16(r[0]!), s16(r[1]!), r[2]!);
        break;
      case S.PGET: {
        const x = s16(r[0]!);
        const y = s16(r[1]!);
        r[0] = x < 0 || y < 0 || x >= SCREEN || y >= SCREEN ? 0 : this.fb[y * SCREEN + x]!;
        break;
      }
      case S.RECT: {
        const [x, y, w, h] = [s16(r[0]!), s16(r[1]!), s16(r[2]!), s16(r[3]!)];
        if (w <= 0 || h <= 0) break;
        this.fill(x, y, w, 1, r[4]!);
        this.fill(x, y + h - 1, w, 1, r[4]!);
        this.fill(x, y, 1, h, r[4]!);
        this.fill(x + w - 1, y, 1, h, r[4]!);
        break;
      }
      case S.RECTFILL:
        this.fill(s16(r[0]!), s16(r[1]!), s16(r[2]!), s16(r[3]!), r[4]!);
        break;
      case S.LINE:
        this.line(s16(r[0]!), s16(r[1]!), s16(r[2]!), s16(r[3]!), r[4]!);
        break;
      case S.SPR:
        this.sprite(r[0]!, s16(r[1]!), s16(r[2]!), r[3]!);
        break;
      case S.MAP: {
        const [map, tiles, cols, rows, x0, y0] = [r[0]!, r[1]!, r[2]!, r[3]!, s16(r[4]!), s16(r[5]!)];
        for (let ty = 0; ty < rows && ty < 64; ty++) {
          for (let tx = 0; tx < cols && tx < 64; tx++) {
            const t = this.read8(map + ty * cols + tx);
            if (t !== 0) this.sprite(tiles + t * 32, x0 + tx * 8, y0 + ty * 8, 0);
          }
        }
        break;
      }
      case S.TEXT:
        r[0] = this.text(r[0]!, s16(r[1]!), s16(r[2]!), r[3]!);
        break;
      case S.NUM: {
        const digits = String(r[0]!);
        let x = s16(r[1]!);
        for (let i = 0; i < digits.length; i++) x = this.char(digits.charCodeAt(i), x, s16(r[2]!), r[3]!);
        r[0] = x;
        break;
      }
      case S.BTN:
        r[0] = this.held;
        break;
      case S.BTNP:
        r[0] = this.pressed;
        break;
      case S.OVERLAP: {
        const [ax, ay, aw, ah, bx, by, bw, bh] = Array.from(r, s16) as [number, number, number, number, number, number, number, number];
        r[0] = ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah ? 1 : 0;
        break;
      }
      case S.RND: {
        // xorshift32
        let x = this.rng;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.rng = x >>> 0;
        const lim = r[0]!;
        r[0] = lim === 0 ? this.rng & 0xffff : this.rng % lim;
        break;
      }
      case S.SOUND:
        this.audio.push({ channel: r[0]! % 3, freq: r[1]!, duration: r[2]!, volume: r[3]! & 15, sweep: 0 });
        break;
      case S.SFX: {
        const id = r[0]!;
        const count = this.soundLen > 0 ? this.read8(this.soundBase) : 0;
        if (id >= count) break; // unknown effect: silently nothing
        const e = this.soundBase + 1 + id * 8;
        this.audio.push({
          channel: this.read8(e) % 3,
          volume: this.read8(e + 1) & 15,
          duration: this.read8(e + 2),
          freq: this.read16(e + 4),
          sweep: s16(this.read16(e + 6)),
        });
        break;
      }
      case S.FRAME:
        r[0] = this.frame & 0xffff;
        break;
      default:
        this.fault = `unknown syscall ${n} at 0x${((this.pc - 4) & 0xffff).toString(16)}`;
    }
  }

  private pset(x: number, y: number, c: number) {
    if (x >= 0 && y >= 0 && x < SCREEN && y < SCREEN) this.fb[y * SCREEN + x] = c & 15;
  }
  private fill(x: number, y: number, w: number, h: number, c: number) {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(SCREEN, x + w);
    const y1 = Math.min(SCREEN, y + h);
    for (let yy = y0; yy < y1; yy++) this.fb.fill(c & 15, yy * SCREEN + x0, yy * SCREEN + Math.max(x0, x1));
  }
  private line(x0: number, y0: number, x1: number, y1: number, c: number) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 1024; i++) {
      this.pset(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  /** 8x8, 4 bits per pixel, row-major, high nibble = left pixel; colour 0 is transparent. flags: 1 = flip x, 2 = flip y. */
  private sprite(addr: number, x: number, y: number, flags: number) {
    for (let py = 0; py < 8; py++) {
      for (let px = 0; px < 8; px++) {
        const byte = this.read8(addr + py * 4 + (px >> 1));
        const c = px & 1 ? byte & 15 : byte >> 4;
        if (c === 0) continue;
        this.pset(x + (flags & 1 ? 7 - px : px), y + (flags & 2 ? 7 - py : py), c);
      }
    }
  }
  private char(code: number, x: number, y: number, c: number): number {
    const g = glyph(code);
    if (g !== null) {
      for (let gy = 0; gy < GLYPH_H; gy++) {
        for (let gx = 0; gx < GLYPH_W; gx++) {
          if ((g >> (14 - (gy * GLYPH_W + gx))) & 1) this.pset(x + gx, y + gy, c);
        }
      }
    }
    return x + CELL_W;
  }
  private text(addr: number, x: number, y: number, c: number): number {
    const x0 = x;
    for (let i = 0; i < 256; i++) {
      const ch = this.read8(addr + i);
      if (ch === 0) break;
      if (ch === 10) {
        x = x0;
        y += CELL_H;
        continue;
      }
      x = this.char(ch, x, y, c);
    }
    return x & 0xffff;
  }

  // ---- inspection ---------------------------------------------------------------------------
  /** SHA-256 over framebuffer, RAM, RNG state and frame counter: the determinism fingerprint. */
  stateHash(): string {
    const buf = new Uint8Array(this.fb.length + 0x8000 + 8);
    buf.set(this.fb, 0);
    buf.set(this.mem.subarray(MEMORY.RAM_START), this.fb.length);
    const dv = new DataView(buf.buffer);
    dv.setUint32(this.fb.length + 0x8000, this.rng, true);
    dv.setUint32(this.fb.length + 0x8004, this.frame, true);
    return toHex(sha256(buf));
  }
  frameHash(): string {
    return toHex(sha256(this.fb));
  }
}
