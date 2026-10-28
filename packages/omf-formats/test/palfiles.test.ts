import { describe, expect, it } from 'vitest';
import {
  parseAct,
  parseGpl,
  parseJascPal,
  parsePaletteFile,
  writePaletteFile,
  writeGpl,
  type RGB,
} from '../src';

const colors: RGB[] = Array.from({ length: 256 }, (_, i) => [i, 255 - i, (i * 7) & 255]);

describe('palette files', () => {
  for (const fmt of ['gpl', 'pal', 'act'] as const) {
    it(`${fmt} round-trips`, () => {
      expect(parsePaletteFile(`x.${fmt}`, writePaletteFile(fmt, colors))).toEqual(colors);
    });
  }

  it('parses GIMP files with comments and names', () => {
    expect(parseGpl('GIMP Palette\nName: t\nColumns: 4\n# c\n  1   2   3\tred\n4 5 6\n')).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(writeGpl([[1, 2, 3]])).toContain('  1   2   3\tIndex 0');
  });

  it('parses JASC with CRLF and ACT with a count', () => {
    expect(parseJascPal('JASC-PAL\r\n0100\r\n2\r\n1 2 3\r\n4 5 6\r\n')).toHaveLength(2);
    const act = new Uint8Array(772);
    act[769] = 2;
    expect(parseAct(act)).toHaveLength(2);
  });

  it('rejects bad input', () => {
    expect(() => parseGpl('nope')).toThrow();
    expect(() => parseJascPal('JASC-PAL\n0100\n1\n1 2 300\n')).toThrow(/300/);
    expect(() => parseAct(new Uint8Array(10))).toThrow();
  });
});
