import { describe, expect, it } from 'vitest';
import { INVALID_TAGS, TAGS } from '@omf/formats';
import { CATEGORIES, TAG_META } from './tagMeta';
import { PREVIEWED_TAGS } from './simulate';

describe('tag-meta.json', () => {
  const keys = Object.keys(TAG_META);

  it('describes exactly the tags of tags.json', () => {
    for (const k of keys) expect(TAGS, k).toHaveProperty(k);
    expect(keys.sort()).toEqual(Object.keys(TAGS).sort());
    for (const k of INVALID_TAGS) expect(keys).not.toContain(k);
  });

  it('gives an argument exactly to the tags openomf reads one for', () => {
    for (const k of keys) expect(!!TAG_META[k]!.arg, k).toBe(TAGS[k]!.arg);
  });

  it('uses known categories and sane argument ranges', () => {
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const k of keys) {
      const m = TAG_META[k]!;
      expect(cats.has(m.category), k).toBe(true);
      expect(m.label.length, k).toBeGreaterThan(0);
      if (m.arg?.min !== undefined && m.arg.max !== undefined)
        expect(m.arg.min, k).toBeLessThanOrEqual(m.arg.max);
    }
  });

  it('previewed tags are real tags', () => {
    for (const k of PREVIEWED_TAGS) expect(TAGS, k).toHaveProperty(k);
  });
});
