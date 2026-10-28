import { describe, expect, it } from 'vitest';
import { OmfFormatError, readBK, writeBK } from '../src';
import { bk, bkAnim } from './helpers';
import { readFixture } from './data';

describe('BK', () => {
  it('openomf test.bk round-trips byte-exact', () => {
    const bytes = readFixture('test.bk');
    expect(writeBK(readBK(bytes))).toEqual(bytes);
  });

  it('writes next offsets and the terminator', () => {
    const bytes = writeBK(
      bk([
        [6, bkAnim({ footerString: 'hi', probability: 300 })],
        [27, bkAnim()],
      ]),
    );
    const dv = new DataView(bytes.buffer);
    let pos = 9;
    const seen: number[] = [];
    for (;;) {
      const next = dv.getUint32(pos, true);
      const id = bytes[pos + 4]!;
      if (id >= 50) {
        expect(id).toBe(51);
        expect(next).toBe(pos);
        break;
      }
      seen.push(id);
      expect(next).toBeGreaterThan(pos);
      pos = next;
    }
    expect(seen).toEqual([6, 27]);
    const back = readBK(bytes);
    expect(back.animations.get(6)!.footerString).toBe('hi');
    expect(writeBK(back)).toEqual(bytes);
  });

  it('writes a zero terminator offset when there are no animations', () => {
    const bytes = writeBK(bk());
    expect(Array.from(bytes.slice(9, 14))).toEqual([0, 0, 0, 0, 51]);
  });

  it('rejects a background of the wrong size', () => {
    const file = bk();
    file.background = new Uint8Array(3);
    expect(() => writeBK(file)).toThrow(OmfFormatError);
  });

  it('rejects trailing data', () => {
    const bytes = writeBK(bk());
    expect(() => readBK(Uint8Array.from([...bytes, 0]))).toThrow(/trailing/);
  });
});
