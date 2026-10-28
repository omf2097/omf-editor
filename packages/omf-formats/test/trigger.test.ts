import { describe, expect, it } from 'vitest';
import {
  InputBuffer,
  analyzeTriggers,
  formatTrigger,
  matchMove,
  mirrorDirections,
  parseTrigger,
  readAF,
  triggerNotation,
} from '../src';
import { HAS_DATA, dataFiles, readData } from './data';
import { af, move } from './helpers';

describe('trigger strings', () => {
  it('parses most-recent-first file order into chronological directions', () => {
    const t = parseTrigger('P632');
    expect(t).toEqual({ kind: 'sequence', button: 'P', directions: '236' });
    expect(triggerNotation(t)).toBe('236P');
    expect(formatTrigger(t)).toBe('P632');
    expect(parseTrigger('K')).toEqual({ kind: 'sequence', button: 'K', directions: '' });
  });

  it('keeps special values verbatim', () => {
    for (const s of ['!', '"!"', '0', 'n', 'LINK17', '', 'P0']) {
      const t = parseTrigger(s);
      expect(t.kind).toBe('special');
      expect(formatTrigger(t)).toBe(s);
    }
  });

  it('mirrors directions for facing left', () => {
    expect(mirrorDirections('41236')).toBe('63214');
  });
});

describe('analyzeTriggers', () => {
  it('finds duplicates and shadowing, graded by context', () => {
    const file = af([
      [15, move({ moveString: 'P6', category: 5 })],
      [16, move({ moveString: 'P632', category: 5 })],
      [17, move({ moveString: 'P6', category: 7 })],
      [18, move({ moveString: 'P22' })],
      [5, move({ moveString: 'K2' })],
      [19, move({ moveString: 'P12345678912' })],
    ]);
    const by = (id: number): string[] =>
      analyzeTriggers(file)
        .filter((i) => i.moveId === id)
        .map((i) => `${i.kind}:${i.severity}`);
    expect(by(16)).toEqual(['shadowed:warning']);
    expect(by(17)).toEqual(['duplicate:info']);
    expect(by(18)).toEqual(['repeat:warning']);
    expect(by(5)).toEqual(['unreachable-id:info']);
    expect(by(19)).toEqual(['too-long:warning']);
  });

  it.skipIf(!HAS_DATA)('reports no warnings for shipped fighters', () => {
    for (const n of dataFiles('AF')) {
      const warnings = analyzeTriggers(readAF(readData(n))).filter((i) => i.severity !== 'info');
      expect(warnings, n).toEqual([]);
    }
  });
});

describe('matching', () => {
  const file = af([
    [15, move({ moveString: 'P' })],
    [16, move({ moveString: 'P632' })],
    [20, move({ moveString: 'K2' })],
  ]);

  it('takes the first id whose directions prefix the buffer', () => {
    expect(matchMove(file, 'P', '6321')).toBe(15);
    expect(matchMove(file, 'K', '2')).toBe(20);
    expect(matchMove(file, 'K', '3')).toBeNull();
  });

  it('simulates the input buffer with the 9-tick window', () => {
    const noBare = af([[16, move({ moveString: 'P632' })]]);
    const b = new InputBuffer();
    b.push('2', 0);
    b.push('3', 3);
    b.push('3', 4);
    b.push('6', 6);
    expect(b.buffer).toBe('632');
    expect(b.press(noBare, 'P', 8)).toBe(16);
    expect(b.buffer).toBe('');
    b.push('2', 20);
    b.push('3', 21);
    b.push('6', 22);
    expect(b.buffer).toBe('632');
    // Pressed more than 9 ticks after the buffer last changed: only "6" counts.
    expect(b.press(noBare, 'P', 32)).toBeNull();
    expect(matchMove(file, 'P', '632')).toBe(15);
  });
});
