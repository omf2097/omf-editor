// The animation block shared by AF moves and BK animations (spec 05): origin,
// collision points, the animation strings and the sprites, plus shared-image
// resolution (spec 04 §Shared images).

import type { BinaryReader, BinaryWriter } from './binary';
import { OmfFormatError, OmfRangeError } from './errors';
import { readSprite, writeSprite, type Sprite } from './sprite';

/** A collision point (spec 14). */
export interface HitCoord {
  /** Signed 10-bit, relative to the animation origin. */
  x: number;
  y: number;
  /** Index of the sprite (A = 0) the point belongs to; file field `frame_id`. */
  spriteId: number;
  /** 6 bits, always 0 in shipped data; preserved. */
  null: number;
}

export interface Animation {
  startX: number;
  startY: number;
  hitCoords: HitCoord[];
  /** The animation string the game plays (spec 08). */
  baseString: string;
  /**
   * Alternatives the game plays instead of the base string: for moves, picked
   * by AFMove.extraStringSelector (enhancements, arm/leg speed); for arena
   * hazards, at random (openomf arena.c, the Desert's plane formations).
   */
  extraStrings: string[];
  sprites: Sprite[];
  /** The u32 after start_x/start_y: 0 in every shipped file; openomf keeps any value. */
  headerZero?: number;
}

export const LIMITS = {
  sprites: 255,
  hitCoordsFormat: 0xffff,
  /** openomf SD_COLCOORD_COUNT_MAX */
  hitCoordsOpenomf: 256,
  /** Bytes; openomf rejects a length ≥ SD_ANIMATION_STRING_MAX (1024). */
  baseString: 1023,
  /** openomf SD_EXTRASTR_COUNT_MAX */
  extraStrings: 10,
  /** Bytes; openomf rejects a length ≥ SD_EXTRA_STRING_MAX (512). */
  extraString: 511,
} as const;

const signed10 = (v: number): number => ((v & 0x3ff) ^ 0x200) - 0x200;

/**
 * A point is stored as two u16 words, each a signed 10-bit coordinate in the
 * low bits and a 6-bit field above it: x with `null`, then y with `spriteId`.
 */
export function unpackHitCoord(a: number, b: number): HitCoord {
  return { x: signed10(a), null: a >> 10, y: signed10(b), spriteId: b >> 10 };
}

export function packHitCoord(c: HitCoord): number {
  return (
    (((c.spriteId & 0x3f) << 26) |
      ((c.y & 0x3ff) << 16) |
      ((c.null & 0x3f) << 10) |
      (c.x & 0x3ff)) >>>
    0
  );
}

export function readAnimation(r: BinaryReader): Animation {
  const startX = r.i16();
  const startY = r.i16();
  const headerZero = r.u32();
  const coordCount = r.u16();
  const spriteCount = r.u8();
  const hitCoords: HitCoord[] = [];
  for (let i = 0; i < coordCount; i++) {
    const a = r.u16();
    const b = r.u16();
    hitCoords.push(unpackHitCoord(a, b));
  }
  const baseString = r.varStr();
  const extraCount = r.u8();
  const extraStrings: string[] = [];
  for (let i = 0; i < extraCount; i++) extraStrings.push(r.varStr());
  const sprites: Sprite[] = [];
  for (let i = 0; i < spriteCount; i++) sprites.push(readSprite(r));
  const a: Animation = { startX, startY, hitCoords, baseString, extraStrings, sprites };
  if (headerZero !== 0) a.headerZero = headerZero;
  return a;
}

/** `sharedLen(sprite)` gives the image length to write for missing sprites. */
export function writeAnimation(
  w: BinaryWriter,
  a: Animation,
  sharedLen: (s: Sprite) => number = () => 0,
): void {
  if (a.sprites.length > LIMITS.sprites) {
    throw new OmfRangeError(a.sprites.length, 0, LIMITS.sprites, 'sprites.length');
  }
  if (a.extraStrings.length > 0xff) {
    throw new OmfRangeError(a.extraStrings.length, 0, 0xff, 'extra_strings.length');
  }
  w.i16(a.startX, 'start_x')
    .i16(a.startY, 'start_y')
    .u32(a.headerZero ?? 0, 'header_zero');
  w.u16(a.hitCoords.length, 'hit_coords.length').u8(a.sprites.length);
  for (const c of a.hitCoords) {
    for (const k of ['x', 'y', 'spriteId', 'null'] as const) {
      if (!Number.isInteger(c[k]))
        throw new OmfFormatError(`hit_coords.${k} = ${c[k]} is not an integer`);
    }
    if (c.x < -512 || c.x > 511) throw new OmfRangeError(c.x, -512, 511, 'hit_coords.x');
    if (c.y < -512 || c.y > 511) throw new OmfRangeError(c.y, -512, 511, 'hit_coords.y');
    if (c.spriteId < 0 || c.spriteId > 63)
      throw new OmfRangeError(c.spriteId, 0, 63, 'hit_coords.frame_id');
    if (c.null < 0 || c.null > 63) throw new OmfRangeError(c.null, 0, 63, 'hit_coords.null');
    w.u32(packHitCoord(c));
  }
  w.varStr(a.baseString, false, 'base_string');
  w.u8(a.extraStrings.length);
  for (const s of a.extraStrings) w.varStr(s, false, 'extra_strings');
  for (const s of a.sprites) writeSprite(w, s, s.missing ? sharedLen(s) : 0);
}

function resolveShared(animations: Iterable<Animation>, ownerZero: boolean): Map<Sprite, Sprite> {
  const table = new Map<number, Sprite>();
  const out = new Map<Sprite, Sprite>();
  for (const a of animations) {
    for (const s of a.sprites) {
      if (s.missing) {
        const owner = table.get(s.index);
        if (owner) out.set(s, owner);
      } else if (s.index !== 0 || ownerZero) {
        table.set(s.index, s);
      }
    }
  }
  return out;
}

/**
 * Resolves `missing` sprites the way the game does (openomf
 * resources/animation.c): to the most recent preceding non-missing sprite
 * with the same index, walking animations in file order. Index 0 is never an
 * owner, so a sharer of index 0, like one with no earlier owner, has no image:
 * openomf dereferences NULL for it. Returns sharer → owner. Pass the
 * animations in file (ascending id) order.
 */
export function resolveSharedImages(animations: Iterable<Animation>): Map<Sprite, Sprite> {
  return resolveShared(animations, false);
}

/**
 * The file-format view (openomf sd_af_postprocess, pyomftools): index 0 owns
 * like any other. Used for the image length written for sharers and for
 * pyomftools JSON, so files stay byte-exact.
 */
export function resolveSharedImagesInFile(animations: Iterable<Animation>): Map<Sprite, Sprite> {
  return resolveShared(animations, true);
}

export function cloneAnimationFields(a: Animation): Animation {
  return {
    startX: a.startX,
    startY: a.startY,
    hitCoords: a.hitCoords.map((c) => ({ ...c })),
    baseString: a.baseString,
    extraStrings: [...a.extraStrings],
    sprites: a.sprites.map((s) => ({ ...s })),
    ...(a.headerZero ? { headerZero: a.headerZero } : {}),
  };
}
