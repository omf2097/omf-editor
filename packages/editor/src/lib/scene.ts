// Scene geometry shared by the canvas, overlays and hit testing.
//
// Coordinate systems: the scene is the 320×200 game screen. An animation is
// drawn relative to its origin (the object position): a sprite's top-left is
// origin + (pos_x, pos_y), collision points are origin + (x, y). Facing left
// mirrors both around the origin; stored values stay unflipped.

import type { HitCoord, Sprite } from '@omf/formats';
import type { AnyAnimation, DocKind } from './doc';
import { clamp } from './util';

/** openomf ARENA_FLOOR; AF previews stand the HAR in the middle of the arena. */
export const ARENA_FLOOR = 190;
export const AF_ORIGIN_X = 160;

export interface Point {
  x: number;
  y: number;
}

export interface OriginOptions {
  /** AF only: centre the animation's sprites in the scene instead of standing on the arena floor. */
  centred?: boolean;
  facingLeft?: boolean;
}

/**
 * Scene position of the animation origin before any script movement. BK
 * animations use start_x/start_y as scene coordinates. AF moves are relative
 * to the HAR, which the preview stands at (160, ARENA_FLOOR) on the arena
 * floor; with `centred` it places the sprites' bounding box in the middle of
 * the scene instead.
 */
export function animationOrigin(
  kind: DocKind,
  a: Pick<AnyAnimation, 'startX' | 'startY'> & { sprites?: readonly Sprite[] },
  o: OriginOptions = {},
): Point {
  if (kind !== 'af') return { x: a.startX, y: a.startY };
  const box = o.centred && a.sprites ? spritesBox(a.sprites) : null;
  if (!box) return { x: AF_ORIGIN_X + a.startX, y: ARENA_FLOOR + a.startY };
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return {
    x: Math.round(SCENE_CENTRE_X + (o.facingLeft ? cx : -cx)) + a.startX,
    y: Math.round(SCENE_CENTRE_Y - cy) + a.startY,
  };
}

const SCENE_CENTRE_X = 160;
const SCENE_CENTRE_Y = 100;
/** The game screen (canvas/render's SCENE_W × SCENE_H; lib does not import canvas). */
const SCENE_W = 320;
const SCENE_H = 200;

/**
 * Union of all sprite rectangles relative to the origin (facing right), or
 * null when all are empty. A sprite with no image bytes of its own that is
 * not shared is invisible in openomf (a 1×1 blank), so its header size, often
 * garbage such as 60537×60537, is ignored.
 */
export function spritesBox(
  sprites: readonly Sprite[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let box: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const s of sprites) {
    if (s.width <= 0 || s.height <= 0 || (!s.missing && s.image.length === 0)) continue;
    const r = { minX: s.posX, minY: s.posY, maxX: s.posX + s.width, maxY: s.posY + s.height };
    box = box
      ? {
          minX: Math.min(box.minX, r.minX),
          minY: Math.min(box.minY, r.minY),
          maxX: Math.max(box.maxX, r.maxX),
          maxY: Math.max(box.maxY, r.maxY),
        }
      : r;
  }
  return box;
}

/** Free space around the sprites in the Centred preview, per side, in scene pixels. */
export const CENTRED_MARGIN = 8;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Stage of the Centred preview (spec 12 §9): the camera follows the object,
 * so the object is drawn at a fixed stage point whatever the script movement.
 * Coordinates are stage pixels.
 */
export interface CentredStage {
  /** Stage size: at least the scene, larger when the frame does not fit in it. */
  width: number;
  height: number;
  /** Where the object (origin plus script movement) is drawn. */
  object: Point;
  /** What the preview fits: every sprite of the animation plus the margin. */
  frame: Rect;
}

/**
 * The Centred stage of an animation, or null when it has no drawable sprite
 * (the preview then keeps the scene framing). The frame is the union of all
 * sprite rectangles around the object (spritesBox, mirrored when facing
 * left), so neither its position nor its size changes between frames; the
 * object is placed so that the frame is centred on the stage.
 */
export function centredStage(
  sprites: readonly Sprite[],
  facingLeft: boolean,
  margin = CENTRED_MARGIN,
): CentredStage | null {
  const box = spritesBox(sprites);
  if (!box) return null;
  // Facing left a sprite covers [-(posX + w), -posX] (spriteRect).
  const minX = facingLeft ? -box.maxX : box.minX;
  const maxX = facingLeft ? -box.minX : box.maxX;
  const fw = maxX - minX + 2 * margin;
  const fh = box.maxY - box.minY + 2 * margin;
  const width = Math.max(SCENE_W, fw);
  const height = Math.max(SCENE_H, fh);
  const object = {
    x: Math.round(width / 2 - (minX + maxX) / 2),
    y: Math.round(height / 2 - (box.minY + box.maxY) / 2),
  };
  return {
    width,
    height,
    object,
    frame: { x: object.x + minX - margin, y: object.y + box.minY - margin, width: fw, height: fh },
  };
}

/**
 * Whole-pixel shift from scene to stage coordinates that draws the object at
 * `stage.object`: stage = scene + shift. The object position is rounded as
 * spriteRect and hitPoint round it, so sprites and points land on the same
 * stage pixels on every tick, however fractional the movement.
 */
export function cameraShift(stage: Pick<CentredStage, 'object'>, objectPos: Point): Point {
  return {
    x: stage.object.x - Math.round(objectPos.x),
    y: stage.object.y - Math.round(objectPos.y),
  };
}

export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
  flipX: boolean;
}

/**
 * Where a sprite is drawn for an object at `pos`. Facing left mirrors around
 * the object position (openomf: x = pos.x - sprite.pos.x - w).
 */
export function spriteRect(
  s: Sprite,
  pos: Point,
  facingLeft: boolean,
  w = s.width,
  h = s.height,
): SpriteRect {
  return facingLeft
    ? { x: Math.round(pos.x - s.posX - w), y: Math.round(pos.y + s.posY), w, h, flipX: true }
    : { x: Math.round(pos.x + s.posX), y: Math.round(pos.y + s.posY), w, h, flipX: false };
}

/** Scene position of a collision point (intersect.c: relative to the object, mirrored when facing left). */
export function hitPoint(c: HitCoord, pos: Point, facingLeft: boolean): Point {
  return { x: Math.round(pos.x + (facingLeft ? -c.x : c.x)), y: Math.round(pos.y + c.y) };
}

/** Inverse of hitPoint: stored value for a scene position. */
export function hitFromScene(p: Point, pos: Point, facingLeft: boolean): { x: number; y: number } {
  const dx = p.x - pos.x;
  return { x: facingLeft ? -dx : dx, y: p.y - pos.y };
}

/** Collision point x/y are signed 10-bit in the file (spec 14 §1). */
export const HIT_MIN = -512;
export const HIT_MAX = 511;
export const clampHit = (v: number): number => clamp(Math.round(v), HIT_MIN, HIT_MAX);

/**
 * Index of the point of `spriteId` nearest to scene position `p` within
 * `radius` pixels (Chebyshev distance), or null. Later points win ties, so the
 * one drawn on top is picked.
 */
export function nearestHit(
  hitCoords: readonly HitCoord[],
  spriteId: number,
  p: Point,
  origin: Point,
  facingLeft: boolean,
  radius = 4,
): number | null {
  let best: number | null = null;
  let bestD = radius;
  hitCoords.forEach((c, i) => {
    if (c.spriteId !== spriteId) return;
    const q = hitPoint(c, origin, facingLeft);
    const d = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y));
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
