// The colour tools of the Palettes view (spec 16 §2.4): their parameters and
// the candidate palette the previewing ones propose. Swap / Move / Sort are in paletteOps.
import {
  adjustColors,
  clonePalette,
  easeInOut,
  rampColors,
  shadeBand,
  type IndexRange,
  type Palette,
  type PaletteFileFormat,
  type RampSpace,
  type VGA,
} from '@omf/formats';
import { hexVga, vgaHex } from './colorHex';

export type PaletteTool =
  | 'ramp'
  | 'shades'
  | 'adjust'
  | 'copy'
  | 'altpals'
  | 'swap'
  | 'sort'
  | 'fill'
  | 'import'
  | 'export'
  | 'compare';

export const PALETTE_TOOLS: { id: PaletteTool; label: string }[] = [
  { id: 'ramp', label: 'Ramp' },
  { id: 'shades', label: 'Shades' },
  { id: 'adjust', label: 'Adjust' },
  { id: 'copy', label: 'Copy / Paste' },
  { id: 'altpals', label: 'From ALTPALS' },
  { id: 'swap', label: 'Swap / Move' },
  { id: 'sort', label: 'Sort' },
  { id: 'fill', label: 'Fill' },
  { id: 'import', label: 'Import' },
  { id: 'export', label: 'Export' },
  { id: 'compare', label: 'Compare' },
];

/** The fields of every tool; colours are `#rrggbb` as the colour inputs use them. */
export const defaultToolParams = () => ({
  rampFrom: '#000000',
  rampTo: '#ffffff',
  rampSpace: 'rgb' as RampSpace,
  rampEase: false,
  shadeBase: '#a05028',
  shadeBlack: 0.12,
  shadeWhite: 0.6,
  shadePeak: 12,
  shadeGamma: 1,
  hue: 0,
  saturation: 0,
  lightness: 0,
  contrast: 0,
  gamma: 1,
  temperature: 0,
  pasteReversed: false,
  altOption: 0,
  altPalette: 0,
  swapTarget: 0,
  swapMode: 'swap' as 'swap' | 'move',
  /** Swap / Move / Sort: permute images, other palettes and remaps too (paletteOps.permuteBk). */
  rewrite: true,
  sortBy: 'luminance' as 'luminance' | 'hue',
  fill: '#808080',
  exportFormat: 'gpl' as PaletteFileFormat,
});
export type ToolParams = ReturnType<typeof defaultToolParams>;

/**
 * Parameters seeded from the selection when a tool opens: the ramp spans the
 * first and last selected colours, Shades starts from the 13th (the band's
 * usual peak), Swap targets the entry after the selection.
 */
export function paramsFromSelection(base: Palette, sel: number[]): Partial<ToolParams> {
  if (!sel.length) return {};
  const last = sel[sel.length - 1]!;
  return {
    rampFrom: vgaHex(base.colors[sel[0]!]!),
    rampTo: vgaHex(base.colors[last]!),
    shadeBase: vgaHex(base.colors[sel[Math.min(sel.length - 1, 12)]!]!),
    swapTarget: last + 1 <= 255 ? last + 1 : 0,
  };
}

/**
 * The palette a previewing tool proposes for the selected entries (`sel`,
 * sorted), or null when the tool does not preview or the selection does not suit it.
 */
export function toolCandidate(
  tool: PaletteTool,
  base: Palette,
  sel: number[],
  p: ToolParams,
  altPals: Palette[] | null,
): Palette | null {
  const out = clonePalette(base);
  /** Writes `vals` to the selected entries in order. */
  const put = (vals: VGA[]): void =>
    vals.forEach((v, k) => sel[k] !== undefined && (out.colors[sel[k]!] = v));
  switch (tool) {
    case 'ramp':
      if (sel.length < 2) return null;
      put(
        rampColors(
          hexVga(p.rampFrom),
          hexVga(p.rampTo),
          sel.length,
          p.rampSpace,
          p.rampEase ? easeInOut : undefined,
        ),
      );
      return out;
    case 'shades':
      if (sel.length !== 16) return null;
      put(
        shadeBand(hexVga(p.shadeBase), {
          black: p.shadeBlack,
          white: p.shadeWhite,
          peak: p.shadePeak,
          gamma: p.shadeGamma,
        }),
      );
      return out;
    case 'adjust':
      put(
        adjustColors(
          sel.map((i) => base.colors[i]!),
          {
            hue: p.hue,
            saturation: p.saturation,
            lightness: p.lightness,
            contrast: p.contrast,
            gamma: p.gamma,
            temperature: p.temperature,
          },
        ),
      );
      return out;
    case 'fill':
      put(sel.map(() => hexVga(p.fill)));
      return out;
    case 'altpals': {
      // An ALTPALS palette holds 16 options of a 16-shade HAR band; the option
      // replaces the band of the first selected entry. Index 0 stays (always black).
      const alt = altPals?.[p.altPalette];
      if (!alt || !sel.length) return null;
      const start = sel[0]! - (sel[0]! % 16);
      for (let k = 0; k < 16; k++) {
        const dst = start + k;
        if (dst === 0) continue;
        out.colors[dst] = [...alt.colors[p.altOption * 16 + k]!] as VGA;
      }
      return out;
    }
    default:
      return null;
  }
}

/**
 * Entries a paste of `count` colours writes: the first `count` selected ones,
 * or, when fewer are selected, a run from the first selected entry (cut at 255).
 */
export function pasteTargets(sel: number[], count: number): number[] {
  return sel.length >= count
    ? sel.slice(0, count)
    : Array.from({ length: count }, (_, k) => sel[0]! + k).filter((i) => i < 256);
}

/** The selection as one range, or null when it is empty or has gaps. */
export function contiguousRange(sel: number[]): IndexRange | null {
  if (!sel.length) return null;
  const r = { start: sel[0]!, end: sel[sel.length - 1]! };
  return sel.length === r.end - r.start + 1 ? r : null;
}
