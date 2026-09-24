// Minimal declarations for the web-standard globals that pure-logic packages may use.
// They exist both in browsers and in Node >= 18. Anything else (DOM, node:*) is off limits.
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean });
  decode(input?: Uint8Array): string;
}
interface QrcReadableStreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}
interface QrcWritableStreamWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
interface QrcTransformStream {
  readonly readable: { getReader(): QrcReadableStreamReader };
  readonly writable: { getWriter(): QrcWritableStreamWriter };
}
declare class CompressionStream implements QrcTransformStream {
  constructor(format: 'deflate-raw' | 'deflate' | 'gzip');
  readonly readable: { getReader(): QrcReadableStreamReader };
  readonly writable: { getWriter(): QrcWritableStreamWriter };
}
declare class DecompressionStream implements QrcTransformStream {
  constructor(format: 'deflate-raw' | 'deflate' | 'gzip');
  readonly readable: { getReader(): QrcReadableStreamReader };
  readonly writable: { getWriter(): QrcWritableStreamWriter };
}
