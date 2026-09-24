// deflate-raw via the web-standard (De)CompressionStream, available in browsers and Node >= 18.

async function pipe(stream: CompressionStream | DecompressionStream, input: Uint8Array): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const writing = writer.write(input as Uint8Array<ArrayBuffer>).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  await writing;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return pipe(new CompressionStream('deflate-raw'), data);
}

export function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return pipe(new DecompressionStream('deflate-raw'), data);
}
