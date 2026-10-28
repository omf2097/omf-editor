// Which animations play each sound-table slot (`s` tags in base and extra strings).

import type { Doc } from './doc';
import { forEachScriptTag, type StringRef } from './scriptTags';

export interface SlotUse {
  animId: number;
  string: StringRef;
  frame: number;
}

export function soundSlotUsage(d: Doc): Map<number, SlotUse[]> {
  const out = new Map<number, SlotUse[]>();
  forEachScriptTag(d, ({ animId, string, frame, tag }) => {
    if (tag.key !== 's' || typeof tag.value !== 'number') return;
    const list = out.get(tag.value) ?? [];
    list.push({ animId, string, frame });
    out.set(tag.value, list);
  });
  return out;
}
