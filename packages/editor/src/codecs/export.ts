// Building PNGs from palette-indexed images, with a key index for transparency (spec 20 §1).

import {
  TRANSPARENT,
  pickTransparentIndex,
  vgaToRgb,
  type DecodedSprite,
  type Palette,
  type RGB,
} from '@omf/formats';
import { encodeIndexedPng } from './png';

export function paletteRgb(pal: Palette): RGB[] {
  return pal.colors.map(vgaToRgb);
}

/**
 * Indexed PNG of a decoded image. Returns null when the image uses all 256
 * indices, so no key index is free (the caller falls back to RGBA).
 */
export function indexedPngOf(
  d: DecodedSprite,
  pal: Palette,
  shift: (p: number) => number = (p) => p,
): Uint8Array | null {
  const shifted: DecodedSprite = {
    ...d,
    pixels: d.pixels.map((p) => (p === TRANSPARENT ? p : shift(p))),
  };
  const hasTransparent = shifted.pixels.some((p) => p === TRANSPARENT);
  const key = hasTransparent ? pickTransparentIndex([shifted]) : null;
  if (hasTransparent && key === null) return null;
  const indices = new Uint8Array(shifted.pixels.length);
  shifted.pixels.forEach((p, i) => (indices[i] = p === TRANSPARENT ? key! : p));
  return encodeIndexedPng({
    width: d.width,
    height: d.height,
    indices,
    palette: paletteRgb(pal),
    transparentIndex: key,
  });
}

/** True-colour PNG through the browser's encoder, for images that use all 256 indices. */
export async function rgbaPngOf(d: DecodedSprite, lut: Uint32Array): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(Math.max(1, d.width), Math.max(1, d.height));
  const ctx = canvas.getContext('2d')!;
  const px = new Uint32Array(d.width * d.height);
  d.pixels.forEach((p, i) => (px[i] = lut[p]!));
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px.buffer), d.width, d.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}
