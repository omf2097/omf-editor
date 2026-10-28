import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TAGS, decodeScript, encodeScript, readAF, readBK, type Animation } from '../src';
import { HAS_DATA, dataFiles, readData } from './data';

const PYOMFTOOLS_STRINGS: string[] = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/pyomftools-strings.json'), 'utf8'),
);

describe('decodeScript', () => {
  it('parses frames and tags', () => {
    expect(decodeScript('A10-bl3B5')).toEqual({
      frames: [
        { key: 'A', duration: 10, tags: [], erratas: [] },
        { key: 'B', duration: 5, tags: [{ key: 'bl', value: 3, erratas: [] }], erratas: [] },
      ],
    });
  });

  it('handles tag names containing signs and signed values', () => {
    const f = decodeScript('x-5y+2x=-3A1').frames[0]!;
    expect(f.tags).toEqual([
      { key: 'x-', value: 5, erratas: [] },
      { key: 'y+', value: 2, erratas: [] },
      { key: 'x=', value: -3, erratas: [] },
    ]);
  });

  it('prefers the longest tag name', () => {
    expect(decodeScript('bpd5A1').frames[0]!.tags[0]!.key).toBe('bpd');
    expect(decodeScript('jf2A1').frames[0]!.tags[0]).toEqual({
      key: 'jf2',
      value: null,
      erratas: [],
    });
  });

  it('records erratas and keeps the spelling', () => {
    const f = decodeScript('cs+05A07').frames[0]!;
    expect(f.erratas).toEqual(['LEADING_ZERO']);
    expect(f.raw).toBe('cs+05A07');
    expect(f.tags).toEqual([
      { key: 'c', value: null, erratas: ['INVALID'] },
      { key: 's', value: 5, erratas: ['LEADING_PLUS', 'LEADING_ZERO'] },
    ]);
  });

  it('treats "!" and "" as empty', () => {
    expect(decodeScript('!').frames).toEqual([]);
    expect(decodeScript('').frames).toEqual([]);
    expect(encodeScript(decodeScript('!'))).toBe('!');
  });

  it('round-trips every pyomftools test string', () => {
    for (const s of PYOMFTOOLS_STRINGS) expect(encodeScript(decodeScript(s))).toBe(s);
  });
});

describe('tag table', () => {
  it('has the merged tags; u and f take no argument (openomf)', () => {
    expect(Object.keys(TAGS)).toHaveLength(153);
    expect(TAGS.u).toEqual({ arg: false, desc: 'Bring sprite to the front' });
    expect(TAGS.f!.arg).toBe(false);
  });
});

function shippedStrings(): string[] {
  const out: string[] = [];
  const add = (a: Animation): void => {
    out.push(a.baseString, ...a.extraStrings);
  };
  for (const n of dataFiles('AF')) {
    for (const m of readAF(readData(n)).moves.values()) {
      add(m);
      out.push(m.enemyString);
    }
  }
  for (const n of dataFiles('BK')) {
    for (const a of readBK(readData(n)).animations.values()) {
      add(a);
      out.push(a.footerString);
    }
  }
  return [...new Set(out)];
}

describe.skipIf(!HAS_DATA)('shipped strings', () => {
  const strings = shippedStrings();

  it('all round-trip byte for byte', () => {
    const failures = strings.filter((s) => encodeScript(decodeScript(s)) !== s);
    expect(failures).toEqual([]);
    expect(strings.length).toBeGreaterThan(1000);
  });
});
