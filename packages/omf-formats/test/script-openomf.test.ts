// The parser against openomf's own (formats/script.c via build/stringparser).
// test/fixtures/openomf-strings.json holds openomf's reading of corner cases,
// a fuzz corpus and the shipped strings openomf drops text from; it is checked
// against stringparser whenever that is built, and regenerated with
// OMF_UPDATE_FIXTURE=1.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TAGS,
  decodeScript,
  encodeScript,
  frameEncodes,
  normaliseScript,
  readAF,
  readBK,
  scanScript,
  type Script,
} from '../src';
import { HAS_DATA, dataFiles, readData } from './data';
import { HAS_STRINGPARSER, openomfParse, type ParsedFrame } from './stringparser';

const FIXTURE = join(import.meta.dirname, 'fixtures/openomf-strings.json');
const PYOMFTOOLS: string[] = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/pyomftools-strings.json'), 'utf8'),
);

const ours = (sc: Script): ParsedFrame[] =>
  sc.frames.map((f) => [f.key + f.duration, f.tags.map((t) => [t.key, t.value])]);

const CORNER_CASES = [
  'A5B7-C2', // a second key: openomf skips one character after the duration
  'A5-3B4',
  'A5bs3', // tags after the last frame are dropped
  'A-05',
  'A000-A+5-bm-0A1',
  'A99999-s-99999B1-x=40000C1',
  's123456789012345A1',
  'rfE10-rff10-C10', // f takes no argument: "ff10" is dropped
  'uabeujf2jfE3-F4',
  'usw30X1-A1',
  'us63A1-bd25A1',
  'dA1-B2',
  'A',
  'A-',
  'A--B2',
  'A1--B2',
  'A1-#',
  'A1-a5-B2',
  'A1-b2-C3',
  'cpozA1',
  'x-5A-3B',
  'A1-!',
  '!',
  'A1-',
  'A1-B2-',
  'bA1',
  'bpd5A1',
  'jf2A1',
  'x+-5y--3A1',
];

function fuzzCorpus(n: number): string[] {
  const names = Object.keys(TAGS);
  const pieces = ['-', '-', '-', '+', '0', '00', '5', '12', '99999', '-3', 'A', 'B', 'Z', 'a'];
  pieces.push('!', '#', 'c', 'p', 'o', 'z', '=');
  let seed = 20261027;
  const rnd = (k: number): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed >>> 8) % k;
  };
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    let s = '';
    for (let i = 1 + rnd(12); i > 0; i--)
      s += rnd(2)
        ? names[rnd(names.length)]! + (rnd(2) ? String(rnd(40) - 5) : '')
        : pieces[rnd(pieces.length)]!;
    out.push(s.startsWith('-') ? 'A' + s : s);
  }
  return out;
}

function fixtureStrings(): string[] {
  const dropping = PYOMFTOOLS.filter((s) => s !== '!' && scanScript(s).dropped.length > 0);
  return [...new Set([...CORNER_CASES, ...fuzzCorpus(300), ...dropping])];
}

interface FixtureEntry {
  s: string;
  frames: ParsedFrame[];
}

const fixture: FixtureEntry[] = JSON.parse(readFileSync(FIXTURE, 'utf8'));

describe('parsing matches openomf', () => {
  it('reads every fixture string the way openomf does and round-trips it', () => {
    expect(fixture.length).toBeGreaterThan(300);
    for (const { s, frames } of fixture) {
      const sc = decodeScript(s);
      expect(ours(sc), s).toEqual(frames);
      expect(encodeScript(sc), s).toBe(s);
      // The canonical spelling means the same to openomf.
      expect(ours(decodeScript(encodeScript(normaliseScript(sc)))), s).toEqual(frames);
    }
  });

  it.skipIf(!HAS_STRINGPARSER)('the fixture is openomf output', () => {
    const strings = fixtureStrings();
    const current = strings.map((s) => ({ s, frames: openomfParse(s) }));
    if (process.env.OMF_UPDATE_FIXTURE) writeFileSync(FIXTURE, JSON.stringify(current) + '\n');
    expect(fixture).toEqual(current);
  });

  it.skipIf(!HAS_STRINGPARSER || !HAS_DATA)('reads every shipped string as openomf does', () => {
    const strings = new Set<string>();
    for (const n of dataFiles('AF'))
      for (const m of readAF(readData(n)).moves.values())
        for (const s of [m.baseString, ...m.extraStrings, m.enemyString]) strings.add(s);
    for (const n of dataFiles('BK'))
      for (const a of readBK(readData(n)).animations.values())
        for (const s of [a.baseString, ...a.extraStrings, a.footerString]) strings.add(s);
    const diffs = [...strings]
      .filter((s) => s !== '' && !s.startsWith('-'))
      .filter((s) => JSON.stringify(ours(decodeScript(s))) !== JSON.stringify(openomfParse(s)));
    expect(diffs).toEqual([]);
    expect(strings.size).toBeGreaterThan(1000);
  });
});

describe('openomf parsing rules', () => {
  const frames = (s: string): string[] =>
    decodeScript(s).frames.map(
      (f) => f.tags.map((t) => t.key + (t.value ?? '')).join(' ') + `|${f.key}${f.duration}`,
    );

  it('a second key before "-" ends the frame and is skipped (S2)', () => {
    expect(frames('A5B7-C2')).toEqual(['|A5', '|C2']);
    const sc = scanScript('A5B7-C2');
    expect(sc.dropped.map((d) => d.text)).toEqual(['B', '7-']);
    expect(encodeScript(sc.script)).toBe('A5B7-C2');
  });

  it('f takes no argument; frames where digits follow it are dropped (S3)', () => {
    expect(frames('rfE10-rff10-C10')).toEqual(['r f|E10', '|C10']);
    expect(frames('uabeujf2jfE3-F4')).toEqual(['|F4']);
    expect(frames('usw30X1-A1')).toEqual(['|A1']);
  });

  it('a tag without argument followed by digits falls back to a shorter name (S4)', () => {
    expect(frames('us63A1')).toEqual(['u s63|A1']);
    expect(frames('bd25A1')).toEqual(['b d25|A1']);
  });

  it('drops tags after the last frame (S12)', () => {
    expect(frames('A5bs3')).toEqual(['|A5']);
    expect(scanScript('A5bs3').script.trailing).toBe('s3');
    expect(encodeScript(decodeScript('A5bs3'))).toBe('A5bs3');
  });

  it('keeps the sign with the digits (S13)', () => {
    const sc = decodeScript('A-05');
    expect(sc.frames[0]!.duration).toBe(-5);
    expect(encodeScript(sc)).toBe('A-05');
    expect(encodeScript(normaliseScript(sc))).toBe('A-5');
  });

  it('clamps numbers to int16 and keeps the digits (S14)', () => {
    const sc = decodeScript('s9999999999A99999');
    expect(sc.frames[0]!.duration).toBe(32767);
    expect(sc.frames[0]!.tags[0]!.value).toBe(32767);
    expect(encodeScript(sc)).toBe('s9999999999A99999');
    expect(encodeScript(normaliseScript(sc))).toBe('s32767A32767');
    expect(encodeScript({ frames: [{ key: 'A', duration: 1e22, tags: [], erratas: [] }] })).toBe(
      'A32767',
    );
  });

  it('keeps every spelling of an unedited frame (S15)', () => {
    for (const s of ['A000', 'A+5', 'bm-0A1', '!', 'A1--B2', 'A1-', 'A1-#', 'x-5A-3B'])
      expect(encodeScript(decodeScript(s))).toBe(s);
  });

  it('an argument tag without digits reads 0 (S16)', () => {
    expect(decodeScript('dA1').frames[0]!.tags).toEqual([{ key: 'd', value: 0, erratas: [] }]);
    expect(encodeScript(normaliseScript(decodeScript('dA1')))).toBe('d0A1');
  });

  it('a NUL ends the string for openomf; the rest is kept as dropped text', () => {
    const sc = scanScript('A1-B2\0C3');
    expect(frames('A1-B2\0C3')).toEqual(['|A1', '|B2']);
    expect(sc.dropped).toEqual([{ start: 5, text: '\0C3' }]);
    expect(encodeScript(sc.script)).toBe('A1-B2\0C3');
  });
});

describe('encoding edited frames', () => {
  const frame = (tags: [string, number | null][]): Script => ({
    frames: [
      {
        key: 'A',
        duration: 3,
        erratas: [],
        tags: tags.map(([key, value]) => ({ key, value, erratas: [] })),
      },
      { key: 'B', duration: 1, erratas: [], tags: [] },
    ],
  });
  const back = (sc: Script): string[] =>
    decodeScript(encodeScript(sc)).frames.flatMap((f) =>
      f.tags.map((t) => t.key + (t.value ?? '')),
    );

  it('orders tags so that they never merge (S1)', () => {
    expect(
      back(
        frame([
          ['b', null],
          ['e', null],
        ]),
      ).sort(),
    ).toEqual(['b', 'e']);
    expect(
      back(
        frame([
          ['b', null],
          ['pd', 5],
        ]),
      ).sort(),
    ).toEqual(['b', 'pd5']);
    expect(
      back(
        frame([
          ['u', null],
          ['s', 3],
        ]),
      ),
    ).toEqual(['u', 's3']);
    expect(
      encodeScript(
        frame([
          ['u', null],
          ['s', 3],
        ]),
      ),
    ).toBe('us3A3-B1');
  });

  it('reports tag sets that merge in every order', () => {
    expect(
      frameEncodes(
        frame([
          ['b', null],
          ['u', null],
          ['e', null],
        ]).frames[0]!,
      ),
    ).toBe(false);
    expect(
      frameEncodes(
        frame([
          ['b', null],
          ['u', null],
        ]).frames[0]!,
      ),
    ).toBe(false);
    expect(
      frameEncodes(
        frame([
          ['b', null],
          ['e', null],
        ]).frames[0]!,
      ),
    ).toBe(true);
  });

  it('every encodable tag set written by the encoder parses back to itself', () => {
    const names = Object.keys(TAGS);
    let seed = 5;
    const rnd = (k: number): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return (seed >>> 8) % k;
    };
    let impossible = 0;
    for (let k = 0; k < 5000; k++) {
      const tags: [string, number | null][] = [];
      for (let i = 1 + rnd(5); i > 0; i--) {
        const key = names[rnd(names.length)]!;
        if (tags.some(([t]) => t === key)) continue;
        const min = key === 'x' || key === 'y' ? 0 : -20;
        tags.push([key, TAGS[key]!.arg ? min + rnd(60) : null]);
      }
      const want = tags.map(([t, v]) => t + (v ?? '')).sort();
      const sc = frame(tags);
      if (!frameEncodes(sc.frames[0]!)) {
        impossible++;
        continue;
      }
      expect(back(sc).sort(), encodeScript(sc)).toEqual(want);
    }
    expect(impossible).toBeLessThan(50);
  });

  it('re-encodes only the frames that changed', () => {
    const sc = decodeScript('s+5A05-#junk-B1-cC2');
    sc.frames[1]!.duration = 4;
    delete sc.frames[1]!.raw;
    expect(encodeScript(sc)).toBe('s+5A05-#junk-B4-cC2');
  });
});
