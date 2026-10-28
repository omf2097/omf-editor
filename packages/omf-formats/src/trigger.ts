// Move trigger strings (AF move_string), spec 18. Matching follows openomf har.c.

import { AF_MAX_MOVES, AF_MOVE_STRING_BYTES, type AFFile, type AFMove } from './af';
import { cp437Length } from './binary';
import { POSITION_CONSTRAINTS } from './enums';

export type TriggerButton = 'P' | 'K';

export type Trigger =
  | {
      kind: 'sequence';
      button: TriggerButton;
      /** Numpad directions in chronological order (oldest first), as the player enters them. */
      directions: string;
    }
  | { kind: 'special'; raw: string };

/** First id the game scans for input matches (ANIM_SCREW + 1). */
export const FIRST_INPUT_MOVE = 15;
/** Input buffer length (har inputs[10]). */
export const INPUT_BUFFER = 10;
/** Ticks allowed between two input changes of a sequence (har.c input_staleness). */
export const INPUT_WINDOW_TICKS = 9;

const SEQUENCE = /^[PK][1-9]*$/;

export function parseTrigger(raw: string): Trigger {
  if (!SEQUENCE.test(raw)) return { kind: 'special', raw };
  const button = raw[0] as TriggerButton;
  return { kind: 'sequence', button, directions: [...raw.slice(1)].reverse().join('') };
}

/** File form: button, then directions most recent first. */
export function formatTrigger(t: Trigger): string {
  if (t.kind === 'special') return t.raw;
  return t.button + [...t.directions].reverse().join('');
}

/** Conventional fighting-game notation, e.g. "236P". */
export function triggerNotation(t: Trigger): string {
  if (t.kind === 'special') return t.raw;
  return t.directions + t.button;
}

const ARROWS: Record<string, string> = {
  '1': '↙',
  '2': '↓',
  '3': '↘',
  '4': '←',
  '5': '•',
  '6': '→',
  '7': '↖',
  '8': '↑',
  '9': '↗',
};

export const directionArrow = (d: string): string => ARROWS[d] ?? d;

/** Mirror numpad directions for a HAR facing left. */
export function mirrorDirections(dirs: string): string {
  const m: Record<string, string> = { '1': '3', '3': '1', '4': '6', '6': '4', '7': '9', '9': '7' };
  return [...dirs].map((d) => m[d] ?? d).join('');
}

export type TriggerIssueKind =
  'duplicate' | 'shadowed' | 'unreachable-id' | 'too-long' | 'repeat' | 'invalid' | 'disabled';

export interface TriggerIssue {
  moveId: number;
  kind: TriggerIssueKind;
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** The other move involved (duplicate, shadowed). */
  otherId?: number;
}

const IN_ARENA_3 = POSITION_CONSTRAINTS.find((f) => f.name === 'IN_ARENA_3')!.bit;

/**
 * openomf (har.c) replaces the trigger of these moves with "!" on load, so they
 * never match: base string "A1", and the Fire Pit constraint IN_ARENA_3.
 */
export const isMoveDisabled = (m: Pick<AFMove, 'baseString' | 'posConstraint'>): boolean =>
  m.baseString === 'A1' || (m.posConstraint & IN_ARENA_3) !== 0;

/**
 * `inputs` is the buffer most recent first (file order), `button` the pressed
 * button. Returns the first move id 15..69 whose trigger matches, skipping
 * moves openomf disables and ignoring the chain rules (`is_move_chain_allowed`)
 * that the game also applies.
 */
export function matchMove(af: AFFile, button: TriggerButton, inputs: string): number | null {
  for (let id = FIRST_INPUT_MOVE; id < AF_MAX_MOVES; id++) {
    const m = af.moves.get(id);
    if (!m || isMoveDisabled(m)) continue;
    const s = m.moveString;
    if (s[0] !== button) continue;
    if (s.length === 1 || inputs.startsWith(s.slice(1))) return id;
  }
  return null;
}

function issue(
  moveId: number,
  kind: TriggerIssueKind,
  severity: TriggerIssue['severity'],
  message: string,
  otherId?: number,
): TriggerIssue {
  return otherId === undefined
    ? { moveId, kind, severity, message }
    : { moveId, kind, severity, otherId, message };
}

/** Problems of a sequence trigger on its own, for a move the game matches input for. */
function sequenceIssues(id: number, m: AFMove, directions: string): TriggerIssue[] {
  const out: TriggerIssue[] = [];
  if (directions.length > INPUT_BUFFER)
    out.push(issue(id, 'too-long', 'warning', `more than ${INPUT_BUFFER} directions never match`));
  if (/(.)\1/.test(directions)) {
    const message = 'repeated direction never matches (the game collapses repeats)';
    out.push(issue(id, 'repeat', 'warning', message));
  }
  if (m.baseString === 'A1')
    out.push(issue(id, 'disabled', 'info', 'openomf disables moves whose script is "A1"'));
  if (m.posConstraint & IN_ARENA_3)
    out.push(issue(id, 'disabled', 'info', 'openomf currently disables Fire Pit moves'));
  return out;
}

/**
 * The first lower-id move that matches whenever move `id` would: the same
 * trigger, or one whose directions are a prefix of `id`'s (matchMove scans
 * ids in ascending order and takes the first hit).
 */
function earlierMatch(af: AFFile, ids: number[], id: number, m: AFMove): TriggerIssue | null {
  const raw = m.moveString;
  for (const other of ids) {
    if (other >= id || other < FIRST_INPUT_MOVE) continue;
    const om = af.moves.get(other)!;
    // A disabled move never matches, so it shadows nothing.
    if (isMoveDisabled(om)) continue;
    const o = om.moveString;
    const duplicate = o === raw;
    const prefix = o[0] === raw[0] && SEQUENCE.test(o) && raw.slice(1).startsWith(o.slice(1));
    if (!duplicate && !prefix) continue;
    // Shipped fighters reuse triggers for moves the game tells apart by state
    // (standing, crouching, jumping) through category and chain rules. Only
    // the same category and constraints make a conflict likely.
    const sameContext = om.category === m.category && om.posConstraint === m.posConstraint;
    const what = duplicate
      ? `same trigger as move ${other}`
      : `move ${other} (${triggerNotation(parseTrigger(o))}) matches first`;
    return issue(
      id,
      duplicate ? 'duplicate' : 'shadowed',
      sameContext ? 'warning' : 'info',
      sameContext
        ? `${what} with the same category and constraints; chain rules may still allow this move`
        : `${what}; categories or constraints differ, so the game may still tell them apart`,
      other,
    );
  }
  return null;
}

export function analyzeTriggers(af: AFFile): TriggerIssue[] {
  const out: TriggerIssue[] = [];
  const ids = [...af.moves.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const m = af.moves.get(id)!;
    const raw = m.moveString;
    const t = parseTrigger(raw);
    if (cp437Length(raw) > AF_MOVE_STRING_BYTES)
      out.push(issue(id, 'invalid', 'error', `longer than ${AF_MOVE_STRING_BYTES} bytes`));
    if (t.kind !== 'sequence') {
      if (/^[PK]/.test(raw))
        out.push(issue(id, 'invalid', 'warning', 'only digits 1–9 can follow the button'));
      continue;
    }
    if (id < FIRST_INPUT_MOVE) {
      const message = `the game only matches input for moves ${FIRST_INPUT_MOVE}–69`;
      out.push(issue(id, 'unreachable-id', 'info', message));
      continue;
    }
    out.push(...sequenceIssues(id, m, t.directions));
    const shadow = earlierMatch(af, ids, id, m);
    if (shadow) out.push(shadow);
  }
  return out;
}

/**
 * Input buffer simulator for "Try it" (spec 18 §4), following har.c har_act:
 * every input adds its direction unless it repeats the newest entry; the
 * staleness of a press is the time since the buffer last changed, measured
 * before this input; when it exceeds 9 ticks only the newest entry counts.
 */
export class InputBuffer {
  /** Most recent first, as in the game. */
  private inputs = '';
  private changeTick = -Infinity;
  /** The direction held now: the last one entered. */
  private held = '5';

  /** One input; returns its staleness, measured before the buffer changes. */
  private add(direction: string, tick: number): number {
    const staleness = tick - this.changeTick;
    if (this.inputs[0] !== direction) {
      this.inputs = (direction + this.inputs).slice(0, INPUT_BUFFER);
      this.changeTick = tick;
    }
    return staleness;
  }

  /** A direction (numpad digit) without a button. */
  push(direction: string, tick: number): void {
    this.held = direction;
    this.add(direction, tick);
  }

  /**
   * A button press while holding `direction`: by default the last direction
   * entered is still held; pass '5' for a button pressed on its own, which
   * the game records as neutral.
   */
  press(af: AFFile, button: TriggerButton, tick: number, direction = this.held): number | null {
    const staleness = this.add(direction, tick);
    const inputs = staleness > INPUT_WINDOW_TICKS ? this.inputs.slice(0, 1) : this.inputs;
    const id = matchMove(af, button, inputs);
    // A match longer than the bare button clears the buffer (inputs[0] = 0).
    if (id !== null && (af.moves.get(id)?.moveString.length ?? 0) > 1) this.inputs = '';
    return id;
  }

  get buffer(): string {
    return this.inputs;
  }
}
