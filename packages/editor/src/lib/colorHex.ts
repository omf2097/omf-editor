// CSS hex colours (#rrggbb) for colour inputs and titles, and hex palette indices.
// Palette entries are 6-bit VGA (0–63 per channel); vgaToRgb / rgbToVga convert (spec 03).
import { rgbToVga, vgaToRgb, type RGB, type VGA } from '@omf/formats';

export const rgbHex = (c: readonly number[]): string =>
  `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
export const vgaHex = (c: VGA): string => rgbHex(vgaToRgb(c));

/** `#rrggbb` (as an `<input type="color">` gives it) to 8-bit RGB; no validation. */
export const hexRgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const hexVga = (h: string): VGA => rgbToVga(hexRgb(h));

/** A palette index as two upper-case hex digits ("0A"). */
export const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0');
