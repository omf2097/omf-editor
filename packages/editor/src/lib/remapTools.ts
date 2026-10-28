// Generation tools of the Remaps tab (spec 16 §2.5). A remap table has 256
// entries; entry i draws base colour table[i]. Tools propose a new table for
// the selected entries only and never wrap an index: a bad parameter gives a reason instead.
import {
  darken,
  grayscale,
  identityRemap,
  lighten,
  rangeMap,
  remapByColor,
  shiftMap,
  tintToward,
  type ColorMetric,
  type Palette,
} from '@omf/formats';
import { hexRgb } from './colorHex';

export const REMAP_TOOLS = [
  'darken',
  'lighten',
  'tint',
  'range',
  'shift',
  'constant',
  'grayscale',
  'identity',
  'copy',
] as const;
export type RemapTool = (typeof REMAP_TOOLS)[number];

/** Tools that closest-match colours within a search range. */
export const SEARCH_TOOLS: readonly string[] = ['darken', 'lighten', 'tint', 'grayscale', 'shift'];

export const remapToolLabel = (t: RemapTool): string =>
  t === 'range' ? 'Range map' : t === 'copy' ? 'Copy from' : t[0]!.toUpperCase() + t.slice(1);

export const defaultRemapParams = () => ({
  /** Darken / lighten amount, tint blend. */
  pct: 50,
  tint: '#ff0000',
  /** Range map: first index of the target range. */
  target: 0x70,
  shift: 1,
  constant: 0,
  searchStart: 0,
  searchEnd: 255,
  metric: 'weighted' as ColorMetric,
  copySlot: 0,
  copyPalette: 0,
});
export type RemapParams = ReturnType<typeof defaultRemapParams>;

export interface RemapInput {
  /** The base palette the table indexes. */
  base: Palette;
  /** The slot's stored table. */
  stored: Uint8Array;
  /** Selected entries, sorted. */
  selected: number[];
  /** Copy from: the table of palette `copyPalette`, slot `copySlot`, if there is one. */
  copySource: Uint8Array | undefined;
}

export type RemapResult = { table: Uint8Array | null; error: string };

/** An index typed in a tool field: a whole number 0–255, else null (never wrapped). */
const idx = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255 ? v : null;

/**
 * The table `tool` proposes, or null with the reason (empty when there is
 * nothing to say, e.g. Copy from a slot that does not exist).
 */
export function computeRemap(tool: RemapTool, t: RemapParams, input: RemapInput): RemapResult {
  const { base: pal, stored: cur, selected } = input;
  const fail = (error: string): RemapResult => ({ table: null, error });
  const ok = (table: Uint8Array | null): RemapResult => ({ table, error: '' });
  if (SEARCH_TOOLS.includes(tool) && (idx(t.searchStart) === null || idx(t.searchEnd) === null))
    return fail('The search range must be indices 0–255');
  /** The tool's table on the selected entries, the stored one elsewhere. */
  const only = (out: Uint8Array): RemapResult => {
    const res = Uint8Array.from(cur);
    for (const k of selected) res[k] = out[k]!;
    return ok(res);
  };
  // Tools that work on a range use the selection's first..last entry.
  const range = { start: selected[0] ?? 0, end: selected[selected.length - 1] ?? 0 };
  const search = {
    start: Math.min(t.searchStart, t.searchEnd),
    end: Math.max(t.searchStart, t.searchEnd),
  };
  const byColor = (f: Parameters<typeof remapByColor>[4]): RemapResult =>
    only(remapByColor(pal, cur, range, search, f, t.metric));
  switch (tool) {
    case 'darken':
      return byColor(darken(t.pct));
    case 'lighten':
      return byColor(lighten(t.pct));
    case 'tint':
      return byColor(tintToward(hexRgb(t.tint), t.pct));
    case 'grayscale':
      return byColor(grayscale);
    case 'range': {
      const n = range.end - range.start;
      if (idx(t.target) === null || t.target + n > 255)
        return fail(`The target start must be 0–${255 - n} so the range fits`);
      return only(rangeMap(cur, range, { start: t.target, end: t.target + n }));
    }
    case 'shift':
      if (!Number.isInteger(t.shift) || Math.abs(t.shift) > 255)
        return fail('The shift must be a whole number from -255 to 255');
      return only(shiftMap(cur, range, t.shift, search));
    case 'constant': {
      const c = idx(t.constant);
      if (c === null) return fail('The index must be 0–255');
      return only(Uint8Array.from({ length: 256 }, () => c));
    }
    case 'identity':
      return only(identityRemap());
    case 'copy':
      // The whole table, not only the selection.
      return ok(input.copySource ? Uint8Array.from(input.copySource) : null);
  }
}
