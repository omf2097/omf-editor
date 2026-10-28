import { describe, expect, it } from 'vitest';
import type { AFFile } from '@omf/formats';
import { decodeCached, forEachScriptTag, scriptQuery } from './scriptTags';
import { soundSlotUsage } from './soundUsage';
import { referencesTo } from './references';

const move = (baseString: string, extraStrings: string[] = []) => ({
  baseString,
  extraStrings,
  sprites: [],
  hitCoords: [],
});

function doc(): AFFile {
  return {
    moves: new Map([
      [1, move('s1A1-s2B1', ['s3A1', 'garbage(('])],
      [2, move('m1s1A1')],
      [3, move('(((')],
    ]),
    soundTable: [],
  } as unknown as AFFile;
}

describe('script tag scan', () => {
  it('visits base and extra strings with their indices and skips undecodable ones', () => {
    const sites: string[] = [];
    forEachScriptTag(doc(), (s) => sites.push(`${s.animId}:${s.string}:${s.frame}:${s.tag.key}`));
    expect(sites).toEqual(['1:base:0:s', '1:base:1:s', '1:0:0:s', '2:base:0:m', '2:base:0:s']);
  });

  it('caches decoded scripts', () => {
    expect(decodeCached('s1A1')).toBe(decodeCached('s1A1'));
    // Everything parses: openomf drops what it cannot read.
    expect(decodeCached('(((')?.frames).toEqual([]);
  });

  it('sound usage records string and frame; references see extra strings', () => {
    const u = soundSlotUsage(doc());
    expect(u.get(1)).toEqual([
      { animId: 1, string: 'base', frame: 0 },
      { animId: 2, string: 'base', frame: 0 },
    ]);
    expect(u.get(3)).toEqual([{ animId: 1, string: 0, frame: 0 }]);
    expect(referencesTo(doc(), 1)).toEqual(['2: base frame 1 tag m1']);
    expect(scriptQuery(0, 4)).toEqual({ string: '0', frame: '4' });
  });
});
