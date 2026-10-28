import { describe, expect, it } from 'vitest';
import {
  decodeScript,
  frameIndexAtTick,
  lintScriptString,
  msPerTick,
  reentryTick,
  spriteIndexOfFrame,
  tagValue,
  tickLenAtFrame,
  tickPosAtFrame,
  totalTicks,
} from '../src';

describe('script runtime helpers', () => {
  const sc = decodeScript('A10-bl3B5-C0-D2');

  it('computes tick positions', () => {
    expect(totalTicks(sc)).toBe(17);
    expect([0, 1, 2, 3].map((i) => tickPosAtFrame(sc, i))).toEqual([0, 10, 15, 15]);
    expect(tickLenAtFrame(sc, 1)).toBe(5);
  });

  it('finds the frame at a tick, wrapping, skipping zero-length frames', () => {
    expect([0, 9, 10, 14, 15, 16, 17, -1].map((t) => frameIndexAtTick(sc, t))).toEqual([
      0, 0, 1, 1, 3, 3, 0, 3,
    ]);
    expect(frameIndexAtTick(decodeScript(''), 3)).toBe(-1);
  });

  it('reads sprite index and tag values', () => {
    expect(spriteIndexOfFrame(sc.frames[3]!)).toBe(3);
    expect(tagValue(sc.frames[1]!, 'bl')).toBe(3);
    expect(tagValue(sc.frames[1]!, 'q')).toBeUndefined();
    expect(tagValue(decodeScript('rA1').frames[0]!, 'r')).toBeNull();
  });

  it('d re-entry ticks', () => {
    expect(reentryTick(sc, 3)).toBe(4);
    expect(reentryTick(sc, -2)).toBe(15);
  });

  it('tick timing follows openomf: 48 − 4 · speed setting, default 5 (S9)', () => {
    expect(msPerTick('arena')).toBe(28);
    expect([0, 1, 5, 9, 10].map((s) => msPerTick('arena', s))).toEqual([48, 44, 28, 12, 8]);
    expect(msPerTick('arena', 12)).toBe(8);
    expect(msPerTick('static', 3)).toBe(10);
  });

  it('adds negative durations as written (S17)', () => {
    const neg = decodeScript('A5-B-3-C4');
    expect(totalTicks(neg)).toBe(6);
    expect(tickPosAtFrame(neg, 2)).toBe(2);
    expect(tickLenAtFrame(neg, 1)).toBe(-3);
    // openomf script_get_frame_at: the first frame covering the tick.
    expect([0, 2, 4, 5].map((t) => frameIndexAtTick(neg, t))).toEqual([0, 0, 0, 2]);
  });

  it('reads the last of repeated tags, as openomf does', () => {
    expect(tagValue(decodeScript('s1s2A1').frames[0]!, 's')).toBe(2);
    expect(tagValue(decodeScript('dA1').frames[0]!, 'd')).toBe(0);
  });
});

describe('lintScriptString', () => {
  it('reports what openomf drops, with its position (S5)', () => {
    expect(lintScriptString('A1-#', 1)).toEqual([
      expect.objectContaining({ severity: 'warning', pos: 3, message: 'openomf drops "#"' }),
    ]);
    const msgs = lintScriptString('A5B7-C2', 3).map((d) => [d.frame, d.pos, d.message]);
    expect(msgs).toEqual([
      [0, 2, expect.stringContaining('openomf drops "B" after the frame')],
      [1, 3, 'openomf drops "7-"'],
    ]);
    expect(lintScriptString('!', 1)).toEqual([]);
  });

  it('reports clamped numbers and missing values (S5, S14, S16)', () => {
    const msgs = lintScriptString('s99999dA-', 1).map((d) => d.message);
    expect(msgs).toEqual([
      "'s' value 99999 is outside -32768…32767; openomf reads 32767",
      "'d' has no value; openomf reads 0, so the animation re-enters at tick 1 forever",
      'frame has no duration; openomf reads 0',
      'zero-duration frame',
    ]);
  });

  it('reports missing sprites, erratas and zero durations', () => {
    const msgs = lintScriptString('s+05A1-C0', 2).map((d) => d.message);
    expect(msgs).toEqual([
      "'s' value written with '+'",
      "'s' value has a leading zero",
      'frame C refers to a sprite that does not exist; nothing is drawn',
      'zero-duration frame',
    ]);
  });

  it('flags frames openomf loses (S3)', () => {
    const d = lintScriptString('uabeujf2jfE3-F4', 6);
    expect(d.map((x) => x.message)).toEqual(['openomf drops "uabeujf2jfE3-"']);
  });
});

describe('sprite letters', () => {
  it('maps indices and keys both ways', async () => {
    const { spriteLetter, spriteIndexOfKey } = await import('../src');
    expect(spriteLetter(0)).toBe('A');
    expect(spriteLetter(25)).toBe('Z');
    expect(spriteIndexOfKey('C')).toBe(2);
  });
});
