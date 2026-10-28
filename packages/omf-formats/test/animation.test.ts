import { describe, expect, it } from 'vitest';
import {
  BinaryReader,
  BinaryWriter,
  OmfRangeError,
  packHitCoord,
  readAnimation,
  unpackHitCoord,
  writeAnimation,
} from '../src';
import { move, sprite } from './helpers';

describe('hit coordinates', () => {
  it('pack/unpack is signed 10-bit and lossless', () => {
    for (const c of [
      { x: 0, y: 0, spriteId: 0, null: 0 },
      { x: -512, y: 511, spriteId: 63, null: 63 },
      { x: 511, y: -512, spriteId: 1, null: 0 },
      { x: -1, y: -1, spriteId: 5, null: 2 },
    ]) {
      const p = packHitCoord(c);
      expect(unpackHitCoord(p & 0xffff, p >>> 16)).toEqual(c);
    }
  });

  it('packs spriteId:6 | y:10 | null:6 | x:10 from MSB', () => {
    expect(packHitCoord({ x: 1, y: 2, spriteId: 3, null: 4 })).toBe(
      ((3 << 26) | (2 << 16) | (4 << 10) | 1) >>> 0,
    );
  });
});

describe('animation block', () => {
  it('round-trips and derives counts from arrays', () => {
    const a = move({
      startX: -5,
      startY: 7,
      hitCoords: [{ x: -3, y: 4, spriteId: 1, null: 0 }],
      baseString: 'A1-bl3B2',
      extraStrings: ['A1', 'B2'],
      sprites: [sprite(), sprite({ index: 1, posX: 3 })],
    });
    const w = new BinaryWriter();
    writeAnimation(w, a);
    const back = readAnimation(new BinaryReader(w.toUint8Array()));
    expect(back).toEqual({
      startX: -5,
      startY: 7,
      hitCoords: a.hitCoords,
      baseString: a.baseString,
      extraStrings: a.extraStrings,
      sprites: a.sprites,
    });
  });

  it('rejects more than 255 sprites and out-of-range coordinates', () => {
    expect(() =>
      writeAnimation(
        new BinaryWriter(),
        move({ sprites: Array.from({ length: 256 }, () => sprite()) }),
      ),
    ).toThrow(OmfRangeError);
    expect(() =>
      writeAnimation(
        new BinaryWriter(),
        move({ hitCoords: [{ x: 512, y: 0, spriteId: 0, null: 0 }] }),
      ),
    ).toThrow(/hit_coords.x/);
  });
});
