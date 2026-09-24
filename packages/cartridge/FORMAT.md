# Cartridge format `QRC1` (format version 1)

A cartridge is an opaque, self-verifying byte array (SPEC L1). It knows nothing about QR codes,
frames, fountain codes or block sizes. All integers are **little-endian**.

## Header (52 bytes + title)

| Offset | Size | Field | Notes |
|---:|---:|---|---|
| 0 | 4 | magic | ASCII `QRC1` (`51 52 43 31`) |
| 4 | 1 | format version | `1`. Anything else is rejected. |
| 5 | 1 | flags | reserved, `0` |
| 6 | 2 | ISA version | VM instruction-set version. Checked by the VM, not by this package. |
| 8 | 1 | payload type | `1` = VM bytecode ROM (the only type) |
| 9 | 1 | compression | `0` = none, `1` = deflate-raw (RFC 1951, no zlib/gzip wrapper) |
| 10 | 1 | title length *T* | 0‥32 |
| 11 | 1 | reserved | `0` |
| 12 | 4 | uncompressed body size | bytes after decompression |
| 16 | 4 | stored body size *S* | bytes of body as stored in the file |
| 20 | 32 | body hash | SHA-256 over the **stored** body (after compression) |
| 52 | *T* | title | UTF-8, metadata for Library/UI only; the VM never reads it |
| 52+*T* | *S* | body | stored body |

The file length must be exactly `52 + T + S`.

## Body (after decompression)

```
u8   section count N
N ×  { u8 type, u32 length }        section table
...  section bytes, concatenated in table order
```

| Type | Section | Content |
|---:|---|---|
| 1 | code | VM bytecode (see `packages/vm/VM.md` for how it is mapped) |
| 2 | rodata | read-only data: sprites, tilemaps, strings, tables |
| 3 | sound | sound definitions |

All three sections are required (they may be empty). Duplicate types, sections running past the end,
and trailing bytes after the last section are rejected.

## Hashes (SPEC §4)

- **Body hash** = SHA-256 over the body *as stored*. Verified on every load, before decompression.
- **Cartridge id** = SHA-256 over the entire file. The transport uses its first 8 bytes.

## Rejections (`CartridgeError`)

bad magic · unsupported format version · unknown payload type or compression · title too long or not UTF-8 ·
truncated file · trailing bytes · body hash mismatch · decompression failure · inflated size ≠ header ·
malformed section table. The ISA version check lives in the VM (`packages/vm`).

## Compression

`serializeCartridge` defaults to `auto`: deflate-raw is used only when it makes the body smaller.
Both directions use the web-standard `CompressionStream`/`DecompressionStream('deflate-raw')`,
available in browsers and Node ≥ 18. Tests assert that Node `zlib` and the stream path agree.
