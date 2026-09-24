#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatListing, formatSymbols } from '@qrc/asm';
import { parseCartridge, toHex } from '@qrc/cartridge';
import { DEFAULT_FRAME_MS, DEFAULT_QR, blockSizeFor, defaultFrameCount, planTransfer, qrByteCapacity, readGif, renderQr, writeGif, type Ecc } from '@qrc/qr';
import { FountainDecoder, Mode, blockCount, decodePacket } from '@qrc/transport';
import { zxingDecoder } from './node-zxing';
import { VM, expandInputs, replay, type ReplayFile } from '@qrc/vm';
import { disassemble } from './disasm';
import { buildGame, readSymbols } from './games';
import { writeFramePng } from './png';

const USAGE = `qrc — QR Console tools

  qrc build <game dir> [--out file.qrc]        (also writes <name>.sym and <name>.lst next to it)
  qrc encode <file.qrc> --out game.gif [--version 12] [--ecc M] [--frame-ms 150] [--scale 8] [--frames N] [--mode systematic|lt]
  qrc decode <file.gif> --out file.qrc
  qrc inspect <file.gif|file.qrc>
  qrc replay <file.qrc> <inputs.json> [--frames N] [--seed N]   (prints the state hash of every frame)
  qrc run <file.qrc> [--frames N] [--dump-frame out.png] [--scale S] [--seed N] [--write-ref ref.json]
          [--inputs inputs.json] [--sym file.sym] [--ram name,name,…] [--trace N] [--trace-frame F]
          --ram prints named RAM words every frame; --trace prints the first N instructions of frame F
          (default: the last frame) with registers and flags
`;

async function main(argv: string[]) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'build': {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { out: { type: 'string' } } });
      const dir = resolve(positionals[0] ?? fail('build: missing <game dir>'));
      const { bytes, name } = await buildGame(dir);
      const out = values.out ?? join(dir, `${name}.qrc`);
      writeFileSync(out, bytes);
      const { asm } = await buildGame(dir);
      const stem = out.replace(/\.qrc$/, '');
      writeFileSync(`${stem}.sym`, formatSymbols(asm));
      writeFileSync(`${stem}.lst`, formatListing(asm));
      const cart = await parseCartridge(bytes);
      console.log(`${out}: ${bytes.length} bytes, "${cart.header.title}", id ${toHex(cart.id).slice(0, 16)}`);
      return;
    }
    case 'run': {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          frames: { type: 'string', default: '1' },
          'dump-frame': { type: 'string' },
          scale: { type: 'string', default: '1' },
          seed: { type: 'string', default: '1' },
          'write-ref': { type: 'string' },
          inputs: { type: 'string' },
          sym: { type: 'string' },
          ram: { type: 'string' },
          trace: { type: 'string' },
          'trace-frame': { type: 'string' },
        },
      });
      const file = positionals[0] ?? fail('run: missing <file.qrc>');
      const cart = await parseCartridge(new Uint8Array(readFileSync(file)));
      const vm = VM.fromCartridge(cart, { seed: Number(values.seed) });
      const frames = Number(values.frames);
      const inputs = values.inputs ? expandInputs(((s) => (Array.isArray(s) ? s : s.inputs))(JSON.parse(readFileSync(values.inputs, 'utf8'))), frames) : new Uint8Array(frames);
      const symPath = values.sym ?? file.replace(/\.qrc$/, '.sym');
      const syms = existsSync(symPath) ? readSymbols(symPath) : new Map<string, number>();
      const byAddr = new Map<number, string>();
      for (const [k, v] of syms) if (!byAddr.has(v) && !/^[A-Z_0-9]+$/.test(k)) byAddr.set(v, k);
      const ramNames = values.ram ? values.ram.split(',').map((s) => s.trim()) : [];
      for (const n of ramNames) if (!syms.has(n)) fail(`--ram: unknown symbol '${n}' (no ${symPath}? run qrc build first)`);
      const traceN = values.trace ? Number(values.trace) : 0;
      const traceFrame = values['trace-frame'] ? Number(values['trace-frame']) : frames;
      for (let f = 0; f < frames; f++) {
        if (traceN && f + 1 === traceFrame) {
          let n = 0;
          console.log(`--- trace of frame ${f + 1} (first ${traceN} instructions) ---`);
          vm.tracer = (pc) => {
            if (n++ >= traceN) return;
            const r = Array.from(vm.regs, (v) => v.toString(16).padStart(4, '0')).join(' ');
            const flags = `${vm.z ? 'Z' : '-'}${vm.n ? 'N' : '-'}${vm.c ? 'C' : '-'}${vm.v ? 'V' : '-'}`;
            const where = byAddr.get(pc);
            console.log(`${pc.toString(16).padStart(4, '0')} ${(where ? `<${where}>` : '').padEnd(20)} ${disassemble(vm.mem, pc, (a) => byAddr.get(a)).padEnd(28)} ${r} ${flags}`);
          };
        } else vm.tracer = null;
        vm.step(inputs[f]!);
        if (ramNames.length) console.log(`${f + 1}: ${ramNames.map((n) => `${n}=${vm.read16(syms.get(n)!)}`).join(' ')}`);
      }
      vm.tracer = null;
      console.log(`${basename(file)}: ran ${frames} frame(s); frame hash ${vm.frameHash()}; state ${vm.stateHash()}${vm.fault ? `; FAULT: ${vm.fault}` : ''}`);
      if (values['write-ref']) {
        const ref = { frames, seed: Number(values.seed), frameHash: vm.frameHash(), stateHash: vm.stateHash() };
        writeFileSync(values['write-ref'], JSON.stringify(ref, null, 2) + '\n');
        console.log(`wrote ${values['write-ref']}`);
      }
      if (values['dump-frame']) {
        writeFramePng(values['dump-frame'], vm.fb, Number(values.scale));
        console.log(`wrote ${values['dump-frame']}`);
      }
      return;
    }
    case 'encode': {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          out: { type: 'string' },
          version: { type: 'string', default: String(DEFAULT_QR.version) },
          ecc: { type: 'string', default: DEFAULT_QR.ecc },
          'frame-ms': { type: 'string', default: String(DEFAULT_FRAME_MS) },
          scale: { type: 'string', default: '8' },
          frames: { type: 'string' },
          mode: { type: 'string', default: 'systematic' },
        },
      });
      const file = positionals[0] ?? fail('encode: missing <file.qrc>');
      const out = values.out ?? fail('encode: missing --out game.gif');
      const bytes = new Uint8Array(readFileSync(file));
      await parseCartridge(bytes); // refuse to encode something that is not a valid cartridge
      const ecc = values.ecc.toUpperCase() as Ecc;
      if (!['L', 'M', 'Q', 'H'].includes(ecc)) fail('--ecc must be L, M, Q or H');
      const plan = planTransfer(bytes, {
        version: Number(values.version),
        ecc,
        scale: Number(values.scale),
        frames: values.frames ? Number(values.frames) : undefined,
        mode: values.mode === 'lt' ? Mode.LT : Mode.Systematic,
      });
      const gif = writeGif(plan.packets.map((p) => renderQr(p, plan.params)), Number(values['frame-ms']));
      writeFileSync(out, gif);
      const loopS = (plan.packets.length * Number(values['frame-ms'])) / 1000;
      console.log(`${out}: ${plan.packets.length} frames (K=${plan.encoder.K} source blocks of ${plan.encoder.blockSize} B + ${plan.packets.length - plan.encoder.K} repair), v${plan.params.version}-${plan.params.ecc}, ${values['frame-ms']} ms/frame, loop ${loopS.toFixed(1)} s, ${gif.length} bytes`);
      return;
    }
    case 'decode': {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { out: { type: 'string' } } });
      const file = positionals[0] ?? fail('decode: missing <file.gif>');
      const out = values.out ?? fail('decode: missing --out file.qrc');
      const frames = readGif(new Uint8Array(readFileSync(file)));
      const decode = await zxingDecoder();
      const dec = new FountainDecoder();
      let read = 0;
      for (const f of frames) {
        const raw = await decode(f.rgba, f.width, f.height);
        if (!raw) continue;
        read++;
        if (dec.receive(raw) === 'complete') break;
      }
      if (!dec.done) fail(`could not reconstruct: ${dec.recovered}/${dec.K} blocks from ${read}/${frames.length} readable frames`);
      const bytes = dec.getResult()!;
      const cart = await parseCartridge(bytes); // verifies the body hash too
      writeFileSync(out, bytes);
      console.log(`${out}: ${bytes.length} bytes, "${cart.header.title}", id ${toHex(cart.id).slice(0, 16)} (used ${read} of ${frames.length} frames)`);
      return;
    }
    case 'inspect': {
      const file = rest[0] ?? fail('inspect: missing <file>');
      const bytes = new Uint8Array(readFileSync(file));
      const magic = String.fromCharCode(...bytes.subarray(0, 4));
      if (magic === 'QRC1') {
        const cart = await parseCartridge(bytes);
        const h = cart.header;
        const B = blockSizeFor(DEFAULT_QR.version, DEFAULT_QR.ecc);
        const K = blockCount(bytes.length, B);
        console.log(`cartridge      ${file}`);
        console.log(`title          ${h.title}`);
        console.log(`id             ${toHex(cart.id)}`);
        console.log(`size           ${bytes.length} bytes (header ${h.headerSize}, body ${h.storedSize} stored / ${h.uncompressedSize} uncompressed, ${h.compression ? 'deflate-raw' : 'no compression'})`);
        console.log(`format / ISA   v${h.formatVersion} / ISA ${h.isaVersion}`);
        console.log(`sections       code ${cart.sections.code.length}, rodata ${cart.sections.rodata.length}, sound ${cart.sections.sound.length} bytes`);
        console.log(`as QR (default v${DEFAULT_QR.version}-${DEFAULT_QR.ecc}, ${DEFAULT_FRAME_MS} ms): blocks K=${K} of ${B} B, ${defaultFrameCount(K)} frames per loop`);
        return;
      }
      if (magic.startsWith('GIF')) {
        const frames = readGif(bytes);
        const decode = await zxingDecoder();
        const seeds = new Set<number>();
        const ids = new Set<string>();
        let pkt: ReturnType<typeof decodePacket> | null = null;
        let unreadable = 0;
        for (const f of frames) {
          const raw = await decode(f.rgba, f.width, f.height);
          const p = raw ? decodePacket(raw) : null;
          if (!p || typeof p === 'string') {
            unreadable++;
            continue;
          }
          pkt = p;
          seeds.add(p.seed);
          ids.add(toHex(p.id));
        }
        if (!pkt || typeof pkt === 'string') fail('no readable QR packets in this GIF');
        const K = blockCount(pkt.totalLength, pkt.blockSize);
        const capacity = pkt.blockSize + 25;
        const match = [];
        for (let v = 1; v <= 40; v++) for (const e of ['L', 'M', 'Q', 'H'] as const) if (qrByteCapacity(v, e) === capacity) match.push(`v${v}-${e}`);
        console.log(`animation      ${file}`);
        console.log(`frames         ${frames.length} × ${frames[0]!.delayMs} ms (loop ${((frames.length * frames[0]!.delayMs) / 1000).toFixed(1)} s), ${frames[0]!.width}×${frames[0]!.height} px, ${unreadable} unreadable`);
        console.log(`cartridge id   ${[...ids].join(', ')} (first 8 bytes of SHA-256)`);
        console.log(`size           ${pkt.totalLength} bytes`);
        console.log(`blocks         K=${K} of ${pkt.blockSize} B; ${seeds.size} distinct packets (${Math.max(0, seeds.size - K)} beyond K), mode ${Mode[pkt.mode]}`);
        console.log(`QR             byte capacity ${capacity} B → ${match.join(' / ') || 'custom'}`);
        return;
      }
      fail(`${file}: neither a QRC1 cartridge nor a GIF`);
      return;
    }
    case 'replay': {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { frames: { type: 'string' }, seed: { type: 'string' } } });
      const [file, inputsFile] = positionals;
      if (!file || !inputsFile) fail('replay: usage: qrc replay <file.qrc> <inputs.json> [--frames N]');
      const script = JSON.parse(readFileSync(inputsFile, 'utf8')) as ReplayFile | ReplayFile['inputs'];
      const rf: ReplayFile = Array.isArray(script) ? { inputs: script } : script;
      const cart = await parseCartridge(new Uint8Array(readFileSync(file)));
      const seed = Number(values.seed ?? rf.seed ?? 1);
      const frames = Number(values.frames ?? (Array.isArray(rf.inputs[0]) ? (rf.inputs as [number, number][]).reduce((n, [c]) => n + c, 0) : rf.inputs.length));
      const hashes = replay(VM.fromCartridge(cart, { seed }), rf.inputs, frames);
      hashes.forEach((h, i) => console.log(`${i + 1} ${h}`));
      return;
    }
    default:
      console.log(USAGE);
      if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = 1;
  }
}

function fail(msg: string): never {
  throw new Error(msg);
}

main(process.argv.slice(2)).catch((e: Error) => {
  console.error(`qrc: ${e.message}`);
  process.exit(1);
});
