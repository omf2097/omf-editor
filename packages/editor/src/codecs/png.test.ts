import { describe, expect, it } from 'vitest';
import { decodeApng } from 'fast-png';
import { TRANSPARENT, grayscalePalette } from '@omf/formats';
import { crc32, decodePng, encodeApng, encodeIndexedPng } from './png';
import { matchToPalette } from './match';
import { indexedPngOf } from './export';

describe('PNG codec', () => {
  it('computes the standard CRC-32', () => {
    expect((crc32(new TextEncoder().encode('123456789')) ^ 0xffffffff) >>> 0).toBe(0xcbf43926);
  });

  it('round-trips indexed images with a transparent key', () => {
    const indices = Uint8Array.from([0, 1, 2, 3, 4, 5]);
    const palette = Array.from(
      { length: 6 },
      (_, i) => [i * 10, i * 20, i * 30] as [number, number, number],
    );
    const png = decodePng(
      encodeIndexedPng({ width: 3, height: 2, indices, palette, transparentIndex: 2 }),
    );
    expect([png.width, png.height]).toEqual([3, 2]);
    expect(Array.from(png.indexed!.indices)).toEqual(Array.from(indices));
    expect(png.indexed!.alpha[2]).toBe(0);
    expect(Array.from(png.rgba.slice(4, 8))).toEqual([10, 20, 30, 255]);
  });

  it('matches an exported sprite back to the same indices', () => {
    const pal = grayscalePalette();
    const d = { width: 2, height: 2, pixels: Uint16Array.from([0, 5, TRANSPARENT, 255]) };
    const png = decodePng(indexedPngOf(d, pal)!);
    const m = matchToPalette(png, pal);
    expect(m.direct).toBe(true);
    expect(Array.from(m.decoded.pixels)).toEqual([0, 5, TRANSPARENT, 255]);
  });

  it('reports unmatched colours for RGB images and maps them with nearest', () => {
    const pal = grayscalePalette();
    const png = { width: 2, height: 1, rgba: Uint8ClampedArray.from([255, 0, 0, 255, 0, 0, 0, 0]) };
    const m = matchToPalette(png, pal);
    expect(m.unmatched).toEqual([{ rgb: [255, 0, 0], count: 1 }]);
    expect(m.decoded.pixels[1]).toBe(TRANSPARENT);
    expect(matchToPalette(png, pal, { nearest: true }).unmatched).toEqual([]);
  });

  it('writes APNG frames that fast-png can read', () => {
    const header = {
      width: 2,
      height: 1,
      palette: [
        [0, 0, 0],
        [255, 255, 255],
      ] as [number, number, number][],
      transparentIndex: null,
    };
    const apng = encodeApng(header, [
      { indices: Uint8Array.from([0, 1]), delayMs: 480 },
      { indices: Uint8Array.from([1, 0]), delayMs: 96 },
    ]);
    const d = decodeApng(apng);
    expect(d.numberOfFrames).toBe(2);
    expect(d.frames[1]!.delayNumber).toBe(96);
  });
});
