// Pure pixel operations for the sprite pixel editor (spec 13). Images are DecodedSprite-shaped:
// one palette index per pixel, TRANSPARENT (256) where nothing is drawn. Every
// operation clips silently at the image edge.

import { TRANSPARENT, type DecodedSprite } from '@omf/formats';

export type Img = DecodedSprite;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const cloneImg = (d: Img): Img => ({
  width: d.width,
  height: d.height,
  pixels: Uint16Array.from(d.pixels),
});
export const blank = (w: number, h: number): Img => ({
  width: w,
  height: h,
  pixels: new Uint16Array(w * h).fill(TRANSPARENT),
});

export function get(d: Img, x: number, y: number): number | undefined {
  return x >= 0 && y >= 0 && x < d.width && y < d.height ? d.pixels[y * d.width + x] : undefined;
}
export function set(d: Img, x: number, y: number, v: number): void {
  if (x >= 0 && y >= 0 && x < d.width && y < d.height) d.pixels[y * d.width + x] = v;
}

/** Square brush of `size` centred on (x, y). */
export function stamp(d: Img, x: number, y: number, v: number, size = 1): void {
  const o = Math.floor((size - 1) / 2);
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) set(d, x - o + dx, y - o + dy, v);
}

/** Bresenham line points. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

export function line(
  d: Img,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  v: number,
  size = 1,
): void {
  for (const [x, y] of linePoints(x0, y0, x1, y1)) stamp(d, x, y, v, size);
}

/** Snaps (x1, y1) so the line from (x0, y0) is horizontal, vertical or 45°. */
export function snap45(x0: number, y0: number, x1: number, y1: number): [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > 2 * ay) return [x1, y0];
  if (ay > 2 * ax) return [x0, y1];
  const m = Math.max(ax, ay);
  return [x0 + Math.sign(dx) * m, y0 + Math.sign(dy) * m];
}

/** Snaps (x1, y1) so the rectangle from (x0, y0) is a square (a zero drag counts as positive). */
export function snapSquare(x0: number, y0: number, x1: number, y1: number): [number, number] {
  const m = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  return [x0 + Math.sign(x1 - x0 || 1) * m, y0 + Math.sign(y1 - y0 || 1) * m];
}

/** Rectangle spanning two corner pixels, both inclusive. */
export function normRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0) + 1,
    h: Math.abs(y1 - y0) + 1,
  };
}

export function rect(d: Img, r: Rect, v: number, filled: boolean): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (filled || y === r.y || y === r.y + r.h - 1 || x === r.x || x === r.x + r.w - 1)
        set(d, x, y, v);
    }
  }
}

/** 4-connected flood fill; `global` replaces every pixel of that index. */
export function fill(d: Img, x: number, y: number, v: number, global = false): void {
  const from = get(d, x, y);
  if (from === undefined || from === v) return;
  if (global) {
    for (let i = 0; i < d.pixels.length; i++) if (d.pixels[i] === from) d.pixels[i] = v;
    return;
  }
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (get(d, cx, cy) !== from) continue;
    set(d, cx, cy, v);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}

export function copyRect(d: Img, r: Rect): Img {
  const out = blank(r.w, r.h);
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) out.pixels[y * r.w + x] = get(d, r.x + x, r.y + y) ?? TRANSPARENT;
  return out;
}

/**
 * Cuts `sel` (the whole image when null) out of a copy of `d`. Returns that
 * copy with the area made transparent, and the cut part.
 */
export function lift(d: Img, sel: Rect | null): { base: Img; part: Img } {
  const base = cloneImg(d);
  const part = sel ? copyRect(base, sel) : cloneImg(base);
  if (sel) rect(base, sel, TRANSPARENT, true);
  else base.pixels.fill(TRANSPARENT);
  return { base, part };
}

/** Draws `src` at (x, y); transparent source pixels are skipped unless `opaque`. Returns clipped pixel count. */
export function paste(d: Img, src: Img, x: number, y: number, opaque = false): number {
  let clipped = 0;
  for (let sy = 0; sy < src.height; sy++) {
    for (let sx = 0; sx < src.width; sx++) {
      const v = src.pixels[sy * src.width + sx]!;
      if (v === TRANSPARENT && !opaque) continue;
      const tx = x + sx;
      const ty = y + sy;
      if (tx < 0 || ty < 0 || tx >= d.width || ty >= d.height) {
        if (v !== TRANSPARENT) clipped++;
        continue;
      }
      d.pixels[ty * d.width + tx] = v;
    }
  }
  return clipped;
}

export function flipH(d: Img): Img {
  const out = blank(d.width, d.height);
  for (let y = 0; y < d.height; y++)
    for (let x = 0; x < d.width; x++)
      out.pixels[y * d.width + x] = d.pixels[y * d.width + (d.width - 1 - x)]!;
  return out;
}

export function flipV(d: Img): Img {
  const out = blank(d.width, d.height);
  for (let y = 0; y < d.height; y++)
    out.pixels.set(
      d.pixels.subarray((d.height - 1 - y) * d.width, (d.height - y) * d.width),
      y * d.width,
    );
  return out;
}

/** 90° clockwise. */
export function rotate90(d: Img): Img {
  const out = blank(d.height, d.width);
  for (let y = 0; y < d.height; y++)
    for (let x = 0; x < d.width; x++)
      out.pixels[x * d.height + (d.height - 1 - y)] = d.pixels[y * d.width + x]!;
  return out;
}

export type Anchor = 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br';

/**
 * Resizes the canvas keeping the anchored content in place. Returns the new
 * image and the change to pos_x/pos_y so the content keeps its scene position.
 */
export function resize(
  d: Img,
  w: number,
  h: number,
  anchor: Anchor,
): { img: Img; dx: number; dy: number } {
  const ax = anchor.endsWith('l') ? 0 : anchor.endsWith('r') ? 1 : 0.5;
  const ay = anchor.startsWith('t') ? 0 : anchor.startsWith('b') ? 1 : 0.5;
  const ox = Math.round((w - d.width) * ax);
  const oy = Math.round((h - d.height) * ay);
  const img = blank(w, h);
  paste(img, d, ox, oy, true);
  return { img, dx: -ox, dy: -oy };
}

/** Bounding box of opaque pixels, or null when fully transparent. */
export function opaqueBounds(d: Img): Rect | null {
  let x0 = d.width;
  let y0 = d.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      if (d.pixels[y * d.width + x] === TRANSPARENT) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function sameImage(a: Img, b: Img): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.pixels.length; i++) if (a.pixels[i] !== b.pixels[i]) return false;
  return true;
}

export interface Placed {
  posX: number;
  posY: number;
  decoded: Img;
}

/** Pixels that differ between two images placed at their offsets (opaque in one only, or another index). */
export function placedDiff(a: Placed, b: Placed): number {
  const opaque = (s: Placed): Map<number, number> => {
    const m = new Map<number, number>();
    const d = s.decoded;
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        const p = d.pixels[y * d.width + x]!;
        if (p !== TRANSPARENT) m.set((s.posX + x + 0x8000) * 0x20000 + (s.posY + y + 0x8000), p);
      }
    }
    return m;
  };
  const ma = opaque(a);
  const mb = opaque(b);
  let n = 0;
  for (const [k, v] of ma) if (mb.get(k) !== v) n++;
  for (const k of mb.keys()) if (!ma.has(k)) n++;
  return n;
}
