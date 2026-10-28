import { describe, expect, it } from 'vitest';
import {
  readAF,
  readBK,
  writeAF,
  writeBK,
  readAltPals,
  writeAltPals,
  readSounds,
  writeSounds,
  SOUNDS_MAX,
} from '../src';
import { HAS_DATA, dataFiles, readData } from './data';

describe.skipIf(!HAS_DATA)('shipped game data round trip', () => {
  for (const name of dataFiles('AF')) {
    it(`${name} is byte-exact`, () => {
      const bytes = readData(name);
      expect(writeAF(readAF(bytes))).toEqual(bytes);
    });
  }
  for (const name of dataFiles('BK')) {
    it(`${name} is byte-exact`, () => {
      const bytes = readData(name);
      expect(writeBK(readBK(bytes))).toEqual(bytes);
    });
  }
  it('ALTPALS.DAT is byte-exact', () => {
    const bytes = readData('ALTPALS.DAT');
    expect(writeAltPals(readAltPals(bytes))).toEqual(bytes);
  });
  it('SOUNDS.DAT is byte-exact', () => {
    const bytes = readData('SOUNDS.DAT');
    const sounds = readSounds(bytes);
    expect(sounds).toHaveLength(SOUNDS_MAX);
    expect(sounds.filter((s) => s.data.length > 0)).toHaveLength(65);
    expect(writeSounds(sounds)).toEqual(bytes);
  });
});
