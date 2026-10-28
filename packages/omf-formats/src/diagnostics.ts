// Document-level diagnostics: openomf limits and broken references (spec 05–07, 12 §8).

import { LIMITS, resolveSharedImages, type Animation } from './animation';
import {
  AF_ENEMY_STRING_MAX,
  AF_MOVE_STRING_BYTES,
  sortedMap,
  type AFFile,
  type AFMove,
} from './af';
import { BK_FOOTER_STRING_MAX, BK_MAX_PALETTES, type BKFile } from './bk';
import { cp437Length } from './binary';
import { lintScriptString, type Severity } from './runtime';
import type { Sprite } from './sprite';

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** Animation / move id. */
  animation?: number;
  /** Sprite index within the animation. */
  sprite?: number;
  /** Frame index in the base string. */
  frame?: number;
  /** Hit coordinate index. */
  hitCoord?: number;
  /** Which string: 'base', 'extra:N', 'footer', 'enemy', 'move'. */
  field?: string;
  /** Character position in a script string. */
  pos?: number;
  /** openomf refuses or crashes on files with this problem, so the editor will not save them. */
  blocksSave?: boolean;
}

/** Lints every frame key against 26 sprites: the enemy string drives the opponent's animation. */
const ANY_SPRITE = 26;

/** A string's byte limit, or that it cannot be written at all. */
function stringDiagnostic(
  at: Pick<Diagnostic, 'animation'>,
  field: string,
  label: string,
  s: string,
  max: number,
): Diagnostic | null {
  const n = cp437Length(s);
  if (n < 0)
    return {
      ...at,
      field,
      severity: 'error',
      blocksSave: true,
      message: `${label} has characters outside cp437; it cannot be saved`,
    };
  if (n > max)
    return {
      ...at,
      field,
      severity: 'error',
      blocksSave: true,
      message: `${label} longer than ${max} bytes; openomf refuses the file`,
    };
  return null;
}

function animationDiagnostics(id: number, a: Animation, owners: Map<Sprite, Sprite>): Diagnostic[] {
  const out: Diagnostic[] = [];
  const at = { animation: id };
  const push = (d: Diagnostic | null): void => {
    if (d) out.push(d);
  };
  push(stringDiagnostic(at, 'base', 'base string', a.baseString, LIMITS.baseString));
  if (a.extraStrings.length > LIMITS.extraStrings) {
    out.push({
      ...at,
      severity: 'error',
      blocksSave: true,
      message: `more than ${LIMITS.extraStrings} extra strings; openomf refuses the file`,
    });
  }
  a.extraStrings.forEach((s, i) => {
    push(stringDiagnostic(at, `extra:${i}`, `extra string ${i}`, s, LIMITS.extraString));
    for (const d of lintScriptString(s, a.sprites.length))
      out.push({ ...at, field: `extra:${i}`, ...d });
  });
  if (a.hitCoords.length > LIMITS.hitCoordsOpenomf) {
    out.push({
      ...at,
      severity: 'error',
      blocksSave: true,
      message: `more than ${LIMITS.hitCoordsOpenomf} collision points; openomf refuses the file`,
    });
  }
  a.hitCoords.forEach((c, i) => {
    if (c.spriteId >= a.sprites.length) {
      out.push({
        ...at,
        hitCoord: i,
        severity: 'warning',
        message: `collision point ${i} belongs to sprite ${c.spriteId}, which does not exist`,
      });
    }
  });
  a.sprites.forEach((s, i) => {
    if (!s.missing || owners.has(s)) return;
    out.push({
      ...at,
      sprite: i,
      severity: 'error',
      blocksSave: true,
      message:
        s.index === 0
          ? `shared sprite ${i} uses image index 0, which the game never shares; openomf crashes on it`
          : `shared sprite ${i} has no earlier sprite with index ${s.index}; openomf crashes on it`,
    });
  });
  for (const d of lintScriptString(a.baseString, a.sprites.length))
    out.push({ ...at, field: 'base', ...d });
  return out;
}

/** The AF-only fields of a move: enemy string, move string, links to other moves. */
function moveDiagnostics(id: number, m: AFMove, moves: Map<number, AFMove>): Diagnostic[] {
  const out: Diagnostic[] = [];
  const at = { animation: id };
  const enemy = stringDiagnostic(at, 'enemy', 'enemy string', m.enemyString, AF_ENEMY_STRING_MAX);
  if (enemy) out.push(enemy);
  // The enemy string is an animation string the opponent plays.
  for (const d of lintScriptString(m.enemyString, ANY_SPRITE))
    out.push({ ...at, field: 'enemy', ...d });
  if (m.nextAnimationId !== 0 && !moves.has(m.nextAnimationId)) {
    out.push({
      ...at,
      severity: 'warning',
      message: `next_animation_id ${m.nextAnimationId} does not exist`,
    });
  }
  // 11 shipped moves point successor_id at missing ids, so its meaning is not settled.
  if (m.successorId !== 0 && !moves.has(m.successorId)) {
    out.push({ ...at, severity: 'info', message: `successor_id ${m.successorId} does not exist` });
  }
  // Only the cp437 check: analyzeTriggers reports a move string that is too long.
  const move = stringDiagnostic(at, 'move', 'move string', m.moveString, AF_MOVE_STRING_BYTES);
  if (move && cp437Length(m.moveString) < 0) out.push(move);
  return out;
}

function afDiagnostics(af: AFFile): Diagnostic[] {
  const out: Diagnostic[] = [];
  // Sharing follows file order, which is ascending id whatever order the map has.
  const moves = sortedMap(af.moves);
  const owners = resolveSharedImages(moves.values());
  for (const [id, m] of moves) {
    out.push(...animationDiagnostics(id, m, owners));
    out.push(...moveDiagnostics(id, m, af.moves));
  }
  return out;
}

function bkDiagnostics(bk: BKFile): Diagnostic[] {
  const out: Diagnostic[] = [];
  const animations = sortedMap(bk.animations);
  const owners = resolveSharedImages(animations.values());
  for (const [id, a] of animations) {
    out.push(...animationDiagnostics(id, a, owners));
    const footer = stringDiagnostic(
      { animation: id },
      'footer',
      'footer string',
      a.footerString,
      BK_FOOTER_STRING_MAX,
    );
    if (footer) out.push(footer);
  }
  if (bk.backgroundWidth !== 320 || bk.backgroundHeight !== 200) {
    out.push({
      severity: 'info',
      message: `background is ${bk.backgroundWidth}×${bk.backgroundHeight}; every shipped scene is 320×200`,
    });
  }
  if (bk.palettes.length === 0)
    out.push({ severity: 'warning', message: 'no palettes; the scene renders black' });
  if (bk.palettes.length > BK_MAX_PALETTES) {
    out.push({
      severity: 'error',
      blocksSave: true,
      message: `${bk.palettes.length} palettes; openomf holds at most ${BK_MAX_PALETTES} and overflows on load`,
    });
  }
  bk.palettes.forEach((p, i) => {
    if (p.colors.colors.some((c) => c.some((v) => v > 63))) {
      out.push({
        severity: 'warning',
        message: `palette ${i} has colour components above 63; the game keeps only 6 bits`,
      });
    }
  });
  return out;
}

/** Every diagnostic for a document, in id order. Those with `blocksSave` stop the editor saving. */
export function documentDiagnostics(doc: AFFile | BKFile): Diagnostic[] {
  return 'moves' in doc ? afDiagnostics(doc) : bkDiagnostics(doc);
}
