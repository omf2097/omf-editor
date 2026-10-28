import { describe, expect, it } from 'vitest';
import {
  TRANSPARENT,
  buildSheet,
  parseSheet,
  pickTransparentIndex,
  samePlacedImage,
  type DecodedSprite,
} from '../src';

const T = TRANSPARENT;
const d = (w: number, h: number, px: number[]): DecodedSprite => ({
  width: w,
  height: h,
  pixels: Uint16Array.from(px),
});

const sprites = [
  { posX: -2, posY: -3, index: 0, missing: false, decoded: d(2, 3, [1, 2, 3, 4, 5, 6]) },
  { posX: 0, posY: -1, index: 1, missing: false, decoded: d(3, 1, [7, T, 8]) },
  { posX: 5, posY: 5, index: 2, missing: false, decoded: d(0, 0, []) },
];
const opts = { source: 'T.AF', animation: 11, palette: 'X.BK#0' };

describe('sprite sheets', () => {
  it('builds uniform cells sharing one origin', () => {
    const { image, meta } = buildSheet(sprites, { ...opts, columns: 2 });
    expect(meta.cell).toEqual({ w: 8, h: 8, spacing: 1 });
    expect(meta.sprites[0]!.origin_in_cell).toEqual({ x: 2, y: 3 });
    expect([image.width, image.height]).toEqual([17, 17]);
    expect(image.pixels[0]).toBe(1);
    expect(meta.transparent_index).toBe(0);
  });

  it('round-trips offsets and pixels', () => {
    const { image, meta } = buildSheet(sprites, opts);
    const back = parseSheet(image, meta);
    back.slice(0, 2).forEach((p, i) => {
      expect([p.posX, p.posY]).toEqual([sprites[i]!.posX, sprites[i]!.posY]);
      expect(p.decoded).toEqual(sprites[i]!.decoded);
      expect(samePlacedImage(p, sprites[i]!)).toBe(true);
    });
    expect(back[2]!.decoded.width).toBe(0);
  });

  it('a sprite moved inside its cell changes pos_x', () => {
    const { image, meta } = buildSheet(sprites, opts);
    // Move sprite B (cell 1) three pixels right.
    const x0 = meta.cell.w + meta.cell.spacing;
    const row = (meta.sprites[1]!.origin_in_cell.y - 1) * image.width;
    const moved = Uint16Array.from(image.pixels);
    for (let x = x0; x < x0 + meta.cell.w; x++) moved[row + x] = T;
    const ox = x0 + meta.sprites[1]!.origin_in_cell.x;
    moved[row + ox + 3] = 7;
    moved[row + ox + 5] = 8;
    const p = parseSheet({ ...image, pixels: moved }, meta)[1]!;
    expect(p.posX).toBe(3);
    expect(samePlacedImage(p, sprites[1]!)).toBe(false);
  });

  it('picks a free transparent index or null', () => {
    expect(pickTransparentIndex([d(2, 1, [0, 1])])).toBe(2);
    expect(
      pickTransparentIndex([
        d(
          256,
          1,
          Array.from({ length: 256 }, (_, i) => i),
        ),
      ]),
    ).toBeNull();
  });

  it('rejects a sheet that is too small', () => {
    const { meta } = buildSheet(sprites, opts);
    expect(() => parseSheet({ width: 4, height: 4, pixels: new Uint16Array(16) }, meta)).toThrow();
  });
});
