// Pure rendering helpers: palette-indexed images to RGBA buffers (spec 11 §Rendering).

import { TRANSPARENT, decodeSprite, type DecodedSprite, type Sprite } from '@omf/formats';

export const SCENE_W = 320;
export const SCENE_H = 200;

/** Index → u32 RGBA (ImageData byte order); entry 256 transparent. */
export type Lut = Uint32Array;

const decodedCache = new WeakMap<Uint8Array, DecodedSprite>();
const EMPTY: DecodedSprite = { width: 0, height: 0, pixels: new Uint16Array(0) };

/**
 * Decodes a sprite image, cached by the (immutable, shared) image buffer.
 * `owner` resolves shared sprites; decode errors render as empty. Palette
 * index 0 comes out as TRANSPARENT: openomf draws sprites with 0 as the
 * transparent colour (spec 13 §7). Backgrounds keep index 0 opaque.
 */
export function decodedOf(s: Sprite, owner?: Sprite): DecodedSprite {
  const src = s.missing ? owner : s;
  if (!src || src.image.length === 0) return EMPTY;
  const key = src.image;
  let d = decodedCache.get(key);
  if (!d) {
    try {
      d = decodeSprite(src.width, src.height, src.image);
      const px = d.pixels;
      for (let i = 0; i < px.length; i++) if (px[i] === 0) px[i] = TRANSPARENT;
    } catch {
      d = EMPTY;
    }
    decodedCache.set(key, d);
  }
  return d;
}

/** P1 → P2 palette shift applied to the HAR band indices (0x01–0x2F). */
export function playerShift(offset: number): (p: number) => number {
  return offset === 0 ? (p) => p : (p) => (p >= 1 && p <= 0x2f ? p + offset : p);
}

/** Sprite pixels to RGBA; index 0 and TRANSPARENT are transparent. */
export function decodedToRgba(
  d: DecodedSprite,
  lut: Lut,
  shift: (p: number) => number = (p) => p,
): Uint8ClampedArray {
  const out = new Uint32Array(d.width * d.height);
  for (let i = 0; i < out.length; i++) {
    const p = d.pixels[i]!;
    out[i] = lut[p === TRANSPARENT || p === 0 ? TRANSPARENT : shift(p)]!;
  }
  return new Uint8ClampedArray(out.buffer);
}

export interface DrawSprite {
  decoded: DecodedSprite;
  /** Top-left position in scene space. */
  x: number;
  y: number;
  flipX?: boolean;
  flipY?: boolean;
  /** Pixel opacity 0..1 (onion skin, dimmed). */
  alpha?: number;
  /** Palette index shift (player 2). */
  shift?: (p: number) => number;
}

export interface SceneSpec {
  width: number;
  height: number;
  /** Background palette indices, width × height, or null for transparent. */
  background: Uint8Array | null;
  backgroundWidth?: number;
  /** Where the background's top-left is drawn (the Centred preview's camera); default 0, 0. */
  backgroundX?: number;
  backgroundY?: number;
  sprites: DrawSprite[];
  /** Shift every pixel (screen shake). */
  offsetX?: number;
  offsetY?: number;
}

/**
 * Composites background and sprites into an RGBA buffer of width × height.
 * Sprite index 0 is transparent, background index 0 is a colour.
 */
export function compositeFrame(scene: SceneSpec, lut: Lut): Uint8ClampedArray {
  const { width: W, height: H } = scene;
  const out = new Uint32Array(W * H);
  const ox = scene.offsetX ?? 0;
  const oy = scene.offsetY ?? 0;
  const bg = scene.background;
  if (bg) {
    const bw = scene.backgroundWidth ?? W;
    const bh = Math.floor(bg.length / Math.max(1, bw));
    const bx = ox + (scene.backgroundX ?? 0);
    const by = oy + (scene.backgroundY ?? 0);
    for (let y = 0; y < H; y++) {
      const sy = y - by;
      if (sy < 0 || sy >= bh) continue;
      for (let x = 0; x < W; x++) {
        const sx = x - bx;
        if (sx < 0 || sx >= bw) continue;
        out[y * W + x] = lut[bg[sy * bw + sx]!]!;
      }
    }
  }
  for (const s of scene.sprites) {
    const d = s.decoded;
    const shift = s.shift ?? ((p: number) => p);
    const a = s.alpha ?? 1;
    for (let y = 0; y < d.height; y++) {
      const ty = s.y + y + oy;
      if (ty < 0 || ty >= H) continue;
      const sy = s.flipY ? d.height - 1 - y : y;
      for (let x = 0; x < d.width; x++) {
        const tx = s.x + x + ox;
        if (tx < 0 || tx >= W) continue;
        const sx = s.flipX ? d.width - 1 - x : x;
        const p = d.pixels[sy * d.width + sx]!;
        if (p === TRANSPARENT || p === 0) continue;
        const c = lut[shift(p)]!;
        out[ty * W + tx] = a >= 1 ? c : blend(out[ty * W + tx]!, c, a);
      }
    }
  }
  return new Uint8ClampedArray(out.buffer);
}

function blend(under: number, over: number, a: number): number {
  const ua = under >>> 24;
  if (ua === 0) {
    return ((Math.round(255 * a) << 24) | (over & 0xffffff)) >>> 0;
  }
  const ch = (shift: number): number =>
    Math.round(((under >>> shift) & 255) * (1 - a) + ((over >>> shift) & 255) * a);
  return ((255 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
}

/** Copies an RGBA buffer into a canvas, resizing it to width × height. */
export function blit(
  canvas: HTMLCanvasElement,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx || width === 0 || height === 0) return;
  ctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
}

/** Like compositeFrame, but keeps palette indices (TRANSPARENT where nothing is drawn). Alpha is ignored. */
export function compositeIndices(scene: SceneSpec): Uint16Array {
  const { width: W, height: H } = scene;
  const out = new Uint16Array(W * H).fill(TRANSPARENT);
  const ox = scene.offsetX ?? 0;
  const oy = scene.offsetY ?? 0;
  const bg = scene.background;
  if (bg) {
    const bw = scene.backgroundWidth ?? W;
    const bh = Math.floor(bg.length / Math.max(1, bw));
    const bx = ox + (scene.backgroundX ?? 0);
    const by = oy + (scene.backgroundY ?? 0);
    for (let y = 0; y < H; y++) {
      const sy = y - by;
      if (sy < 0 || sy >= bh) continue;
      for (let x = 0; x < W; x++) {
        const sx = x - bx;
        if (sx >= 0 && sx < bw) out[y * W + x] = bg[sy * bw + sx]!;
      }
    }
  }
  for (const s of scene.sprites) {
    const d = s.decoded;
    const shift = s.shift ?? ((p: number) => p);
    for (let y = 0; y < d.height; y++) {
      const ty = s.y + y + oy;
      if (ty < 0 || ty >= H) continue;
      const sy = s.flipY ? d.height - 1 - y : y;
      for (let x = 0; x < d.width; x++) {
        const tx = s.x + x + ox;
        if (tx < 0 || tx >= W) continue;
        const p = d.pixels[sy * d.width + (s.flipX ? d.width - 1 - x : x)]!;
        if (p !== TRANSPARENT && p !== 0) out[ty * W + tx] = shift(p);
      }
    }
  }
  return out;
}
