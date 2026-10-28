// Palette helpers, palette files and sheet sidecars on bad input (U7–U10, G13).

import { describe, expect, it } from 'vitest';
import {
  OmfFormatError,
  TRANSPARENT,
  buildSheet,
  parseAct,
  parseGpl,
  parseJascPal,
  parseSheet,
  rampColors,
  rgbToHsl,
  swapMapping,
  vgaToRgb,
  writeAct,
  type SheetMeta,
} from '../src';

describe('rampColors (U7)', () => {
  it('a ramp from grey keeps the other end’s hue instead of passing through red', () => {
    const ramp = rampColors([32, 32, 32], [0, 0, 63], 5, 'hsl-short');
    for (const c of ramp.slice(1, -1)) {
      const [r, , b] = vgaToRgb(c);
      expect(r).toBeLessThanOrEqual(b);
      expect(rgbToHsl(vgaToRgb(c))[0]).toBeGreaterThan(200);
    }
  });
});

describe('swapMapping (U8)', () => {
  it('swaps equal ranges and refuses anything that is not a permutation', () => {
    const m = swapMapping({ start: 0, end: 1 }, { start: 4, end: 5 });
    expect([...m.slice(0, 6)]).toEqual([4, 5, 2, 3, 0, 1]);
    expect(() => swapMapping({ start: 0, end: 2 }, { start: 4, end: 5 })).toThrow(RangeError);
    expect(() => swapMapping({ start: 0, end: 3 }, { start: 2, end: 5 })).toThrow(/overlap/);
    expect(() => swapMapping({ start: -1, end: 0 }, { start: 4, end: 5 })).toThrow(RangeError);
  });
});

describe('palette files (U9, U10)', () => {
  it('GPL and JASC take plain decimal components and counts only', () => {
    expect(() => parseGpl('GIMP Palette\n0x10 0 0\n')).toThrow(OmfFormatError);
    expect(() => parseGpl('GIMP Palette\n1e1 0 0\n')).toThrow(OmfFormatError);
    expect(parseGpl('GIMP Palette\n10 20 30 name\n')).toEqual([[10, 20, 30]]);
    expect(() => parseJascPal('JASC-PAL\r\n0100\r\n\r\n')).toThrow(/bad colour count/);
    expect(() => parseJascPal('JASC-PAL\r\n0100\r\n1e0\r\n1 2 3\r\n')).toThrow(/bad colour count/);
    expect(parseJascPal('JASC-PAL\r\n0100\r\n1\r\n1 2 3\r\n')).toEqual([[1, 2, 3]]);
  });

  it('ACT with fewer than 256 colours carries the count trailer', () => {
    const bytes = writeAct([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(bytes.length).toBe(772);
    expect(parseAct(bytes)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(writeAct(Array.from({ length: 256 }, () => [0, 0, 0])).length).toBe(768);
  });
});

describe('parseSheet sidecar checks (G13)', () => {
  const { image, meta } = buildSheet(
    [
      {
        posX: 0,
        posY: 0,
        index: 1,
        missing: false,
        decoded: { width: 1, height: 1, pixels: Uint16Array.from([5]) },
      },
    ],
    { source: 'T.AF', animation: 11, palette: 'X' },
  );
  const bad = (f: (m: SheetMeta) => void): (() => unknown) => {
    const m = structuredClone(meta);
    f(m);
    return () => parseSheet(image, m);
  };

  it('refuses layouts that would read outside the image', () => {
    expect(parseSheet(image, meta)[0]!.decoded.pixels[0]).toBe(5);
    expect(bad((m) => (m.columns = 0))).toThrow(/columns/);
    expect(bad((m) => (m.cell.w = 0))).toThrow(/cell/);
    expect(bad((m) => (m.sprites[0]!.cell = 3))).toThrow(/cell 3 is outside/);
    expect(bad((m) => (m.sprites[0]!.cell = -1))).toThrow(/outside/);
    expect(bad((m) => (m.sprites[0]!.origin_in_cell.x = 0.5))).toThrow(/origin_in_cell/);
  });

  it('never turns pixels outside the image into index 0', () => {
    const out = parseSheet(image, meta);
    expect([...out[0]!.decoded.pixels].every((p) => p === 5 || p === TRANSPARENT)).toBe(true);
  });
});
