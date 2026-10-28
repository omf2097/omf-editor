import { describe, expect, it } from 'vitest';
import { TRANSPARENT } from '@omf/formats';
import * as px from './pixels';

const T = TRANSPARENT;
const rows = (d: px.Img): number[][] =>
  Array.from({ length: d.height }, (_, y) =>
    Array.from(d.pixels.subarray(y * d.width, (y + 1) * d.width)),
  );

describe('pixel operations', () => {
  it('draws lines, rectangles and brushes', () => {
    const d = px.blank(4, 4);
    px.line(d, 0, 0, 3, 3, 1);
    expect(rows(d).map((r, y) => r[y])).toEqual([1, 1, 1, 1]);
    const r = px.blank(3, 3);
    px.rect(r, px.normRect(0, 0, 2, 2), 2, false);
    expect(rows(r)[1]).toEqual([2, T, 2]);
    px.rect(r, px.normRect(0, 0, 2, 2), 2, true);
    expect(rows(r)[1]).toEqual([2, 2, 2]);
    const b = px.blank(3, 3);
    px.stamp(b, 1, 1, 5, 3);
    expect(b.pixels.every((v) => v === 5)).toBe(true);
  });

  it('fills contiguously (4-connected) and globally', () => {
    const d: px.Img = {
      width: 3,
      height: 3,
      pixels: Uint16Array.from([1, 1, 2, 2, 2, 2, 1, 2, 1]),
    };
    const c = px.cloneImg(d);
    px.fill(c, 0, 0, 9);
    expect(rows(c)).toEqual([
      [9, 9, 2],
      [2, 2, 2],
      [1, 2, 1],
    ]);
    const g = px.cloneImg(d);
    px.fill(g, 0, 0, 9, true);
    expect(rows(g)[2]).toEqual([9, 2, 9]);
  });

  it('flips and rotates', () => {
    const d: px.Img = { width: 2, height: 1, pixels: Uint16Array.from([1, 2]) };
    expect(Array.from(px.flipH(d).pixels)).toEqual([2, 1]);
    const r = px.rotate90(d);
    expect([r.width, r.height, ...r.pixels]).toEqual([1, 2, 1, 2]);
    const v: px.Img = { width: 1, height: 2, pixels: Uint16Array.from([1, 2]) };
    expect(Array.from(px.flipV(v).pixels)).toEqual([2, 1]);
  });

  it('resize keeps the anchored content in scene position', () => {
    const d: px.Img = { width: 2, height: 2, pixels: Uint16Array.from([1, 2, 3, 4]) };
    const { img, dx, dy } = px.resize(d, 4, 4, 'b');
    expect([dx, dy]).toEqual([-1, -2]);
    expect(px.get(img, 1, 2)).toBe(1);
    const shrink = px.resize(d, 1, 1, 'tl');
    expect([shrink.dx, shrink.dy, shrink.img.pixels[0]]).toEqual([0, 0, 1]);
  });

  it('paste clips and counts clipped pixels', () => {
    const d = px.blank(2, 2);
    const s: px.Img = { width: 2, height: 1, pixels: Uint16Array.from([7, 8]) };
    expect(px.paste(d, s, 1, 0)).toBe(1);
    expect(px.get(d, 1, 0)).toBe(7);
  });

  it('finds opaque bounds and snaps lines', () => {
    const d = px.blank(4, 4);
    px.set(d, 1, 2, 3);
    expect(px.opaqueBounds(d)).toEqual({ x: 1, y: 2, w: 1, h: 1 });
    expect(px.opaqueBounds(px.blank(2, 2))).toBeNull();
    expect(px.snap45(0, 0, 5, 1)).toEqual([5, 0]);
    expect(px.snap45(0, 0, 4, 5)).toEqual([5, 5]);
  });
});
