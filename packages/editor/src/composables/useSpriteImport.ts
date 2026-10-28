// PNG import into sprites and the shared-image prompt (spec 12 §10.2). Used by
// the sprite list, pixel editor, sheet import and background views.
import { computed } from 'vue';
import {
  bandedGrayscalePalette,
  paletteToRgbaLut,
  type DecodedSprite,
  type Palette,
} from '@omf/formats';
import { decodePng, type DecodedPng } from '../codecs/png';
import { matchToPalette, type MatchOptions } from '../codecs/match';
import { pickFile, type PickedFile } from '../lib/files';
import {
  isShared,
  replaceImage,
  spriteLabel,
  type ShareMode,
  type SpriteRef,
} from '../lib/spriteEdit';
import { useConfirm } from './useConfirm';
import { useDocument } from './useDocument';
import { usePalette } from './usePalette';
import { errorMessage, useToasts } from './useToasts';
import { rgbHex } from '../lib/colorHex';

export const PNG_TYPES = [
  { description: 'PNG image', accept: { 'image/png': ['.png'] as `.${string}`[] } },
];

export const GREYSCALE_NOTE =
  'No palette source is loaded, so colours are matched against the greyscale fallback palette.';

export function useSpriteImport() {
  const docs = useDocument();
  const palette = usePalette();
  const { ask } = useConfirm();
  const toasts = useToasts();

  /**
   * The palette PNGs are matched against and exported with: the BK palette
   * itself, before HAR colour selection and remap preview, which only change
   * how the stored indices look (spec 12 §10.2).
   */
  const matchPalette = computed<Palette>(() => {
    const bk = palette.paletteBk.value;
    if (palette.isFallback.value || !bk) return bandedGrayscalePalette();
    return bk.palettes[Math.min(palette.paletteIndex.value, bk.palettes.length - 1)]!.colors;
  });

  const matchLut = computed(() => paletteToRgbaLut(matchPalette.value));

  /**
   * Palette-matches a decoded PNG, asking about unmatched colours. `sprite`
   * reads index 0 as transparent (spec 13 §7). Null when cancelled.
   */
  async function match(
    png: DecodedPng,
    name: string,
    o: Omit<MatchOptions, 'nearest'>,
  ): Promise<DecodedSprite | null> {
    const pal = matchPalette.value;
    const grey = palette.isFallback.value;
    const m = matchToPalette(png, pal, o);
    if (!m.unmatched.length) {
      if (grey) toasts.info(GREYSCALE_NOTE);
      return m.decoded;
    }
    const c = await ask({
      title: 'Colours not in the palette',
      message: `${m.unmatched.length} colour(s) in ${name} are not in the palette.${grey ? ` ${GREYSCALE_NOTE}` : ''}`,
      details: m.unmatched.slice(0, 20).map((u) => `${rgbHex(u.rgb)} × ${u.count}`),
      choices: [
        { id: 'cancel', label: 'Cancel', variant: 'outline-secondary' },
        { id: 'nearest', label: 'Use nearest colours', variant: 'primary' },
      ],
    });
    return c === 'nearest' ? matchToPalette(png, pal, { ...o, nearest: true }).decoded : null;
  }

  /** Decodes and palette-matches a PNG file; see `match`. */
  async function decodeAndMatch(
    file: PickedFile,
    o: Omit<MatchOptions, 'nearest'> = { sprite: true },
  ): Promise<DecodedSprite | null> {
    let png;
    try {
      png = decodePng(file.bytes);
    } catch (e) {
      toasts.error(`${file.name} is not a readable PNG: ${errorMessage(e)}`);
      return null;
    }
    return match(png, file.name, o);
  }

  /** 'all' when `r` shares no image, else asks; null when cancelled. */
  async function shareMode(r: SpriteRef): Promise<ShareMode | null> {
    const d = docs.doc.value;
    if (!d || !isShared(d, r)) return 'all';
    const c = await ask({
      title: 'Shared image',
      message:
        'This image is shared with other sprites. Change it for all of them, or only for this sprite?',
      choices: [
        { id: 'cancel', label: 'Cancel', variant: 'outline-secondary' },
        { id: 'only', label: 'Only this sprite', variant: 'secondary' },
        { id: 'all', label: 'Update all', variant: 'primary' },
      ],
    });
    return c === 'cancel' ? null : (c as ShareMode);
  }

  /** Writes a decoded image into a sprite (one history entry), asking about shared images first. */
  async function applyImage(
    r: SpriteRef,
    decoded: DecodedSprite,
    label: string,
    pos?: { x: number; y: number },
  ): Promise<boolean> {
    const mode = await shareMode(r);
    if (!mode) return false;
    try {
      docs.mutate(label, (d) => replaceImage(d, r, decoded, mode, pos));
      return true;
    } catch (e) {
      toasts.error(errorMessage(e));
      return false;
    }
  }

  async function importInto(r: SpriteRef): Promise<boolean> {
    const f = await pickFile(PNG_TYPES);
    if (!f) return false;
    const decoded = await decodeAndMatch(f);
    if (!decoded) return false;
    return applyImage(r, decoded, `import PNG ${spriteLabel(r)}`);
  }

  return { matchPalette, matchLut, match, decodeAndMatch, shareMode, applyImage, importInto };
}
