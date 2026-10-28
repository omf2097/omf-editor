// Animation string parser and encoder (spec 08). Parsing follows openomf
// formats/script.c exactly; the spelling of every frame and the text openomf
// drops are kept, so an unedited string is written back byte for byte.

import TAG_TABLE from './tags.json' with { type: 'json' };

export type Errata = 'LEADING_ZERO' | 'LEADING_PLUS' | 'INVALID';

export interface Tag {
  key: string;
  /** null for tags without an argument; 0 when an argument tag has no digits (openomf). */
  value: number | null;
  erratas: Errata[];
}

export interface Frame {
  /** Sprite letter, A = sprite 0. */
  key: string;
  duration: number;
  tags: Tag[];
  erratas: Errata[];
  /**
   * Source spelling of the tags, key and duration. Written back while it still
   * parses to this frame; editing operations drop it.
   */
  raw?: string;
  /**
   * The character openomf skipped after the duration when it was not the
   * usual one ('-' between frames, nothing at the end).
   */
  sep?: string;
  /** Text before this frame that openomf drops (frames it cannot parse, stray '-'). */
  dropped?: string;
}

export interface Script {
  frames: Frame[];
  /** Text after the last frame that openomf drops. */
  trailing?: string;
}

export interface TagInfo {
  arg: boolean;
  desc: string;
}

export const TAGS: Readonly<Record<string, TagInfo>> = TAG_TABLE.tags;
export const INVALID_TAGS: readonly string[] = TAG_TABLE.invalid;

export const isValidTag = (t: string): boolean => Object.hasOwn(TAGS, t);
export const tagHasArg = (t: string): boolean => (isValidTag(t) ? TAGS[t]!.arg : false);
export const isInvalidTag = (t: string): boolean => INVALID_TAGS.includes(t);
export const tagDescription = (t: string): string => (isValidTag(t) ? TAGS[t]!.desc : '');

/** openomf reads durations and tag values as int16 and clamps to this range. */
export const SCRIPT_INT_MIN = -32768;
export const SCRIPT_INT_MAX = 32767;

export const clampScriptInt = (v: number): number =>
  Number.isNaN(v) ? 0 : Math.min(SCRIPT_INT_MAX, Math.max(SCRIPT_INT_MIN, Math.trunc(v))) + 0;

const isUpper = (c: string | undefined): boolean => c !== undefined && c >= 'A' && c <= 'Z';
const isLower = (c: string | undefined): boolean => c !== undefined && c >= 'a' && c <= 'z';
const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';
const isValueStart = (c: string | undefined): boolean => isDigit(c) || c === '-' || c === '+';

// ------------------------------------------------------------ scanner

interface LongRead {
  value: number;
  end: number;
  /** False when no digits followed (openomf then reads 0). */
  digits: boolean;
  /** The written number was outside int16. */
  clamped: boolean;
  erratas: Errata[];
}

/** sstream_read_long: optional sign, digits, clamped to int16; 0 without digits. */
function readLong(s: string, pos: number): LongRead {
  let i = pos;
  let sign = 1;
  let plus = false;
  if (s[i] === '-') {
    sign = -1;
    i++;
  } else if (s[i] === '+') {
    plus = true;
    i++;
  }
  const d0 = i;
  while (isDigit(s[i])) i++;
  if (i === d0) return { value: 0, end: i, digits: false, clamped: false, erratas: [] };
  const digits = s.slice(d0, i);
  const erratas: Errata[] = [];
  if (plus) erratas.push('LEADING_PLUS');
  if (digits.length > 1 && digits[0] === '0') erratas.push('LEADING_ZERO');
  const exact = sign * Number(digits);
  const value = clampScriptInt(exact);
  return { value, end: i, digits: true, clamped: value !== exact + 0, erratas };
}

/** Something openomf reads differently from what is written, for diagnostics. */
export interface ScriptNote {
  kind: 'clamped' | 'no-value' | 'no-duration';
  /** Frame index the note belongs to. */
  frame: number;
  /** Tag name; absent for the duration. */
  tag?: string;
  pos: number;
  /** Source text of the number. */
  text: string;
}

/** A run of text openomf skips, with its position. */
export interface DroppedSpan {
  start: number;
  text: string;
  /** Index of the frame the text precedes or, for a skipped separator, follows. */
  frame?: number;
  /** A character skipped in place of the '-' after a frame. */
  separator?: boolean;
}

export interface ScriptScan {
  script: Script;
  dropped: DroppedSpan[];
  notes: ScriptNote[];
}

interface TagRead {
  tag: Tag;
  end: number;
  read?: LongRead;
}

/** parse_tag: longest name first; a tag without argument followed by a value start is skipped. */
function readTag(s: string, pos: number): TagRead | null {
  if (!isLower(s[pos])) return null;
  for (let len = Math.min(3, s.length - pos); len > 0; len--) {
    const key = s.slice(pos, pos + len);
    if (!isValidTag(key)) continue;
    const arg = TAGS[key]!.arg;
    if (!arg && isValueStart(s[pos + len])) continue;
    if (!arg) return { tag: { key, value: null, erratas: [] }, end: pos + len };
    const read = readLong(s, pos + len);
    return { tag: { key, value: read.value, erratas: read.erratas }, end: read.end, read };
  }
  return null;
}

/** Port of openomf script.c decode, keeping positions and spellings. */
export function scanScript(source: string): ScriptScan {
  const out = scan(source);
  // Keep the source spelling only where it differs from the canonical one.
  for (const f of out.script.frames) if (f.raw === frameText(f)) delete f.raw;
  return out;
}

/** One pass of openomf's decode loop: tags, then the sprite letter and duration. */
interface FrameRead {
  /**
   * Null when openomf could not read a frame: it skipped past the next '-' or
   * reached the end of the string, and the text from the start up to `end` is lost.
   */
  frame: Frame | null;
  end: number;
  /** Notes for the frame, which gets index `index` if it is read. */
  notes: ScriptNote[];
}

function readFrame(s: string, start: number, index: number, beforeNul: boolean): FrameRead {
  const tags: Tag[] = [];
  const notes: ScriptNote[] = [];
  let pos = start;
  while (pos < s.length) {
    const c = s[pos]!;
    if (isUpper(c)) {
      const r = readLong(s, pos + 1);
      const text = s.slice(pos + 1, r.end);
      if (!r.digits) notes.push({ kind: 'no-duration', frame: index, pos: pos + 1, text });
      else if (r.clamped) notes.push({ kind: 'clamped', frame: index, pos: pos + 1, text });
      const frame: Frame = { key: c, duration: r.value, tags, erratas: r.erratas };
      frame.raw = s.slice(start, r.end);
      // openomf skips one character after the duration, whatever it is.
      const sep = s[r.end] ?? '';
      const end = Math.min(s.length, r.end + 1);
      if (sep !== '-' && sep !== '') frame.sep = sep;
      // A trailing '-', or the end of the string before a NUL: kept as written.
      else if (end >= s.length && (sep === '-' || beforeNul)) frame.sep = sep;
      return { frame, end, notes };
    }
    const t = readTag(s, pos);
    if (t) {
      tags.push(t.tag);
      if (t.read && !t.read.digits)
        notes.push({ kind: 'no-value', frame: index, tag: t.tag.key, pos: t.end, text: '' });
      else if (t.read?.clamped) {
        const at = pos + t.tag.key.length;
        const text = s.slice(at, t.end);
        notes.push({ kind: 'clamped', frame: index, tag: t.tag.key, pos: at, text });
      }
      pos = t.end;
      continue;
    }
    if (isInvalidTag(c)) {
      // openomf keeps c, o, p and z as "invalid" tags and writes them back.
      tags.push({ key: c, value: null, erratas: ['INVALID'] });
      pos++;
      continue;
    }
    // on_fail_seek_end: skip to and past the next '-'; the frame is lost.
    while (pos < s.length && s[pos] !== '-') pos++;
    return { frame: null, end: Math.min(s.length, pos + 1), notes: [] };
  }
  return { frame: null, end: pos, notes: [] };
}

function scan(source: string): ScriptScan {
  // The game reads strings as C strings: nothing after a NUL exists for it.
  const nul = source.indexOf('\0');
  const s = nul < 0 ? source : source.slice(0, nul);
  const frames: Frame[] = [];
  const dropped: DroppedSpan[] = [];
  const notes: ScriptNote[] = [];
  // Dropped text not yet attached to a frame: the next frame keeps it as `dropped`.
  let pending = '';

  let pos = 0;
  while (pos < s.length) {
    const start = pos;
    const { frame, end, notes: frameNotes } = readFrame(s, start, frames.length, nul >= 0);
    pos = end;
    if (!frame) {
      pending += s.slice(start, end);
      dropped.push({ start, text: s.slice(start, end), frame: frames.length });
      continue;
    }
    if (frame.sep && frame.sep !== '-') {
      dropped.push({ start: end - 1, text: frame.sep, frame: frames.length, separator: true });
    }
    if (pending) frame.dropped = pending;
    pending = '';
    notes.push(...frameNotes);
    frames.push(frame);
  }
  const script: Script = { frames };
  const rest = pending + (nul < 0 ? '' : source.slice(nul));
  if (nul >= 0) dropped.push({ start: nul, text: source.slice(nul), frame: frames.length });
  if (rest) script.trailing = rest;
  // Trailing spans do not precede a frame.
  for (const d of dropped) if (d.frame === frames.length && !d.separator) delete d.frame;
  return { script, dropped, notes };
}

export function decodeScript(s: string): Script {
  return scanScript(s).script;
}

/**
 * Every string parses (openomf drops what it cannot read); `error` is kept
 * for callers that still check it and is never set.
 */
export function tryDecodeScript(s: string): {
  script?: Script;
  error?: { pos: number; message: string };
} {
  return { script: decodeScript(s) };
}

// ------------------------------------------------------------ encoder

/** The value a tag is written with: none for tags without an argument, int16 otherwise. */
function writtenValue(t: Tag): number | null {
  if (isInvalidTag(t.key) || (isValidTag(t.key) && !TAGS[t.key]!.arg)) return null;
  if (!isValidTag(t.key) && t.value === null) return null;
  return clampScriptInt(t.value ?? 0);
}

const intText = (v: number): string => String(clampScriptInt(v));
function tagText(t: Tag): string {
  const v = writtenValue(t);
  return v === null ? t.key : t.key + String(v);
}

const sameErratas = (a: Errata[], b: Errata[]): boolean =>
  a.length === b.length && a.every((e, i) => b[i] === e);

function sameFrame(a: Frame, b: Frame): boolean {
  return (
    a.key === b.key &&
    a.duration === b.duration &&
    sameErratas(a.erratas, b.erratas) &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => {
      const u = b.tags[i]!;
      return t.key === u.key && t.value === u.value && sameErratas(t.erratas, u.erratas);
    })
  );
}

/** The one frame `text` parses to, when it parses to exactly one frame and nothing else. */
function parseFrameText(text: string): Frame | null {
  const sc = scan(text).script;
  if (sc.frames.length !== 1 || sc.trailing) return null;
  const f = sc.frames[0]!;
  return f.dropped || f.sep ? null : f;
}

/** True when `text` parses to one frame carrying `tags[order[i]]` in that order. */
function parsesTo(text: string, tags: Tag[], order: number[]): boolean {
  const f = parseFrameText(text);
  return (
    f !== null &&
    f.tags.length === order.length &&
    order.every(
      (k, i) => f.tags[i]!.key === tags[k]!.key && f.tags[i]!.value === writtenValue(tags[k]!),
    )
  );
}

/**
 * Tags in an order that parses back to the same tags. Written next to each
 * other, tags can merge (`b` + `e` is `be`, `b` + `pd5` is `bpd5`). The given
 * order is kept when it works; tags with the same name keep their relative
 * order, because openomf uses the last one.
 */
function orderTags(tags: Tag[], tail: string): string | null {
  const texts = tags.map(tagText);
  const used = tags.map(() => false);
  const order: number[] = [];
  // Backtracking over orders is factorial; give up (null) after this many tries.
  let budget = 4000;
  const search = (prefix: string): string | null => {
    if (order.length === tags.length) return prefix;
    for (let i = 0; i < tags.length; i++) {
      if (used[i]) continue;
      if (tags.some((t, j) => j < i && !used[j] && t.key === tags[i]!.key)) continue;
      if (--budget < 0) return null;
      const next = prefix + texts[i]!;
      order.push(i);
      used[i] = true;
      if (parsesTo(next + tail, tags, order)) {
        const done = search(next);
        if (done !== null) return done;
      }
      used[i] = false;
      order.pop();
    }
    return null;
  };
  return search('');
}

/** The frame written in canonical form, or null when no order of its tags reads back as written. */
function encodeFrame(f: Frame): string | null {
  const tail = f.key + intText(f.duration);
  if (f.tags.length === 0) return tail;
  const plain = f.tags.map(tagText).join('') + tail;
  const asGiven = f.tags.map((_, i) => i);
  if (parsesTo(plain, f.tags, asGiven)) return plain;
  const tags = orderTags(f.tags, tail);
  return tags === null ? null : tags + tail;
}

/**
 * False when the frame's tags cannot be written so that openomf reads them back:
 * some sets merge in every order (`b`, `u` and `e`: `bu`, `ub`, `be`, `ue`).
 */
export const frameEncodes = (f: Frame): boolean => encodeFrame(f) !== null;

/** Canonical spelling of one frame: tags, key, duration, no erratas. */
export function frameText(f: Frame): string {
  // A frame that cannot be written faithfully (see frameEncodes) keeps its tag order.
  return encodeFrame(f) ?? f.tags.map(tagText).join('') + f.key + intText(f.duration);
}

/** The frame's text: its source spelling while that still means the same frame. */
function frameSource(f: Frame): string {
  if (f.raw !== undefined) {
    const back = parseFrameText(f.raw);
    if (back && sameFrame(back, f)) return f.raw;
  }
  return frameText(f);
}

export function encodeScript(sc: Script): string {
  let out = '';
  const n = sc.frames.length;
  sc.frames.forEach((f, i) => {
    out += (f.dropped ?? '') + frameSource(f);
    if (i < n - 1) out += f.sep || '-';
    else out += f.sep ?? '';
  });
  if (sc.trailing) {
    if (n > 0 && sc.frames[n - 1]!.sep === undefined) out += '-';
    out += sc.trailing;
  }
  return out;
}

/**
 * Canonical spelling: no leading zeros or plus signs, and nothing that openomf
 * drops. c/p/o/z tags stay, still marked invalid, because openomf keeps them.
 */
export function normaliseScript(sc: Script): Script {
  return {
    frames: sc.frames.map((f) => ({
      key: f.key,
      duration: f.duration,
      erratas: [],
      tags: f.tags.map((t) => ({ ...t, erratas: t.erratas.filter((e) => e === 'INVALID') })),
    })),
  };
}
