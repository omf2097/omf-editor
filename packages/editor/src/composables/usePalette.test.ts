import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import {
  bandedGrayscalePalette,
  identityRemap,
  paletteToRgbaLut,
  writeAltPals,
  writeBK,
  type BKFile,
  type Palette,
  type VGA,
} from '@omf/formats';
import { newFighter, newScene } from '../lib/templates';

vi.mock('../lib/db', () => ({
  getSetting: async (_k: string, fallback: unknown) => fallback,
  setSetting: async () => undefined,
  getCachedFile: async () => undefined,
  setCachedFile: async () => undefined,
}));

const { useDocument } = await import('./useDocument');
const { usePalette } = await import('./usePalette');
const docs = useDocument();
const pal = usePalette();

const colours = (f: (i: number) => VGA): Palette => ({
  colors: Array.from({ length: 256 }, (_, i) => f(i)),
});

function source(): BKFile {
  const b = newScene();
  b.palettes = [
    { colors: colours((i) => [i & 63, 0, 0]), remaps: Array.from({ length: 19 }, identityRemap) },
    { colors: colours((i) => [0, i & 63, 0]), remaps: Array.from({ length: 19 }, identityRemap) },
  ];
  // Remap 2 maps everything to entry 7.
  b.palettes[0]!.remaps[2] = new Uint8Array(256).fill(7);
  return b;
}

const alt = (): Palette[] =>
  Array.from({ length: 11 }, (_, p) => colours((i) => [p, 63 - (i & 15), (i >> 4) & 63]));

beforeEach(async () => {
  docs.close();
  pal.sourceBk.value = null;
  pal.altPals.value = null;
  pal.forceGrayscale.value = false;
  pal.paletteIndex.value = 0;
  pal.remapIndex.value = null;
  pal.setHarColor('p1', 0, null);
  pal.setHarColor('p2', 0, null);
});

describe('usePalette LUT', () => {
  it('an AF without a palette source uses the banded greyscale fallback', () => {
    docs.newDocument(newFighter(), 'Untitled.AF');
    expect(pal.isFallback.value).toBe(true);
    expect(Array.from(pal.lut.value)).toEqual(
      Array.from(paletteToRgbaLut(bandedGrayscalePalette())),
    );
  });

  it('an AF uses the chosen palette of its source BK; a BK uses its own', async () => {
    docs.newDocument(newFighter(), 'Untitled.AF');
    expect(await pal.loadSourceBytes('src.bk', writeBK(source()), false)).toBe(true);
    expect(pal.isFallback.value).toBe(false);
    expect(Array.from(pal.lut.value)).toEqual(
      Array.from(paletteToRgbaLut(source().palettes[0]!.colors)),
    );
    pal.paletteIndex.value = 1;
    expect(pal.lut.value[5]).toBe(paletteToRgbaLut(source().palettes[1]!.colors)[5]);
    pal.forceGrayscale.value = true;
    expect(pal.isFallback.value).toBe(true);
    pal.forceGrayscale.value = false;
    // A BK document is its own source, whatever was chosen for fighters.
    const own = source();
    own.palettes[0]!.colors = colours(() => [9, 9, 9]);
    docs.newDocument(own, 'Untitled.BK');
    pal.paletteIndex.value = 0;
    expect(pal.lut.value[200]).toBe(paletteToRgbaLut(own.palettes[0]!.colors)[200]);
  });

  it('a remap preview rewrites the palette through the table, and resets on open', async () => {
    docs.newDocument(newFighter(), 'Untitled.AF');
    await pal.loadSourceBytes('src.bk', writeBK(source()), false);
    pal.remapIndex.value = 2;
    const want = paletteToRgbaLut(source().palettes[0]!.colors)[7];
    expect(pal.lut.value.length).toBeGreaterThanOrEqual(256);
    expect(new Set(pal.lut.value.slice(0, 256))).toEqual(new Set([want]));
    docs.newDocument(newFighter(), 'Other.AF');
    await nextTick();
    expect(pal.remapIndex.value).toBeNull();
  });

  it('HAR colours copy 16 ALTPALS shades into a band; player 2 is 48 higher; 0 stays', async () => {
    docs.newDocument(newFighter(), 'Untitled.AF');
    await pal.loadSourceBytes('src.bk', writeBK(source()), false);
    expect(await pal.loadAltPalsBytes('ALTPALS.DAT', writeAltPals(alt()), false)).toBe(true);
    const base = Array.from(pal.lut.value);
    pal.setHarColor('p1', 0, 3); // band 0 = indices 0–15, option 3 = ALTPALS 0 entries 48–63
    pal.setHarColor('p2', 1, 2); // band 1 of player 2 = indices 64–79
    const lut = pal.lut.value;
    const want = paletteToRgbaLut(alt()[0]!);
    expect(lut[0]).toBe(base[0]); // index 0 stays black
    for (let i = 1; i < 16; i++) expect(lut[i]).toBe(want[48 + i]);
    for (let i = 0; i < 16; i++) expect(lut[64 + i]).toBe(want[32 + i]);
    expect(lut[16]).toBe(base[16]);
    expect(lut[48]).toBe(base[48]);
    pal.setHarColor('p1', 0, null);
    expect(pal.lut.value[5]).toBe(base[5]);
  });

  it('an unreadable source is refused with a message and the old one kept', async () => {
    docs.newDocument(newFighter(), 'Untitled.AF');
    await pal.loadSourceBytes('src.bk', writeBK(source()), false);
    expect(await pal.loadSourceBytes('bad.bk', new Uint8Array(3), false)).toBe(false);
    expect(pal.sourceName.value).toBe('src.bk');
  });
});
