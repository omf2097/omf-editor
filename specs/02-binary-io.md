# 02 — Binary I/O

Module: `packages/omf-formats/src/binary.ts`. Mirrors
`pyshadowdive/utils/parser.py` method for method so ports stay mechanical.

## Conventions

- All integers little-endian.
- Text is **cp437**. The library ships its own 256-entry cp437 → Unicode
  table and reverse map (generated once with Python's `cp437` codec by
  `tools/export_cp437.py`); the WHATWG Encoding standard has no cp437, so
  `TextDecoder` cannot be used. Characters not representable in cp437 are a write error.
  Bytes 0x00–0x1F decode to the control characters, not to the glyphs
  (matches Python's codec).
- No Node or DOM APIs. Works on `ArrayBuffer` / `Uint8Array` only.

## `BinaryReader`

```ts
class BinaryReader {
  constructor(data: Uint8Array | ArrayBuffer);
  pos: number;                 // cursor, settable
  readonly length: number;
  remaining(): number;
  skip(n: number): void;
  u8(): number; i8(): number; u16(): number; i16(): number;
  u32(): number; i32(): number; f32(): number;
  boolean(): boolean;         // u8 === 1
  bytes(n: number): Uint8Array;   // copy
  str(n: number): string;         // fixed-length cp437
  nullPaddedStr(max: number): string;  // reads `max` bytes, stops decoding at first NUL
  varStr(sizeIncludesZero = false): string;
  expectU8(v: number): void;  // throws OmfFormatError on mismatch
  setXorKey(key: number | null): void;
}
```

`varStr`: `u16 len`. If `sizeIncludesZero` and `len === 0` return `""`
without consuming a NUL. Otherwise read `len - (sizeIncludesZero ? 1 : 0)`
bytes, then `expectU8(0)`.

XOR key: when set, every byte read is XORed with the key and the key
increments modulo 256. Not used by AF/BK; kept for future formats.

Reading past the end throws `OmfFormatError` with the offset.

## `BinaryWriter`

```ts
class BinaryWriter {
  constructor(initialCapacity = 64 * 1024);
  readonly pos: number;
  u8(v): this; i8(v): this; u16(v): this; i16(v): this;
  u32(v): this; i32(v): this; f32(v): this;
  boolean(v): this;
  bytes(b: Uint8Array): this;
  str(s: string): this;
  nullPaddedStr(s: string, max: number): this;   // truncates to `max` bytes, pads with NUL
  varStr(s: string, sizeIncludesZero = false): this;
  padding(n: number): this;
  setXorKey(key: number | null): void;
  toUint8Array(): Uint8Array;   // trimmed copy
}
```

Growable buffer, doubling. Range checks: writing a value outside the field's
range throws `OmfRangeError` naming the field when the caller supplies one
(`u8(v, "block_damage")`). The editor's widgets prevent this in practice;
the check protects JSON import.

## Errors

```ts
class OmfFormatError extends Error { offset?: number }
class OmfRangeError extends OmfFormatError { field?: string; value: number }
```
