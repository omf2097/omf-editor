import { beforeEach, describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, useHistory } from './useHistory';
import type { Doc } from '../lib/doc';

const doc = (n: number) => ({ n }) as unknown as Doc;
const n = (d: Doc | null) => (d as unknown as { n: number } | null)?.n ?? null;
const h = useHistory();

beforeEach(() => h.clear());

describe('useHistory', () => {
  it('undo and redo walk the stacks; a new commit clears redo', () => {
    h.commit('add animation', doc(0), 0);
    h.commit('delete sprite', doc(1), 1000);
    expect(h.undoLabel.value).toBe('delete sprite');
    expect(n(h.undo(doc(2)))).toBe(1);
    expect(n(h.undo(doc(1)))).toBe(0);
    expect(h.undo(doc(0))).toBeNull();
    expect(h.canUndo.value).toBe(false);
    expect(h.redoLabel.value).toBe('add animation');
    expect(n(h.redo(doc(0)))).toBe(1);
    expect(h.canRedo.value).toBe(true);
    h.commit('set health', doc(1), 5000);
    expect(h.canRedo.value).toBe(false);
    expect(h.redo(doc(9))).toBeNull();
  });

  it(`keeps the newest ${HISTORY_LIMIT} entries`, () => {
    expect(HISTORY_LIMIT).toBe(200);
    for (let i = 0; i < 205; i++) h.commit(`add ${i}`, doc(i), i * 1000);
    expect(h.undoStack.value).toHaveLength(200);
    expect(h.undoStack.value[0]!.label).toBe('add 5');
    let last: Doc | null = null;
    for (let i = 0; i < 200; i++) last = h.undo(doc(-1));
    expect(n(last)).toBe(5);
    expect(h.undo(doc(-1))).toBeNull();
  });

  it('coalesces the same value edit within 500 ms, keeping the oldest document', () => {
    h.commit('set health', doc(0), 0);
    h.commit('set health', doc(1), 499);
    h.commit('set health', doc(2), 998); // 499 ms after the previous one
    expect(h.undoStack.value).toHaveLength(1);
    expect(n(h.undoStack.value[0]!.doc)).toBe(0);
    h.commit('set health', doc(3), 1498); // exactly 500 ms: a new entry
    expect(h.undoStack.value).toHaveLength(2);
    h.commit('edit sprite 1/A', doc(4), 1500);
    h.commit('edit sprite 1/A', doc(5), 1600);
    expect(h.undoStack.value).toHaveLength(3);
  });

  it('never coalesces other labels, discrete operations or after a seal', () => {
    h.commit('set health', doc(0), 0);
    h.commit('set points', doc(1), 10);
    h.commit('add animation', doc(2), 20);
    h.commit('add animation', doc(3), 30);
    h.commit('set points', doc(4), 40, false);
    h.commit('set points', doc(5), 50, false);
    expect(h.undoStack.value.map((e) => e.label)).toEqual([
      'set health',
      'set points',
      'add animation',
      'add animation',
      'set points',
      'set points',
    ]);
    h.clear();
    h.commit('set health', doc(0), 0);
    h.seal();
    h.commit('set health', doc(1), 10);
    expect(h.undoStack.value).toHaveLength(2);
  });

  it('an undo or redo entry does not coalesce with the next edit', () => {
    h.commit('set health', doc(0), 10_000);
    h.undo(doc(1));
    h.redo(doc(0));
    h.commit('set health', doc(1), 10_010);
    expect(h.undoStack.value).toHaveLength(2);
  });
});
