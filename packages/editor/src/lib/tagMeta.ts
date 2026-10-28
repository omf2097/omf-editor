// Editor-side description of the animation tags (labels, categories, argument
// kinds and ranges) from tag-meta.json; the tag set itself is @omf/formats TAGS.
// Spec 15 §2.
import META from '../tag-meta.json' with { type: 'json' };
import { TAGS } from '@omf/formats';
import { PREVIEWED_TAGS } from './simulate';
import { clamp } from './util';

export type ArgKind =
  | 'ticks'
  | 'pixels'
  | 'percent'
  | 'degrees'
  | 'animId'
  | 'soundIndex'
  | 'musicTrack'
  | 'paletteIndex'
  | 'count'
  | 'raw';
export type TagCategory =
  'position' | 'appearance' | 'combat' | 'chain' | 'spawn' | 'sound' | 'screen' | 'advanced';

export interface TagMeta {
  label: string;
  category: TagCategory;
  arg?: { kind: ArgKind; min?: number; max?: number; hex?: boolean; note?: string };
}

export const TAG_META = META as Record<string, TagMeta>;

export const CATEGORIES: { id: TagCategory; label: string }[] = [
  { id: 'position', label: 'Position' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'combat', label: 'Combat' },
  { id: 'chain', label: 'Chaining' },
  { id: 'spawn', label: 'Spawn' },
  { id: 'sound', label: 'Sound' },
  { id: 'screen', label: 'Screen' },
  { id: 'advanced', label: 'Advanced' },
];

/** openomf reads tag values as int16. */
export const ARG_MIN = -32768;
export const ARG_MAX = 32767;

export function tagInfo(key: string): {
  meta: TagMeta | undefined;
  desc: string;
  previewed: boolean;
} {
  return { meta: TAG_META[key], desc: TAGS[key]?.desc ?? '', previewed: PREVIEWED_TAGS.has(key) };
}

export const tagLabel = (key: string): string => TAG_META[key]?.label ?? key;

/** How an errata (a spelling openomf reads but the canonical form does not use) is shown. */
export const errataText = (e: string): string =>
  ({ LEADING_PLUS: 'written with +', LEADING_ZERO: 'leading zero', INVALID: 'invalid' })[e] ?? e;

/** Value a newly added tag gets: none without an argument, else its minimum but not below 0. */
export function defaultTagValue(key: string): number | null {
  const arg = TAG_META[key]?.arg;
  return arg ? Math.max(arg.min ?? 0, 0) : null;
}

/** Tags whose value can be set by dragging on the canvas (pixel positions and offsets). */
export const DRAG_TAGS: ReadonlySet<string> = new Set([
  'x+',
  'x-',
  'x=',
  'y+',
  'y-',
  'y=',
  'ox',
  'oy',
]);

/**
 * Value of a drag tag moved (dx, dy) scene pixels from `start`: x tags follow
 * the horizontal movement, y tags the vertical, and x- / y- run against it.
 * Stays inside the tag's range; x+ y+ x- y- are distances, never negative.
 */
export function draggedTagValue(key: string, start: number, dx: number, dy: number): number {
  const horizontal = key.startsWith('x') || key === 'ox';
  const sign = key === 'x-' || key === 'y-' ? -1 : 1;
  const v = start + sign * (horizontal ? dx : dy);
  const arg = TAG_META[key]?.arg;
  const min = arg?.min ?? ARG_MIN;
  const lo = key.endsWith('+') || key.endsWith('-') ? Math.max(0, min) : min;
  return clamp(v, lo, arg?.max ?? ARG_MAX);
}
