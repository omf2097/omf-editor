import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import { decodeApng } from 'fast-png';
import { TRANSPARENT, grayscalePalette, vgaToRgb, type Palette, type VGA } from '@omf/formats';
import { apngDelay, crc32, decodePng, encodeApng, encodeIndexedPng } from './png';
import { matchToPalette } from './match';
import { indexedPngOf, paletteRgb } from './export';

/** A raw PNG with the given IHDR fields, unfiltered rows and extra chunks before IDAT. */
function rawPng(
  w: number,
  h: number,
  depth: number,
  colourType: number,
  rows: number[][],
  extra: [string, number[]][] = [],
): Uint8Array {
  const chunk = (type: string, data: Uint8Array): number[] => {
    const td = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++) td[i] = type.charCodeAt(i);
    td.set(data, 4);
    const crc = (crc32(td) ^ 0xffffffff) >>> 0;
    const len = data.length;
    return [
      len >>> 24,
      (len >> 16) & 255,
      (len >> 8) & 255,
      len & 255,
      ...td,
      crc >>> 24,
      (crc >> 16) & 255,
      (crc >> 8) & 255,
      crc & 255,
    ];
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = depth;
  ihdr[9] = colourType;
  const raw = Uint8Array.from(rows.flatMap((r) => [0, ...r]));
  return Uint8Array.from([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...chunk('IHDR', ihdr),
    ...extra.flatMap(([t, d]) => chunk(t, Uint8Array.from(d))),
    ...chunk('IDAT', zlibSync(raw)),
    ...chunk('IEND', new Uint8Array(0)),
  ]);
}

const alphaOf = (png: { rgba: Uint8ClampedArray }): number[] =>
  Array.from(png.rgba.filter((_, i) => i % 4 === 3));
const greyOf = (png: { rgba: Uint8ClampedArray }): number[] =>
  Array.from(png.rgba.filter((_, i) => i % 4 === 0));

describe('decodePng (G8)', () => {
  it('unpacks 1-, 2- and 4-bit greyscale', () => {
    expect(greyOf(decodePng(rawPng(4, 1, 1, 0, [[0b01010000]])))).toEqual([0, 255, 0, 255]);
    expect(greyOf(decodePng(rawPng(4, 1, 2, 0, [[0b00011011]])))).toEqual([0, 85, 170, 255]);
    expect(greyOf(decodePng(rawPng(2, 1, 4, 0, [[0x0f]])))).toEqual([0, 255]);
  });

  it('applies a greyscale tRNS colour key', () => {
    const png = decodePng(rawPng(2, 1, 8, 0, [[0, 200]], [['tRNS', [0, 0]]]));
    expect(alphaOf(png)).toEqual([0, 255]);
  });

  it('applies an RGB tRNS colour key, also on images under 3 pixels', () => {
    const key: [string, number[]][] = [['tRNS', [0, 255, 0, 0, 0, 255]]];
    const four = decodePng(
      rawPng(4, 1, 8, 2, [[255, 0, 255, 255, 0, 0, 255, 0, 255, 1, 2, 3]], key),
    );
    expect(alphaOf(four)).toEqual([0, 255, 0, 255]);
    const one = decodePng(rawPng(1, 1, 8, 2, [[255, 0, 255]], key));
    expect(alphaOf(one)).toEqual([0]);
  });
});

/** A palette where index 17 repeats the colour of index 1, as in ARENA0.BK. */
function dupPalette(): Palette {
  const p = grayscalePalette();
  p.colors[1] = [10, 20, 30] as VGA;
  p.colors[17] = [10, 20, 30] as VGA;
  return p;
}

describe('matchToPalette', () => {
  it('keeps duplicate-colour indices and matches only foreign pixels by colour (G6)', () => {
    const pal = dupPalette();
    const rgb = paletteRgb(pal);
    rgb[200] = [1, 2, 3]; // not the palette's colour at 200
    const png = decodePng(
      encodeIndexedPng({
        width: 3,
        height: 1,
        indices: Uint8Array.from([17, 1, 200]),
        palette: rgb,
        transparentIndex: null,
      }),
    );
    const m = matchToPalette(png, pal);
    expect(m.direct).toBe(false);
    expect(Array.from(m.decoded.pixels)).toEqual([17, 1, TRANSPARENT]);
    expect(m.unmatched).toEqual([{ rgb: [1, 2, 3], count: 1 }]);
    expect(
      Array.from(matchToPalette(png, pal, { nearest: true }).decoded.pixels).slice(0, 2),
    ).toEqual([17, 1]);
  });

  it('reads index 0 as transparent in sprites and never matches a colour to it (A4)', () => {
    const pal = grayscalePalette();
    pal.colors[0] = [63, 0, 0] as VGA;
    pal.colors[5] = [63, 0, 0] as VGA; // the same red at 5
    const png = decodePng(
      encodeIndexedPng({
        width: 2,
        height: 1,
        indices: Uint8Array.from([0, 3]),
        palette: paletteRgb(pal),
        transparentIndex: null,
      }),
    );
    expect(Array.from(matchToPalette(png, pal, { sprite: true }).decoded.pixels)).toEqual([
      TRANSPARENT,
      3,
    ]);
    // Backgrounds keep index 0.
    expect(Array.from(matchToPalette(png, pal).decoded.pixels)).toEqual([0, 3]);
    // RGB red goes to 5, not 0.
    const red = { width: 1, height: 1, rgba: Uint8ClampedArray.from([255, 0, 0, 255]) };
    expect(Array.from(matchToPalette(red, pal, { sprite: true }).decoded.pixels)).toEqual([5]);
    pal.colors[5] = [0, 0, 0] as VGA;
    const near = { width: 1, height: 1, rgba: Uint8ClampedArray.from([250, 0, 0, 255]) };
    const m = matchToPalette(near, pal, { sprite: true, nearest: true });
    expect(m.decoded.pixels[0]).not.toBe(0);
  });

  it('treats the sheet transparent_index as transparent without tRNS (G11)', () => {
    const pal = grayscalePalette();
    const png = decodePng(
      encodeIndexedPng({
        width: 2,
        height: 1,
        indices: Uint8Array.from([7, 3]),
        palette: paletteRgb(pal),
        transparentIndex: null,
      }),
    );
    expect(Array.from(matchToPalette(png, pal, { keyIndex: 7 }).decoded.pixels)).toEqual([
      TRANSPARENT,
      3,
    ]);
  });

  it('round-trips a single-sprite export with unshifted indices (G9)', () => {
    const pal = dupPalette();
    const d = { width: 3, height: 1, pixels: Uint16Array.from([5, 17, TRANSPARENT]) };
    const m = matchToPalette(decodePng(indexedPngOf(d, pal)!), pal, { sprite: true });
    expect(Array.from(m.decoded.pixels)).toEqual([5, 17, TRANSPARENT]);
    expect(vgaToRgb(pal.colors[17]!)).toEqual(paletteRgb(pal)[17]);
  });
});

describe('APNG delays (X1)', () => {
  it('switches to coarser units instead of wrapping past 65 535 ms', () => {
    expect(apngDelay(480)).toEqual([480, 1000]);
    expect(apngDelay(200_000)).toEqual([20_000, 100]);
    const png = encodeApng({ width: 1, height: 1, palette: [[0, 0, 0]], transparentIndex: null }, [
      { indices: Uint8Array.from([0]), delayMs: 200_000 },
      { indices: Uint8Array.from([0]), delayMs: 70 },
    ]);
    const frames = decodeApng(png).frames;
    expect(frames.map((f) => f.delayNumber / f.delayDenominator)).toEqual([200, 0.07]);
  });
});
