import { describe, expect, it } from 'vitest';
import { writeBK, type VGA } from '@omf/formats';
import { newScene } from '../lib/templates';
import { useSpriteImport } from './useSpriteImport';
import { usePalette } from './usePalette';
import { useToasts } from './useToasts';

describe('useSpriteImport palette (G7)', () => {
  it('matches against the scene palette, not the remap preview or HAR colours', async () => {
    const bk = newScene();
    const colors = bk.palettes[0]!.colors.colors;
    colors[5] = [10, 20, 30] as VGA;
    colors[9] = [40, 50, 60] as VGA;
    // Remap 0 sends 5 to 9: the preview shows index 5 in index 9's colour.
    bk.palettes[0]!.remaps[0]![5] = 9;
    const palette = usePalette();
    expect(await palette.loadSourceBytes('arena.bk', writeBK(bk), false)).toBe(true);
    palette.remapIndex.value = 0;
    palette.harColors.value = { p1: [3, null, null], p2: [null, null, null] };
    const imp = useSpriteImport();
    expect(palette.activePalette.value.colors[5]).toEqual([40, 50, 60]);
    expect(imp.matchPalette.value.colors[5]).toEqual([10, 20, 30]);
    // Index 5 in its own colour imports as 5.
    const png = {
      width: 1,
      height: 1,
      rgba: Uint8ClampedArray.from([40, 81, 121, 255]),
    };
    expect(Array.from((await imp.match(png, 'x.png', { sprite: true }))!.pixels)).toEqual([5]);
    palette.remapIndex.value = null;
  });

  it('says so when the greyscale fallback is matched against', async () => {
    const palette = usePalette();
    palette.forceGrayscale.value = true;
    const toasts = useToasts();
    const before = toasts.toasts.value.length;
    const png = { width: 1, height: 1, rgba: Uint8ClampedArray.from([0, 0, 0, 0]) };
    await useSpriteImport().match(png, 'x.png', { sprite: true });
    expect(toasts.toasts.value.slice(before).map((t) => t.message)).toEqual([
      expect.stringMatching(/greyscale/),
    ]);
    palette.forceGrayscale.value = false;
  });
});
