// The shipped-bug corpus (spec 10 §Fixtures): small synthetic files holding
// the odd data found in the real game files, so CI without game data still
// covers how it is read and that it is written back byte for byte. Each entry
// names the shipped file it imitates. test/fixtures/corpus.af and corpus.bk
// are the committed output of these builders (regenerate with
// OMF_UPDATE_FIXTURE=1); a change to the writer that alters them fails.

import { encodeSprite, writeAF, writeBK, type AFFile, type BKFile, type Sprite } from '../src';
import { af, bk, bkAnim, move } from './helpers';

/** One RLE command word: x (0), run (1), y (2) or end (3). */
export const word = (op: 0 | 1 | 2 | 3, data = 0): number[] => {
  const c = (data << 2) | op;
  return [c & 0xff, c >> 8];
};
const X = (v: number) => word(0, v);
const Y = (v: number) => word(2, v);
const RUN = (...b: number[]) => [...word(1, b.length), ...b];
const END = word(3);

function img(w: number, h: number, seed: number): Uint8Array {
  const pixels = Uint16Array.from({ length: w * h }, (_, i) => 16 + ((i * 7 + seed) % 200));
  return encodeSprite({ width: w, height: h, pixels });
}

const plain = (index: number, w = 6, h = 5): Sprite => ({
  posX: -3,
  posY: -h,
  width: w,
  height: h,
  index,
  missing: false,
  image: img(w, h, index),
});

/** A sprite sharing the image of the latest earlier owner with the same index. */
const sharer = (index: number, posX = -2): Sprite => ({
  posX,
  posY: -5,
  width: 6,
  height: 5,
  index,
  missing: true,
  image: new Uint8Array(0),
});

/**
 * 60537×60537 with no image bytes: FIGHTR0.AF move 9, FIGHTR5.AF moves 21,
 * 37 and 42, ARENA4.BK animation 14, END1.BK. openomf makes it a 1×1 blank.
 */
export const garbageEmpty = (posX = 0, posY = 0): Sprite => ({
  posX,
  posY,
  width: 60537,
  height: 60537,
  index: 0,
  missing: false,
  image: new Uint8Array(0),
});

/** Streams openomf's sd_sprite_vga_decode reads in its own way (width 4, height 2). */
export const STREAMS = {
  /** No end command (op 3): the stream simply runs out. */
  noEnd: Uint8Array.from([...Y(0), ...X(1), ...RUN(5, 6)]),
  /** A run past width × height: openomf stops there ("Truncating sd_sprite vga data"). */
  overflow: Uint8Array.from([...Y(1), ...X(2), ...RUN(7, 8, 9, 10), ...END]),
  /** A run longer than the bytes left: the bytes there are drawn, then it stops. */
  shortRun: Uint8Array.from([...Y(0), ...X(0), ...word(1, 6), 11, 12]),
  /** An end command before the end: openomf returns SD_INVALID_INPUT. */
  endNotLast: Uint8Array.from([...Y(0), ...X(0), ...RUN(3), ...END, ...X(0)]),
};

const stream = (index: number, image: Uint8Array): Sprite => ({
  posX: -2,
  posY: -2,
  width: 4,
  height: 2,
  index,
  missing: false,
  image,
});

/** Strings openomf reads differently from how they look (spec 08 §openomf drops). */
export const STRINGS = {
  /** FIGHTR9.AF move 1: `f` takes no argument, so openomf drops `rff10-`. */
  rff: 'A130-B30-C10-D10-E10-F10-rfC10-rfD10-rfE10-rff10-C10-B30-A130',
  /** FIGHTR8.AF move 36: `hx+8-` has no frame key, so it is dropped. */
  hx: 'hx+9y-2C5-hx+8-y-3D3-hx+7y-4E3-hx+6y-5F3-vx-7y-7F1-G5',
  /** FIGHTR6.AF move 34: the `uabeujf2jf` frames are dropped (`j` is no tag;
   * the `uabewjf2jf` ones parse). */
  uabe: 'bm10amex+20beA1-usbebxA6-bes21l60B8-beC3-beuD4-uabeujf2jfE3-uabeujf2jfF4-uabeujf2jfG4-uabewjf2jfH4-uabeujf2jfD4-uabeujf2jfE3-uabeujf2jfF4-uabeujf2jfG4-uabewjf2jfH4-uabeujf2jfD4-uabeujf2jfE3-uabeujf2jfF4-uabeujf2jfG4-uabewjf2jfH4-uabeujf2jfD4-uabeujf2jfE3-uabeujf2jfF4-uabeujf2jfG4-uabewjf2jfH4-uabewjf2jfI5-uabewjf2jfJ7',
  /** FIGHTR2.AF move 36 enemy string: `usw30X1` is dropped (`sw` is no tag). */
  usw: 'uO27-ey-24uox-10N6-ey-46uox-13N3-ey-75uox-15N1-uox-15vy-30N1-uox-15boN27-gy-482bobpN1-buboN1-hboZ20-bofbpN28-ey-75x-15um12mi5ma270mx-20s28sp12l45X1-hm12mi5ma270mx+50my-16usw30X1-hbpp64uX1-hmx-30my+4m56uX1-hmx+30my-2m56uX1-hoX4000',
  /** FIGHTR7.AF move 22, FIGHTR9.AF move 29: no frame at all. */
  bang: '!',
  /** Not shipped: a second key before '-'; openomf skips one character after the duration. */
  twoKeys: 'A5B7-C2',
} as const;

/** FIGHTR0.AF move 1: move_string "0", then leftover bytes after the NUL. */
export const MOVE_STRING_RAW = Uint8Array.from([
  48, 0, 0, 50, 48, 45, 66, 50, 48, 45, 67, 49, 48, 45, 68, 49, 48, 45, 69, 49, 0,
]);

export function corpusAF(): AFFile {
  const f = af([
    [
      1,
      move({
        baseString: STRINGS.rff,
        sprites: [1, 2, 3, 4, 5, 6].map((i) => plain(i)),
        moveString: '0',
        moveStringRaw: MOVE_STRING_RAW,
        extraStrings: [STRINGS.twoKeys],
      }),
    ],
    [
      9,
      move({
        baseString: STRINGS.hx,
        // Sharers of move 1's images (FIGHTR0.AF moves 16/17 share 131–136),
        // then the empty garbage-size sprite.
        sprites: [...[1, 2, 3, 4, 5, 6].map((i) => sharer(i)), garbageEmpty(-15, -15)],
        moveString: '!',
      }),
    ],
    [
      20,
      move({
        baseString: STRINGS.uabe,
        enemyString: STRINGS.usw,
        sprites: [
          stream(7, STREAMS.noEnd),
          stream(8, STREAMS.overflow),
          stream(9, STREAMS.shortRun),
          stream(10, STREAMS.endNotLast),
          ...[11, 12, 13, 14, 15, 16].map((i) => plain(i)),
        ],
        // Odd fields openomf keeps as they are.
        headerZero: 0xdeadbeef,
        hitCoords: [
          { x: -512, y: 511, spriteId: 1, null: 0 },
          { x: 3, y: -4, spriteId: 2, null: 63 },
        ],
        aiFlags: 0xffff,
        posConstraint: 0xffff,
        unknown4: 1,
        unknown11: 255,
        moveString: '236P',
      }),
    ],
    [22, move({ baseString: STRINGS.bang, sprites: [plain(17)], moveString: '0' })],
  ]);
  f.version1 = 0;
  return f;
}

export function corpusBK(): BKFile {
  const b = bk(
    [
      [
        14,
        // ARENA4.BK animation 14: an empty garbage-size first sprite.
        bkAnim({ baseString: 'A5-B5', sprites: [garbageEmpty(-15, -15), plain(0)] }),
      ],
      [
        20,
        // CREDITS.BK 20–27: a 0×1 sprite carrying 768 bytes nobody draws.
        bkAnim({
          baseString: 'A1-B500',
          sprites: [
            plain(0),
            {
              posX: 0,
              posY: 0,
              width: 0,
              height: 1,
              index: 0,
              missing: false,
              image: Uint8Array.from({ length: 768 }, (_, i) => (i * 13) & 0xff),
            },
          ],
          footerString: 'x',
          null: 3,
          chainHit: 1,
          probability: 255,
        }),
      ],
      [21, bkAnim({ baseString: STRINGS.bang, sprites: [plain(0)] })],
    ],
    320,
    200,
  );
  b.unknownA = 7;
  b.musicMask = 0x80000001;
  return b;
}

export const corpusBytes = (): { af: Uint8Array; bk: Uint8Array } => ({
  af: writeAF(corpusAF()),
  bk: writeBK(corpusBK()),
});
