import { describe, expect, it } from 'vitest';
import { TRANSPARENT } from '@omf/formats';
import { usePixelEditor } from './usePixelEditor';
import * as px from '../lib/pixels';

const img = (w: number, h: number, f: (x: number, y: number) => number): px.Img => ({
  width: w,
  height: h,
  pixels: Uint16Array.from({ length: w * h }, (_, i) => f(i % w, Math.floor(i / w))),
});

describe('usePixelEditor', () => {
  it('leaves no undo step for a stroke that changed nothing (G18)', () => {
    const pe = usePixelEditor();
    pe.load(
      img(2, 2, () => 3),
      0,
      0,
    );
    pe.begin();
    const out = px.cloneImg(pe.working.value);
    px.fill(out, 0, 0, 3);
    pe.commit(out);
    pe.dropIfUnchanged();
    expect(pe.undoStack.value.length).toBe(0);
    pe.begin();
    const out2 = px.cloneImg(pe.working.value);
    px.set(out2, 0, 0, 4);
    pe.commit(out2);
    pe.dropIfUnchanged();
    expect(pe.undoStack.value.length).toBe(1);
  });

  it('aborts an unfinished stroke back to its start (G18 pointercancel)', () => {
    const pe = usePixelEditor();
    pe.load(
      img(2, 1, () => 3),
      0,
      0,
    );
    pe.begin();
    pe.commit(img(2, 1, () => 9));
    pe.abortStroke();
    expect(Array.from(pe.working.value.pixels)).toEqual([3, 3]);
    expect(pe.undoStack.value.length).toBe(0);
  });

  it('reports pixels a rotated selection loses at the edge (G19)', () => {
    const pe = usePixelEditor();
    pe.load(
      img(4, 2, () => 5),
      0,
      0,
    );
    pe.selection.value = { x: 0, y: 0, w: 4, h: 2 };
    // 4×2 turns into 2×4 and only 2 rows fit.
    expect(pe.transform(px.rotate90)).toBe(4);
    expect(pe.selection.value).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    pe.selection.value = null;
    expect(pe.transform(px.flipH)).toBe(0);
    expect(pe.working.value.pixels.filter((p) => p === TRANSPARENT).length).toBe(4);
  });
});
