import { ref, watch, type Ref } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { clamp } from '../lib/util';

// View transform of a fixed-size, non-scrolling pane showing an image at a
// zoom (spec 12 §9, spec 13 §4): the pixel editor and the scene preview. The
// stage inside the pane is placed at `offset` (pane pixels of its top-left)
// and sized by the zoom. Zooming keeps the image point under the pointer
// (wheel) or the pane centre (keys, buttons, select) in place; panning moves
// `offset`, always keeping part of the image in view.

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/** Screen pixels of the image that panning keeps inside the pane on each axis. */
const KEEP_VISIBLE = 48;
/** Wheel travel (CSS px) per zoom step; one notch of a mouse wheel is about 100. */
const WHEEL_STEP = 40;

export interface ViewTransformOptions {
  /** Zoom steps of the wheel, keys and fit, ascending. */
  steps: number[];
  /** Free space kept around the image when fitting, per side. */
  fitMargin: number;
  /** Pane size assumed by a fit before the pane is laid out. */
  guess: () => { w: number; h: number };
  /**
   * Fit fills the pane exactly (a fractional zoom) instead of picking the
   * largest step that fits. The wheel and keys still move between steps.
   */
  exactFit?: boolean;
}

/**
 * `pane` is the fixed-size container, `content` the image size in image
 * pixels and `zoom` the zoom ref (owned by the caller; any change to it,
 * from anywhere, rescales around the anchor).
 */
export function useViewTransform(
  pane: Ref<HTMLElement | null>,
  content: () => Size,
  zoom: Ref<number>,
  opts: ViewTransformOptions,
) {
  const offset = ref<Point>({ x: 0, y: 0 });
  /** Pane point the next zoom change keeps fixed; the pane centre when null. */
  let anchor: Point | null = null;
  let paneSize = { w: 0, h: 0 };

  function size(): { w: number; h: number } {
    const el = pane.value;
    return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 0, h: 0 };
  }

  /** `offset` clamped so at least a little of the image stays inside the pane. */
  function clamped(p: Point, z = zoom.value): Point {
    const { w, h } = size();
    const d = content();
    const sw = d.width * z;
    const sh = d.height * z;
    const kx = Math.min(KEEP_VISIBLE, sw);
    const ky = Math.min(KEEP_VISIBLE, sh);
    // Kept unrounded: rounding here would compound over successive zooms.
    // The stage is placed at the rounded offset (whole screen pixels).
    return { x: clamp(p.x, kx - sw, w - kx), y: clamp(p.y, ky - sh, h - ky) };
  }

  /** Moves the stage's top-left to pane point `p` (clamped). */
  function moveTo(p: Point): void {
    offset.value = clamped(p);
  }

  /** Puts image point `c` at the pane centre at the current zoom. */
  function centreOn(c: Point): void {
    const { w, h } = size();
    const z = zoom.value;
    moveTo({ x: w / 2 - c.x * z, y: h / 2 - c.y * z });
  }

  /** Image point at the pane centre now. */
  function centrePoint(): Point {
    const { w, h } = size();
    const z = zoom.value;
    const o = offset.value;
    return { x: (w / 2 - o.x) / z, y: (h / 2 - o.y) / z };
  }

  /** Centres the image in the pane at the current zoom. */
  function centre(): void {
    const d = content();
    centreOn({ x: d.width / 2, y: d.height / 2 });
  }

  // Every zoom change (keys, wheel, buttons, select, fit) rescales around the anchor.
  watch(
    zoom,
    (z, old) => {
      const el = pane.value;
      if (!el || !old) return;
      const { w, h } = size();
      const a = anchor ?? { x: w / 2, y: h / 2 };
      const o = offset.value;
      offset.value = clamped(
        { x: a.x - ((a.x - o.x) * z) / old, y: a.y - ((a.y - o.y) * z) / old },
        z,
      );
    },
    { flush: 'sync' },
  );

  // A size change without a re-fit (rotate) keeps the image centre in place.
  watch(
    [() => content().width, () => content().height],
    ([w, h], [ow, oh]) => {
      if (!pane.value) return;
      const z = zoom.value;
      const o = offset.value;
      offset.value = clamped({ x: o.x + ((ow - w) * z) / 2, y: o.y + ((oh - h) * z) / 2 });
    },
    { flush: 'sync' },
  );

  // A resized pane keeps what was at its centre there; it does not re-fit.
  useResizeObserver(pane, () => {
    const s = size();
    if (paneSize.w && paneSize.h) {
      const o = offset.value;
      offset.value = clamped({
        x: o.x + (s.w - paneSize.w) / 2,
        y: o.y + (s.h - paneSize.h) / 2,
      });
    }
    paneSize = s;
  });

  /** Next zoom step up (+1) or down (-1) from the current one. */
  function zoomStep(dir: 1 | -1): number {
    const z = zoom.value;
    const steps = opts.steps;
    return dir > 0
      ? (steps.find((v) => v > z) ?? Math.max(z, steps[steps.length - 1]!))
      : ([...steps].reverse().find((v) => v < z) ?? steps[0]!);
  }

  /** Sets the zoom keeping the image point under (clientX, clientY), or the pane centre, in place. */
  function setZoom(z: number, at?: { clientX: number; clientY: number }): void {
    const r = pane.value?.getBoundingClientRect();
    anchor = at && r ? { x: at.clientX - r.left, y: at.clientY - r.top } : null;
    zoom.value = z;
    anchor = null;
  }

  /**
   * Sets the largest zoom step at which the image, or the `region` of it,
   * fits the pane, and centres it. An exact fit may exceed the largest step
   * (a small region); zooming in from there keeps the zoom.
   */
  function fitZoom(region?: { x: number; y: number; width: number; height: number }): void {
    const d = region ?? { x: 0, y: 0, ...content() };
    const el = pane.value;
    // Before the pane is laid out, the caller's guess stands in for its size.
    const g = el ? { w: el.clientWidth, h: el.clientHeight } : opts.guess();
    const m = 2 * opts.fitMargin;
    const k = Math.min(Math.max(200, g.w - m) / d.width, Math.max(200, g.h - m) / d.height);
    const steps = opts.steps;
    zoom.value = opts.exactFit
      ? Math.max(steps[0]!, k)
      : ([...steps].reverse().find((z) => z <= k) ?? steps[0]!);
    centreOn({ x: d.x + d.width / 2, y: d.y + d.height / 2 });
  }

  let wheel = 0;
  /** The wheel zooms around the cursor, one step per notch (trackpad travel adds up). */
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (Math.sign(dy) !== Math.sign(wheel)) wheel = 0;
    wheel += dy;
    if (Math.abs(wheel) < WHEEL_STEP) return;
    wheel = 0;
    setZoom(zoomStep(dy < 0 ? 1 : -1), e);
  }

  return {
    offset,
    moveTo,
    centre,
    centreOn,
    centrePoint,
    size,
    zoomStep,
    setZoom,
    fitZoom,
    onWheel,
  };
}

// ------------------------------------------------------------- Space hold
// Space held turns a left drag into a pan. Shared by every pane: the key's
// shortcut (the pixel editor's, or the playback bar's) calls holdSpace(); the
// release is seen here. In the scene a tap of Space still plays / pauses:
// that runs on release, unless the hold was used to pan.

const spaceHeld = ref(false);
let spaceTap: (() => void) | null = null;
let spaceInstalled = false;

function installSpace(): void {
  if (spaceInstalled || typeof window === 'undefined') return;
  spaceInstalled = true;
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    const tap = spaceHeld.value ? spaceTap : null;
    spaceHeld.value = false;
    spaceTap = null;
    tap?.();
  });
  window.addEventListener('blur', () => {
    spaceHeld.value = false;
    spaceTap = null;
  });
}

/**
 * Space was pressed (a shortcut handler calls this; key repeats are ignored).
 * `onTap` runs on release if no pan started meanwhile.
 */
export function holdSpace(onTap?: () => void): void {
  installSpace();
  if (spaceHeld.value) return;
  spaceHeld.value = true;
  spaceTap = onTap ?? null;
}

/**
 * Panning of a view transform's pane with the middle button, or the left one
 * with Space held, anywhere in the pane. Bind onPanDown in the capture phase
 * on the pane so it runs before the pane's own tools. `onPan` runs when a pan
 * starts.
 */
export function useViewPan(
  view: { offset: Ref<Point>; moveTo: (p: Point) => void },
  onPan?: () => void,
) {
  /** A pan drag is under way. */
  const panning = ref(false);
  let pan: { x: number; y: number; left: number; top: number } | null = null;

  function onPanDown(e: PointerEvent): void {
    if (!(e.button === 1 || (spaceHeld.value && e.button === 0))) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    spaceTap = null;
    const o = view.offset.value;
    pan = { x: e.clientX, y: e.clientY, left: o.x, top: o.y };
    panning.value = true;
    onPan?.();
  }
  function onPanMove(e: PointerEvent): void {
    if (!pan) return;
    view.moveTo({ x: pan.left + e.clientX - pan.x, y: pan.top + e.clientY - pan.y });
  }
  function onPanEnd(): void {
    pan = null;
    panning.value = false;
  }

  return { spaceHeld, panning, holdSpace: () => holdSpace(), onPanDown, onPanMove, onPanEnd };
}
