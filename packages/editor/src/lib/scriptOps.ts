// Pure edits on a parsed animation script; callers encode and commit.
// An edited frame loses its source spelling (Frame.raw) and is written in
// canonical form; untouched frames, and the text openomf drops, stay as they were.

import {
  SCRIPT_INT_MAX,
  clampScriptInt,
  frameEncodes,
  isInvalidTag,
  spriteIndexOfKey,
  spriteLetter,
  tagHasArg,
  type Frame,
  type Script,
  type Tag,
} from '@omf/formats';
import { clamp } from './util';

const cloneFrame = (f: Frame): Frame => ({
  ...f,
  tags: f.tags.map((t) => ({ ...t, erratas: [...t.erratas] })),
  erratas: [...f.erratas],
});
export const cloneScript = (s: Script): Script => ({ ...s, frames: s.frames.map(cloneFrame) });

const keepInvalid = (t: Tag): void => {
  t.erratas = t.erratas.filter((e) => e === 'INVALID');
};

/** A tag's value as openomf can hold it: none without an argument, int16 otherwise. */
function tagValueFor(key: string, value: number | null): number | null {
  if (!tagHasArg(key)) return null;
  const v = clampScriptInt(value ?? 0);
  // "x-5" reads as the x- tag, so scale tags cannot be negative.
  return (key === 'x' || key === 'y') && v < 0 ? 0 : v;
}

/**
 * Adds a tag unless the frame could then not be written so that openomf reads
 * it back (some tag sets merge in every order, spec 08). Returns whether it was added.
 */
function pushTag(f: Frame, t: Tag): boolean {
  f.tags.push(t);
  if (frameEncodes(f)) return true;
  f.tags.pop();
  return false;
}

/** Edits frame `i` of a copy of `s`; the frame loses its source spelling (raw). */
export function withFrame(s: Script, i: number, fn: (f: Frame) => void): Script {
  const out = cloneScript(s);
  const f = out.frames[i];
  if (f) {
    fn(f);
    delete f.raw;
  }
  return out;
}

/** After frames were added, removed or reordered, separators are written the usual way. */
function relink(s: Script): Script {
  for (const f of s.frames) if (f.sep === '-' || f.sep === '') delete f.sep;
  return s;
}

export function setDuration(s: Script, i: number, d: number): Script {
  return withFrame(s, i, (f) => {
    f.duration = clamp(Math.round(d), 0, SCRIPT_INT_MAX);
    f.erratas = [];
  });
}

export function setSprite(s: Script, i: number, spriteIndex: number): Script {
  return withFrame(s, i, (f) => {
    f.key = spriteLetter(spriteIndex);
    f.erratas = f.erratas.filter((e) => e !== 'INVALID');
  });
}

export function setTagValue(s: Script, i: number, t: number, value: number): Script {
  return withFrame(s, i, (f) => {
    const tag = f.tags[t];
    if (!tag) return;
    tag.value = tagValueFor(tag.key, value);
    keepInvalid(tag);
  });
}

export function addTag(s: Script, i: number, key: string, value: number | null): Script {
  return withFrame(s, i, (f) => {
    if (f.tags.some((t) => t.key === key)) return;
    pushTag(f, { key, value: tagValueFor(key, value), erratas: [] });
  });
}

export function removeTag(s: Script, i: number, t: number): Script {
  return withFrame(s, i, (f) => {
    f.tags.splice(t, 1);
  });
}

/** Clears one tag's erratas (the chip's "fix"). */
export function fixTag(s: Script, i: number, t: number): Script {
  return withFrame(s, i, (f) => {
    const tag = f.tags[t];
    if (tag) keepInvalid(tag);
  });
}

export function fixFrame(s: Script, i: number): Script {
  return withFrame(s, i, (f) => {
    f.erratas = [];
  });
}

/** Inserts a copy of `frame`; text openomf dropped around the original is not copied. */
export function insertFrame(s: Script, at: number, frame: Frame): Script {
  const out = cloneScript(s);
  const copy = cloneFrame(frame);
  delete copy.dropped;
  delete copy.sep;
  out.frames.splice(clamp(at, 0, out.frames.length), 0, copy);
  return relink(out);
}

export function deleteFrame(s: Script, i: number): Script {
  const out = cloneScript(s);
  out.frames.splice(i, 1);
  return relink(out);
}

export function moveFrame(s: Script, from: number, to: number): Script {
  const out = cloneScript(s);
  const [f] = out.frames.splice(from, 1);
  if (f) out.frames.splice(clamp(to, 0, out.frames.length), 0, f);
  return relink(out);
}

const copyable = (t: Tag): boolean => !isInvalidTag(t.key);

export function copyEffectsToAll(s: Script, i: number): Script {
  const src = s.frames[i];
  if (!src) return s;
  const out = cloneScript(s);
  out.frames.forEach((f, k) => {
    if (k === i) return;
    let changed = false;
    for (const t of src.tags.filter(copyable)) {
      if (!f.tags.some((x) => x.key === t.key))
        changed = pushTag(f, { ...t, erratas: [] }) || changed;
    }
    if (changed) delete f.raw;
  });
  return out;
}

export function pasteEffects(s: Script, i: number, tags: Tag[]): Script {
  return withFrame(s, i, (f) => {
    for (const t of tags.filter(copyable)) {
      const value = tagValueFor(t.key, t.value);
      const existing = f.tags.find((x) => x.key === t.key);
      if (existing) {
        existing.value = value;
        // The pasted value replaces the old spelling too ('+', leading zeros).
        keepInvalid(existing);
      } else pushTag(f, { key: t.key, value, erratas: [] });
    }
  });
}

/** Rewrites frame keys after sprites were reordered: `order[newIndex] = oldIndex`. */
export function remapSprites(s: Script, order: number[]): Script {
  const inverse = new Map(order.map((oldIdx, newIdx) => [oldIdx, newIdx]));
  const out = cloneScript(s);
  for (const f of out.frames) {
    const old = spriteIndexOfKey(f.key);
    const n = inverse.get(old);
    if (n !== undefined && n !== old) {
      f.key = spriteLetter(n);
      delete f.raw;
    }
  }
  return out;
}
