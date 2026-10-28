// Walks the tags of every animation string in a document, with decoded scripts cached.

import { tryDecodeScript, type Script, type Tag } from '@omf/formats';
import { animationsOf, type Doc } from './doc';

/** Which string of an animation: the base string or an extra string index. */
export type StringRef = 'base' | number;

const CACHE_MAX = 4096;
const cache = new Map<string, Script | null>();

/** tryDecodeScript with a bounded cache: strings are immutable, documents share most of them. */
export function decodeCached(s: string): Script | null {
  let sc = cache.get(s);
  if (sc === undefined) {
    sc = tryDecodeScript(s).script ?? null;
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(s, sc);
  }
  return sc;
}

export interface TagSite {
  animId: number;
  string: StringRef;
  frame: number;
  tag: Tag;
}

/** Calls `f` for every tag of every decodable base and extra string. */
export function forEachScriptTag(d: Doc, f: (site: TagSite) => void): void {
  for (const [animId, a] of animationsOf(d)) {
    [a.baseString, ...a.extraStrings].forEach((s, si) => {
      decodeCached(s)?.frames.forEach((fr, frame) => {
        for (const tag of fr.tags) f({ animId, string: si === 0 ? 'base' : si - 1, frame, tag });
      });
    });
  }
}

/** Route query that opens the Script view on `string` at `frame`. */
export const scriptQuery = (string: StringRef, frame: number): Record<string, string> => ({
  string: String(string),
  frame: String(frame),
});
