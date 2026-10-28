// Drawing for the pixel editor canvas (spec 13 §2, §4). The canvas shows the
// sprite at 1:1 in sprite space: (0, 0) is the sprite's top-left pixel, the
// animation origin sits at (-pos_x, -pos_y). CSS scales it by the zoom.

import { TRANSPARENT, type BKFile, type DecodedSprite } from '@omf/formats';
import type { Point } from '../lib/scene';
import type { Rect } from '../lib/pixels';
import { drawCrosshair, drawGrid, ORIGIN_COLOUR } from './overlay';

/**
 * Sprite index drawn `delta` steps before or after `index` for onion skinning:
 * the neighbour in the animation's frame order when the sprite is in it,
 * otherwise the neighbouring sprite index. Null when there is none.
 */
export function onionNeighbour(
  frameOrder: number[],
  index: number,
  delta: number,
  spriteCount: number,
): number | null {
  const pos = frameOrder.indexOf(index);
  if (pos >= 0 && frameOrder.length > 1)
    return frameOrder[(pos + delta + frameOrder.length) % frameOrder.length] ?? null;
  const n = index + delta;
  return n >= 0 && n < spriteCount ? n : null;
}

/**
 * The part of the arena background behind a width × height sprite whose
 * top-left is at scene position (x, y). Outside the background is index 0.
 */
export function backgroundBehind(
  bk: BKFile,
  x: number,
  y: number,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const sx = x + i;
      const sy = y + j;
      out[j * width + i] =
        sx >= 0 && sy >= 0 && sx < bk.backgroundWidth && sy < bk.backgroundHeight
          ? bk.background[sy * bk.backgroundWidth + sx]!
          : 0;
    }
  }
  return out;
}

/** Halves the RGB of `rgba` wherever the sprite is transparent, so the arena reads as backdrop. */
export function dimTransparent(rgba: Uint8ClampedArray, sprite: DecodedSprite): void {
  for (let i = 0; i < sprite.pixels.length; i++) {
    if (sprite.pixels[i] !== TRANSPARENT) continue;
    rgba[i * 4] = rgba[i * 4]! >> 1;
    rgba[i * 4 + 1] = rgba[i * 4 + 1]! >> 1;
    rgba[i * 4 + 2] = rgba[i * 4 + 2]! >> 1;
  }
}

export interface PixelOverlay {
  zoom: number;
  width: number;
  height: number;
  /** Pixel grid, drawn from zoom 4 up. */
  grid: boolean;
  /** Animation origin in sprite space, (-pos_x, -pos_y). */
  origin: Point;
  selection: Rect | null;
  /** Brush outline: centre pixel and size. */
  brush: { x: number; y: number; size: number } | null;
}

/** Sizes the overlay canvas to image size × zoom and draws grid, origin, selection and brush on it. */
export function drawOverlay(o: HTMLCanvasElement, v: PixelOverlay): void {
  const z = v.zoom;
  o.width = v.width * z;
  o.height = v.height * z;
  const ctx = o.getContext('2d')!;
  ctx.clearRect(0, 0, o.width, o.height);
  if (v.grid && z >= 4) drawGrid(ctx, v.width, v.height, 1, z, 'rgba(255,255,255,0.12)');
  drawCrosshair(ctx, v.origin, z, 8, ORIGIN_COLOUR);
  const s = v.selection;
  if (s) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#ffeb3b';
    ctx.strokeRect(s.x * z + 0.5, s.y * z + 0.5, s.w * z - 1, s.h * z - 1);
    ctx.setLineDash([]);
  }
  const b = v.brush;
  if (b) {
    const o2 = Math.floor((b.size - 1) / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.strokeRect((b.x - o2) * z + 0.5, (b.y - o2) * z + 0.5, b.size * z - 1, b.size * z - 1);
  }
}
