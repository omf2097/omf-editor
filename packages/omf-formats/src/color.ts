// Colour maths for the palette and remap tools (spec 16 §2.4–2.5). Pure.

import { decodeSprite, encodeSprite, TRANSPARENT } from './sprite';
import { vgaFrom8, vgaToRgb, type Palette, type RGB, type VGA } from './palette';
import type { Animation } from './animation';
import type { AFFile } from './af';
import type { BKFile } from './bk';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export type ColorMetric = 'weighted' | 'cie76';

export interface IndexRange {
  start: number;
  end: number;
}

/** Weighted RGB distance, 2·ΔR² + 4·ΔG² + 3·ΔB². */
export function weightedDistance(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab(c: RGB): [number, number, number] {
  const [r, g, b] = c.map(srgbToLinear) as [number, number, number];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number): number =>
    t > 216 / 24389 ? Math.cbrt(t) : (t * 24389) / 27 / 116 + 16 / 116;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function cie76(a: RGB, b: RGB): number {
  const la = rgbToLab(a);
  const lb = rgbToLab(b);
  return (la[0] - lb[0]) ** 2 + (la[1] - lb[1]) ** 2 + (la[2] - lb[2]) ** 2;
}

/** Closest palette index to `rgb` within `range` (inclusive). Ties go to the lowest index. */
export function closestIndex(
  pal: Palette,
  rgb: RGB,
  range: IndexRange = { start: 0, end: 255 },
  metric: ColorMetric = 'weighted',
): number {
  const dist = metric === 'cie76' ? cie76 : weightedDistance;
  let best = range.start;
  let bestD = Infinity;
  for (let i = range.start; i <= range.end; i++) {
    const d = dist(rgb, vgaToRgb(pal.colors[i]!));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// ------------------------------------------------------------- HSL

export type HSL = [h: number, s: number, l: number];

export function rgbToHsl([r8, g8, b8]: RGB): HSL {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function hslToRgb([h, s, l]: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [r, g, b].map((v) => Math.round(clamp(v + m, 0, 1) * 255)) as RGB;
}

// ------------------------------------------------------------- generators

export type RampSpace = 'rgb' | 'hsl-short' | 'hsl-long';

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** `count` colours from `from` to `to` inclusive, quantised to 6-bit. */
export function rampColors(
  from: VGA,
  to: VGA,
  count: number,
  space: RampSpace = 'rgb',
  ease?: (t: number) => number,
): VGA[] {
  const out: VGA[] = [];
  const a = vgaToRgb(from);
  const b = vgaToRgb(to);
  const ha = rgbToHsl(a);
  const hb = rgbToHsl(b);
  // A grey has no hue (rgbToHsl gives 0, red): take the other end's, so a ramp
  // from grey to a colour does not pass through red.
  if (ha[1] === 0) ha[0] = hb[0];
  if (hb[1] === 0) hb[0] = ha[0];
  const short = ((((hb[0] - ha[0]) % 360) + 540) % 360) - 180;
  const dh = space === 'hsl-long' ? (short > 0 ? short - 360 : short + 360) : short;
  for (let i = 0; i < count; i++) {
    let t = count === 1 ? 0 : i / (count - 1);
    if (ease) t = ease(t);
    if (i === 0) out.push([...from] as VGA);
    else if (i === count - 1) out.push([...to] as VGA);
    else if (space === 'rgb')
      out.push(quantise([0, 1, 2].map((k) => a[k]! + (b[k]! - a[k]!) * t) as RGB));
    else
      out.push(
        quantise(
          hslToRgb([ha[0] + dh * t, ha[1] + (hb[1] - ha[1]) * t, ha[2] + (hb[2] - ha[2]) * t]),
        ),
      );
  }
  return out;
}

export function quantise(c: RGB): VGA {
  return c.map((v) => vgaFrom8(Math.round(clamp(v, 0, 255)))) as VGA;
}

export interface ShadeOptions {
  /** Brightness of the darkest shade relative to the base, 0..1. Default 0.12. */
  black?: number;
  /** How far the lightest shade moves toward white, 0..1. Default 0.6. */
  white?: number;
  /** Index (0..15) where the base colour sits. Default 12. */
  peak?: number;
  /** Gamma applied to the dark part of the ramp. Default 1. */
  gamma?: number;
}

/** A 16-shade HAR band from one base colour, dark → base → highlights, like ALTPALS. */
export function shadeBand(base: VGA, opts: ShadeOptions = {}): VGA[] {
  const black = opts.black ?? 0.12;
  const white = opts.white ?? 0.6;
  const peak = clamp(Math.round(opts.peak ?? 12), 1, 15);
  const gamma = opts.gamma ?? 1;
  const rgb = vgaToRgb(base);
  const out: VGA[] = [];
  for (let i = 0; i < 16; i++) {
    if (i <= peak) {
      const t = (i / peak) ** gamma;
      const k = black + (1 - black) * t;
      out.push(quantise(rgb.map((v) => v * k) as RGB));
    } else {
      const t = ((i - peak) / (15 - peak)) * white;
      out.push(quantise(rgb.map((v) => v + (255 - v) * t) as RGB));
    }
  }
  return out;
}

export interface Adjustment {
  /** Degrees. */
  hue?: number;
  /** −1..1, relative. */
  saturation?: number;
  /** −1..1, added to lightness. */
  lightness?: number;
  /** −1..1. */
  contrast?: number;
  /** > 0, 1 = none. */
  gamma?: number;
  /** −1 (cool) .. 1 (warm). */
  temperature?: number;
}

export function adjustColor(c: VGA, a: Adjustment): VGA {
  let rgb = vgaToRgb(c).map(Number) as RGB;
  if (a.gamma && a.gamma !== 1) rgb = rgb.map((v) => 255 * (v / 255) ** (1 / a.gamma!)) as RGB;
  if (a.contrast) {
    const f = 1 + a.contrast;
    rgb = rgb.map((v) => (v - 128) * f + 128) as RGB;
  }
  if (a.temperature) {
    rgb = [rgb[0] + 40 * a.temperature, rgb[1], rgb[2] - 40 * a.temperature];
  }
  rgb = rgb.map((v) => clamp(v, 0, 255)) as RGB;
  if (a.hue || a.saturation || a.lightness) {
    const [h, s, l] = rgbToHsl(rgb.map(Math.round) as RGB);
    rgb = hslToRgb([
      h + (a.hue ?? 0),
      clamp(s * (1 + (a.saturation ?? 0)), 0, 1),
      clamp(l + (a.lightness ?? 0), 0, 1),
    ]);
  }
  return quantise(rgb);
}

export const adjustColors = (cs: VGA[], a: Adjustment): VGA[] => cs.map((c) => adjustColor(c, a));

export const luminance = (c: VGA): number => {
  const [r, g, b] = vgaToRgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// ------------------------------------------------------------- remap tables

/** For each source index in `range`, map to the closest entry in `search` after transforming its colour. */
export function remapByColor(
  pal: Palette,
  current: Uint8Array,
  range: IndexRange,
  search: IndexRange,
  transform: (c: RGB) => RGB,
  metric: ColorMetric = 'weighted',
): Uint8Array {
  const out = Uint8Array.from(current);
  for (let i = range.start; i <= range.end; i++) {
    out[i] = closestIndex(pal, transform(vgaToRgb(pal.colors[i]!)), search, metric);
  }
  return out;
}

export const darken =
  (pct: number) =>
  (c: RGB): RGB =>
    c.map((v) => v * (1 - pct / 100)) as RGB;
export const lighten =
  (pct: number) =>
  (c: RGB): RGB =>
    c.map((v) => v + (255 - v) * (pct / 100)) as RGB;
export const tintToward =
  (target: RGB, pct: number) =>
  (c: RGB): RGB =>
    c.map((v, k) => v + (target[k]! - v) * (pct / 100)) as RGB;
export const grayscale = (c: RGB): RGB => {
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return [y, y, y];
};

/** Linearly map source range onto target range. */
export function rangeMap(current: Uint8Array, src: IndexRange, dst: IndexRange): Uint8Array {
  const out = Uint8Array.from(current);
  const n = src.end - src.start;
  const m = dst.end - dst.start;
  for (let i = src.start; i <= src.end; i++) {
    out[i] = n === 0 ? dst.start : dst.start + Math.round(((i - src.start) * m) / n);
  }
  return out;
}

/** target = source + n, clamped to `within`. */
export function shiftMap(
  current: Uint8Array,
  range: IndexRange,
  n: number,
  within: IndexRange,
): Uint8Array {
  const out = Uint8Array.from(current);
  for (let i = range.start; i <= range.end; i++) out[i] = clamp(i + n, within.start, within.end);
  return out;
}

// ------------------------------------------------------------- image rewrite

/**
 * Rewrites palette indices in every sprite and the BK background through
 * `mapping` (old index → new index), for palette swap/move/sort with
 * "rewrite images". Sprites are re-encoded only when their pixels change.
 * Returns new animation/background values; inputs are not modified.
 */
export function remapAnimationImages<A extends Animation>(
  anims: Map<number, A>,
  mapping: Uint8Array,
): Map<number, A> {
  const out = new Map<number, A>();
  for (const [id, a] of anims) {
    const sprites = a.sprites.map((s) => {
      if (s.missing || s.image.length === 0) return s;
      const d = decodeSprite(s.width, s.height, s.image);
      let changed = false;
      const pixels = d.pixels.map((p) => {
        if (p === TRANSPARENT) return p;
        const q = mapping[p]!;
        if (q !== p) changed = true;
        return q;
      });
      return changed ? { ...s, image: encodeSprite({ ...d, pixels }) } : s;
    });
    out.set(id, { ...a, sprites });
  }
  return out;
}

export function remapImages<T extends AFFile | BKFile>(doc: T, mapping: Uint8Array): T {
  if ('moves' in doc) return { ...doc, moves: remapAnimationImages(doc.moves, mapping) };
  return {
    ...doc,
    animations: remapAnimationImages(doc.animations, mapping),
    background: doc.background.map((p) => mapping[p]!),
  };
}

/**
 * Mapping that swaps two ranges. They must be the same size, inside 0–255 and
 * not overlap, or the result is not a permutation; anything else throws.
 */
export function swapMapping(a: IndexRange, b: IndexRange): Uint8Array {
  const n = a.end - a.start;
  const inside = (r: IndexRange): boolean =>
    Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end <= 255;
  if (!inside(a) || !inside(b) || n < 0 || b.end - b.start !== n)
    throw new RangeError('swapMapping needs two ranges of the same size within 0–255');
  if (a.start <= b.end && b.start <= a.end) throw new RangeError('swapMapping ranges overlap');
  const m = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let k = 0; k <= n; k++) {
    m[a.start + k] = b.start + k;
    m[b.start + k] = a.start + k;
  }
  return m;
}

/** Applies a permutation to a palette: new[mapping[i]] = old[i]. */
export function permutePalette(pal: Palette, mapping: Uint8Array): Palette {
  const colors = pal.colors.map((c) => [...c] as VGA);
  for (let i = 0; i < 256; i++) colors[mapping[i]!] = [...pal.colors[i]!] as VGA;
  return { colors };
}

/** Mapping that sorts `range` by luminance or hue. */
export function sortMapping(pal: Palette, range: IndexRange, by: 'luminance' | 'hue'): Uint8Array {
  const idx: number[] = [];
  for (let i = range.start; i <= range.end; i++) idx.push(i);
  const key = (i: number): number =>
    by === 'luminance' ? luminance(pal.colors[i]!) : rgbToHsl(vgaToRgb(pal.colors[i]!))[0];
  const sorted = [...idx].sort((x, y) => key(x) - key(y) || x - y);
  const m = Uint8Array.from({ length: 256 }, (_, i) => i);
  sorted.forEach((oldIndex, k) => {
    m[oldIndex] = range.start + k;
  });
  return m;
}
