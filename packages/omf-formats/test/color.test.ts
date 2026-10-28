import { describe, expect, it } from 'vitest';
import {
  adjustColor,
  closestIndex,
  darken,
  grayscalePalette,
  luminance,
  permutePalette,
  rampColors,
  rangeMap,
  readAF,
  readAltPals,
  remapByColor,
  remapImages,
  shadeBand,
  shiftMap,
  sortMapping,
  swapMapping,
  decodeSprite,
  identityRemap,
  regionOf,
  remapSlotNote,
  type VGA,
} from '../src';
import { HAS_DATA, readData } from './data';
import { af, bk, move, sprite } from './helpers';

describe('closestIndex', () => {
  it('finds exact and nearest matches within a range, both metrics', () => {
    const pal = grayscalePalette();
    expect(closestIndex(pal, [130, 130, 130])).toBe(128);
    expect(closestIndex(pal, [130, 130, 130], { start: 0, end: 100 })).toBe(100);
    expect(closestIndex(pal, [255, 255, 255], undefined, 'cie76')).toBe(252);
  });
});

describe('generators', () => {
  it('ramp keeps endpoints and is monotonic in RGB', () => {
    const r = rampColors([0, 0, 0], [63, 32, 10], 8);
    expect(r[0]).toEqual([0, 0, 0]);
    expect(r[7]).toEqual([63, 32, 10]);
    for (let i = 1; i < 8; i++)
      for (let k = 0; k < 3; k++) expect(r[i]![k]!).toBeGreaterThanOrEqual(r[i - 1]![k]!);
  });

  it('HSL long path differs from the short path', () => {
    const a: VGA = [63, 0, 0];
    const b: VGA = [0, 0, 63];
    expect(rampColors(a, b, 5, 'hsl-short')[2]).not.toEqual(rampColors(a, b, 5, 'hsl-long')[2]);
  });

  it('shade band goes dark to light with the base at the peak', () => {
    const band = shadeBand([40, 20, 10]);
    expect(band).toHaveLength(16);
    expect(band[12]).toEqual([40, 20, 10]);
    for (let i = 1; i < 16; i++)
      expect(luminance(band[i]!)).toBeGreaterThanOrEqual(luminance(band[i - 1]!));
  });

  it.skipIf(!HAS_DATA)('ALTPALS bands are dark to light too (shape check)', () => {
    const p = readAltPals(readData('ALTPALS.DAT'))[0]!;
    for (let c = 0; c < 16; c++) {
      expect(luminance(p.colors[c * 16 + 15]!)).toBeGreaterThan(luminance(p.colors[c * 16]!));
    }
  });

  it('adjust is identity with no changes and clamps to 6-bit', () => {
    expect(adjustColor([10, 20, 30], {})).toEqual([10, 20, 30]);
    expect(adjustColor([60, 60, 60], { lightness: 1 })).toEqual([63, 63, 63]);
    expect(adjustColor([63, 0, 0], { hue: 120 })).toEqual([0, 63, 0]);
  });
});

describe('remap tools', () => {
  const pal = grayscalePalette();

  it('darken maps to the closest darker index in the search range', () => {
    const r = remapByColor(
      pal,
      identityRemap(),
      { start: 100, end: 103 },
      { start: 0, end: 255 },
      darken(50),
    );
    // 101 → 50.5; nearest grey is 52 (index 52), not 48.
    expect(r[100]).toBe(52);
    expect(r[0]).toBe(0);
  });

  it('range map and shift', () => {
    const r = rangeMap(identityRemap(), { start: 0x60, end: 0x6f }, { start: 0x70, end: 0x7f });
    expect([r[0x60], r[0x6f], r[0x5f]]).toEqual([0x70, 0x7f, 0x5f]);
    const s = shiftMap(identityRemap(), { start: 10, end: 15 }, 3, { start: 0, end: 15 });
    expect([s[10], s[13], s[15]]).toEqual([13, 15, 15]);
  });

  it('swap with image rewrite keeps every rendered colour', () => {
    const m = swapMapping({ start: 1, end: 2 }, { start: 3, end: 4 });
    const p2 = permutePalette(pal, m);
    const file = bk([], 4, 1);
    file.background = Uint8Array.from([1, 2, 3, 4]);
    const out = remapImages(file, m);
    for (let i = 0; i < 4; i++)
      expect(p2.colors[out.background[i]!]).toEqual(pal.colors[file.background[i]!]);
    expect(file.background[0]).toBe(1);
  });

  it('sort by luminance with rewrite keeps the picture', () => {
    const p = grayscalePalette();
    p.colors[10] = [60, 60, 60];
    p.colors[11] = [1, 1, 1];
    const m = sortMapping(p, { start: 10, end: 11 }, 'luminance');
    expect([m[10], m[11]]).toEqual([11, 10]);
    const sorted = permutePalette(p, m);
    expect(sorted.colors[10]).toEqual([1, 1, 1]);
  });

  it('remapImages re-encodes only sprites whose pixels change', () => {
    const untouched = sprite();
    const file = af([[11, move({ sprites: [untouched] })]]);
    const m = identityRemap();
    m[200] = 201;
    expect(remapImages(file, m).moves.get(11)!.sprites[0]).toBe(untouched);
    m[1] = 9;
    const changed = remapImages(file, m).moves.get(11)!.sprites[0]!;
    expect(decodeSprite(2, 2, changed.image).pixels[0]).toBe(9);
  });

  it.skipIf(!HAS_DATA)('identity mapping leaves a whole fighter untouched', () => {
    const f = readAF(readData('FIGHTR0.AF'));
    const out = remapImages(f, identityRemap());
    for (const [id, m] of f.moves)
      m.sprites.forEach((s, i) => expect(out.moves.get(id)!.sprites[i]).toBe(s));
  });
});

describe('layout', () => {
  it('names regions and remap slots', () => {
    expect([0, 1, 0x30, 0x60, 0xa0].map((i) => regionOf(i).id)).toEqual([
      'black',
      'p1',
      'p2',
      'arena',
      'ui',
    ]);
    expect(remapSlotNote(4)).toMatch(/dimming/);
    expect(remapSlotNote(12)).toMatch(/Not used/);
  });
});
