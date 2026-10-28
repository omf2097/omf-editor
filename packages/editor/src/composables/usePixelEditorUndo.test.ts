import { describe, expect, it } from 'vitest';
import { PIXEL_UNDO_LIMIT, usePixelEditor } from './usePixelEditor';
import * as px from '../lib/pixels';

describe('pixel editor undo stack (D16)', () => {
  it('keeps only the last PIXEL_UNDO_LIMIT strokes', () => {
    const pe = usePixelEditor();
    pe.load(px.blank(2, 2), 0, 0);
    for (let i = 0; i < PIXEL_UNDO_LIMIT + 50; i++) {
      pe.begin();
      const img = px.cloneImg(pe.working.value);
      img.pixels[0] = i % 256;
      pe.commit(img);
    }
    expect(pe.undoStack.value.length).toBe(PIXEL_UNDO_LIMIT);
    pe.undo();
    expect(pe.working.value.pixels[0]).toBe((PIXEL_UNDO_LIMIT + 48) % 256);
  });
});
