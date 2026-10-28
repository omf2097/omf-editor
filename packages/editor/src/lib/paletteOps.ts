import { permutePalette, remapImages, type BKFile, type IndexRange } from '@omf/formats';
import { clamp } from './util';

// Palette index ranges, and the permutations of the Swap / Move / Sort tools (spec 16 §2.4).
// A permutation `m` maps old index → new index; see permuteBk for what it touches.

/** Every index from `a` to `b`, in either order (a Shift+click or drag selection). */
export function indexRange(a: number, b: number): Set<number> {
  const out = new Set<number>();
  for (let k = Math.min(a, b); k <= Math.max(a, b); k++) out.add(k);
  return out;
}

/**
 * Remap table `r` (entry i draws colour r[i]) after the palette is permuted
 * by `m` (old index → new index): new[m[i]] = m[r[i]], so every entry still
 * picks the same colour.
 */
export function permuteRemap(r: Uint8Array, m: Uint8Array): Uint8Array {
  const out = new Uint8Array(256);
  for (let i = 0; i < 256; i++) out[m[i]!] = m[r[i]!]!;
  return out;
}

/** Mapping that moves `a` so it starts at index `to`, shifting the entries in between. */
export function moveMapping(a: IndexRange, to: number): Uint8Array {
  const n = a.end - a.start + 1;
  const order = Array.from({ length: 256 }, (_, i) => i).filter((i) => i < a.start || i > a.end);
  const block = Array.from({ length: n }, (_, k) => a.start + k);
  order.splice(clamp(to, 0, order.length), 0, ...block);
  const m = new Uint8Array(256);
  order.forEach((old, nu) => (m[old] = nu));
  return m;
}

/** A target start for a block of `n` entries: an integer with the block inside 0–255, else null. */
export function blockStart(v: unknown, n: number): number | null {
  if (typeof v === 'string' && v.trim() === '') return null;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(x) && x >= 0 && x + n <= 256 ? x : null;
}

/**
 * Applies a permutation to palette `index` of `doc`. With `rewrite` the
 * pictures must stay the same, so every palette and every remap table is
 * permuted along with the images; without it only that palette's colours
 * move and images change colour.
 */
export function permuteBk(
  doc: BKFile,
  index: number,
  mapping: Uint8Array,
  rewrite: boolean,
): BKFile {
  const palettes = doc.palettes.map((p, i) =>
    rewrite
      ? {
          ...p,
          colors: permutePalette(p.colors, mapping),
          remaps: p.remaps.map((r) => permuteRemap(r, mapping)),
        }
      : i === index
        ? { ...p, colors: permutePalette(p.colors, mapping) }
        : p,
  );
  const next = { ...doc, palettes };
  return rewrite ? remapImages(next, mapping) : next;
}
