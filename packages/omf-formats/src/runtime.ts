// Script timing helpers mirroring openomf script.c, tick timing and script diagnostics.

import {
  SCRIPT_INT_MAX,
  SCRIPT_INT_MIN,
  scanScript,
  type DroppedSpan,
  type Frame,
  type Script,
  type ScriptNote,
} from './script';

// openomf adds durations as written, negative ones included.
export const totalTicks = (sc: Script): number => sc.frames.reduce((n, f) => n + f.duration, 0);

export function tickPosAtFrame(sc: Script, i: number): number {
  let pos = 0;
  for (let k = 0; k < i && k < sc.frames.length; k++) pos += sc.frames[k]!.duration;
  return pos;
}

export const tickLenAtFrame = (sc: Script, i: number): number => sc.frames[i]?.duration ?? 0;

/**
 * Frame active at `tick` (openomf script_get_frame_at: the first frame with
 * start ≤ tick < start + duration), with `tick` wrapping modulo totalTicks.
 * -1 when no frame covers it or the script is empty; 0 for a script whose
 * total is not positive but has frames, so there is something to show.
 */
export function frameIndexAtTick(sc: Script, tick: number): number {
  const total = totalTicks(sc);
  if (total <= 0) return sc.frames.length > 0 ? 0 : -1;
  const t = ((tick % total) + total) % total;
  let pos = 0;
  for (let i = 0; i < sc.frames.length; i++) {
    const next = pos + sc.frames[i]!.duration;
    if (pos <= t && t < next) return i;
    pos = next;
  }
  return -1;
}

export function frameAtTick(sc: Script, tick: number): Frame | undefined {
  return sc.frames[frameIndexAtTick(sc, tick)];
}

/** Sprite index a frame key names: 'A' is sprite 0. */
export const spriteIndexOfKey = (key: string): number => key.charCodeAt(0) - 65;
export const spriteIndexOfFrame = (f: Frame): number => spriteIndexOfKey(f.key);
/** Frame key of sprite `index` (0 → 'A'). Only A–Z are valid frame keys. */
export const spriteLetter = (index: number): string => String.fromCharCode(65 + index);

/**
 * undefined: tag absent; null: a tag without an argument. When a tag appears
 * twice the last one counts (openomf script_get_tag_by_id searches backwards).
 */
export function tagValue(f: Frame, name: string): number | null | undefined {
  const t = f.tags.findLast((x) => x.key === name);
  return t === undefined ? undefined : t.value;
}

/** Tick a `d N` re-entry seeks to (openomf player.c). */
export function reentryTick(sc: Script, n: number): number {
  return n >= 0 ? n + 1 : totalTicks(sc) + n;
}

export type TimingKind = 'arena' | 'static';

/** Game speed setting openomf starts with. */
export const DEFAULT_GAME_SPEED = 5;

/**
 * openomf game_state.c: in arenas 8 + 60 − (setting + 5) / 15 · 60 ms, that is
 * 48 − 4 · setting (setting 0–10, default 5 → 28 ms); other scenes STATIC_TICKS.
 */
export function msPerTick(kind: TimingKind, speed = DEFAULT_GAME_SPEED): number {
  if (kind === 'static') return 10;
  const s = Math.min(10, Math.max(0, Math.round(speed)));
  return 48 - s * 4;
}

// ------------------------------------------------------------ diagnostics

export type Severity = 'error' | 'warning' | 'info';

export interface ScriptDiagnostic {
  severity: Severity;
  message: string;
  /** Frame index, when the diagnostic is about one frame. */
  frame?: number;
  /** Character position in the string. */
  pos?: number;
}

const quote = (s: string): string => JSON.stringify(s);

function droppedDiagnostic(d: DroppedSpan): ScriptDiagnostic {
  const what = d.text.includes('\0')
    ? 'text after a NUL character'
    : d.separator
      ? `${quote(d.text)} after the frame (it skips one character there, normally '-')`
      : quote(d.text);
  return {
    severity: 'warning',
    message: `openomf drops ${what}`,
    pos: d.start,
    ...(d.frame !== undefined ? { frame: d.frame } : {}),
  };
}

function noteMessage(n: ScriptNote): string {
  if (n.kind === 'no-value') {
    const loop = n.tag === 'd' ? ', so the animation re-enters at tick 1 forever' : '';
    return `'${n.tag}' has no value; openomf reads 0${loop}`;
  }
  if (n.kind === 'no-duration') return 'frame has no duration; openomf reads 0';
  const v = Number(n.text.replace('+', ''));
  const read = v > 0 ? SCRIPT_INT_MAX : SCRIPT_INT_MIN;
  const what = n.tag ? `'${n.tag}' value` : 'duration';
  return `${what} ${n.text} is outside ${SCRIPT_INT_MIN}…${SCRIPT_INT_MAX}; openomf reads ${read}`;
}

/** Diagnostics for an animation string, including what openomf reads differently. */
export function lintScriptString(s: string, spriteCount: number): ScriptDiagnostic[] {
  const { script, dropped, notes } = scanScript(s);
  const out: ScriptDiagnostic[] = [];
  // "!" is the conventional "no string" marker.
  if (s !== '!') out.push(...dropped.map(droppedDiagnostic));
  for (const n of notes) {
    out.push({ frame: n.frame, pos: n.pos, severity: 'warning', message: noteMessage(n) });
  }
  out.push(...lintScript(script, spriteCount));
  return out;
}

export function lintScript(sc: Script, spriteCount: number): ScriptDiagnostic[] {
  const out: ScriptDiagnostic[] = [];
  sc.frames.forEach((f, i) => {
    const idx = spriteIndexOfFrame(f);
    // Shipped data does this often (Z is the conventional "draw nothing" frame,
    // and one-sprite block animations use A2-B2); the game draws nothing.
    if (f.key === 'Z' && idx >= spriteCount) {
      out.push({ severity: 'info', frame: i, message: 'frame Z draws nothing (convention)' });
    } else if (idx >= spriteCount) {
      out.push({
        severity: 'info',
        frame: i,
        message: `frame ${f.key} refers to a sprite that does not exist; nothing is drawn`,
      });
    }
    if (f.duration === 0) out.push({ severity: 'info', frame: i, message: 'zero-duration frame' });
    if (f.duration < 0) out.push({ severity: 'warning', frame: i, message: 'negative duration' });
    if (f.erratas.includes('LEADING_PLUS'))
      out.push({ severity: 'info', frame: i, message: "duration written with '+'" });
    if (f.erratas.includes('LEADING_ZERO'))
      out.push({ severity: 'info', frame: i, message: 'duration has a leading zero' });
    for (const t of f.tags) {
      if (t.erratas.includes('INVALID'))
        out.push({ severity: 'info', frame: i, message: `invalid tag '${t.key}'` });
      if (t.erratas.includes('LEADING_PLUS'))
        out.push({ severity: 'info', frame: i, message: `'${t.key}' value written with '+'` });
      if (t.erratas.includes('LEADING_ZERO'))
        out.push({ severity: 'info', frame: i, message: `'${t.key}' value has a leading zero` });
    }
  });
  return out;
}
