import { describe, expect, it } from 'vitest';
import { decodeScript } from '@omf/formats';
import {
  AIRBORNE_STUN_SUFFIX,
  AIRBORNE_SUFFIX,
  GROUNDED_STUN_SUFFIX,
  LAUNCH_STRING,
  effectiveEnemyString,
  launchFrames,
} from './enemyString';

// The expected strings are written out as openomf har.c har_take_damage builds them.
describe('effectiveEnemyString (openomf har_take_damage)', () => {
  const s = 'A2-x-3B3-C2';

  it('standing, not stunned: the string as is (custom stays empty)', () => {
    expect(effectiveEnemyString(s, { position: 'standing', stun: false })).toEqual({
      text: s,
      kept: s,
      removed: '',
      added: '',
    });
  });

  it('airborne: appends -L2-M5-L2', () => {
    const e = effectiveEnemyString(s, { position: 'airborne', stun: false });
    expect(e.text).toBe('A2-x-3B3-C2-L2-M5-L2');
    expect(e.added).toBe(AIRBORNE_SUFFIX);
  });

  it('airborne and stunned or KO: appends -L3-M5000 instead', () => {
    const e = effectiveEnemyString(s, { position: 'airborne', stun: true });
    expect(e.text).toBe('A2-x-3B3-C2-L3-M5000');
    expect(e.added).toBe(AIRBORNE_STUN_SUFFIX);
  });

  it('grounded stun or KO: up to the last "-", then the MASTER.DAT fall', () => {
    const e = effectiveEnemyString(s, { position: 'standing', stun: true });
    expect(e.text).toBe('A2-x-3B3-x-20ox-20L1-ox-20L2-x-20zzs4l25sp13M1-zzM2');
    expect(e).toMatchObject({ kept: 'A2-x-3B3', removed: '-C2', added: GROUNDED_STUN_SUFFIX });
  });

  it('grounded stun of a string without "-" keeps nothing (str_last_of fails, slice 0..0)', () => {
    const e = effectiveEnemyString('A20', { position: 'standing', stun: true });
    expect(e.text).toBe(GROUNDED_STUN_SUFFIX);
    expect(e.removed).toBe('A20');
  });

  it('launch replaces the whole string, stun or not', () => {
    for (const stun of [false, true]) {
      const e = effectiveEnemyString(s, { position: 'launch', stun });
      expect(e.text).toBe('A1-s01l50B2-C2-L5-M400');
      expect(e).toMatchObject({ kept: '', removed: s, added: LAUNCH_STRING });
    }
  });

  it('an empty string is no hit animation in every state', () => {
    for (const position of ['standing', 'airborne', 'launch'] as const)
      expect(effectiveEnemyString('', { position, stun: true }).text).toBe('');
  });

  it('the added text parses as frames after the string (openomf script.c)', () => {
    const e = effectiveEnemyString(s, { position: 'airborne', stun: false });
    expect(decodeScript(e.text).frames.map((f) => f.key + f.duration)).toEqual([
      'A2',
      'B3',
      'C2',
      'L2',
      'M5',
      'L2',
    ]);
  });
});

describe('launchFrames', () => {
  it('lists frames with ai, none for a projectile move (category 8)', () => {
    const base = decodeScript('A2-aiB2-C2-aiD1');
    expect(launchFrames(base, 5)).toEqual([1, 3]);
    expect(launchFrames(base, 8)).toEqual([]);
    expect(launchFrames(decodeScript('A2-B2'), 5)).toEqual([]);
  });
});
