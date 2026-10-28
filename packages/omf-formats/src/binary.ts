// Little-endian byte reader and writer (spec 02). Strings in the files are
// cp437, one byte per character; in the model they are ordinary JS strings.

import { CP437_TO_UNICODE } from './cp437';
import { OmfFormatError, OmfRangeError } from './errors';

const UNICODE_TO_CP437 = new Map<string, number>();
for (let i = 0; i < 256; i++) UNICODE_TO_CP437.set(CP437_TO_UNICODE[i]!, i);

export function decodeCp437(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += CP437_TO_UNICODE[b];
  return s;
}

/** A fixed-size field read as a C string: the text up to the first NUL, or all of it. */
export function decodeNullPadded(raw: Uint8Array): string {
  const end = raw.indexOf(0);
  return decodeCp437(end < 0 ? raw : raw.subarray(0, end));
}

export function encodeCp437(s: string, field?: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const b = UNICODE_TO_CP437.get(s[i]!);
    if (b === undefined) {
      throw new OmfFormatError(
        `${field ?? 'string'}: character ${JSON.stringify(s[i])} is not representable in cp437`,
      );
    }
    out[i] = b;
  }
  return out;
}

/** Number of bytes `s` takes in cp437, or -1 if it contains unrepresentable characters. */
export function cp437Length(s: string): number {
  for (const ch of s) if (!UNICODE_TO_CP437.has(ch)) return -1;
  return s.length;
}

function toBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

export class BinaryReader {
  pos = 0;
  readonly length: number;
  private readonly data: Uint8Array;
  private readonly view: DataView;
  private xorKey: number | null = null;

  constructor(data: Uint8Array | ArrayBuffer) {
    this.data = toBytes(data);
    this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    this.length = this.data.byteLength;
  }

  remaining(): number {
    return this.length - this.pos;
  }

  /**
   * openomf's rolling XOR (memreader_xor, used for CHR and pilot data): each
   * byte is XORed with the key, which then increments mod 256. AF and BK do
   * not use it. Null turns it off.
   */
  setXorKey(key: number | null): void {
    this.xorKey = key === null ? null : key & 0xff;
  }

  private need(n: number): number {
    if (this.pos + n > this.length) {
      throw new OmfFormatError(`unexpected end of data, wanted ${n} bytes`, this.pos);
    }
    const at = this.pos;
    this.pos += n;
    return at;
  }

  /** Reads `n` raw bytes, applying the XOR key when set. Always a copy. */
  private raw(n: number): Uint8Array {
    const at = this.need(n);
    const out = this.data.slice(at, at + n);
    if (this.xorKey !== null) {
      for (let i = 0; i < n; i++) {
        out[i] = out[i]! ^ this.xorKey;
        this.xorKey = (this.xorKey + 1) & 0xff;
      }
    }
    return out;
  }

  private dv(n: number): DataView {
    if (this.xorKey === null) {
      const at = this.need(n);
      return new DataView(this.view.buffer, this.view.byteOffset + at, n);
    }
    const b = this.raw(n);
    return new DataView(b.buffer);
  }

  skip(n: number): void {
    this.need(n);
  }

  u8(): number {
    return this.dv(1).getUint8(0);
  }
  i8(): number {
    return this.dv(1).getInt8(0);
  }
  u16(): number {
    return this.dv(2).getUint16(0, true);
  }
  i16(): number {
    return this.dv(2).getInt16(0, true);
  }
  u32(): number {
    return this.dv(4).getUint32(0, true);
  }
  i32(): number {
    return this.dv(4).getInt32(0, true);
  }
  f32(): number {
    return this.dv(4).getFloat32(0, true);
  }
  boolean(): boolean {
    return this.u8() === 1;
  }

  bytes(n: number): Uint8Array {
    return this.raw(n);
  }

  str(n: number): string {
    return decodeCp437(this.raw(n));
  }

  nullPaddedStr(max: number): string {
    return decodeNullPadded(this.raw(max));
  }

  /**
   * A u16 length and the string. Without `sizeIncludesZero` (openomf
   * sd_read_terminated_str) an uncounted NUL must follow. With it (openomf
   * sd_read_padded_str) the length counts the NUL; openomf does not require
   * it, so a last byte that is not NUL belongs to the string.
   */
  varStr(sizeIncludesZero = false): string {
    const len = this.u16();
    if (!sizeIncludesZero) {
      const s = this.str(len);
      this.expectU8(0);
      return s;
    }
    if (len === 0) return '';
    const b = this.bytes(len);
    return decodeCp437(b[len - 1] === 0 ? b.subarray(0, len - 1) : b);
  }

  expectU8(v: number): void {
    const at = this.pos;
    const got = this.u8();
    if (got !== v) throw new OmfFormatError(`expected byte ${v}, got ${got}`, at);
  }
}

function check(v: number, min: number, max: number, field?: string): void {
  if (!Number.isInteger(v) || v < min || v > max) throw new OmfRangeError(v, min, max, field);
}

export class BinaryWriter {
  private buf: Uint8Array;
  private view: DataView;
  private len = 0;
  private xorKey: number | null = null;

  constructor(initialCapacity = 64 * 1024) {
    this.buf = new Uint8Array(Math.max(16, initialCapacity));
    this.view = new DataView(this.buf.buffer);
  }

  get pos(): number {
    return this.len;
  }

  /** See BinaryReader.setXorKey. */
  setXorKey(key: number | null): void {
    this.xorKey = key === null ? null : key & 0xff;
  }

  /** Reserves `n` bytes, growing the buffer as needed; returns their offset. */
  private ensure(n: number): number {
    if (this.len + n > this.buf.length) {
      let cap = this.buf.length * 2;
      while (cap < this.len + n) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
      this.view = new DataView(next.buffer);
    }
    const at = this.len;
    this.len += n;
    return at;
  }

  private applyXor(at: number, n: number): void {
    if (this.xorKey === null) return;
    for (let i = at; i < at + n; i++) {
      this.buf[i] = this.buf[i]! ^ this.xorKey;
      this.xorKey = (this.xorKey + 1) & 0xff;
    }
  }

  /** Appends `n` bytes written by `set` at their offset, then applies the XOR key. */
  private put(n: number, set: (view: DataView, at: number) => void): this {
    const at = this.ensure(n);
    set(this.view, at);
    this.applyXor(at, n);
    return this;
  }

  // Integer writers throw OmfRangeError, naming `field`, for values that do not fit.
  u8(v: number, field?: string): this {
    check(v, 0, 0xff, field);
    return this.put(1, (dv, at) => dv.setUint8(at, v));
  }
  i8(v: number, field?: string): this {
    check(v, -0x80, 0x7f, field);
    return this.put(1, (dv, at) => dv.setInt8(at, v));
  }
  u16(v: number, field?: string): this {
    check(v, 0, 0xffff, field);
    return this.put(2, (dv, at) => dv.setUint16(at, v, true));
  }
  i16(v: number, field?: string): this {
    check(v, -0x8000, 0x7fff, field);
    return this.put(2, (dv, at) => dv.setInt16(at, v, true));
  }
  u32(v: number, field?: string): this {
    check(v, 0, 0xffffffff, field);
    return this.put(4, (dv, at) => dv.setUint32(at, v, true));
  }
  i32(v: number, field?: string): this {
    check(v, -0x80000000, 0x7fffffff, field);
    return this.put(4, (dv, at) => dv.setInt32(at, v, true));
  }
  f32(v: number): this {
    return this.put(4, (dv, at) => dv.setFloat32(at, v, true));
  }
  boolean(v: boolean): this {
    return this.u8(v ? 1 : 0);
  }

  bytes(b: Uint8Array): this {
    const at = this.ensure(b.length);
    this.buf.set(b, at);
    this.applyXor(at, b.length);
    return this;
  }

  str(s: string, field?: string): this {
    return this.bytes(encodeCp437(s, field));
  }

  nullPaddedStr(s: string, max: number, field?: string): this {
    const enc = encodeCp437(s, field).subarray(0, max);
    this.bytes(enc);
    return this.padding(max - enc.length);
  }

  varStr(s: string, sizeIncludesZero = false, field?: string): this {
    const enc = encodeCp437(s, field);
    if (enc.length === 0 && sizeIncludesZero) return this.u16(0);
    this.u16(enc.length + (sizeIncludesZero ? 1 : 0), field);
    this.bytes(enc);
    return this.u8(0);
  }

  padding(n: number): this {
    const at = this.ensure(n);
    this.buf.fill(0, at, at + n);
    this.applyXor(at, n);
    return this;
  }

  /** Overwrites a u32 at an earlier position (no XOR). */
  patchU32(at: number, v: number, field?: string): this {
    check(v, 0, 0xffffffff, field);
    this.view.setUint32(at, v, true);
    return this;
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}
