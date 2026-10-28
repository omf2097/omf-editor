// Limits and readers checked against openomf's loader (A1–A16, G2/G5, S19/S20).

import { describe, expect, it } from 'vitest';
import {
  BinaryReader,
  BinaryWriter,
  OmfFormatError,
  OmfRangeError,
  SOUND_TABLE_VALUE_MAX,
  TRANSPARENT,
  afFromJSON,
  afToJSON,
  clonePaletteMapping,
  decodeSprite,
  documentDiagnostics,
  encodeSprite,
  readAF,
  resolveSharedImages,
  resolveSharedImagesInFile,
  soundAssignable,
  writeAF,
  type AFFile,
  type BKFile,
} from '../src';
import { af, bk, bkAnim, move, sprite } from './helpers';

const blocking = (d: AFFile | BKFile): string[] =>
  documentDiagnostics(d)
    .filter((x) => x.blocksSave)
    .map((x) => x.message);

describe('string limits are openomf’s (A1)', () => {
  const cases: [string, number, (n: number) => AFFile | BKFile][] = [
    ['base', 1023, (n) => af([[11, move({ baseString: 'A'.repeat(n) })]])],
    ['extra', 511, (n) => af([[11, move({ extraStrings: ['A'.repeat(n)] })]])],
    ['enemy', 510, (n) => af([[11, move({ enemyString: 'A'.repeat(n) })]])],
    ['footer', 510, (n) => bk([[6, bkAnim({ footerString: 'A'.repeat(n) })]])],
  ];
  for (const [name, max, make] of cases) {
    it(`${name}: ${max} bytes saves, ${max + 1} blocks`, () => {
      expect(blocking(make(max))).toEqual([]);
      expect(blocking(make(max + 1))).toEqual([expect.stringMatching(/longer than/)]);
    });
  }

  it('a string outside cp437 blocks with its own message (S20)', () => {
    const d = documentDiagnostics(af([[11, move({ extraStrings: ['A1€'] })]]));
    expect(d.filter((x) => x.blocksSave).map((x) => x.message)).toEqual([
      'extra string 0 has characters outside cp437; it cannot be saved',
    ]);
  });
});

describe('BK palettes (A2)', () => {
  it('more than 8 block saving', () => {
    const file = bk();
    while (file.palettes.length < 8) file.palettes.push(clonePaletteMapping(file.palettes[0]!));
    expect(blocking(file)).toEqual([]);
    file.palettes.push(clonePaletteMapping(file.palettes[0]!));
    expect(blocking(file)).toEqual([expect.stringMatching(/9 palettes; openomf holds at most 8/)]);
  });
});

describe('sprite encoder (A3, A5, A6)', () => {
  const one = (w: number, h: number, x: number, y: number) => {
    const pixels = new Uint16Array(w * h).fill(TRANSPARENT);
    pixels[y * w + x] = 5;
    return { width: w, height: h, pixels };
  };

  it('refuses coordinates beyond the 14-bit fields instead of wrapping them', () => {
    expect(() => encodeSprite(one(16385, 1, 16384, 0))).toThrow(OmfRangeError);
    expect(() => encodeSprite(one(1, 16385, 0, 16384))).toThrow(OmfRangeError);
    const ok = encodeSprite(one(16384, 1, 16383, 0));
    expect(decodeSprite(16384, 1, ok).pixels[16383]).toBe(5);
  });

  it('splits runs longer than 16383 pixels', () => {
    const w = 16400;
    const pixels = new Uint16Array(w).fill(7);
    const back = decodeSprite(w, 1, encodeSprite({ width: w, height: 1, pixels }));
    expect(back.pixels.every((p) => p === 7)).toBe(true);
  });

  it('refuses pixel values above 255 and a pixel count that does not match', () => {
    const bad = one(4, 4, 1, 1);
    bad.pixels[2] = 300;
    expect(() => encodeSprite(bad)).toThrow(/sprite\.pixels\[2\]/);
    expect(() => encodeSprite({ width: 4, height: 4, pixels: new Uint16Array(3) })).toThrow(
      OmfFormatError,
    );
    expect(() => encodeSprite({ width: 60537, height: 60537, pixels: new Uint16Array(0) })).toThrow(
      /expected 60537×60537/,
    );
  });

  it('refuses a 255×255 opaque sprite, which cannot fit 65535 bytes', () => {
    expect(() =>
      encodeSprite({ width: 255, height: 255, pixels: new Uint16Array(255 * 255).fill(1) }),
    ).toThrow(OmfRangeError);
  });
});

describe('hit coordinates (A7)', () => {
  it('must be integers', () => {
    const file = af([[11, move({ hitCoords: [{ x: 1.7, y: 0, spriteId: 0, null: 0 }] })]]);
    expect(() => writeAF(file)).toThrow(/hit_coords.x = 1.7 is not an integer/);
    file.moves.get(11)!.hitCoords[0]!.x = NaN;
    expect(() => writeAF(file)).toThrow(/not an integer/);
  });
});

describe('JSON import (A8, A12)', () => {
  it('refuses ids with leading zeros, which would collapse', () => {
    const j = afToJSON(af([[11, move()]]));
    j.moves['011'] = j.moves['11']!;
    expect(() => afFromJSON(j)).toThrow(/moves\.011: id must be written without leading zeros/);
  });

  it('refuses NUL characters in strings', () => {
    const j = afToJSON(af([[11, move({ baseString: 'A1' })]]));
    j.moves['11']!.base_string = 'A1\0B2';
    expect(() => afFromJSON(j)).toThrow(/base_string: contains a NUL character/);
  });
});

describe('reader leniency matching openomf (A11)', () => {
  it('keeps a non-zero animation header dword', () => {
    const file = af([[11, move({ headerZero: 0xdeadbeef })]]);
    const bytes = writeAF(file);
    const back = readAF(bytes);
    expect(back.moves.get(11)!.headerZero).toBe(0xdeadbeef);
    expect(writeAF(back)).toEqual(bytes);
    expect(afFromJSON(afToJSON(back)).moves.get(11)!.headerZero).toBe(0xdeadbeef);
  });

  it('reads a counted string whose last byte is not NUL', () => {
    const w = new BinaryWriter();
    w.u16(3).bytes(Uint8Array.from([65, 66, 67]));
    expect(new BinaryReader(w.toUint8Array()).varStr(true)).toBe('ABC');
    const z = new BinaryWriter();
    z.varStr('AB', true);
    expect(new BinaryReader(z.toUint8Array()).varStr(true)).toBe('AB');
  });
});

describe('shared images follow file order (A14)', () => {
  it('whatever order the map has', () => {
    const owner1 = sprite({ index: 3 });
    const owner2 = sprite({ index: 3 });
    const sharer = sprite({ index: 3, missing: true, image: new Uint8Array(0) });
    const file = af([
      [12, move({ sprites: [owner2] })],
      [11, move({ sprites: [owner1] })],
      [13, move({ sprites: [sharer] })],
    ]);
    const diags = documentDiagnostics(file);
    expect(diags.filter((d) => d.blocksSave)).toEqual([]);
    const j = afToJSON(file);
    expect(j.moves['13']!.sprites[0]!.image).toEqual(Array.from(owner2.image));
  });
});

describe('index 0 never owns an image at runtime (G2, G5)', () => {
  const owner = sprite({ index: 0 });
  const sharer = sprite({ index: 0, missing: true, image: new Uint8Array(0) });
  const file = af([
    [11, move({ sprites: [owner] })],
    [12, move({ sprites: [sharer] })],
  ]);

  it('the game resolves nothing; the file format still does', () => {
    expect(resolveSharedImages(file.moves.values()).has(sharer)).toBe(false);
    expect(resolveSharedImagesInFile(file.moves.values()).get(sharer)).toBe(owner);
  });

  it('a sharer without owner blocks saving: openomf dereferences NULL', () => {
    expect(blocking(file)).toEqual([expect.stringMatching(/image index 0.*crashes/)]);
    const orphan = af([
      [12, move({ sprites: [sprite({ index: 4, missing: true, image: new Uint8Array(0) })] })],
    ]);
    expect(blocking(orphan)).toEqual([expect.stringMatching(/no earlier sprite with index 4/)]);
  });
});

describe('enemy strings are animation strings (S19)', () => {
  it('are linted', () => {
    const d = documentDiagnostics(af([[11, move({ enemyString: 'A1-#' })]]));
    expect(d).toContainEqual(
      expect.objectContaining({ field: 'enemy', message: 'openomf drops "#"', pos: 3 }),
    );
  });
});

describe('sound table values (A16)', () => {
  it('are bytes: SOUNDS.DAT entries up to 255 can be assigned', () => {
    expect(SOUND_TABLE_VALUE_MAX).toBe(255);
    expect(soundAssignable(254)).toBe(true);
    expect(soundAssignable(255)).toBe(false);
    const file = af();
    file.soundTable[0] = 200;
    expect(documentDiagnostics(file)).toEqual([]);
  });
});
