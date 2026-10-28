// The paired enemy-string preview (spec 15 §6.1): the attacker plays its base
// string and the opponent plays the enemy string, timed and placed as openomf
// would. Pure; useOpponent / useEnemyScene put it on the canvas.

import {
  spriteIndexOfFrame,
  tagValue,
  tickPosAtFrame,
  type HitCoord,
  type Script,
  type Sprite,
} from '@omf/formats';
import { ARENA_FLOOR, AF_ORIGIN_X, spritesBox, type Point } from './scene';

/** Origin-to-origin distance of the two fighters in the paired preview, in scene pixels. */
export const DEFAULT_PAIR_DISTANCE = 60;
export const MAX_PAIR_DISTANCE = 300;

/** First frame of the attacker's string with `ua` (forces the opponent into move 9), or -1. */
export function uaFrame(base: Script): number {
  return base.frames.findIndex((f) => tagValue(f, 'ua') !== undefined);
}

/** First frame whose sprite has collision points (the frame that can hit), or 0. */
export function firstHitFrame(base: Script, hitCoords: readonly HitCoord[]): number {
  const withPoints = new Set(hitCoords.map((c) => c.spriteId));
  const i = base.frames.findIndex((f) => withPoints.has(spriteIndexOfFrame(f)));
  return Math.max(0, i);
}

export interface PairTiming {
  /** Attacker frame the opponent starts on: the `ua` frame, or the chosen hit frame. */
  frame: number;
  /** True when the start is a `ua` frame (a throw). */
  throw: boolean;
  /** Attacker reader tick at that frame. */
  attackerStart: number;
  /** Enemy string reader tick the opponent starts on. */
  enemyStart: number;
}

/**
 * When the opponent starts. A `ua` frame forces the opponent into move 9 with
 * the enemy string and seeks its reader to the attacker's tick (player.c
 * ~688–697), so both strings run on the same tick from there and the enemy
 * string's earlier ticks never play. A hit (har_take_damage) starts the enemy
 * string from its beginning when the attacker's frame `hitFrame` connects
 * (default: the first frame with collision points).
 */
export function pairTiming(
  base: Script,
  hitCoords: readonly HitCoord[],
  hitFrame: number | null,
): PairTiming {
  const ua = uaFrame(base);
  if (ua >= 0) {
    const t = tickPosAtFrame(base, ua);
    return { frame: ua, throw: true, attackerStart: t, enemyStart: t };
  }
  const n = base.frames.length;
  const f =
    hitFrame === null ? firstHitFrame(base, hitCoords) : Math.min(Math.max(0, hitFrame), n - 1);
  const frame = Math.max(0, f);
  return {
    frame,
    throw: false,
    attackerStart: n ? tickPosAtFrame(base, frame) : 0,
    enemyStart: 0,
  };
}

/**
 * The attacker's reader tick while the opponent's reader is on `enemyTick`:
 * both advance one tick per game tick. During the wait before the opponent
 * starts the opponent's tick runs from enemyStart - attackerStart, so this
 * covers the attacker's whole lead-in.
 */
export function attackerTickAt(enemyTick: number, t: PairTiming): number {
  return enemyTick - t.enemyStart + t.attackerStart;
}

/**
 * The attacker's state while the opponent's reader is on tick `enemyTick`,
 * from its states by reader tick (Simulator.statesByTick), held on the last
 * one after its string ends.
 */
export function attackerStateAt<T>(
  states: readonly T[],
  enemyTick: number,
  t: PairTiming,
): T | null {
  if (states.length === 0) return null;
  return states[Math.min(Math.max(0, attackerTickAt(enemyTick, t)), states.length - 1)]!;
}

/**
 * For the opponent's `e` tag (SimOptions.enemyAt): the attacker's position at
 * the opponent's reader tick, as an offset from the opponent's origin.
 */
export function attackerOffset(
  states: readonly { x: number; y: number }[],
  t: PairTiming,
  origins: { attacker: Point; opponent: Point },
): (enemyTick: number) => Point | null {
  return (enemyTick) => {
    const st = attackerStateAt(states, enemyTick, t);
    if (!st) return null;
    return {
      x: origins.attacker.x + st.x - origins.opponent.x,
      y: origins.attacker.y + st.y - origins.opponent.y,
    };
  };
}

type Placed = { startX: number; startY: number; sprites: readonly Sprite[] };

/**
 * Origins of the two fighters before any script movement. They stand on the
 * arena floor `distance` apart around the scene centre, the attacker on the
 * side it faces away from. `centred` (no arena drawn) shifts both together so
 * the union of their sprites is centred in the scene, as a single animation
 * is (animationOrigin).
 */
export function pairOrigins(
  attacker: Placed,
  opponent: Placed,
  o: { distance: number; facingLeft: boolean; centred: boolean },
): { attacker: Point; opponent: Point } {
  const dir = o.facingLeft ? -1 : 1;
  const half = Math.round(o.distance / 2);
  let a = { x: AF_ORIGIN_X - dir * half + attacker.startX, y: ARENA_FLOOR + attacker.startY };
  let b = {
    x: AF_ORIGIN_X + dir * (o.distance - half) + opponent.startX,
    y: ARENA_FLOOR + opponent.startY,
  };
  if (o.centred) {
    const boxes = [
      sceneBox(attacker.sprites, a, o.facingLeft),
      sceneBox(opponent.sprites, b, !o.facingLeft),
    ].filter((x) => x !== null);
    if (boxes.length) {
      const minX = Math.min(...boxes.map((x) => x.minX));
      const maxX = Math.max(...boxes.map((x) => x.maxX));
      const minY = Math.min(...boxes.map((x) => x.minY));
      const maxY = Math.max(...boxes.map((x) => x.maxY));
      const dx = Math.round(160 - (minX + maxX) / 2);
      const dy = Math.round(100 - (minY + maxY) / 2);
      a = { x: a.x + dx, y: a.y + dy };
      b = { x: b.x + dx, y: b.y + dy };
    }
  }
  return { attacker: a, opponent: b };
}

function sceneBox(sprites: readonly Sprite[], at: Point, facingLeft: boolean) {
  const box = spritesBox(sprites);
  if (!box) return null;
  return {
    minX: at.x + (facingLeft ? -box.maxX : box.minX),
    maxX: at.x + (facingLeft ? -box.minX : box.maxX),
    minY: at.y + box.minY,
    maxY: at.y + box.maxY,
  };
}
