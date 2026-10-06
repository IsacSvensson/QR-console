import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { unpack } from '@qrc/asm';
import { BOX_CONTENT, ENEMY_TYPE, PREFAB_IDS, SIGN_KIND, generateLevels } from '../../games/bo/tools/levels';
import { generateTiles, T, WTILE } from '../../games/bo/tools/tiles';
import { boView, frameProblems, gridOf } from './frames';
import { type Bo, CONSTS, GAME_DIR, LEVEL_IDS, ROWS, buildBo, derivedNumbers, ramAttrs, readRefLevel, runReplay, symbol, vmInLevel } from './oracle';

// M19 acceptance: levels, scrolling, rolling (PLAN.md Part 3).
let bo: Bo;
beforeAll(async () => {
  bo = await buildBo();
});

describe('Bo build', () => {
  it('generated data files are up to date with the level sources and the tile art', () => {
    expect(readFileSync(join(GAME_DIR, 'tiles.gen.asm'), 'utf8')).toBe(generateTiles());
    expect(readFileSync(join(GAME_DIR, 'levels.gen.asm'), 'utf8')).toBe(generateLevels().asm);
  });

  it('reports the cartridge and ROM size', () => {
    const s = bo.cart.sections;
    const rom = s.code.length + s.rodata.length + s.sound.length;
    console.log(`[size] bo: cartridge ${bo.bytes.length} B, ROM ${rom} B of 32768 (code ${s.code.length}, data ${s.rodata.length}, sound ${s.sound.length})`);
    expect(rom).toBeLessThanOrEqual(32768);
  });

  it('the physics constants in ROM equal DESIGN.md §3.2', () => {
    expect(Object.keys(CONSTS).length).toBeGreaterThanOrEqual(20);
    for (const [name, value] of Object.entries(CONSTS)) {
      const a = symbol(bo.sym, `PH_${name}`);
      expect(bo.rom[a]! | (bo.rom[a + 1]! << 8), name).toBe(value);
    }
  });
});

// ---- the ROM level table, decoded independently (FORMAT.md, "ROM format") -----------------------------
type Item = Record<string, string | number>;
const name = (table: Record<string, number>, v: number) => Object.entries(table).find(([, x]) => x === v)?.[0] ?? `?${v}`;
const tileName = (code: number) => name(T as unknown as Record<string, number>, code) ?? name(WTILE, code);
const KIND_OF_CODE: Record<number, string> = { [T.BLOCK]: 'block', [T.WEAK]: 'weak', [T.BOUNCE]: 'bounce', [T.BAR]: 'bar', [T.RAIL]: 'rail' };
const TERRAIN_OPS = ['flat', 'up22', 'down22', 'up45', 'down45', 'gap', 'liquid'];

function normalize(t: { op: string; n: number }[]) {
  const out: { op: string; n: number }[] = [];
  for (const s of t) {
    const last = out[out.length - 1];
    if (last && last.op === s.op && TERRAIN_OPS.includes(s.op)) last.n += s.n;
    else out.push({ ...s });
  }
  return out;
}

function decodeRom(bo: Bo) {
  const rom = bo.rom;
  const rd16 = (a: number) => rom[a]! | (rom[a + 1]! << 8);
  const table = symbol(bo.sym, 'level_table');
  const xdata = bo.cart.sections.xdata!;
  return LEVEL_IDS.map((_, i) => {
    const base = table + i * 14;
    const head = { width: rd16(base + 6), h0: rom[base + 8]!, rows: rom[base + 9]!, world: rom[base + 10]!, start: rom[base + 11]!, music: rom[base + 12]! };
    // the level's terrain and objects are packed in xdata (ISA 2): far address (hi, lo), objects at an offset
    const far = rd16(base) * 0x10000 + rd16(base + 2);
    expect(far, `level ${i} lives in xdata`).toBeGreaterThanOrEqual(0x10000);
    const data = unpack(xdata.subarray(far - 0x10000));
    const terrain: { op: string; n: number }[] = [];
    for (let p = 0; ; p++) {
      const b = data[p]!;
      const type = b >> 5;
      const low = b & 31;
      if (type < 7) terrain.push({ op: TERRAIN_OPS[type]!, n: low + 1 });
      else if (low < 16) terrain.push({ op: 'step', n: low - 8 });
      else if (low < 20) terrain.push({ op: `mat:${['normal', 'sand', 'ice', 'alt'][low - 16]}`, n: 0 });
      else if (low < 22) terrain.push({ op: `liq:${['water', 'choc'][low - 20]}`, n: 0 });
      else if (low === 31) break;
      else throw new Error(`level ${i}: bad terrain byte ${b}`);
    }
    const items: Item[] = [];
    const apples = new Set<string>();
    for (let p = rd16(base + 4); ; ) {
      if (data[p] === 255 && data[p + 1] === 255) break;
      const col = data[p]! | ((data[p + 1]! & 1) << 8);
      const type = data[p + 1]! >> 1;
      const row = data[p + 2]!;
      const param = data[p + 3]!;
      const y = ROWS - 1 - row;
      p += 4;
      switch (type) {
        case 1:
        case 2: {
          let w = 1;
          let h = 1;
          if (type === 2) {
            w = (data[p]! & 15) + 1;
            h = (data[p]! >> 4) + 1;
            p++;
          }
          const kind = KIND_OF_CODE[param];
          if (kind === 'rail') items.push({ kind, col, y, w });
          else if (kind) items.push({ kind, col, y, w, h });
          else items.push({ kind: 'tile', name: tileName(param), col, y, w, h });
          break;
        }
        case 3: {
          let c = col;
          let r = row;
          apples.add(`${c},${r}`);
          for (let k = 1; k < param; k++) {
            const d = data[p++]!;
            c += d >> 4;
            r += (d & 15) >= 8 ? (d & 15) - 16 : d & 15;
            apples.add(`${c},${r}`);
          }
          break;
        }
        case 4: items.push({ kind: 'box', col, y, content: name(BOX_CONTENT, param) }); break;
        case 5: items.push({ kind: 'star', col, y, n: param + 1 }); break;
        case 6: items.push({ kind: 'part', col, y }); break;
        case 7: items.push({ kind: 'flag', col }); break;
        case 8: items.push({ kind: 'goal', col }); break;
        case 9: items.push({ kind: 'enemy', col, y, type: name(ENEMY_TYPE, param) }); break;
        case 10: items.push({ kind: 'fg', col, y, name: PREFAB_IDS[param]! }); break;
        case 11: items.push({ kind: ['ramp45', 'ramp45l', 'ramp22', 'ramp22l'][param >> 4]!, col, n: (param & 15) + 1 }); break;
        case 12: items.push({ kind: 'raild', col, y, n: (param & 127) + 1, dir: param & 128 ? 'down' : 'up' }); break;
        case 13: items.push({ kind: 'platform', col, y, w: param }); break;
        case 14: items.push({ kind: 'sign', col, sign: name(SIGN_KIND, param) }); break;
        case 15: items.push({ kind: 'pickup', col, y, what: param === T.POMMES ? 'pommes' : param === T.GODIS ? 'godis' : `?${param}` }); break;
        case 16: items.push({ kind: 'prefab', col, y, name: PREFAB_IDS[param]! }); break;
        default: throw new Error(`level ${i}: object type ${type}`);
      }
    }
    return { head, terrain, items, apples };
  });
}

/** The same items read from the .lvl source (heights resolved against the reference ground). */
function sourceItems(id: string) {
  const L = readRefLevel(id);
  const g = gridOf(id);
  const items: Item[] = [];
  for (const o of L.objects) {
    const y = (k: number) => {
      const s = o.args[k] ?? 'g';
      const m = /^g([+-]\d+)?$/.exec(s);
      return m ? g.ground[o.col]! + Number(m[1] ?? 0) : Number(s);
    };
    const n = (k: number, d = 1) => (o.args[k] === undefined ? d : Number(o.args[k]));
    switch (o.kind) {
      case 'apples': case 'column': case 'apple': case 'arc': break;
      case 'block': case 'weak': case 'bounce': case 'bar': items.push({ kind: o.kind, col: o.col, y: y(0), w: n(1), h: n(2) }); break;
      case 'tile': items.push({ kind: 'tile', name: o.args[0]!, col: o.col, y: y(1), w: n(2), h: n(3) }); break;
      case 'rail': items.push({ kind: 'rail', col: o.col, y: y(0), w: n(1) }); break;
      case 'raild': items.push({ kind: 'raild', col: o.col, y: y(0), n: n(1), dir: o.args[2]! }); break;
      case 'platform': items.push({ kind: 'platform', col: o.col, y: y(0), w: n(1) }); break;
      case 'ramp45': case 'ramp45l': case 'ramp22': case 'ramp22l': items.push({ kind: o.kind, col: o.col, n: n(0) }); break;
      case 'box': items.push({ kind: 'box', col: o.col, y: y(0), content: o.args[1] ?? 'apples' }); break;
      case 'star': items.push({ kind: 'star', col: o.col, y: y(0), n: n(1) }); break;
      case 'part': items.push({ kind: 'part', col: o.col, y: y(0) }); break;
      case 'flag': case 'goal': items.push({ kind: o.kind, col: o.col }); break;
      case 'sign': items.push({ kind: 'sign', col: o.col, sign: o.args[0]! }); break;
      case 'pickup': items.push({ kind: 'pickup', col: o.col, y: y(1), what: o.args[0]! }); break;
      case 'prefab': case 'fg': items.push({ kind: o.kind, col: o.col, y: y(1), name: o.args[0]! }); break;
      case 'enemy': items.push({ kind: 'enemy', col: o.col, y: y(1), type: o.args[0]! }); break;
      default: throw new Error(`${id}: ${o.kind}`);
    }
  }
  return { L, items, apples: new Set([...g.patterns.values()].flat().map(([c, r]) => `${c},${r}`)) };
}

const canon = (items: Item[]) => items.map((i) => JSON.stringify(Object.fromEntries(Object.entries(i).sort()))).sort();

describe('levels (M19)', () => {
  it('a TypeScript decoder of the ROM level table reproduces the terrain and objects of every .lvl source', () => {
    const rom = decodeRom(bo);
    expect(rom.length).toBe(LEVEL_IDS.length);
    LEVEL_IDS.forEach((id, i) => {
      const src = sourceItems(id);
      const r = rom[i]!;
      expect(r.head, id).toEqual({ width: src.L.width, h0: src.L.h0, rows: src.L.rows, world: src.L.world, start: src.L.start, music: src.L.music });
      expect(normalize(r.terrain), id).toEqual(normalize(src.L.terrain));
      expect(canon(r.items), id).toEqual(canon(src.items));
      expect([...r.apples].sort(), id).toEqual([...src.apples].sort());
    });
  });

  it('every level, unpacked by the engine into RAM, equals the reference grid built from its .lvl source', () => {
    for (const id of LEVEL_IDS) {
      const g = gridOf(id);
      const vm = vmInLevel(bo, id);
      expect(vm.read16(symbol(bo.sym, 'lv_w')), id).toBe(g.level.width);
      const ram = ramAttrs(bo, vm, g.level.width);
      const diffs: string[] = [];
      for (let i = 0; i < ram.length && diffs.length < 10; i++) if (ram[i] !== g.attr[i]) diffs.push(`${id} col ${Math.floor(i / ROWS)} row ${i % ROWS}: RAM ${ram[i]} reference ${g.attr[i]}`);
      expect(diffs).toEqual([]);
    }
  });
});

// ---- replays: per-frame reference checks and the derived values of §3.3 ------------------------------
interface Sample {
  input: number;
  x16: number;
  y16: number;
  vx: number;
  vy: number;
  grounded: boolean;
  playing: boolean;
  sattr: number;
}
const samples = new Map<string, Sample[]>();
const A_BTN = 16;
const LR = 3;

for (const name of ['m19-t1', 'm19-t2']) {
  describe(`replay ${name} (M19)`, () => {
    it('matches the committed per-frame hashes; budgets; Bo never overlaps a solid cell and stands exactly on the reference surface', () => {
      const problems: string[] = [];
      const list: Sample[] = [];
      const run = runReplay(bo, name, (v) => {
        const b = boView(bo, v);
        problems.push(...frameProblems(b, v.f));
        list.push({ input: v.input, x16: b.x16, y16: b.y16, vx: b.vx, vy: b.vy, grounded: b.grounded, playing: b.playing, sattr: b.sattr });
      });
      samples.set(name, list);
      expect(run.hashMismatch, 'first frame whose state hash differs').toBe(-1);
      expect(run.expectedFrames).toBe(run.rf.frames);
      expect(problems.slice(0, 10)).toEqual([]);
      expect(run.vm.fault).toBeNull();
      expect(run.vm.overruns).toBe(0);
      console.log(`[budget] ${name}: ${run.rf.frames} frames, max ${run.maxCycles} cycles per frame`);
      expect(run.maxCycles).toBeLessThanOrEqual(25_000);
    });
  });
}

describe('derived values of DESIGN.md §3.3, measured from the replays (M19)', () => {
  const all = () => [...samples.values()];
  /** ollies on flat ground that land at their takeoff height: A held every frame (hold) or only the first (tap) */
  function ollies() {
    const out: { kind: 'hold' | 'tap'; v: number; height: number; air: number; length: number }[] = [];
    for (const s of all()) {
      for (let f = 1; f < s.length; f++) {
        if (!(s[f - 1]!.grounded && !s[f]!.grounded && s[f]!.vy === -(CONSTS.JUMP_V! - CONSTS.G!) && s[f]!.input & A_BTN && !(s[f - 1]!.input & A_BTN))) continue;
        let e = f;
        while (e < s.length && !s[e]!.grounded) e++;
        if (e >= s.length || s[e]!.y16 !== s[f - 1]!.y16 || s[f - 1]!.sattr !== s[e]!.sattr) continue;
        const aFrames = s.slice(f, e + 1).map((x) => !!(x.input & A_BTN));
        const kind = aFrames.every(Boolean) ? 'hold' : aFrames.slice(1).every((a) => !a) ? 'tap' : null;
        if (!kind) continue;
        // a free flight only (nothing hit on the way): vy grows by G every frame (a tap: after the cut)
        let free = true;
        for (let k = f + 1; k < e; k++) {
          const prev = kind === 'tap' && k === f + 1 ? Math.max(s[k - 1]!.vy, -CONSTS.JUMP_CUT!) : s[k - 1]!.vy;
          if (s[k]!.vy !== Math.min(prev + CONSTS.G!, CONSTS.MAX_FALL!)) free = false;
        }
        if (!free) continue;
        const minY = Math.min(...s.slice(f, e + 1).map((x) => x.y16));
        out.push({ kind, v: s[f]!.vx, height: (s[f - 1]!.y16 - minY) / 16, air: e - f + 1, length: (s[e]!.x16 - s[f - 1]!.x16) / 16 });
      }
    }
    return out;
  }

  it('ollie with A held: height and airtime; tap height and airtime', () => {
    const [h, hTiles, air] = derivedNumbers('Ollie med A');
    const [tapH, tapAir] = derivedNumbers('Kort tryck');
    void hTiles;
    const o = ollies();
    const holds = o.filter((x) => x.kind === 'hold');
    const taps = o.filter((x) => x.kind === 'tap');
    console.log(`[measured] ollies: ${o.map((x) => `${x.kind} v${x.v} ${x.height.toFixed(2)} px ${x.air} f ${x.length.toFixed(1)} px`).join('; ')}`);
    expect(holds.length).toBeGreaterThan(0);
    expect(taps.length).toBeGreaterThan(0);
    for (const x of holds) {
      expect(Math.abs(x.height - h!)).toBeLessThanOrEqual(1);
      expect(Math.abs(x.air - air!)).toBeLessThanOrEqual(1);
    }
    for (const x of taps) {
      expect(Math.abs(x.height - tapH!)).toBeLessThanOrEqual(1);
      expect(Math.abs(x.air - tapAir!)).toBeLessThanOrEqual(1);
    }
  });

  it('jump length at 1.5 / 2.5 / 3.5 px per frame', () => {
    const lengths = derivedNumbers('Hopplängd'); // 6,4 / 10,6 / 14,9 tiles
    const speeds = [24, 40, 56];
    const holds = ollies().filter((x) => x.kind === 'hold');
    speeds.forEach((v, i) => {
      const got = holds.filter((x) => x.v === v);
      expect(got.length, `an ollie at ${v / 16} px per frame`).toBeGreaterThan(0);
      // the table rounds to 0.1 tile; one frame more or less moves the landing by v/16 px
      for (const x of got) expect(Math.abs(x.length - lengths[i]! * 8)).toBeLessThanOrEqual(1 + v / 16 + 0.4);
    });
  });

  /** runs of frames on the ground: from vx = from (at the frame before) with `btn(input)` true, until vx = to */
  function runs(from: number, to: number, btn: (input: number, vx: number) => boolean, onSlope = false) {
    const out: { frames: number; dist: number }[] = [];
    for (const s of all()) {
      for (let f = 1; f < s.length; f++) {
        const p = s[f - 1]!;
        if (!p.grounded || Math.abs(p.vx) !== from || !btn(s[f]!.input, p.vx)) continue;
        if (f >= 2 && Math.abs(s[f - 2]!.vx) === from && btn(s[f - 1]!.input, s[f - 2]!.vx) && s[f - 2]!.grounded) continue; // not the start
        const slope = ((p.sattr & 15) === 2) === onSlope;
        if (!slope) continue;
        // every frame of the run on the same kind of ground: flat normal ground, or a slope
        const same = (x: Sample) => ((x.sattr & 15) === 2) === onSlope && (onSlope || (x.sattr & 15) === 1);
        let e = f;
        while (e < s.length && s[e]!.grounded && same(s[e]!) && btn(s[e]!.input, s[e - 1]!.vx) && Math.abs(s[e]!.vx) !== to) e++;
        if (e >= s.length || Math.abs(s[e]!.vx) !== to || !s[e]!.grounded || !same(s[e]!)) continue;
        // no wall or level edge stopped Bo: the speed changes by at most the slope + brake per frame
        let smooth = true;
        for (let k = f; k <= e; k++) if (Math.abs(Math.abs(s[k]!.vx) - Math.abs(s[k - 1]!.vx)) > CONSTS.BRAKE! + CONSTS.SLOPE_45!) smooth = false;
        if (!smooth) continue;
        out.push({ frames: e - f + 1, dist: Math.abs(s[e]!.x16 - p.x16) / 16 });
      }
    }
    return out;
  }
  const near = (got: { frames: number; dist: number }[], frames: number, dist: number, what: string) => {
    console.log(`[measured] ${what}: ${got.map((g) => `${g.frames} f ${g.dist.toFixed(2)} px`).join('; ')} (DESIGN: ${frames} f, ${dist} px)`);
    expect(got.length, what).toBeGreaterThan(0);
    for (const g of got) {
      expect(Math.abs(g.frames - frames), what).toBeLessThanOrEqual(1);
      expect(Math.abs(g.dist - dist), what).toBeLessThanOrEqual(1);
    }
  };

  it('push 0 -> 1.5 px per frame', () => {
    const [frames, dist] = derivedNumbers('Push 0 → 1,5');
    near(runs(0, 24, (i) => (i & LR) !== 0 && (i & LR) !== LR), frames!, dist!, 'push 0 -> 24');
  });

  it('coasting out from 1.5 px per frame on flat ground', () => {
    const [frames, dist] = derivedNumbers('Rulla ut');
    near(runs(24, 0, (i) => i === 0), frames!, dist!, 'coast 24 -> 0');
  });

  it('braking from 1.5 and from 2.5 px per frame', () => {
    const [f1, d1, f2, d2] = derivedNumbers('Broms från');
    const opposite = (i: number, vx: number) => (vx > 0 ? i === 1 : vx < 0 ? i === 2 : i === 1 || i === 2);
    near(runs(24, 0, opposite), f1!, d1!, 'brake 24 -> 0');
    near(runs(40, 0, opposite), f2!, d2!, 'brake 40 -> 0');
  });

  it('downhill from standstill to the speed cap on 22.5° and 45°', () => {
    const [f22, d22, f45, d45] = derivedNumbers('Nedför 22,5°');
    const free = (i: number) => i === 0;
    const got = runs(0, CONSTS.SPEED_CAP!, free, true);
    // which slope: 22.5° slopes accelerate by SLOPE_22 per frame, 45° by SLOPE_45 — split by duration
    const by22 = got.filter((g) => g.frames > (f22! + f45!) / 2);
    const by45 = got.filter((g) => g.frames <= (f22! + f45!) / 2);
    near(by22, f22!, d22!, 'downhill 22.5°');
    near(by45, f45!, d45!, 'downhill 45°');
  });
});
