import { describe, expect, it } from 'vitest';
import {
  BinaryReader,
  BinaryWriter,
  bandedGrayscalePalette,
  grayscalePalette,
  identityRemap,
  paletteToRgbaLut,
  pyomftoolsTo8,
  readPaletteMapping,
  remapPalette,
  vgaFrom8,
  vgaTo8,
  writePaletteMapping,
  type PaletteMapping,
  type VGA,
} from '../src';

describe('6/8-bit conversion', () => {
  it('vgaTo8 matches openomf COLOR_6TO8 and spans 0..255', () => {
    expect([0, 1, 16, 32, 63].map(vgaTo8)).toEqual([0, 4, 65, 130, 255]);
  });

  it('vgaFrom8 inverts both vgaTo8 and the pyomftools formula exactly', () => {
    for (let v = 0; v < 64; v++) {
      expect(vgaFrom8(vgaTo8(v))).toBe(v);
      expect(vgaFrom8(pyomftoolsTo8(v))).toBe(v);
    }
  });

  it('pyomftoolsTo8 is trunc(v*255/63)', () => {
    expect([1, 22, 63].map(pyomftoolsTo8)).toEqual([4, 89, 255]);
  });
});

describe('palette mapping', () => {
  it('round-trips 6-bit values and remaps', () => {
    const colors: VGA[] = Array.from({ length: 256 }, (_, i) => [
      i & 63,
      (i >> 2) & 63,
      63 - (i & 63),
    ]);
    const remaps = Array.from({ length: 19 }, (_, k) =>
      Uint8Array.from({ length: 256 }, (_, i) => (i + k) & 255),
    );
    const m: PaletteMapping = { colors: { colors }, remaps };
    const w = new BinaryWriter();
    writePaletteMapping(w, m);
    const bytes = w.toUint8Array();
    expect(bytes.length).toBe(768 + 19 * 256);
    const back = readPaletteMapping(new BinaryReader(bytes));
    expect(back.colors.colors).toEqual(colors);
    expect(back.remaps).toEqual(remaps);
  });

  it('writes bytes above 63 read from a file back as is; errors name the entry (A11)', () => {
    const colors: VGA[] = Array.from({ length: 256 }, () => [64, 0, 0]);
    const w = new BinaryWriter();
    writePaletteMapping(w, { colors: { colors }, remaps: Array(19).fill(identityRemap()) });
    expect(w.toUint8Array()[0]).toBe(64);
    colors[7] = [0, 300, 0];
    expect(() =>
      writePaletteMapping(
        new BinaryWriter(),
        { colors: { colors }, remaps: Array(19).fill(identityRemap()) },
        'palettes[2]',
      ),
    ).toThrow(/palettes\[2\]\.colors\[7\]\.g/);
  });

  it('remapPalette takes base[remap[k]]', () => {
    const base = grayscalePalette();
    const remap = identityRemap();
    remap[5] = 200;
    expect(remapPalette(base, remap).colors[5]).toEqual(base.colors[200]);
  });

  it('LUT is ImageData byte order with a transparent entry 256', () => {
    const p = grayscalePalette();
    p.colors[1] = [63, 0, 32];
    const lut = paletteToRgbaLut(p);
    expect(lut.length).toBe(257);
    const bytes = new Uint8Array(lut.buffer);
    expect(Array.from(bytes.slice(4, 8))).toEqual([255, 0, 130, 255]);
    expect(lut[256]).toBe(0);
  });
});

describe('banded greyscale', () => {
  it('restarts the ramp in every 16-colour band and keeps index 0 black', () => {
    const p = bandedGrayscalePalette();
    expect(p.colors[0]).toEqual([0, 0, 0]);
    expect(p.colors[1]).toEqual([8, 8, 8]);
    for (const top of [15, 31, 47, 255]) expect(p.colors[top]).toEqual([63, 63, 63]);
    expect(p.colors[16]).toEqual([4, 4, 4]);
  });
});
