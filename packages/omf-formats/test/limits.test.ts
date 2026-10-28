import { describe, expect, it } from 'vitest';
import { OmfRangeError, documentDiagnostics, encodeSprite, readAF, readBK, writeAF } from '../src';
import { HAS_DATA, dataFiles, readData } from './data';
import { af, bk, bkAnim, move, sprite } from './helpers';

describe('writer limits', () => {
  it('rejects too many sprites and too-large images', () => {
    expect(() =>
      writeAF(af([[11, move({ sprites: Array.from({ length: 256 }, () => sprite()) })]])),
    ).toThrow(OmfRangeError);
    expect(() =>
      writeAF(af([[11, move({ sprites: [sprite({ image: new Uint8Array(65536) })] })]])),
    ).toThrow(OmfRangeError);
    const big = { width: 255, height: 255, pixels: new Uint16Array(255 * 255).fill(1) };
    expect(() => encodeSprite(big)).toThrow(OmfRangeError);
  });
});

describe('documentDiagnostics', () => {
  it('reports openomf limits and broken references', () => {
    const file = af([
      [
        11,
        move({
          baseString: 'A1-'.repeat(400) + 'A1',
          extraStrings: Array.from({ length: 11 }, () => 'A1'),
          hitCoords: [{ x: 0, y: 0, spriteId: 4, null: 0 }],
          nextAnimationId: 33,
          enemyString: 'x'.repeat(513),
        }),
      ],
      [
        12,
        move({
          sprites: [sprite({ index: 7, missing: true, image: new Uint8Array(0) })],
          baseString: 'A1-C1',
        }),
      ],
    ]);
    const msgs = documentDiagnostics(file).map((d) => `${d.animation}:${d.severity}:${d.message}`);
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^11:error:base string longer than 1023/),
        expect.stringMatching(/^11:error:more than 10 extra strings/),
        expect.stringMatching(/^11:warning:collision point 0 belongs to sprite 4/),
        expect.stringMatching(/^11:warning:next_animation_id 33 does not exist/),
        expect.stringMatching(/^11:error:enemy string longer than 510/),
        expect.stringMatching(/^12:error:shared sprite 0 has no earlier sprite/),
        expect.stringMatching(/^12:info:frame C refers to a sprite that does not exist/),
      ]),
    );
  });

  it('flags unusual BK sizes and missing palettes', () => {
    const file = bk([[6, bkAnim({ footerString: 'y'.repeat(600) })]], 64, 32);
    file.palettes = [];
    const msgs = documentDiagnostics(file).map((d) => d.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/footer string longer/),
        expect.stringMatching(/64×32/),
        expect.stringMatching(/no palettes/),
      ]),
    );
  });

  it.skipIf(!HAS_DATA)('shipped files have no errors', () => {
    for (const n of dataFiles('AF')) {
      const errors = documentDiagnostics(readAF(readData(n))).filter((d) => d.severity === 'error');
      expect(errors, n).toEqual([]);
    }
    for (const n of dataFiles('BK')) {
      const errors = documentDiagnostics(readBK(readData(n))).filter((d) => d.severity === 'error');
      expect(errors, n).toEqual([]);
    }
  });
});
