import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { SCENE_H, SCENE_W } from '../canvas/render';
import type { Rect } from '../lib/scene';
import { useDocument } from './useDocument';
import { ZOOMS, useViewport } from './useViewport';
import { useViewPan, useViewTransform } from './useViewTransform';

// View of the zoomable scene preview (spec 12 §9): the shared pane transform
// on the viewport zoom. One preview is shown at a time; the view carries over
// between them (switching tabs keeps zoom and centre), and a newly opened
// document, or the Fit button, fits the scene and centres it.
//
// The Centred mode passes a larger stage and a `frame` (the animation's
// sprites around the followed object): Fit then fits the frame, and another
// frame (another animation, facing, mode) refits, or recentres a zoomed view.

/** What the preview shows: the stage size in scene pixels and the region a fit fills. */
export interface SceneLayout {
  width: number;
  height: number;
  /** Region to fit; the whole stage when null. */
  frame: Rect | null;
}

/** Module state: what the next preview mounted shows. */
const state = {
  /** Fit on mount (nothing zoomed or panned since the last fit). */
  fitted: true,
  /** Document generation the view belongs to; another one fits. */
  generation: -1,
  /** Stage point at the pane centre when the last preview went away. */
  centre: { x: SCENE_W / 2, y: SCENE_H / 2 },
};

export function useSceneView(
  pane: Ref<HTMLElement | null>,
  layout: () => SceneLayout,
  fullscreen?: Ref<boolean>,
) {
  const vp = useViewport();
  const docs = useDocument();
  const t = useViewTransform(pane, layout, vp.zoom, {
    steps: ZOOMS,
    fitMargin: 0,
    guess: () => ({ w: 2 * SCENE_W, h: 2 * SCENE_H }),
    // The scene fills the preview box; the zoom buttons give exact whole steps.
    exactFit: true,
  });
  let fitting = false;
  let placed = false;

  function fit(): void {
    fitting = true;
    t.fitZoom(layout().frame ?? undefined);
    fitting = false;
    state.fitted = true;
    state.generation = docs.generation.value;
  }

  // Any other zoom change (buttons, keys, wheel) leaves the fitted view.
  watch(
    vp.zoom,
    () => {
      if (!fitting) state.fitted = false;
    },
    { flush: 'sync' },
  );
  const pan = useViewPan(t, () => (state.fitted = false));

  /** First placement, once the pane has a size. */
  function place(): void {
    const s = t.size();
    if (placed || !s.w || !s.h) return;
    placed = true;
    if (state.fitted || state.generation !== docs.generation.value) fit();
    else t.centreOn(state.centre);
  }

  // Fullscreen fits; leaving it restores the view from before once the pane
  // is back to its size (on the resize below).
  type Saved = { fitted: boolean; zoom: number; centre: { x: number; y: number } };
  let beforeFull: Saved | null = null;
  let restoring = false;
  function restore(): void {
    const b = beforeFull;
    if (!restoring || !b) return;
    restoring = false;
    beforeFull = null;
    if (b.fitted) return fit();
    vp.zoom.value = b.zoom;
    state.fitted = false;
    t.centreOn(b.centre);
  }
  if (fullscreen) {
    // The view is taken when fullscreen is asked for: by the time the browser
    // reports it, the pane has already changed size.
    let asked: Saved | null = null;
    watch(
      () => vp.fullscreenRequest.value,
      () => {
        if (placed && !fullscreen.value)
          asked = { fitted: state.fitted, zoom: vp.zoom.value, centre: t.centrePoint() };
      },
      { flush: 'sync' },
    );
    watch(fullscreen, (on) => {
      if (on) {
        beforeFull = asked;
        asked = null;
        restoring = false;
        fit();
      } else if (beforeFull) {
        restoring = true;
        // Without a resize (the pane happened to keep its size) restore anyway.
        void nextTick(() => requestAnimationFrame(() => requestAnimationFrame(restore)));
      }
    });
  }

  onMounted(place);
  // The box settles to its width after the first layout, and changes with the
  // window: a view nobody has zoomed or panned since its fit stays fitted.
  useResizeObserver(pane, () => {
    if (!placed) place();
    else if (restoring) restore();
    else if (state.fitted) fit();
  });
  onBeforeUnmount(() => {
    if (placed) state.centre = t.centrePoint();
  });
  watch(() => docs.generation.value, fit);
  watch(() => vp.fitRequest.value, fit);
  watch(() => vp.mode.value, fit);
  // Another frame to follow: a fitted view fits it, a zoomed one keeps the
  // zoom and centres on it.
  watch(
    () => JSON.stringify(layout().frame),
    () => {
      if (!placed) return;
      const f = layout().frame;
      if (state.fitted || !f) fit();
      else t.centreOn({ x: f.x + f.width / 2, y: f.y + f.height / 2 });
    },
  );

  return {
    offset: t.offset,
    onWheel: t.onWheel,
    spaceHeld: pan.spaceHeld,
    panning: pan.panning,
    onPanDown: pan.onPanDown,
    onPanMove: pan.onPanMove,
    onPanEnd: pan.onPanEnd,
  };
}
