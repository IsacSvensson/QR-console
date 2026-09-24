import QRCode from 'qrcode';
import * as qrVersion from 'qrcode/lib/core/version.js';
import * as qrEcl from 'qrcode/lib/core/error-correction-level.js';
import * as qrMode from 'qrcode/lib/core/mode.js';
import { FountainEncoder, Mode, PACKET_OVERHEAD } from '@qrc/transport';

export type Ecc = 'L' | 'M' | 'Q' | 'H';

export interface QrParams {
  /** QR version 1..40 (default 12). */
  version: number;
  /** Error-correction level (default M). */
  ecc: Ecc;
  /** Pixels per module (integer, default 4). */
  scale: number;
  /** Quiet zone in modules (default 4). */
  quiet: number;
}

export const DEFAULT_QR: QrParams = { version: 12, ecc: 'M', scale: 4, quiet: 4 };
/** Default frame duration of generated animations (SPEC §6). */
export const DEFAULT_FRAME_MS = 150;

/** Grayscale bitmap: 0 = black, 255 = white. */
export interface Bitmap {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Byte-mode capacity of one QR symbol. */
export function qrByteCapacity(version: number, ecc: Ecc): number {
  return qrVersion.getCapacity(version, qrEcl.from(ecc), qrMode.BYTE);
}

/** Fountain block size for these QR parameters: capacity minus packet header + CRC (SPEC §6). */
export function blockSizeFor(version: number, ecc: Ecc): number {
  return qrByteCapacity(version, ecc) - PACKET_OVERHEAD;
}

/** Renders raw bytes as one QR symbol in byte mode: pure black/white, integer scaling, no anti-aliasing. */
export function renderQr(payload: Uint8Array, params: Partial<QrParams> = {}): Bitmap {
  const p = { ...DEFAULT_QR, ...params };
  const qr = QRCode.create([{ data: payload, mode: 'byte' }], { version: p.version, errorCorrectionLevel: p.ecc });
  if (qr.version !== p.version) throw new Error(`payload needs QR version ${qr.version}, requested ${p.version}`);
  const n = qr.modules.size;
  const size = (n + 2 * p.quiet) * p.scale;
  const data = new Uint8Array(size * size).fill(255);
  for (let my = 0; my < n; my++) {
    for (let mx = 0; mx < n; mx++) {
      if (!qr.modules.get(my, mx)) continue;
      const x0 = (mx + p.quiet) * p.scale;
      const y0 = (my + p.quiet) * p.scale;
      for (let y = y0; y < y0 + p.scale; y++) data.fill(0, y * size + x0, y * size + x0 + p.scale);
    }
  }
  return { width: size, height: size, data };
}

export interface TransferPlan {
  encoder: FountainEncoder;
  /** Seeds of the frames, in display order. */
  seeds: number[];
  packets: Uint8Array[];
  params: QrParams;
}

/**
 * Default number of distinct frames in a looping animation: all K source blocks plus 50 % repair
 * packets (at least 4), so that one loop at ~20 % frame loss usually suffices (D-006).
 */
export function defaultFrameCount(K: number): number {
  return K + Math.max(4, Math.ceil(K * 0.5));
}

/** Plans the packets for one looping animation of `data` (any bytes; the transport does not parse them). */
export function planTransfer(data: Uint8Array, opts: Partial<QrParams> & { frames?: number; mode?: Mode } = {}): TransferPlan {
  const params = { ...DEFAULT_QR, ...opts };
  const encoder = new FountainEncoder(data, { blockSize: blockSizeFor(params.version, params.ecc), mode: opts.mode ?? Mode.Systematic });
  const n = opts.frames ?? defaultFrameCount(encoder.K);
  const seeds = Array.from({ length: n }, (_, i) => i);
  return { encoder, seeds, packets: seeds.map((s) => encoder.packet(s)), params };
}
