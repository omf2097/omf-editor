import { describe, expect, it } from 'vitest';
import {
  TRANSPARENT,
  decodeSprite,
  encodeSprite,
  resolveSharedImages,
  type AFFile,
  type Sprite,
} from '@omf/formats';
import {
  deleteSpriteFrom,
  framesShowing,
  freeImageIndex,
  keepImagesOfDoomedOwners,
  ownerRef,
  replaceImage,
  replaceImages,
  sharersLosingOwner,
} from './spriteEdit';
import { newFighter, newMove } from './templates';

const one = (p: number) => ({ width: 1, height: 1, pixels: Uint16Array.from([p]) });
const own = (index: number, p: number): Sprite => ({
  posX: 0,
  posY: 0,
  width: 1,
  height: 1,
  index,
  missing: false,
  image: encodeSprite(one(p)),
});
const sharer = (index: number): Sprite => ({
  posX: 0,
  posY: 0,
  width: 1,
  height: 1,
  index,
  missing: true,
  image: new Uint8Array(0),
});
const doc = (...anims: Sprite[][]): AFFile => {
  const f = newFighter();
  f.moves = new Map(anims.map((sprites, id) => [id, newMove({ sprites })]));
  return f;
};
/** The pixel each sprite shows, through sharing. */
const shown = (d: AFFile): number[][] => {
  const owners = resolveSharedImages(d.moves.values());
  return [...d.moves.values()].map((a) =>
    a.sprites.map((s) => {
      const src = s.missing ? owners.get(s) : s;
      return src ? decodeSprite(src.width, src.height, src.image).pixels[0]! : -1;
    }),
  );
};

describe('replaceImage', () => {
  it("'only' on a sharer keeps later sharers on the old owner (G3)", () => {
    // FIGHTR6 17/18/19: 18:A and 19:A both share 17:A.
    const d = doc([own(9, 1)], [sharer(9)], [sharer(9)]);
    replaceImage(d, { animId: 1, index: 0 }, one(5), 'only');
    expect(shown(d)).toEqual([[1], [5], [1]]);
    expect(d.moves.get(1)!.sprites[0]!.index).not.toBe(9);
    expect(ownerRef(d, d.moves.get(2)!.sprites[0]!)).toEqual({ animId: 0, index: 0 });
  });

  it("'only' on a sharer keeps its index when nothing later shares it", () => {
    const d = doc([own(9, 1)], [sharer(9)]);
    replaceImage(d, { animId: 1, index: 0 }, one(5), 'only');
    expect(shown(d)).toEqual([[1], [5]]);
    expect(d.moves.get(1)!.sprites[0]!.index).toBe(9);
  });

  it("'only' on an owner hands the old image to its first sharer only", () => {
    const d = doc([own(9, 1)], [sharer(9)], [sharer(9)]);
    replaceImage(d, { animId: 0, index: 0 }, one(5), 'only');
    expect(shown(d)).toEqual([[5], [1], [1]]);
    expect(d.moves.get(1)!.sprites[0]!.missing).toBe(false);
    expect(d.moves.get(2)!.sprites[0]!.missing).toBe(true);
  });

  it("'all' on a sharer changes the shared image", () => {
    const d = doc([own(9, 1)], [sharer(9)], [sharer(9)]);
    replaceImage(d, { animId: 2, index: 0 }, one(5), 'all');
    expect(shown(d)).toEqual([[5], [5], [5]]);
  });
});

describe('replaceImages (sheet import)', () => {
  it("'all' with an owner and its sharer both changed keeps both edits (G12)", () => {
    const d = doc([own(5, 1), sharer(5)]);
    replaceImages(
      d,
      0,
      [
        { index: 0, decoded: one(10), posX: 0, posY: 0 },
        { index: 1, decoded: one(20), posX: 0, posY: 0 },
      ],
      'all',
    );
    expect(shown(d)).toEqual([[10, 20]]);
  });

  it("'all' with identical edits keeps the sharing", () => {
    const d = doc([own(5, 1), sharer(5)]);
    replaceImages(
      d,
      0,
      [
        { index: 0, decoded: one(10), posX: 0, posY: 0 },
        { index: 1, decoded: one(10), posX: 2, posY: 0 },
      ],
      'all',
    );
    expect(shown(d)).toEqual([[10, 10]]);
    expect(d.moves.get(0)!.sprites[1]!).toMatchObject({ missing: true, posX: 2 });
  });
});

describe('deleting owners (G5)', () => {
  it('lists sharers that lose their owner and can hand the image over', () => {
    const d = doc([own(9, 1)], [sharer(9)], [sharer(9)]);
    const doomed = (r: { animId: number }) => r.animId === 0;
    expect(sharersLosingOwner(d, doomed)).toEqual([
      {
        owner: { animId: 0, index: 0 },
        sharers: [
          { animId: 1, index: 0 },
          { animId: 2, index: 0 },
        ],
      },
    ]);
    keepImagesOfDoomedOwners(d, doomed);
    d.moves.delete(0);
    expect(shown(d)).toEqual([[1], [1]]);
  });
});

describe('deleteSpriteFrom (G4)', () => {
  it('rewrites base and extra strings and drops frames showing the sprite', () => {
    const a = newMove({
      baseString: 'A3-bl3B4-C2',
      extraStrings: ['A1-C1', 'x5', 'A1'],
      sprites: [own(1, 1), own(2, 2), own(3, 3)],
      hitCoords: [
        { x: 0, y: 0, spriteId: 1, null: 0 },
        { x: 1, y: 1, spriteId: 2, null: 0 },
      ],
    });
    // Every string parses the way openomf does; 'x5' has no frames (openomf drops it).
    expect(framesShowing(a, 1)).toEqual([{ string: 0, frame: 1 }]);
    expect(deleteSpriteFrom(a, 1)).toBeNull();
    expect(a.baseString).toBe('A3-B2');
    // Strings without affected frames keep their exact text.
    expect(a.extraStrings).toEqual(['A1-B1', 'x5', 'A1']);
    expect(a.sprites.map((s) => s.index)).toEqual([1, 3]);
    expect(a.hitCoords).toEqual([{ x: 1, y: 1, spriteId: 1, null: 0 }]);
  });

  it('refuses when a string would lose every frame', () => {
    const a = newMove({
      baseString: 'A1-B1',
      extraStrings: ['B1'],
      sprites: [own(1, 1), own(2, 2)],
    });
    expect(deleteSpriteFrom({ ...a }, 1)).toMatch(/extra string 0/);
    expect(a.sprites.length).toBe(2);
  });
});

describe('image indices (G2)', () => {
  it('templates and freeImageIndex never use index 0', () => {
    const f = newFighter();
    const used = [...f.moves.values()].map((m) => m.sprites[0]!.index);
    expect(used).not.toContain(0);
    expect(new Set(used).size).toBe(used.length);
    expect(newMove().sprites[0]!.index).toBe(1);
    expect(freeImageIndex(doc([own(1, 1), own(2, 1)]))).toBe(3);
    expect(freeImageIndex(doc([own(0, 1)]))).toBe(1);
    const full = doc(Array.from({ length: 255 }, (_, i) => own(i + 1, 1)));
    expect(freeImageIndex(full)).toBe(0);
  });

  it('keeps transparency for a cleared image', () => {
    const d = doc([own(9, 1)]);
    replaceImage(d, { animId: 0, index: 0 }, one(TRANSPARENT), 'all');
    expect(shown(d)).toEqual([[TRANSPARENT]]);
  });
});
