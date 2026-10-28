// Each limit at its exact boundary: the last value that works and the first
// that does not (T8). Limits are openomf's or the file format's (spec 06, 07).

import { describe, expect, it } from 'vitest';
import {
  AF_MAX_MOVES,
  BK_MAX_ANIMATIONS,
  BK_MAX_PALETTES,
  LIMITS,
  OmfRangeError,
  SPRITE_COORD_MAX,
  TRANSPARENT,
  afFromJSON,
  afToJSON,
  decodeSprite,
  documentDiagnostics,
  encodeSprite,
  msPerTick,
  readAF,
  readBK,
  writeAF,
  writeBK,
  type HitCoord,
} from '../src';
import { af, bk, bkAnim, move, sprite } from './helpers';

const blocking = (d: Parameters<typeof documentDiagnostics>[0]) =>
  documentDiagnostics(d).filter((x) => x.blocksSave);

describe('exact boundaries', () => {
  it('sprites per animation: 255 / 256', () => {
    const n = (k: number) =>
      af([[11, move({ sprites: Array.from({ length: k }, () => sprite()) })]]);
    expect(LIMITS.sprites).toBe(255);
    expect(readAF(writeAF(n(255))).moves.get(11)!.sprites).toHaveLength(255);
    expect(() => writeAF(n(256))).toThrow(OmfRangeError);
  });

  it('image bytes: 65535 / 65536', () => {
    const n = (k: number) => af([[11, move({ sprites: [sprite({ image: new Uint8Array(k) })] })]]);
    expect(readAF(writeAF(n(65535))).moves.get(11)!.sprites[0]!.image).toHaveLength(65535);
    expect(() => writeAF(n(65536))).toThrow(OmfRangeError);
  });

  it('collision points: x and y −512…511, frame_id and null 0…63', () => {
    const c = (o: Partial<HitCoord>): HitCoord => ({ x: 0, y: 0, spriteId: 0, null: 0, ...o });
    const ok = [c({ x: -512, y: 511 }), c({ x: 511, y: -512 }), c({ spriteId: 63, null: 63 })];
    expect(readAF(writeAF(af([[11, move({ hitCoords: ok })]]))).moves.get(11)!.hitCoords).toEqual(
      ok,
    );
    for (const bad of [
      c({ x: -513 }),
      c({ x: 512 }),
      c({ y: -513 }),
      c({ y: 512 }),
      c({ spriteId: 64 }),
      c({ null: 64 }),
      c({ spriteId: -1 }),
    ])
      expect(() => writeAF(af([[11, move({ hitCoords: [bad] })]])), JSON.stringify(bad)).toThrow(
        OmfRangeError,
      );
  });

  it('move ids 0…69 and BK animation ids 0…49', () => {
    expect(AF_MAX_MOVES).toBe(70);
    expect([
      ...readAF(
        writeAF(
          af([
            [0, move()],
            [69, move()],
          ]),
        ),
      ).moves.keys(),
    ]).toEqual([0, 69]);
    expect(() => writeAF(af([[70, move()]]))).toThrow(OmfRangeError);
    expect(BK_MAX_ANIMATIONS).toBe(50);
    expect([...readBK(writeBK(bk([[49, bkAnim()]]))).animations.keys()]).toEqual([49]);
    expect(() => writeBK(bk([[50, bkAnim()]]))).toThrow(OmfRangeError);
  });

  it('extra strings: openomf loads 10, the format holds 255', () => {
    const n = (k: number) =>
      af([[11, move({ extraStrings: Array.from({ length: k }, () => 'A1') })]]);
    expect(blocking(n(10))).toEqual([]);
    expect(documentDiagnostics(n(11)).some((d) => d.severity === 'error')).toBe(true);
    expect(readAF(writeAF(n(255))).moves.get(11)!.extraStrings).toHaveLength(255);
    expect(() => writeAF(n(256))).toThrow(OmfRangeError);
  });

  it('BK palettes: 8 / 9', () => {
    const b = bk();
    b.palettes = Array.from({ length: BK_MAX_PALETTES }, () => b.palettes[0]!);
    expect(blocking(b)).toEqual([]);
    b.palettes.push(b.palettes[0]!);
    expect(blocking(b).length).toBeGreaterThan(0);
  });

  it('sprite encoder: x and y up to 16383, a run of 16383 is one command', () => {
    expect(SPRITE_COORD_MAX).toBe(16383);
    const last = (w: number, h: number) => {
      const pixels = new Uint16Array(w * h).fill(TRANSPARENT);
      pixels[w * h - 1] = 7;
      return { width: w, height: h, pixels };
    };
    // A pixel at x 16383 (row 0) and at y 16383 (column 0) encode and decode.
    for (const d of [last(16384, 1), last(1, 16384)]) {
      const back = decodeSprite(d.width, d.height, encodeSprite(d));
      expect(back.pixels[d.width * d.height - 1]).toBe(7);
    }
    expect(() => encodeSprite(last(16385, 1))).toThrow(OmfRangeError);
    expect(() => encodeSprite(last(1, 16385))).toThrow(OmfRangeError);
    // Runs: 16383 pixels in one run command, 16384 split in two.
    const run = (n: number) =>
      encodeSprite({ width: n, height: 1, pixels: new Uint16Array(n).fill(3) });
    const runs = (img: Uint8Array) => {
      let count = 0;
      for (let i = 0; i + 1 < img.length;) {
        const c = img[i]! | (img[i + 1]! << 8);
        i += 2;
        if ((c & 3) === 1) {
          count++;
          i += c >> 2;
        }
      }
      return count;
    };
    expect(runs(run(16383))).toBe(1);
    expect(runs(run(16384))).toBe(2);
    expect(decodeSprite(16384, 1, run(16384)).pixels.every((p) => p === 3)).toBe(true);
  });

  it('sprite pixel values: 0…255 and TRANSPARENT', () => {
    const one = (v: number) => encodeSprite({ width: 1, height: 1, pixels: Uint16Array.of(v) });
    expect(decodeSprite(1, 1, one(255)).pixels[0]).toBe(255);
    expect(decodeSprite(1, 1, one(0)).pixels[0]).toBe(0);
    expect(decodeSprite(1, 1, one(TRANSPARENT)).pixels[0]).toBe(TRANSPARENT);
    expect(() => encodeSprite({ width: 1, height: 1, pixels: Uint16Array.of(257) })).toThrow(
      OmfRangeError,
    );
  });

  it('move string: 21 bytes without NUL / 22 refused from JSON', () => {
    const s21 = 'ABCDEFGHIJKLMNOPQRSTU';
    const back = readAF(writeAF(af([[11, move({ moveString: s21 })]])));
    expect(back.moves.get(11)!.moveString).toBe(s21);
    expect(back.moves.get(11)!.moveStringRaw).not.toContain(0);
    const j = afToJSON(af([[11, move({ moveString: s21 })]]));
    j.moves['11']!.move_string = s21 + 'V';
    expect(() => afFromJSON(j)).toThrow(/move_string/);
  });

  it('arena tick length: settings clamp to 0…10', () => {
    expect([-1, 0, 10, 11].map((s) => msPerTick('arena', s))).toEqual([48, 48, 8, 8]);
    for (let s = 0; s <= 10; s++) expect(msPerTick('arena', s)).toBe(48 - 4 * s);
  });
});
