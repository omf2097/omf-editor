import { describe, expect, it } from 'vitest';
import {
  OmfFormatError,
  OmfRangeError,
  TRANSPARENT,
  decodeSprite,
  encodeSprite,
  readAF,
  readBK,
  spritePaletteRange,
  type DecodedSprite,
} from '../src';
import { HAS_DATA, dataFiles, readData } from './data';

const T = TRANSPARENT;
const words = (...ws: number[]): Uint8Array => new Uint8Array(new Uint16Array(ws).buffer);

function img(w: number, h: number, rows: number[][]): DecodedSprite {
  return { width: w, height: h, pixels: Uint16Array.from(rows.flat()) };
}

function roundTrip(d: DecodedSprite): void {
  const back = decodeSprite(d.width, d.height, encodeSprite(d));
  if (d.pixels.every((p) => p === T)) {
    // An all-transparent image encodes to just "y = 0, end".
    expect(back.pixels.every((p) => p === T)).toBe(true);
  } else {
    expect(back.pixels).toEqual(d.pixels);
  }
}

describe('decodeSprite', () => {
  it('applies x, y and copy ops; x resets after a copy', () => {
    const stream = new Uint8Array([
      ...words(2, 1 * 4, (2 << 2) | 1),
      7,
      8,
      ...words(1 * 4 + 2, (1 << 2) | 1),
      9,
      ...words(7),
    ]);
    const d = decodeSprite(3, 2, stream);
    expect(Array.from(d.pixels)).toEqual([T, 7, 8, 9, T, T]);
  });

  it('accepts a stream without an end marker', () => {
    const d = decodeSprite(2, 1, new Uint8Array([...words(2, (1 << 2) | 1), 5]));
    expect(Array.from(d.pixels)).toEqual([5, T]);
  });

  it('rejects an end marker that is not last', () => {
    expect(() => decodeSprite(2, 1, words(2, 7, 2))).toThrow(OmfFormatError);
  });

  it('stops and flags overflow past width × height', () => {
    const d = decodeSprite(1, 1, new Uint8Array([...words(2, (3 << 2) | 1), 1, 2, 3, ...words(7)]));
    expect(d.truncated).toBe(true);
    expect(Array.from(d.pixels)).toEqual([1]);
  });

  it('returns an empty image for zero size or no data', () => {
    expect(decodeSprite(0, 5, words(2, 7)).pixels.length).toBe(0);
    expect(decodeSprite(60537, 60537, new Uint8Array(0)).pixels.length).toBe(0);
  });
});

describe('encodeSprite', () => {
  it('produces openomf layout for a simple image', () => {
    const d = img(3, 2, [
      [1, 2, T],
      [T, 3, 4],
    ]);
    expect(Array.from(encodeSprite(d))).toEqual([2, 0, 9, 0, 1, 2, 6, 0, 4, 0, 9, 0, 3, 4, 7, 0]);
    roundTrip(d);
  });

  it('round-trips edge cases', () => {
    roundTrip(img(1, 1, [[0]]));
    roundTrip(img(1, 1, [[T]]));
    roundTrip(img(4, 1, [[1, 2, 3, 4]]));
    roundTrip(img(5, 1, [[T, 1, T, 2, T]]));
    roundTrip(
      img(3, 3, [
        [1, T, T],
        [T, T, T],
        [T, T, 2],
      ]),
    );
    roundTrip(
      img(2, 3, [
        [T, T],
        [5, 5],
        [5, T],
      ]),
    );
    roundTrip(
      img(3, 2, [
        [T, T, 9],
        [9, T, T],
      ]),
    );
  });

  it('fits a 254×254 opaque square but not 255×255', () => {
    const sq = (n: number): DecodedSprite => ({
      width: n,
      height: n,
      pixels: new Uint16Array(n * n).fill(17),
    });
    expect(encodeSprite(sq(254)).length).toBe(254 * 254 + 4 * 254 + 2);
    expect(() => encodeSprite(sq(255))).toThrow(OmfRangeError);
  });

  it('spritePaletteRange lists used indices', () => {
    expect(spritePaletteRange(img(3, 1, [[T, 9, 3]]))).toEqual({ start: 3, end: 9, used: [3, 9] });
  });
});

describe.skipIf(!HAS_DATA)('every shipped sprite', () => {
  for (const name of [...dataFiles('AF'), ...dataFiles('BK')]) {
    it(`${name}: decode(encode(decode(x))) is identical`, () => {
      const bytes = readData(name);
      const anims = name.toUpperCase().endsWith('.AF')
        ? readAF(bytes).moves
        : readBK(bytes).animations;

      for (const a of anims.values()) {
        for (const s of a.sprites) {
          if (s.missing || s.image.length === 0) continue;
          const d = decodeSprite(s.width, s.height, s.image);
          if (d.truncated) continue;
          const again = decodeSprite(d.width, d.height, encodeSprite(d));
          expect(again.pixels).toEqual(d.pixels);
        }
      }
    });
  }
});
