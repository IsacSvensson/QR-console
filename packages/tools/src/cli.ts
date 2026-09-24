#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseCartridge, toHex } from '@qrc/cartridge';
import { VM } from '@qrc/vm';
import { buildGame } from './games';
import { writeFramePng } from './png';

const USAGE = `qrc — QR Console tools

  qrc build <game dir> [--out file.qrc]
  qrc run <file.qrc> [--frames N] [--dump-frame out.png] [--scale S] [--seed N] [--write-ref ref.json]
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
      const cart = await parseCartridge(bytes);
      console.log(`${out}: ${bytes.length} bytes, "${cart.header.title}", id ${toHex(cart.id).slice(0, 16)}`);
      return;
    }
    case 'run': {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { frames: { type: 'string', default: '1' }, 'dump-frame': { type: 'string' }, scale: { type: 'string', default: '1' }, seed: { type: 'string', default: '1' }, 'write-ref': { type: 'string' } },
      });
      const file = positionals[0] ?? fail('run: missing <file.qrc>');
      const cart = await parseCartridge(new Uint8Array(readFileSync(file)));
      const vm = VM.fromCartridge(cart, { seed: Number(values.seed) });
      const frames = Number(values.frames);
      for (let f = 0; f < frames; f++) vm.step(0);
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
