// Trigger matching against openomf har.c: disabled moves and the input buffer.

import { describe, expect, it } from 'vitest';
import { InputBuffer, analyzeTriggers, isMoveDisabled, matchMove, readAF } from '../src';
import { HAS_DATA, dataFiles, readData } from './data';
import { af, move } from './helpers';

const FIRE_PIT = 0x40;

describe('moves openomf disables (S6)', () => {
  const file = af([
    [15, move({ moveString: 'P6', baseString: 'A1' })],
    [16, move({ moveString: 'P6', posConstraint: FIRE_PIT })],
    [17, move({ moveString: 'P63' })],
  ]);

  it('never match', () => {
    expect(isMoveDisabled(file.moves.get(15)!)).toBe(true);
    expect(isMoveDisabled(file.moves.get(16)!)).toBe(true);
    expect(matchMove(file, 'P', '63')).toBe(17);
    expect(matchMove(file, 'P', '6')).toBeNull();
  });

  it('shadow nothing', () => {
    const issues = analyzeTriggers(file).filter((i) => i.moveId === 17);
    expect(issues).toEqual([]);
  });

  it.skipIf(!HAS_DATA)('in shipped fighters', () => {
    for (const n of dataFiles('AF')) {
      const f = readAF(readData(n));
      for (const [id, m] of f.moves) {
        if (id < 15 || !/^[PK][1-9]*$/.test(m.moveString)) continue;
        const got = matchMove(f, m.moveString[0] as 'P' | 'K', m.moveString.slice(1));
        if (got !== null) expect(isMoveDisabled(f.moves.get(got)!), `${n} ${id}`).toBe(false);
      }
      for (const i of analyzeTriggers(f)) {
        if (i.otherId !== undefined) expect(isMoveDisabled(f.moves.get(i.otherId)!)).toBe(false);
      }
    }
  });
});

describe('InputBuffer (har.c har_act, S7)', () => {
  const file = af([[20, move({ moveString: 'P32' })]]);

  it('measures staleness at the press, from the last change of the buffer', () => {
    const b = new InputBuffer();
    b.push('2', 0);
    b.push('3', 20); // a long gap between directions does not matter
    expect(b.press(file, 'P', 22)).toBe(20);
  });

  it('a repeated direction does not refresh the window', () => {
    const b = new InputBuffer();
    b.push('2', 0);
    b.push('3', 5);
    b.push('3', 13);
    expect(b.buffer).toBe('32');
    expect(b.press(file, 'P', 20)).toBeNull(); // 15 ticks since "3": only "3" counts
  });

  it('a button on its own adds neutral 5', () => {
    const b = new InputBuffer();
    b.push('2', 0);
    b.push('3', 1);
    expect(b.press(file, 'P', 2, '5')).toBeNull();
    expect(b.buffer).toBe('532');
  });

  it('a match longer than the button clears the buffer', () => {
    const b = new InputBuffer();
    b.push('2', 0);
    b.push('3', 1);
    expect(b.press(file, 'P', 2)).toBe(20);
    expect(b.buffer).toBe('');
    // The held direction comes back with the next press.
    expect(b.press(af([[15, move({ moveString: 'P3' })]]), 'P', 3)).toBe(15);
  });
});
