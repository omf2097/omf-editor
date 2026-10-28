import { describe, expect, it } from 'vitest';
import { decodeScript, encodeScript } from '@omf/formats';
import * as ops from './scriptOps';

const edit = (
  s: string,
  f: (sc: ReturnType<typeof decodeScript>) => ReturnType<typeof decodeScript>,
) => encodeScript(f(decodeScript(s)));

describe('script edits', () => {
  it('re-encode only the edited frame; dropped text and other spellings stay', () => {
    expect(edit('s+5A05-#junk-B1-x=1e-C2', (sc) => ops.setDuration(sc, 1, 4))).toBe(
      's+5A05-#junk-B4-x=1e-C2',
    );
    expect(edit('s+5A05-B1', (sc) => ops.setTagValue(sc, 0, 0, 7))).toBe('s7A5-B1');
  });

  it('adding a tag never merges it with its neighbour (S1)', () => {
    const s = edit('bA1', (sc) => ops.addTag(sc, 0, 'e', null));
    expect(
      decodeScript(s)
        .frames[0]!.tags.map((t) => t.key)
        .sort(),
    ).toEqual(['b', 'e']);
    expect(edit('uA1', (sc) => ops.addTag(sc, 0, 's', 3))).toBe('us3A1');
  });

  it('refuses a tag that would make the frame unwritable', () => {
    // b + u is "bu" and u + b is "ub": no order reads back as two tags.
    expect(edit('bA1', (sc) => ops.addTag(sc, 0, 'u', null))).toBe('bA1');
  });

  it('adds f without a value (S3) and clamps values to what openomf holds', () => {
    expect(edit('A1', (sc) => ops.addTag(sc, 0, 'f', 0))).toBe('fA1');
    expect(edit('A1', (sc) => ops.addTag(sc, 0, 's', 99999))).toBe('s32767A1');
    expect(edit('xA1', (sc) => ops.setTagValue(sc, 0, 0, -5))).toBe('x0A1');
    expect(edit('A1', (sc) => ops.setDuration(sc, 0, 1e9))).toBe('A32767');
  });

  it('pasting a value replaces the old spelling (S21)', () => {
    const tags = [{ key: 's', value: -5, erratas: [] }];
    expect(edit('s+5A1', (sc) => ops.pasteEffects(sc, 0, tags))).toBe('s-5A1');
  });

  it('fixing errata drops the spelling', () => {
    expect(edit('s+05A07', (sc) => ops.fixTag(sc, 0, 0))).toBe('s5A7');
    expect(edit('A07', (sc) => ops.fixFrame(sc, 0))).toBe('A7');
  });

  it('moving and deleting frames keep separators valid', () => {
    expect(edit('A1-B2', (sc) => ops.moveFrame(sc, 0, 1))).toBe('B2-A1');
    expect(edit('A1-B2-', (sc) => ops.deleteFrame(sc, 1))).toBe('A1');
    expect(edit('A5B7-C2', (sc) => ops.moveFrame(sc, 1, 0))).toBe('7-C2-A5B');
    expect(edit('A1-B2', (sc) => ops.insertFrame(sc, 2, sc.frames[0]!))).toBe('A1-B2-A1');
  });
});
