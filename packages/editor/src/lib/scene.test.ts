import { describe, expect, it } from 'vitest';
import { TRANSPARENT, encodeSprite, paletteToRgbaLut, grayscalePalette } from '@omf/formats';
import { compositeFrame, compositeIndices, decodedOf } from '../canvas/render';
import {
  animationOrigin,
  cameraShift,
  centredStage,
  hitPoint,
  spriteRect,
  spritesBox,
} from './scene';

const sprite = (pixels: number[], w = pixels.length, h = 1) => ({
  posX: 0,
  posY: 0,
  width: w,
  height: h,
  index: 1,
  missing: false,
  image: encodeSprite({ width: w, height: h, pixels: Uint16Array.from(pixels) }),
});

describe('sprite index 0 (A4)', () => {
  it('renders transparent in sprites and opaque in backgrounds', () => {
    const d = decodedOf(sprite([0, 7]));
    expect(Array.from(d.pixels)).toEqual([TRANSPARENT, 7]);
    const lut = paletteToRgbaLut(grayscalePalette());
    const raw = { width: 1, height: 1, pixels: Uint16Array.from([0]) };
    const scene = {
      width: 1,
      height: 1,
      background: Uint8Array.from([9]),
      sprites: [{ decoded: raw, x: 0, y: 0 }],
    };
    expect(compositeIndices(scene)[0]).toBe(9);
    expect(new Uint32Array(compositeFrame(scene, lut).buffer)[0]).toBe(lut[9]);
    const bg0 = { ...scene, background: Uint8Array.from([0]), sprites: [] };
    expect(compositeIndices(bg0)[0]).toBe(0);
  });
});

describe('compositeFrame background position', () => {
  it('draws the background at backgroundX/Y, sprites where they are', () => {
    const bg = Uint8Array.from([1, 2, 3, 4]);
    const raw = { width: 1, height: 1, pixels: Uint16Array.from([9]) };
    const scene = {
      width: 3,
      height: 2,
      background: bg,
      backgroundWidth: 2,
      backgroundX: 1,
      backgroundY: 1,
      sprites: [{ decoded: raw, x: 0, y: 0 }],
    };
    expect(Array.from(compositeIndices(scene))).toEqual([
      9,
      TRANSPARENT,
      TRANSPARENT,
      TRANSPARENT,
      1,
      2,
    ]);
  });
});

describe('spritesBox (P1)', () => {
  it('ignores unshared sprites without image bytes, whatever their header size', () => {
    const garbage = { ...sprite([5]), width: 60537, height: 60537, image: new Uint8Array(0) };
    const real = { ...sprite([5, 5], 2, 1), posX: -10, posY: -20 };
    expect(spritesBox([garbage, real])).toEqual({ minX: -10, minY: -20, maxX: -8, maxY: -19 });
    const o = animationOrigin(
      'af',
      { startX: 0, startY: 0, sprites: [garbage, real] },
      { centred: true },
    );
    expect(o).toEqual({ x: 169, y: 120 });
  });
});

describe('centredStage (spec 12 §9, Centred)', () => {
  // Two sprites around the object: a body above it and a fist to the right.
  const body = { ...sprite([1]), width: 20, height: 60, posX: -10, posY: -60 };
  const fist = { ...sprite([1]), width: 30, height: 10, posX: 10, posY: -40 };

  it('frames the union of the sprites plus the margin, centred on the stage', () => {
    const st = centredStage([body, fist], false, 8)!;
    // Box (-10, -60)–(40, 0); 50×60 plus 8 on each side.
    expect(st.width).toBe(320);
    expect(st.height).toBe(200);
    expect(st.frame).toEqual({ x: 127, y: 62, width: 66, height: 76 });
    expect(st.object).toEqual({ x: 145, y: 130 });
    expect(st.frame.x + st.frame.width / 2).toBe(160);
    expect(st.frame.y + st.frame.height / 2).toBe(100);
    // Every sprite drawn at the object lies inside the frame.
    for (const s of [body, fist]) {
      const r = spriteRect(s, st.object, false);
      expect(r.x).toBeGreaterThanOrEqual(st.frame.x + 8);
      expect(r.x + r.w).toBeLessThanOrEqual(st.frame.x + st.frame.width - 8);
      expect(r.y).toBeGreaterThanOrEqual(st.frame.y + 8);
      expect(r.y + r.h).toBeLessThanOrEqual(st.frame.y + st.frame.height - 8);
    }
  });

  it('mirrors the frame when facing left', () => {
    const st = centredStage([body, fist], true, 8)!;
    expect(st.frame).toEqual({ x: 127, y: 62, width: 66, height: 76 });
    // The fist is now on the left: the object sits right of the frame centre.
    expect(st.object).toEqual({ x: 175, y: 130 });
    const r = spriteRect(fist, st.object, true);
    expect(r.x).toBe(st.frame.x + 8);
  });

  it('ignores garbage headers and falls back to null without drawable sprites', () => {
    const garbage = { ...sprite([5]), width: 60537, height: 60537, image: new Uint8Array(0) };
    expect(centredStage([garbage], false)).toBeNull();
    expect(centredStage([], false)).toBeNull();
    expect(centredStage([garbage, body], false, 0)!.frame).toMatchObject({ width: 20, height: 60 });
  });

  it('grows the stage when the frame is larger than the scene', () => {
    const wide = { ...sprite([1]), width: 400, height: 10, posX: -200, posY: -10 };
    const st = centredStage([wide], false, 8)!;
    expect(st).toMatchObject({ width: 416, height: 200 });
    expect(st.frame).toEqual({ x: 0, y: 87, width: 416, height: 26 });
  });
});

describe('cameraShift', () => {
  const st = centredStage([{ ...sprite([1]), width: 8, height: 8, posX: -4, posY: -8 }], false)!;

  it('keeps sprites and collision points on the same stage pixels whatever the movement', () => {
    const s = { ...sprite([1]), width: 8, height: 8, posX: -4, posY: -8 };
    const hit = { x: 3, y: -5, spriteId: 0, null: 0 };
    const seen = new Set<string>();
    // Script movement, fractional during slides.
    for (const pos of [
      { x: 160, y: 190 },
      { x: 172.4, y: 150.5 },
      { x: 90.5, y: -30.49 },
      { x: -12, y: 400 },
    ]) {
      const d = cameraShift(st, pos);
      expect(Number.isInteger(d.x) && Number.isInteger(d.y)).toBe(true);
      const r = spriteRect(s, pos, false);
      const h = hitPoint(hit, pos, false);
      seen.add(JSON.stringify([r.x + d.x, r.y + d.y, h.x + d.x, h.y + d.y]));
    }
    expect([...seen]).toEqual([
      JSON.stringify([st.object.x - 4, st.object.y - 8, st.object.x + 3, st.object.y - 5]),
    ]);
  });
});
