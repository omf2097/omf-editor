// Sprite headers and the RLE image stream (spec 04). The codec follows openomf
// formats/sprite.c. Loading a file never decodes; that is for display and editing.

import type { BinaryReader, BinaryWriter } from './binary';
import { OmfFormatError, OmfRangeError } from './errors';

/** Pixel value for "no pixel": one above the 256 palette indices. */
export const TRANSPARENT = 256;
export const MAX_IMAGE_BYTES = 0xffff;

export interface Sprite {
  /** Offset relative to the animation origin. */
  posX: number;
  posY: number;
  width: number;
  height: number;
  /** Image slot id within the file. */
  index: number;
  /** No image bytes of its own; the image is shared by `index` (see resolveSharedImages). */
  missing: boolean;
  /** Raw RLE stream; empty when missing. Immutable: replace, never write in place. */
  image: Uint8Array;
}

export interface DecodedSprite {
  width: number;
  height: number;
  /** Palette index per pixel, or TRANSPARENT. */
  pixels: Uint16Array;
  /** Set when the stream wrote past width × height and decoding stopped. */
  truncated?: boolean;
}

/** A missing sprite's stored image length is not kept; writeSprite recomputes it. */
export function readSprite(r: BinaryReader): Sprite {
  const imageLen = r.u16();
  const posX = r.i16();
  const posY = r.i16();
  const width = r.u16();
  const height = r.u16();
  const index = r.u8();
  const missing = r.u8() !== 0;
  const image = !missing && imageLen > 0 ? r.bytes(imageLen) : new Uint8Array(0);
  return { posX, posY, width, height, index, missing, image };
}

/**
 * `sharedLen` is the image length written for a missing sprite: the resolved
 * owner's image length, which is what every shipped file stores.
 */
export function writeSprite(w: BinaryWriter, s: Sprite, sharedLen = 0): void {
  const len = s.missing ? sharedLen : s.image.length;
  if (len > MAX_IMAGE_BYTES) throw new OmfRangeError(len, 0, MAX_IMAGE_BYTES, 'sprite.image');
  w.u16(len, 'sprite.imageLen');
  w.i16(s.posX, 'sprite.pos_x');
  w.i16(s.posY, 'sprite.pos_y');
  w.u16(s.width, 'sprite.width');
  w.u16(s.height, 'sprite.height');
  w.u8(s.index, 'sprite.index');
  w.u8(s.missing ? 1 : 0);
  if (!s.missing) w.bytes(s.image);
}

/**
 * Port of openomf `sd_sprite_vga_decode`, as lenient as it is with shipped
 * data (spec 04 §RLE stream): a zero size or empty stream gives an empty
 * image, the end marker is optional, and a write past the image stops
 * decoding with `truncated` set.
 */
export function decodeSprite(width: number, height: number, image: Uint8Array): DecodedSprite {
  if (width === 0 || height === 0 || image.length === 0) {
    return { width: 0, height: 0, pixels: new Uint16Array(0) };
  }
  const size = width * height;
  const pixels = new Uint16Array(size).fill(TRANSPARENT);
  let x = 0;
  let y = 0;
  let i = 0;
  // u16 words: the low 2 bits are the op, the rest its argument.
  while (i + 1 < image.length) {
    const c = image[i]! | (image[i + 1]! << 8);
    i += 2;
    const op = c & 3;
    const data = c >> 2;
    switch (op) {
      case 0:
        x = data;
        break;
      case 2:
        y = data;
        break;
      // A run: `data` pixel bytes follow.
      case 1: {
        let n = data;
        while (n > 0 && i < image.length) {
          const pos = y * width + x;
          if (pos >= size) return { width, height, pixels, truncated: true };
          pixels[pos] = image[i]!;
          i++;
          x++;
          n--;
        }
        x = 0;
        break;
      }
      // End marker.
      case 3:
        if (i !== image.length)
          throw new OmfFormatError('sprite stream has data after its end marker', i);
        break;
    }
  }
  return { width, height, pixels };
}

/**
 * Largest x, y or run length an RLE command holds (14 bits).
 */
export const SPRITE_COORD_MAX = 0x3fff;

/**
 * Port of openomf `sd_sprite_vga_encode`, skipping TRANSPARENT rather than
 * index 0. Byte layout matches openomf's output for the same pixels. Runs
 * longer than the 14-bit field are split; a pixel that needs an x or y
 * command above 16383 cannot be stored and throws.
 *
 * Apart from run splitting, the loop is kept statement for statement with
 * openomf's, quirks included, so the bytes can be checked against it.
 */
export function encodeSprite(d: DecodedSprite): Uint8Array {
  const { width: w, height: h, pixels } = d;
  const size = w * h;
  const opaque = countOpaque(d);
  // Every opaque pixel is one byte, so this many cannot fit whatever the layout.
  if (opaque + 4 > MAX_IMAGE_BYTES)
    throw new OmfRangeError(opaque + 4, 0, MAX_IMAGE_BYTES, 'sprite.image');
  // Worst case: every pixel its own run (x word + run word + byte), a row word
  // per pixel, the start and end words, and the extra commands of split runs.
  const buf = new Uint8Array(7 * opaque + 4 * Math.ceil(opaque / SPRITE_COORD_MAX) + 8);
  let i = 0;
  // Position of the previous opaque pixel.
  let lastx = -1;
  let lasty = 0;
  // Pixels in the current run, and where its run word goes: the word is
  // reserved when the run starts and patched once its length is known.
  let rowlen = 0;
  let rowstart = 0;
  const put = (c: number): void => {
    buf[i++] = c & 0xff;
    buf[i++] = (c >> 8) & 0xff;
  };
  const patch = (at: number, c: number): void => {
    buf[at] = c & 0xff;
    buf[at + 1] = (c >> 8) & 0xff;
  };
  const coord = (v: number, field: string): number => {
    if (v > SPRITE_COORD_MAX) throw new OmfRangeError(v, 0, SPRITE_COORD_MAX, field);
    return v;
  };

  put(2);
  for (let pos = 0; pos < size; pos++) {
    const idx = pixels[pos]!;
    if (idx === TRANSPARENT) continue;
    const x = pos % w;
    const y = Math.floor(pos / w);
    // A run that reached the field limit ends; the next pixel starts a new one.
    const split = rowlen === SPRITE_COORD_MAX && x === lastx + 1 && y === lasty;
    if (y !== lasty) put(coord(y, 'sprite.y') * 4 + 2);
    if (x !== lastx + 1 || y !== lasty || split) {
      if (x !== 0) put(coord(x, 'sprite.x') * 4);
      if (!rowlen) {
        rowstart = i;
        i += 2;
      }
    }
    if (y !== lasty || x !== lastx + 1 || split) {
      if (rowlen) {
        patch(rowstart, rowlen * 4 + 1);
        rowlen = 0;
        rowstart = i;
        i += 2;
      }
    } else if (lasty === 0 && x === 0) {
      // The very first pixel at (0, 0) needs no x or y word, only a run word.
      rowstart = i;
      i += 2;
    }
    lastx = x;
    lasty = y;
    buf[i++] = idx;
    rowlen++;
  }
  if (rowlen) patch(rowstart, rowlen * 4 + 1);
  put(7);
  if (i > MAX_IMAGE_BYTES) throw new OmfRangeError(i, 0, MAX_IMAGE_BYTES, 'sprite.image');
  return buf.slice(0, i);
}

/** Opaque pixels of `d`, after checking its size and that every pixel is a palette index. */
function countOpaque(d: DecodedSprite): number {
  const { width: w, height: h, pixels } = d;
  const size = w * h;
  if (pixels.length !== size) {
    throw new OmfFormatError(`sprite has ${pixels.length} pixels, expected ${w}×${h}`);
  }
  let opaque = 0;
  for (let pos = 0; pos < size; pos++) {
    const idx = pixels[pos]!;
    if (idx === TRANSPARENT) continue;
    if (!Number.isInteger(idx) || idx < 0 || idx > 255)
      throw new OmfRangeError(idx, 0, 255, `sprite.pixels[${pos}]`);
    opaque++;
  }
  return opaque;
}

export function spritePaletteRange(d: DecodedSprite): {
  start: number;
  end: number;
  used: number[];
} {
  const seen = new Uint8Array(256);
  for (const p of d.pixels) if (p !== TRANSPARENT) seen[p] = 1;
  const used: number[] = [];
  for (let k = 0; k < 256; k++) if (seen[k]) used.push(k);
  return { start: used[0] ?? 0, end: used[used.length - 1] ?? 0, used };
}
