import type { Ref } from 'vue';
import type { Img } from '../lib/pixels';
import { usePixelEditor } from './usePixelEditor';
import { useViewTransform } from './useViewTransform';

/** Zoom steps of the pixel editor. */
export const PIXEL_ZOOMS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];

/** Free space kept around the sprite when fitting, per side. */
const FIT_MARGIN = 16;

/**
 * View transform of the pixel editor (spec 13 §4): the shared pane transform
 * (useViewTransform) on the editor's zoom, fitting with a 16 px margin.
 */
export function usePixelZoom(pane: Ref<HTMLElement | null>, img: () => Img) {
  const pe = usePixelEditor();
  const t = useViewTransform(pane, img, pe.zoom, {
    steps: PIXEL_ZOOMS,
    fitMargin: FIT_MARGIN,
    // Before the pane is laid out: the window minus the side panels.
    guess: () => ({ w: window.innerWidth - 420, h: window.innerHeight - 260 }),
  });
  return {
    offset: t.offset,
    moveTo: t.moveTo,
    centre: t.centre,
    zoomStep: t.zoomStep,
    setZoom: t.setZoom,
    fitZoom: t.fitZoom,
    onWheel: t.onWheel,
  };
}
