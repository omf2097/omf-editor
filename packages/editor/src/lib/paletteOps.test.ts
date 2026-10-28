import { describe, expect, it } from 'vitest';
import { swapMapping, type BKFile, type VGA } from '@omf/formats';
import { blockStart, moveMapping, permuteBk, permuteRemap } from './paletteOps';

const colours = (seed: number): { colors: VGA[] } => ({
  colors: Array.from({ length: 256 }, (_, i) => [i & 63, (i + seed) & 63, seed] as VGA),
});
const shift = (k: number): Uint8Array => Uint8Array.from({ length: 256 }, (_, i) => (i + k) & 255);

function scene(): BKFile {
  return {
    musicMask: 0,
    unknownA: 0,
    backgroundWidth: 4,
    backgroundHeight: 1,
    animations: new Map(),
    background: Uint8Array.from([16, 17, 100, 200]),
    palettes: [0, 1].map((p) => ({ colors: colours(p), remaps: [shift(1), shift(5)] })),
    soundTable: new Array<number>(30).fill(0),
  } as BKFile;
}

/** Colour each background pixel shows under palette p, remap r (or none). */
function shown(d: BKFile, p: number, r?: number): string[] {
  const pal = d.palettes[p]!;
  return [...d.background].map((px) =>
    pal.colors.colors[r === undefined ? px : pal.remaps[r]![px]!]!.join(),
  );
}

describe('palette permutations', () => {
  it('rewrite keeps every picture under every palette and remap (U1)', () => {
    const d = scene();
    const m = swapMapping({ start: 16, end: 19 }, { start: 100, end: 103 });
    const out = permuteBk(d, 0, m, true);
    for (const p of [0, 1]) {
      expect(shown(out, p)).toEqual(shown(d, p));
      for (const r of [0, 1]) expect(shown(out, p, r)).toEqual(shown(d, p, r));
    }
    // The other palette's colours moved too.
    expect(out.palettes[1]!.colors.colors[100]).toEqual(d.palettes[1]!.colors.colors[16]);
  });

  it('without rewrite only the edited palette changes', () => {
    const d = scene();
    const m = swapMapping({ start: 16, end: 19 }, { start: 100, end: 103 });
    const out = permuteBk(d, 1, m, false);
    expect(out.palettes[0]).toBe(d.palettes[0]);
    expect(out.palettes[1]!.remaps).toBe(d.palettes[1]!.remaps);
    expect([...out.background]).toEqual([...d.background]);
    expect(out.palettes[1]!.colors.colors[100]).toEqual(d.palettes[1]!.colors.colors[16]);
  });

  it('permuteRemap keeps the colour each entry picks', () => {
    const m = swapMapping({ start: 0, end: 9 }, { start: 200, end: 209 });
    const r = shift(3);
    const out = permuteRemap(r, m);
    for (let i = 0; i < 256; i++) expect(out[m[i]!]).toBe(m[r[i]!]);
  });

  it('move puts the block at the target start in both directions (U3)', () => {
    for (const [a, to] of [
      [{ start: 16, end: 19 }, 100],
      [{ start: 200, end: 203 }, 100],
      [{ start: 16, end: 19 }, 2],
      [{ start: 16, end: 19 }, 17],
      [{ start: 16, end: 19 }, 252],
    ] as const) {
      const m = moveMapping(a, to);
      expect([m[a.start], m[a.end]]).toEqual([to, to + 3]);
      expect(new Set(m).size).toBe(256);
    }
  });

  it('target start must be an integer that fits (U2)', () => {
    expect(blockStart(-2, 4)).toBeNull();
    expect(blockStart('', 4)).toBeNull();
    expect(blockStart(3.5, 4)).toBeNull();
    expect(blockStart(253, 4)).toBeNull();
    expect(blockStart(252, 4)).toBe(252);
    expect(blockStart(0, 1)).toBe(0);
  });
});
