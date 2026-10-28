import { describe, expect, it } from 'vitest';
import { readAF, resolveSharedImages, writeAF, hasMoveString, fromReal, toReal } from '../src';
import { af, move, sprite } from './helpers';
import { readFixture } from './data';

describe('AF', () => {
  it('openomf test.af round-trips byte-exact', () => {
    const bytes = readFixture('test.af');
    expect(writeAF(readAF(bytes))).toEqual(bytes);
  });

  it('round-trips a constructed file, moves sorted by id', () => {
    const file = af([
      [20, move({ moveString: 'P632', enemyString: 'x', damageAmount: 12 })],
      [1, move({ category: 9, moveString: '0' })],
    ]);
    const back = readAF(writeAF(file));
    expect([...back.moves.keys()]).toEqual([1, 20]);
    const m = back.moves.get(20)!;
    expect([m.moveString, m.enemyString, m.damageAmount]).toEqual(['P632', 'x', 12]);
    expect(writeAF(back)).toEqual(writeAF(file));
  });

  it('accepts a 21-byte move string without NUL', () => {
    const s = 'P123456789123456789KK';
    expect(s.length).toBe(21);
    expect(readAF(writeAF(af([[15, move({ moveString: s })]]))).moves.get(15)!.moveString).toBe(s);
  });

  it('keeps move string padding until the string is edited', () => {
    const file = readAF(writeAF(af([[15, move({ moveString: 'P6' })]])));
    const m = file.moves.get(15)!;
    m.moveStringRaw = Uint8Array.from([80, 54, 0, 66, 50, ...new Array(16).fill(0)]);
    expect(readAF(writeAF(file)).moves.get(15)!.moveStringRaw![3]).toBe(66);
    m.moveString = 'K6';
    expect(Array.from(readAF(writeAF(file)).moves.get(15)!.moveStringRaw!.slice(0, 5))).toEqual([
      75, 54, 0, 0, 0,
    ]);
  });

  it('resolves shared images to the most recent owner and writes its length', () => {
    const owner1 = sprite({ index: 3 });
    const owner2 = sprite({ index: 3, image: Uint8Array.from([2, 0, 5, 0, 9, 7, 0]) });
    const sharerA = sprite({ index: 3, missing: true, image: new Uint8Array(0) });
    const sharerB = sprite({ index: 3, missing: true, image: new Uint8Array(0) });
    const file = af([
      [1, move({ sprites: [owner1, sharerA] })],
      [2, move({ sprites: [owner2, sharerB] })],
    ]);
    const map = resolveSharedImages(file.moves.values());
    expect(map.get(sharerA)).toBe(owner1);
    expect(map.get(sharerB)).toBe(owner2);

    // The last sprite of the last move starts 12 header bytes before the move
    // fields (2+2+8+9 bytes, 21-byte move string, 2-byte empty enemy string),
    // the terminator and the sound table.
    const lastSpriteImageLen = (b: Uint8Array): number => {
      const at = b.length - 30 - 1 - (2 + 2 + 8 + 9 + 21 + 2) - 12;
      return b[at]! | (b[at + 1]! << 8);
    };
    const bytes = writeAF(file);
    expect(lastSpriteImageLen(bytes)).toBe(owner2.image.length);
    expect(writeAF(readAF(bytes))).toEqual(bytes);

    const orphan = af([
      [1, move({ sprites: [sprite({ index: 9, missing: true, image: new Uint8Array(0) })] })],
    ]);
    expect(lastSpriteImageLen(writeAF(orphan))).toBe(0);
  });

  it('fixed-point helpers and move string presence', () => {
    expect(fromReal(-14.5)).toBe(-3712);
    expect(toReal(294)).toBeCloseTo(1.148, 3);
    expect(
      ['!', '"!"', '0', '', 'P6', 'n'].map((s) => hasMoveString(move({ moveString: s }))),
    ).toEqual([false, false, false, false, true, true]);
  });
});
