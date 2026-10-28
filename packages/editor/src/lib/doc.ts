// Editor-side helpers over the @omf/formats document model.

import {
  AF_MOVE_NAMES,
  BK_ANIMATION_NAMES,
  HAR_NAMES,
  readAF,
  readBK,
  writeAF,
  writeBK,
  type AFFile,
  type AFMove,
  type Animation,
  type BKAnimation,
  type BKFile,
  type HitCoord,
  type PaletteMapping,
  type Sprite,
} from '@omf/formats';

export type Doc = AFFile | BKFile;
export type DocKind = 'af' | 'bk';
export type AnyAnimation = AFMove | BKAnimation;

export const isAF = (d: Doc): d is AFFile => 'moves' in d;
export const kindOf = (d: Doc): DocKind => (isAF(d) ? 'af' : 'bk');

export function animationsOf(d: Doc): Map<number, AnyAnimation> {
  return isAF(d) ? d.moves : d.animations;
}

export const maxAnimations = (k: DocKind): number => (k === 'af' ? 70 : 50);

export function animationName(kind: DocKind, id: number): string | undefined {
  return kind === 'af' ? AF_MOVE_NAMES[id] : BK_ANIMATION_NAMES[id];
}

export function animationLabel(kind: DocKind, id: number): string {
  return animationName(kind, id) ?? `${kind === 'af' ? 'Move' : 'Anim'} ${id}`;
}

export function docTitle(d: Doc): string {
  if (isAF(d)) return HAR_NAMES[d.fighterId] ?? `Fighter ${d.fighterId}`;
  return 'Scene';
}

/** Parses bytes, by extension first, then by trying both readers. */
export function parseDocument(name: string, bytes: Uint8Array): Doc {
  const ext = name.toLowerCase().split('.').pop();
  const order = ext === 'bk' ? [readBK, readAF] : [readAF, readBK];
  let first: unknown;
  for (const read of order) {
    try {
      return read(bytes);
    } catch (e) {
      first ??= e;
    }
  }
  throw first;
}

export function serializeDocument(d: Doc): Uint8Array {
  return isAF(d) ? writeAF(d) : writeBK(d);
}

// ------------------------------------------------------------- cloning

const cloneHit = (c: HitCoord): HitCoord => ({ ...c });
// Sprite images are immutable by convention and shared between snapshots.
const cloneSprite = (s: Sprite): Sprite => ({ ...s });

function cloneAnimation<A extends Animation>(a: A): A {
  return {
    ...a,
    hitCoords: a.hitCoords.map(cloneHit),
    extraStrings: [...a.extraStrings],
    sprites: a.sprites.map(cloneSprite),
  };
}

function clonePaletteMapping(p: PaletteMapping): PaletteMapping {
  // Remap tables are immutable by convention; colours are small and copied.
  return {
    colors: { colors: p.colors.colors.map((c) => [c[0], c[1], c[2]]) },
    remaps: [...p.remaps],
  };
}

/**
 * Copies every object, array and Map but shares the large typed arrays
 * (sprite images, background, remap tables, raw move strings), which are
 * never written in place (spec 11).
 */
export function cloneDoc<T extends Doc>(d: T): T {
  if (isAF(d)) {
    const moves = new Map<number, AFMove>();
    for (const [id, m] of d.moves) moves.set(id, cloneAnimation(m));
    return { ...d, moves, soundTable: [...d.soundTable] } as T;
  }
  const animations = new Map<number, BKAnimation>();
  for (const [id, a] of d.animations) animations.set(id, cloneAnimation(a));
  return {
    ...d,
    animations,
    palettes: d.palettes.map(clonePaletteMapping),
    soundTable: [...d.soundTable],
  } as T;
}
