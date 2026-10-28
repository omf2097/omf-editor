// Sprite edits that respect shared images (spec 12 §10.2).
//
// Shared images (spec 04 §Shared images): a sprite with `missing` set has no
// pixels of its own and shows the image of the most recent preceding owner
// (a non-missing sprite) with the same `index`, in file order across all
// animations. In the game index 0 never owns (resolveSharedImages). So
// replacing, deleting or reordering an owner can silently change what its
// sharers show; these helpers keep the pictures the user expects.

import {
  encodeScript,
  encodeSprite,
  resolveSharedImages,
  decodeScript,
  spriteIndexOfFrame,
  spriteLetter,
  type DecodedSprite,
  type Sprite,
} from '@omf/formats';
import { animationsOf, type AnyAnimation, type Doc } from './doc';
import { sameImage } from './pixels';
import { remapSprites } from './scriptOps';

export interface SpriteRef {
  animId: number;
  index: number;
}

/** "animId/letter", as messages name a sprite. */
export const spriteLabel = (r: SpriteRef): string => `${r.animId}/${spriteLetter(r.index)}`;

export function spriteAt(d: Doc, r: SpriteRef): Sprite | undefined {
  return animationsOf(d).get(r.animId)?.sprites[r.index];
}

/** Every sprite in the document sharing `owner`'s image, in file order. */
export function sharersOf(d: Doc, owner: Sprite): SpriteRef[] {
  const owners = resolveSharedImages(animationsOf(d).values());
  const out: SpriteRef[] = [];
  for (const [animId, a] of animationsOf(d)) {
    a.sprites.forEach((s, index) => {
      if (owners.get(s) === owner) out.push({ animId, index });
    });
  }
  return out;
}

/** Where `s` (by identity) sits in the document. */
export function refOf(d: Doc, s: Sprite): SpriteRef | null {
  for (const [animId, a] of animationsOf(d)) {
    const index = a.sprites.indexOf(s);
    if (index >= 0) return { animId, index };
  }
  return null;
}

/** The owner whose image the sharer `s` shows, or null (not a sharer, or unresolved). */
export function ownerRef(d: Doc, s: Sprite): SpriteRef | null {
  const owner = resolveSharedImages(animationsOf(d).values()).get(s);
  return owner ? refOf(d, owner) : null;
}

/** Whether replacing this sprite's image affects other sprites. */
export function isShared(d: Doc, r: SpriteRef): boolean {
  const s = spriteAt(d, r);
  if (!s) return false;
  return s.missing ? ownerRef(d, s) !== null : sharersOf(d, s).length > 0;
}

/**
 * Gives `owner`'s image to its first sharer that `keep` accepts, so the
 * remaining sharers (which follow it in file order) keep the same picture
 * once `owner` changes or goes away. Returns the new owner, or null.
 */
export function handImageToFirstSharer(
  d: Doc,
  owner: Sprite,
  keep: (r: SpriteRef) => boolean = () => true,
): SpriteRef | null {
  const first = sharersOf(d, owner).find(keep);
  if (!first) return null;
  const t = animationsOf(d).get(first.animId)!;
  t.sprites[first.index] = {
    ...t.sprites[first.index]!,
    missing: false,
    image: owner.image,
    width: owner.width,
    height: owner.height,
  };
  return first;
}

/** Owners inside `doomed` whose image is shared by sprites outside it. */
export function sharersLosingOwner(
  d: Doc,
  doomed: (r: SpriteRef) => boolean,
): { owner: SpriteRef; sharers: SpriteRef[] }[] {
  const out: { owner: SpriteRef; sharers: SpriteRef[] }[] = [];
  for (const [animId, a] of animationsOf(d)) {
    a.sprites.forEach((s, index) => {
      const owner = { animId, index };
      if (s.missing || !doomed(owner)) return;
      const sharers = sharersOf(d, s).filter((r) => !doomed(r));
      if (sharers.length) out.push({ owner, sharers });
    });
  }
  return out;
}

/** Hands every doomed owner's image to its first surviving sharer. */
export function keepImagesOfDoomedOwners(d: Doc, doomed: (r: SpriteRef) => boolean): void {
  for (const { owner } of sharersLosingOwner(d, doomed)) {
    handImageToFirstSharer(d, spriteAt(d, owner)!, (r) => !doomed(r));
  }
}

export type ShareMode = 'all' | 'only';

/** Sets the header size of sprites `refs` (sharers keep their owner's size). */
function setSizes(d: Doc, refs: SpriteRef[], width: number, height: number): void {
  const anims = animationsOf(d);
  for (const r of refs) {
    const t = anims.get(r.animId)!;
    t.sprites[r.index] = { ...t.sprites[r.index]!, width, height };
  }
}

type Geometry = { width: number; height: number; posX?: number; posY?: number };

/**
 * Replaces the image of sprite `r` in `d` (a working copy, mutated in place).
 * 'all': the shared image changes for every user. 'only': just this sprite;
 * a sharer becomes an owner, under a fresh index when keeping its index would
 * capture later sharers of its old owner; an owner hands its old image to its
 * first sharer, which the remaining sharers then follow.
 */
export function replaceImage(
  d: Doc,
  r: SpriteRef,
  decoded: DecodedSprite,
  mode: ShareMode,
  pos?: { x: number; y: number },
): void {
  const a = animationsOf(d).get(r.animId);
  const s = a?.sprites[r.index];
  if (!a || !s) return;
  const image = encodeSprite(decoded);
  const geometry: Geometry = {
    width: decoded.width,
    height: decoded.height,
    ...(pos ? { posX: pos.x, posY: pos.y } : {}),
  };
  if (s.missing) replaceSharerImage(d, a, r, s, image, geometry, mode);
  else replaceOwnerImage(d, a, r, s, image, geometry, mode);
}

function replaceSharerImage(
  d: Doc,
  a: AnyAnimation,
  r: SpriteRef,
  s: Sprite,
  image: Uint8Array,
  geometry: Geometry,
  mode: ShareMode,
): void {
  const anims = animationsOf(d);
  const o = ownerRef(d, s);
  if (mode === 'all' && o) {
    // Write the owner; the sharers follow through the index.
    const ownerAnim = anims.get(o.animId)!;
    const { width, height } = geometry;
    const owner = { ...ownerAnim.sprites[o.index]!, image, width, height };
    ownerAnim.sprites[o.index] = owner;
    a.sprites[r.index] = { ...a.sprites[r.index]!, ...geometry };
    setSizes(d, sharersOf(d, owner), width, height);
    return;
  }
  // Become an owner. Under the old index this sprite would also become the
  // owner of later sharers of the old owner ("capture"); take a fresh index then.
  const before = resolveSharedImages(anims.values());
  const own: Sprite = { ...s, ...geometry, missing: false, image };
  a.sprites[r.index] = own;
  const after = resolveSharedImages(anims.values());
  let captured = false;
  for (const [sharer, o2] of after) if (o2 === own && before.get(sharer) !== own) captured = true;
  if (captured) a.sprites[r.index] = { ...own, index: freeImageIndex(d) };
}

function replaceOwnerImage(
  d: Doc,
  a: AnyAnimation,
  r: SpriteRef,
  s: Sprite,
  image: Uint8Array,
  geometry: Geometry,
  mode: ShareMode,
): void {
  const sharers = sharersOf(d, s);
  if (mode === 'only' && sharers.length) handImageToFirstSharer(d, s);
  else setSizes(d, sharers, geometry.width, geometry.height);
  a.sprites[r.index] = { ...a.sprites[r.index]!, ...geometry, image };
}

export interface PlacedImage {
  index: number;
  decoded: DecodedSprite;
  posX: number;
  posY: number;
}

/**
 * Writes several images into animation `animId` (sheet import). In 'all'
 * mode the first sprite of each shared image sets it; a later sprite of the
 * same image with other pixels gets its own image ('only') instead of
 * overwriting the first one's edit.
 */
export function replaceImages(d: Doc, animId: number, items: PlacedImage[], mode: ShareMode): void {
  const a = animationsOf(d).get(animId);
  if (!a) return;
  const owners = resolveSharedImages(animationsOf(d).values());
  const groups = items.map((it) => {
    const s = a.sprites[it.index]!;
    return (s.missing ? owners.get(s) : s) ?? s;
  });
  const written = new Map<Sprite, DecodedSprite>();
  items.forEach((it, k) => {
    let m = mode;
    if (mode === 'all') {
      const prev = written.get(groups[k]!);
      if (prev && !sameImage(prev, it.decoded)) m = 'only';
      else written.set(groups[k]!, it.decoded);
    }
    replaceImage(d, { animId, index: it.index }, it.decoded, m, { x: it.posX, y: it.posY });
  });
}

/**
 * Lowest image index no sprite in the file uses. Starts at 1 because openomf
 * never registers index 0 as a shared-image owner; falls back to 0, which no
 * sharer resolves to, when 1–255 are all taken.
 */
export function freeImageIndex(d: Doc): number {
  const used = new Set<number>();
  for (const a of animationsOf(d).values()) for (const s of a.sprites) used.add(s.index);
  for (let i = 1; i < 256; i++) if (!used.has(i)) return i;
  return 0;
}

export const stringLabel = (k: number): string =>
  k === 0 ? 'base string' : `extra string ${k - 1}`;

/** Frames of the base (string 0) and extra strings (1…) that show sprite `i`. */
export function framesShowing(a: AnyAnimation, i: number): { string: number; frame: number }[] {
  const frames: { string: number; frame: number }[] = [];
  [a.baseString, ...a.extraStrings].forEach((str, k) => {
    decodeScript(str).frames.forEach((f, n) => {
      if (spriteIndexOfFrame(f) === i) frames.push({ string: k, frame: n });
    });
  });
  return frames;
}

/**
 * Deletes sprite `i` of `a` in place: drops its collision points and the
 * frames showing it from the base and extra strings, and moves later letters
 * down by one. Strings it does not affect keep their exact text. Returns an
 * error and changes nothing when a string would lose every frame.
 */
export function deleteSpriteFrom(a: AnyAnimation, i: number): string | null {
  const order = a.sprites.map((_, k) => k).filter((k) => k !== i);
  const rewritten: string[] = [];
  for (const [k, str] of [a.baseString, ...a.extraStrings].entries()) {
    const sc = decodeScript(str);
    if (!sc.frames.some((f) => spriteIndexOfFrame(f) >= i)) {
      rewritten.push(str);
      continue;
    }
    const kept = { frames: sc.frames.filter((f) => spriteIndexOfFrame(f) !== i) };
    if (!kept.frames.length) return `The ${stringLabel(k)} only shows this sprite; change it first`;
    rewritten.push(encodeScript(remapSprites(kept, order)));
  }
  a.sprites = a.sprites.filter((_, k) => k !== i);
  a.hitCoords = a.hitCoords
    .filter((c) => c.spriteId !== i)
    .map((c) => (c.spriteId > i ? { ...c, spriteId: c.spriteId - 1 } : c));
  a.baseString = rewritten[0]!;
  a.extraStrings = rewritten.slice(1);
  return null;
}
