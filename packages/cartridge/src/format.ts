import { deflateRaw, inflateRaw } from './compression';
import { sha256, toHex } from './sha256';

// Byte layout: see ../FORMAT.md. All integers little-endian.

export const MAGIC = [0x51, 0x52, 0x43, 0x31] as const; // "QRC1"
export const FORMAT_VERSION = 1;
export const HEADER_FIXED_SIZE = 52;
export const MAX_TITLE_BYTES = 32;

export enum PayloadType {
  VmRom = 1,
}

export enum Compression {
  None = 0,
  DeflateRaw = 1,
}

export enum SectionType {
  Code = 1,
  Rodata = 2,
  Sound = 3,
}

export interface CartridgeSections {
  code: Uint8Array;
  rodata: Uint8Array;
  sound: Uint8Array;
}

export interface CartridgeHeader {
  formatVersion: number;
  isaVersion: number;
  payloadType: PayloadType;
  compression: Compression;
  title: string;
  uncompressedSize: number;
  storedSize: number;
  bodyHash: Uint8Array;
  headerSize: number;
}

export interface Cartridge {
  header: CartridgeHeader;
  sections: CartridgeSections;
  /** SHA-256 over the entire serialized file (SPEC §4 "cartridge id"). */
  id: Uint8Array;
}

export interface CartridgeInput {
  title: string;
  isaVersion: number;
  sections: CartridgeSections;
  /** 'auto' stores deflate-raw only when it is smaller. Default 'auto'. */
  compression?: 'none' | 'deflate-raw' | 'auto';
}

export class CartridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CartridgeError';
  }
}

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
function put16(b: Uint8Array, o: number, v: number) {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
}
function put32(b: Uint8Array, o: number, v: number) {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
  b[o + 2] = (v >>> 16) & 0xff;
  b[o + 3] = (v >>> 24) & 0xff;
}

const SECTION_ORDER: [SectionType, keyof CartridgeSections][] = [
  [SectionType.Code, 'code'],
  [SectionType.Rodata, 'rodata'],
  [SectionType.Sound, 'sound'],
];

/** Body (uncompressed) = u8 section count, count × {u8 type, u32 length}, then section bytes in table order. */
export function encodeBody(sections: CartridgeSections): Uint8Array {
  const tableSize = 1 + SECTION_ORDER.length * 5;
  const total = tableSize + SECTION_ORDER.reduce((n, [, k]) => n + sections[k].length, 0);
  const body = new Uint8Array(total);
  body[0] = SECTION_ORDER.length;
  let off = tableSize;
  SECTION_ORDER.forEach(([type, key], i) => {
    body[1 + i * 5] = type;
    put32(body, 2 + i * 5, sections[key].length);
    body.set(sections[key], off);
    off += sections[key].length;
  });
  return body;
}

export function decodeBody(body: Uint8Array): CartridgeSections {
  if (body.length < 1) throw new CartridgeError('body is empty: no section table');
  const count = body[0]!;
  const tableSize = 1 + count * 5;
  if (body.length < tableSize) throw new CartridgeError('body truncated inside section table');
  const found = new Map<number, Uint8Array>();
  let off = tableSize;
  for (let i = 0; i < count; i++) {
    const type = body[1 + i * 5]!;
    const len = u32(body, 2 + i * 5);
    if (off + len > body.length) throw new CartridgeError(`section ${type} runs past end of body`);
    if (found.has(type)) throw new CartridgeError(`duplicate section ${type}`);
    found.set(type, body.subarray(off, off + len));
    off += len;
  }
  if (off !== body.length) throw new CartridgeError(`body has ${body.length - off} trailing bytes`);
  const get = (t: SectionType, name: string) => {
    const s = found.get(t);
    if (!s) throw new CartridgeError(`missing required section: ${name}`);
    return s;
  };
  return { code: get(SectionType.Code, 'code'), rodata: get(SectionType.Rodata, 'rodata'), sound: get(SectionType.Sound, 'sound') };
}

export async function serializeCartridge(input: CartridgeInput): Promise<Uint8Array> {
  const titleBytes = new TextEncoder().encode(input.title);
  if (titleBytes.length > MAX_TITLE_BYTES) throw new CartridgeError(`title is ${titleBytes.length} bytes, max ${MAX_TITLE_BYTES}`);
  if (input.isaVersion < 0 || input.isaVersion > 0xffff) throw new CartridgeError('isaVersion out of range');
  const raw = encodeBody(input.sections);
  const mode = input.compression ?? 'auto';
  let stored = raw;
  let compression = Compression.None;
  if (mode !== 'none') {
    const deflated = await deflateRaw(raw);
    if (mode === 'deflate-raw' || deflated.length < raw.length) {
      stored = deflated;
      compression = Compression.DeflateRaw;
    }
  }
  const headerSize = HEADER_FIXED_SIZE + titleBytes.length;
  const out = new Uint8Array(headerSize + stored.length);
  out.set(MAGIC, 0);
  out[4] = FORMAT_VERSION;
  out[5] = 0; // flags, reserved
  put16(out, 6, input.isaVersion);
  out[8] = PayloadType.VmRom;
  out[9] = compression;
  out[10] = titleBytes.length;
  out[11] = 0; // reserved
  put32(out, 12, raw.length);
  put32(out, 16, stored.length);
  out.set(sha256(stored), 20);
  out.set(titleBytes, HEADER_FIXED_SIZE);
  out.set(stored, headerSize);
  return out;
}

/** Validates everything that can be checked without decompressing: magic, version, sizes, body hash. */
export function parseHeader(bytes: Uint8Array): CartridgeHeader {
  if (bytes.length < HEADER_FIXED_SIZE) throw new CartridgeError(`truncated: ${bytes.length} bytes is shorter than the ${HEADER_FIXED_SIZE}-byte header`);
  for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) throw new CartridgeError('bad magic: not a QRC1 cartridge');
  const formatVersion = bytes[4]!;
  if (formatVersion !== FORMAT_VERSION) throw new CartridgeError(`unsupported format version ${formatVersion} (supported: ${FORMAT_VERSION})`);
  const payloadType = bytes[8]!;
  if (payloadType !== PayloadType.VmRom) throw new CartridgeError(`unknown payload type ${payloadType}`);
  const compression = bytes[9]!;
  if (compression !== Compression.None && compression !== Compression.DeflateRaw) throw new CartridgeError(`unknown compression method ${compression}`);
  const titleLen = bytes[10]!;
  if (titleLen > MAX_TITLE_BYTES) throw new CartridgeError(`title length ${titleLen} exceeds ${MAX_TITLE_BYTES}`);
  const headerSize = HEADER_FIXED_SIZE + titleLen;
  const uncompressedSize = u32(bytes, 12);
  const storedSize = u32(bytes, 16);
  if (bytes.length < headerSize + storedSize) throw new CartridgeError(`truncated: expected ${headerSize + storedSize} bytes, got ${bytes.length}`);
  if (bytes.length > headerSize + storedSize) throw new CartridgeError(`size mismatch: ${bytes.length - headerSize - storedSize} unexpected trailing bytes`);
  if (compression === Compression.None && uncompressedSize !== storedSize) throw new CartridgeError('size mismatch: uncompressed body size differs from stored size');
  const bodyHash = bytes.slice(20, 52);
  const body = bytes.subarray(headerSize);
  if (toHex(sha256(body)) !== toHex(bodyHash)) throw new CartridgeError('body hash mismatch: cartridge is corrupted');
  let title: string;
  try {
    title = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(HEADER_FIXED_SIZE, headerSize));
  } catch {
    throw new CartridgeError('title is not valid UTF-8');
  }
  return {
    formatVersion,
    isaVersion: u16(bytes, 6),
    payloadType,
    compression,
    title,
    uncompressedSize,
    storedSize,
    bodyHash,
    headerSize,
  };
}

/** Full load: header checks, body hash, decompression, section table. */
export async function parseCartridge(bytes: Uint8Array): Promise<Cartridge> {
  const header = parseHeader(bytes);
  const stored = bytes.subarray(header.headerSize);
  let body: Uint8Array;
  if (header.compression === Compression.DeflateRaw) {
    try {
      body = await inflateRaw(stored);
    } catch (e) {
      throw new CartridgeError(`decompression failed: ${(e as Error).message}`);
    }
  } else {
    body = stored;
  }
  if (body.length !== header.uncompressedSize) throw new CartridgeError(`size mismatch: body inflated to ${body.length} bytes, header says ${header.uncompressedSize}`);
  return { header, sections: decodeBody(body), id: cartridgeId(bytes) };
}

export function cartridgeId(bytes: Uint8Array): Uint8Array {
  return sha256(bytes);
}
