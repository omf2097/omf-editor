import { describe, expect, it } from 'vitest';
import {
  BinaryReader,
  BinaryWriter,
  OmfFormatError,
  OmfRangeError,
  cp437Length,
  decodeCp437,
  encodeCp437,
} from '../src';

describe('BinaryWriter / BinaryReader', () => {
  it('round-trips every primitive little-endian', () => {
    const w = new BinaryWriter(4);
    w.u8(0xfe)
      .i8(-2)
      .u16(0xbeef)
      .i16(-12345)
      .u32(0xdeadbeef)
      .i32(-123456789)
      .f32(1.5)
      .boolean(true);
    const b = w.toUint8Array();
    expect(Array.from(b.slice(0, 4))).toEqual([0xfe, 0xfe, 0xef, 0xbe]);
    const r = new BinaryReader(b);
    expect([r.u8(), r.i8(), r.u16(), r.i16(), r.u32(), r.i32(), r.f32(), r.boolean()]).toEqual([
      0xfe,
      -2,
      0xbeef,
      -12345,
      0xdeadbeef,
      -123456789,
      1.5,
      true,
    ]);
    expect(r.remaining()).toBe(0);
  });

  it('grows past the initial capacity', () => {
    const w = new BinaryWriter(1);
    for (let i = 0; i < 1000; i++) w.u16(i);
    expect(w.pos).toBe(2000);
    expect(new BinaryReader(w.toUint8Array()).skip(1998)).toBeUndefined();
  });

  it('rejects out-of-range values with the field name', () => {
    const w = new BinaryWriter();
    expect(() => w.u8(256, 'block_damage')).toThrow(OmfRangeError);
    expect(() => w.u8(256, 'block_damage')).toThrow(/block_damage/);
    expect(() => w.i16(0x8000)).toThrow(OmfRangeError);
    expect(() => w.u16(1.5)).toThrow(OmfRangeError);
    expect(() => w.u32(-1)).toThrow(OmfRangeError);
  });

  it('throws OmfFormatError with offset at end of data', () => {
    const r = new BinaryReader(new Uint8Array([1, 2, 3]));
    r.u16();
    try {
      r.u16();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(OmfFormatError);
      expect((e as OmfFormatError).offset).toBe(2);
    }
  });

  it('varStr with and without size-includes-zero', () => {
    const w = new BinaryWriter();
    w.varStr('A10').varStr('').varStr('', true).varStr('xy', true);
    const b = w.toUint8Array();
    expect(Array.from(b)).toEqual([3, 0, 65, 49, 48, 0, 0, 0, 0, 0, 0, 3, 0, 120, 121, 0]);
    const r = new BinaryReader(b);
    expect([r.varStr(), r.varStr(), r.varStr(true), r.varStr(true)]).toEqual(['A10', '', '', 'xy']);
  });

  it('varStr requires the terminating NUL', () => {
    expect(() => new BinaryReader(new Uint8Array([1, 0, 65, 1])).varStr()).toThrow(OmfFormatError);
  });

  it('nullPaddedStr pads, truncates and stops at the first NUL', () => {
    const w = new BinaryWriter();
    w.nullPaddedStr('P632', 6).nullPaddedStr('ABCDEFGH', 4);
    const b = w.toUint8Array();
    expect(Array.from(b)).toEqual([80, 54, 51, 50, 0, 0, 65, 66, 67, 68]);
    const r = new BinaryReader(new Uint8Array([80, 0, 66, 67]));
    expect(r.nullPaddedStr(4)).toBe('P');
    expect(r.pos).toBe(4);
  });

  it('XOR key applies per byte with an incrementing key', () => {
    const w = new BinaryWriter();
    w.setXorKey(0xff);
    w.u8(0).u8(0).u16(0);
    const b = w.toUint8Array();
    expect(Array.from(b)).toEqual([0xff, 0x00, 0x01, 0x02]);
    const r = new BinaryReader(b);
    r.setXorKey(0xff);
    expect([r.u8(), r.u8(), r.u16()]).toEqual([0, 0, 0]);
  });
});

describe('cp437', () => {
  it('maps all 256 bytes and back', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    const s = decodeCp437(all);
    expect(s.length).toBe(256);
    expect(encodeCp437(s)).toEqual(all);
  });

  it('decodes high bytes to the cp437 glyphs and low bytes to controls', () => {
    expect(decodeCp437(new Uint8Array([0x82, 0xdb, 0x0a]))).toBe('é█\n');
  });

  it('refuses characters outside cp437', () => {
    expect(() => encodeCp437('€', 'footer_string')).toThrow(/footer_string/);
    expect(cp437Length('é€')).toBe(-1);
    expect(cp437Length('P632')).toBe(4);
  });
});
