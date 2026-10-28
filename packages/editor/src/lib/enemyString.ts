// What the opponent plays when a move's enemy string is used (spec 15 §6.1).
//
// The enemy string (openomf footer_string) is an animation string for the
// OPPONENT: on a hit openomf switches the opponent to its own move 9 (Damage)
// and replaces that animation's script with it, so its frame letters are
// sprites of the opponent's move 9. har_take_damage (game/objects/har.c
// ~966–1030) changes the string by the opponent's state; these are those code
// paths, kept as data so the editor can show and preview each one.

import { tagValue, type Script } from '@omf/formats';

/** Appended for an airborne opponent (har.c "airborne knockback"). */
export const AIRBORNE_SUFFIX = '-L2-M5-L2';
/** Appended instead when that airborne hit stuns or KOs: the opponent lands stunned. */
export const AIRBORNE_STUN_SUFFIX = '-L3-M5000';
/** Grounded stun or KO: replaces the last frame ("taken from MASTER.DAT" in har.c). */
export const GROUNDED_STUN_SUFFIX = '-x-20ox-20L1-ox-20L2-x-20zzs4l25sp13M1-zzM2';
/** Grounded launch (attacker frame has `ai`, move is not a projectile): replaces the string. */
export const LAUNCH_STRING = 'A1-s01l50B2-C2-L5-M400';

/** MoveCategory PROJECTILE: openomf never launches with a projectile. */
const CAT_PROJECTILE = 8;

/** Where the opponent is when hit; `launch` is har.c's grounded launch. */
export type EnemyPosition = 'standing' | 'airborne' | 'launch';

export interface EnemyVariant {
  position: EnemyPosition;
  /** The hit stuns (endurance at its maximum) or KOs (health at 0). */
  stun: boolean;
}

export const STANDING: EnemyVariant = { position: 'standing', stun: false };

/**
 * The string openomf plays, split for display: `kept` of the enemy string,
 * then `removed` (dropped), then `added` (openomf's own text). `text` is
 * kept + added; empty when the move has no hit animation.
 */
export interface EffectiveEnemyString {
  text: string;
  kept: string;
  removed: string;
  added: string;
}

/**
 * har_take_damage's choice of string. Order as in har.c: an empty string is
 * no hit animation at all (Chronos' stasis, ~970); a launch replaces the
 * whole string (~985); an airborne opponent gets a suffix (~991); a grounded
 * stun or KO keeps the string up to its last '-' and appends the fall
 * (~1009). Anything else plays the string as is.
 */
export function effectiveEnemyString(s: string, v: EnemyVariant): EffectiveEnemyString {
  if (s === '') return { text: '', kept: '', removed: '', added: '' };
  if (v.position === 'launch')
    return { text: LAUNCH_STRING, kept: '', removed: s, added: LAUNCH_STRING };
  if (v.position === 'airborne') {
    const added = v.stun ? AIRBORNE_STUN_SUFFIX : AIRBORNE_SUFFIX;
    return { text: s + added, kept: s, removed: '', added };
  }
  if (!v.stun) return { text: s, kept: s, removed: '', added: '' };
  // str_last_of + str_from_slice(0, last): the last '-' and what follows go.
  // Without a '-' (or with one only at 0) the slice is empty; openomf asserts
  // start < end there, so a debug build would abort on a one-frame string.
  const last = s.lastIndexOf('-');
  const kept = last > 0 ? s.slice(0, last) : '';
  return {
    text: kept + GROUNDED_STUN_SUFFIX,
    kept,
    removed: s.slice(kept.length),
    added: GROUNDED_STUN_SUFFIX,
  };
}

/**
 * Frames of the attacker's string that would launch the opponent (they carry
 * `ai`); none for a projectile move, which openomf never launches with.
 */
export function launchFrames(base: Script, category: number): number[] {
  if (category === CAT_PROJECTILE) return [];
  return base.frames.flatMap((f, i) => (tagValue(f, 'ai') !== undefined ? [i] : []));
}
