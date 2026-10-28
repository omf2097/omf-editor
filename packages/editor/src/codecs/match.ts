// Matching decoded PNGs to a palette (spec 12 §10.2).

import {
  TRANSPARENT,
  closestIndex,
  vgaToRgb,
  type DecodedSprite,
  type Palette,
  type RGB,
} from '@omf/formats';
import type { DecodedPng } from './png';

export interface UnmatchedColor {
  rgb: RGB;
  count: number;
}

export interface MatchResult {
  decoded: DecodedSprite;
  unmatched: UnmatchedColor[];
  /** True when every pixel kept its index from the PNG's own palette. */
  direct: boolean;
}

const key = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;

export interface MatchOptions {
  /** Map colours missing from the palette to the closest entry instead of reporting them. */
  nearest?: boolean;
  /**
   * Sprite image: palette index 0 is transparent in openomf (its mod loader
   * stores transparent PNG pixels as 0), so index 0 reads as TRANSPARENT and
   * no colour matches it. Off for backgrounds, where index 0 is a colour.
   */
  sprite?: boolean;
  /** Indexed PNG: this index is transparent even without a tRNS entry (sheet `transparent_index`). */
  keyIndex?: number | null;
}

/**
 * Per PNG palette entry k: k itself when the PNG's colour at k equals the
 * target palette's, TRANSPARENT for transparent entries, or -1 to match the
 * pixel by colour instead.
 */
function directIndices(ix: NonNullable<DecodedPng['indexed']>, target: RGB[], o: MatchOptions) {
  const direct = new Int32Array(256).fill(-1);
  for (let k = 0; k < Math.min(256, ix.palette.length); k++) {
    const got = ix.palette[k]!;
    const want = target[k];
    if ((ix.alpha[k] ?? 255) < 128 || (o.sprite && k === 0) || k === o.keyIndex)
      direct[k] = TRANSPARENT;
    else if (want && got[0] === want[0] && got[1] === want[1] && got[2] === want[2]) direct[k] = k;
  }
  return direct;
}

/**
 * Colour → palette index matcher over indices `first`…255. Exact colours map
 * to the lowest index with that colour; others to the closest entry with
 * `nearest`, else they are counted in `missing` and give TRANSPARENT.
 */
function colourMatcher(pal: Palette, target: RGB[], first: number, nearest: boolean) {
  const lookup = new Map<number, number>();
  for (let i = 255; i >= first; i--) {
    const [r, g, b] = target[i]!;
    lookup.set(key(r, g, b), i); // lowest index wins
  }
  const missing = new Map<number, UnmatchedColor>();
  const near = new Map<number, number>();
  function match(r: number, g: number, b: number): number {
    const k = key(r, g, b);
    const idx = lookup.get(k);
    if (idx !== undefined) return idx;
    if (nearest) {
      let m = near.get(k);
      if (m === undefined) {
        m = closestIndex(pal, [r, g, b], { start: first, end: 255 });
        near.set(k, m);
      }
      return m;
    }
    const u = missing.get(k);
    if (u) u.count++;
    else missing.set(k, { rgb: [r, g, b], count: 1 });
    return TRANSPARENT;
  }
  return { match, missing };
}

/**
 * Converts a PNG to palette indices. A pixel of an indexed PNG keeps its own
 * index when the PNG's colour at that index equals the palette's, so
 * duplicate colours (1/17/33… in arena palettes) survive; every other pixel
 * is matched by colour to the lowest index with that colour. Colours compare
 * as 8-bit RGB, the palette's 6-bit VGA values expanded by vgaToRgb. Alpha
 * below 128 is transparent.
 */
export function matchToPalette(png: DecodedPng, pal: Palette, o: MatchOptions = {}): MatchResult {
  const n = png.width * png.height;
  const pixels = new Uint16Array(n);
  const target = pal.colors.map(vgaToRgb);
  const ix = png.indexed;
  const direct = ix ? directIndices(ix, target, o) : null;
  const { match, missing } = colourMatcher(pal, target, o.sprite ? 1 : 0, !!o.nearest);
  let allDirect = !!ix;
  for (let i = 0; i < n; i++) {
    if (ix && direct) {
      const d = direct[ix.indices[i]!]!;
      if (d >= 0) {
        pixels[i] = d;
        continue;
      }
      allDirect = false;
    }
    const c = png.rgba;
    pixels[i] = c[i * 4 + 3]! < 128 ? TRANSPARENT : match(c[i * 4]!, c[i * 4 + 1]!, c[i * 4 + 2]!);
  }
  return {
    decoded: { width: png.width, height: png.height, pixels },
    unmatched: [...missing.values()].sort((x, y) => y.count - x.count),
    direct: allDirect,
  };
}
