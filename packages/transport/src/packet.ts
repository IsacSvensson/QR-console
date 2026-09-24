import { crc32 } from './crc32';

// Packet layout: see ../PACKET.md. All integers little-endian.
export const PACKET_MAGIC0 = 0x51; // 'Q'
export const PACKET_MAGIC1 = 0x46; // 'F'
export const PROTOCOL_VERSION = 1;
export const HEADER_SIZE = 21;
export const CRC_SIZE = 4;
export const PACKET_OVERHEAD = HEADER_SIZE + CRC_SIZE;

export enum Mode {
  /** Every seed is an LT packet drawn from the robust soliton distribution. */
  LT = 0,
  /** Seeds 0..K-1 carry source block `seed` verbatim; seeds >= K are LT repair packets. */
  Systematic = 1,
}

export interface Packet {
  mode: Mode;
  id: Uint8Array; // 8 bytes
  totalLength: number;
  blockSize: number;
  seed: number;
  payload: Uint8Array;
}

export type PacketParseError = 'too-short' | 'bad-magic' | 'bad-version' | 'bad-crc' | 'bad-fields';

export function encodePacket(p: Packet): Uint8Array {
  if (p.id.length !== 8) throw new Error('id must be 8 bytes');
  if (p.payload.length !== p.blockSize) throw new Error('payload must be blockSize bytes');
  const out = new Uint8Array(PACKET_OVERHEAD + p.blockSize);
  const dv = new DataView(out.buffer);
  out[0] = PACKET_MAGIC0;
  out[1] = PACKET_MAGIC1;
  out[2] = (PROTOCOL_VERSION << 4) | p.mode;
  out.set(p.id, 3);
  dv.setUint32(11, p.totalLength, true);
  dv.setUint16(15, p.blockSize, true);
  dv.setUint32(17, p.seed >>> 0, true);
  out.set(p.payload, HEADER_SIZE);
  dv.setUint32(HEADER_SIZE + p.blockSize, crc32(out, 0, HEADER_SIZE + p.blockSize), true);
  return out;
}

export function decodePacket(bytes: Uint8Array): Packet | PacketParseError {
  if (bytes.length < PACKET_OVERHEAD + 1) return 'too-short';
  if (bytes[0] !== PACKET_MAGIC0 || bytes[1] !== PACKET_MAGIC1) return 'bad-magic';
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blockSize = dv.getUint16(15, true);
  // CRC first: nothing from a corrupted packet is trusted, including the length fields.
  const end = HEADER_SIZE + blockSize;
  if (bytes.length !== end + CRC_SIZE) {
    // blockSize itself may be corrupt; check CRC over what we have to classify it.
    const crcAt = bytes.length - CRC_SIZE;
    if (crc32(bytes, 0, crcAt) !== dv.getUint32(crcAt, true)) return 'bad-crc';
    return 'bad-fields';
  }
  if (crc32(bytes, 0, end) !== dv.getUint32(end, true)) return 'bad-crc';
  if (bytes[2]! >> 4 !== PROTOCOL_VERSION) return 'bad-version';
  const mode = bytes[2]! & 0x0f;
  if (mode !== Mode.LT && mode !== Mode.Systematic) return 'bad-fields';
  const totalLength = dv.getUint32(11, true);
  if (blockSize === 0) return 'bad-fields';
  return {
    mode,
    id: bytes.slice(3, 11),
    totalLength,
    blockSize,
    seed: dv.getUint32(17, true),
    payload: bytes.slice(HEADER_SIZE, end),
  };
}

export function blockCount(totalLength: number, blockSize: number): number {
  return Math.max(1, Math.ceil(totalLength / blockSize));
}
