import { ref, shallowRef, type Ref } from 'vue';
import { TRANSPARENT } from '@omf/formats';
import * as px from '../lib/pixels';
import { clamp } from '../lib/util';
import { paintable, usePixelEditor, type PixelTool } from './usePixelEditor';
import { useToasts } from './useToasts';
import { useViewPan } from './useViewTransform';

// Pointer handling of the pixel editor canvas (spec 13 §3): the drawing tools
// on the overlay canvas, and panning the view with the middle button or
// Space + drag anywhere in the pane (useViewPan).
//
// Undo: a gesture calls pe.begin() on press. Pencil strokes commit on every
// move; line, rectangle and move show `preview` while dragging and commit on
// release. A release that changed nothing drops its undo step; a cancelled
// pointer reverts the gesture.

type Point = { x: number; y: number };

/** A drag of the pencil, eraser, line, rectangle or select tool. */
interface Stroke {
  /** The image when the drag started (line and rectangle redraw onto it). */
  base: px.Img;
  x0: number;
  y0: number;
  lastX: number;
  lastY: number;
  /** Palette index painted, already through paintable(). */
  value: number;
  tool: PixelTool;
}

/** Pixels lifted by the move tool, following the pointer until release. */
interface Floating {
  img: px.Img;
  /** The image with the lifted area made transparent. */
  base: px.Img;
  /** Where the lifted part was. */
  x: number;
  y: number;
  /** Pointer pixel at the press. */
  startX: number;
  startY: number;
  sel: px.Rect | null;
}

/**
 * `overlay` is the canvas receiving the tool events; the pane takes the pan
 * events (onPan*) and `view` holds its offset. `img` is the working image.
 */
export function usePixelPointer(
  overlay: Ref<HTMLElement | null>,
  view: { offset: Ref<Point>; moveTo: (p: Point) => void },
  img: () => px.Img,
) {
  const pe = usePixelEditor();
  const toasts = useToasts();

  /** Image pixel under the pointer (may be outside the image). */
  const hoverPx = ref<Point | null>(null);
  /** Image shown instead of the working one during a line, rectangle or move drag. */
  const preview = shallowRef<{ img: px.Img } | null>(null);

  let stroke: Stroke | null = null;
  /** End of the last pencil stroke, for Shift+click lines. */
  let lastPoint: Point | null = null;
  let floating: Floating | null = null;

  /** Event position in image pixels. Flip only mirrors the display; editing stays unflipped. */
  function pos(e: PointerEvent): Point {
    const d = img();
    const r = overlay.value!.getBoundingClientRect();
    const z = r.width / d.width;
    const x = Math.floor((e.clientX - r.left) / z);
    return {
      x: pe.flipPreview.value ? d.width - 1 - x : x,
      y: Math.floor((e.clientY - r.top) / z),
    };
  }

  // ------------------------------------------------------------- panning
  const { spaceHeld, panning, holdSpace, onPanDown, onPanMove, onPanEnd } = useViewPan(view);

  // ------------------------------------------------------------- tools
  function pickAt(p: Point, right: boolean): void {
    const v = px.get(img(), p.x, p.y);
    if (v === undefined) return;
    if (right) pe.bg.value = v;
    else pe.fg.value = v;
  }

  function fillAt(p: Point, value: number, global: boolean): void {
    pe.begin();
    const out = px.cloneImg(img());
    px.fill(out, p.x, p.y, value, global);
    pe.commit(out);
    pe.dropIfUnchanged();
  }

  function liftForMove(p: Point): void {
    pe.begin();
    const sel = pe.selection.value;
    const { base, part } = px.lift(img(), sel);
    floating = { img: part, base, x: sel?.x ?? 0, y: sel?.y ?? 0, startX: p.x, startY: p.y, sel };
  }

  /** Pencil, eraser, line or rectangle press. Pencil and eraser paint at once (Shift: line from the last stroke). */
  function startStroke(p: Point, t: PixelTool, value: number, shift: boolean): void {
    pe.begin();
    stroke = { base: px.cloneImg(img()), x0: p.x, y0: p.y, lastX: p.x, lastY: p.y, value, tool: t };
    if (t !== 'pencil' && t !== 'eraser') return;
    const out = px.cloneImg(img());
    if (shift && lastPoint) px.line(out, lastPoint.x, lastPoint.y, p.x, p.y, value, pe.brush.value);
    else px.stamp(out, p.x, p.y, value, pe.brush.value);
    pe.commit(out);
  }

  /** The line or rectangle a drag from the stroke start to `p` draws. */
  function shapeOf(s: Stroke, p: Point, e: PointerEvent): px.Img {
    const out = px.cloneImg(s.base);
    if (s.tool === 'line') {
      const [x1, y1] = e.shiftKey ? px.snap45(s.x0, s.y0, p.x, p.y) : [p.x, p.y];
      px.line(out, s.x0, s.y0, x1, y1, s.value, pe.brush.value);
    } else {
      const [x1, y1] = e.shiftKey ? px.snapSquare(s.x0, s.y0, p.x, p.y) : [p.x, p.y];
      px.rect(out, px.normRect(s.x0, s.y0, x1, y1), s.value, e.altKey);
    }
    return out;
  }

  /** The lifted pixels dropped at their offset for pointer pixel `p`; returns clipped pixels too. */
  function dropFloating(
    f: Floating,
    p: Point,
  ): { img: px.Img; x: number; y: number; clipped: number } {
    const out = px.cloneImg(f.base);
    const x = f.x + p.x - f.startX;
    const y = f.y + p.y - f.startY;
    const clipped = px.paste(out, f.img, x, y);
    return { img: out, x, y, clipped };
  }

  // ------------------------------------------------------------- events
  function onDown(e: PointerEvent): void {
    if (e.button === 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = pos(e);
    const right = e.button === 2;
    // Alt is the temporary picker, except with the rectangle, where it means filled.
    const t = e.altKey && pe.tool.value !== 'rect' ? 'picker' : pe.tool.value;
    const value = paintable(t === 'eraser' ? TRANSPARENT : right ? pe.bg.value : pe.fg.value);
    if (t === 'picker') pickAt(p, right);
    else if (t === 'fill') fillAt(p, value, e.shiftKey);
    else if (t === 'move') liftForMove(p);
    else if (t === 'select') {
      // Selecting is not an edit: no undo step.
      stroke = { base: img(), x0: p.x, y0: p.y, lastX: p.x, lastY: p.y, value, tool: t };
      pe.selection.value = px.normRect(p.x, p.y, p.x, p.y);
    } else startStroke(p, t, value, e.shiftKey);
  }

  function onMove(e: PointerEvent): void {
    const p = pos(e);
    hoverPx.value = p;
    if (floating) {
      preview.value = { img: dropFloating(floating, p).img };
      return;
    }
    const s = stroke;
    if (!s) return;
    if (s.tool === 'pencil' || s.tool === 'eraser') {
      const out = px.cloneImg(img());
      px.line(out, s.lastX, s.lastY, p.x, p.y, s.value, pe.brush.value);
      s.lastX = p.x;
      s.lastY = p.y;
      pe.commit(out);
    } else if (s.tool === 'line' || s.tool === 'rect') {
      preview.value = { img: shapeOf(s, p, e) };
    } else if (s.tool === 'select') {
      const d = img();
      pe.selection.value = px.normRect(
        clamp(s.x0, 0, d.width - 1),
        clamp(s.y0, 0, d.height - 1),
        clamp(p.x, 0, d.width - 1),
        clamp(p.y, 0, d.height - 1),
      );
    }
  }

  function onUp(e: PointerEvent): void {
    const p = pos(e);
    if (floating) {
      const r = dropFloating(floating, p);
      if (r.clipped) toasts.info(`${r.clipped} pixel(s) moved outside the sprite were clipped`);
      if (floating.sel) pe.selection.value = { ...floating.sel, x: r.x, y: r.y };
      floating = null;
      preview.value = null;
      pe.commit(r.img);
      pe.dropIfUnchanged();
      return;
    }
    const s = stroke;
    if (s && (s.tool === 'line' || s.tool === 'rect')) pe.commit(shapeOf(s, p, e));
    if (s && (s.tool === 'pencil' || s.tool === 'eraser')) lastPoint = { x: p.x, y: p.y };
    if (s && s.tool !== 'select') pe.dropIfUnchanged();
    preview.value = null;
    stroke = null;
  }

  /** The browser took the pointer (touch scroll, focus loss): undo the unfinished stroke. */
  function onCancel(): void {
    const began = floating || (stroke && stroke.tool !== 'select');
    floating = null;
    stroke = null;
    preview.value = null;
    if (began) pe.abortStroke();
  }

  function onLeave(): void {
    hoverPx.value = null;
  }

  return {
    hoverPx,
    preview,
    spaceHeld,
    panning,
    holdSpace,
    onPanDown,
    onPanMove,
    onPanEnd,
    onDown,
    onMove,
    onUp,
    onCancel,
    onLeave,
  };
}
