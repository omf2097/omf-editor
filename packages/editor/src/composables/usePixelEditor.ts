import { computed, ref, shallowRef } from 'vue';
import { TRANSPARENT, encodeSprite, MAX_IMAGE_BYTES } from '@omf/formats';
import * as px from '../lib/pixels';
import type { IconName } from '../lib/icons';

// State of the sprite pixel editor (spec 13), a module singleton so tool,
// colours and zoom survive leaving and reopening the editor. The editor works
// on a copy of the sprite (`working`); nothing reaches the document until Apply.
// Undo here is per stroke and separate from the document history.

export type PixelTool =
  'pencil' | 'eraser' | 'line' | 'rect' | 'fill' | 'select' | 'move' | 'picker';

/** Toolbar order, with each tool's single-key shortcut. */
export const PIXEL_TOOLS: { id: PixelTool; icon: IconName; label: string; key: string }[] = [
  { id: 'pencil', icon: 'pencil', label: 'Pencil', key: 'B' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser', key: 'X' },
  { id: 'line', icon: 'line', label: 'Line', key: 'L' },
  { id: 'rect', icon: 'rect', label: 'Rectangle (Alt: filled)', key: 'R' },
  { id: 'fill', icon: 'fill', label: 'Fill (Shift: all of that colour)', key: 'G' },
  { id: 'select', icon: 'select', label: 'Select', key: 'M' },
  { id: 'move', icon: 'move', label: 'Move', key: 'V' },
  { id: 'picker', icon: 'picker', label: 'Colour picker', key: 'I' },
];

/** Sprite index 0 is transparent in openomf (spec 13 §7): painting it stores TRANSPARENT. */
export const paintable = (v: number): number => (v === 0 ? TRANSPARENT : v);

interface Snapshot {
  img: px.Img;
  posX: number;
  posY: number;
}

const working = shallowRef<px.Img>(px.blank(1, 1));
const posX = ref(0);
const posY = ref(0);
const original = shallowRef<Snapshot | null>(null);
const tool = ref<PixelTool>('pencil');
const fg = ref<number>(1);
const bg = ref<number>(TRANSPARENT);
const brush = ref(1);
const zoom = ref(8);
const grid = ref(true);
const onionPrev = ref(true);
const onionNext = ref(false);
const arenaBg = ref(false);
const flipPreview = ref(false);
const selection = ref<px.Rect | null>(null);
const undoStack = shallowRef<Snapshot[]>([]);
const redoStack = shallowRef<Snapshot[]>([]);
/** In-app clipboard shared between sprites (spec 13 §8). */
const clipboard = shallowRef<{ img: px.Img; x: number; y: number } | null>(null);
const version = ref(0);

/** Strokes kept for undo while the editor is open (oldest dropped). */
export const PIXEL_UNDO_LIMIT = 200;
const capped = (s: Snapshot[]): Snapshot[] =>
  s.length > PIXEL_UNDO_LIMIT ? s.slice(s.length - PIXEL_UNDO_LIMIT) : s;

const snap = (): Snapshot => ({
  img: px.cloneImg(working.value),
  posX: posX.value,
  posY: posY.value,
});

function load(img: px.Img, x: number, y: number): void {
  working.value = px.cloneImg(img);
  posX.value = x;
  posY.value = y;
  original.value = snap();
  undoStack.value = [];
  redoStack.value = [];
  selection.value = null;
  version.value++;
}

/** Records the state before a stroke. Every edit is begin() → commit()… (→ dropIfUnchanged()). */
function begin(): void {
  undoStack.value = capped([...undoStack.value, snap()]);
  redoStack.value = [];
}

function commit(img: px.Img): void {
  working.value = img;
  version.value++;
}

const sameState = (a: Snapshot): boolean =>
  a.posX === posX.value && a.posY === posY.value && px.sameImage(a.img, working.value);

/** Ends a stroke that changed nothing without leaving an undo step. */
function dropIfUnchanged(): void {
  const s = undoStack.value[undoStack.value.length - 1];
  if (s && sameState(s)) undoStack.value = undoStack.value.slice(0, -1);
}

/** Reverts an unfinished stroke to the state recorded by begin(). */
function abortStroke(): void {
  const s = undoStack.value[undoStack.value.length - 1];
  if (!s) return;
  undoStack.value = undoStack.value.slice(0, -1);
  restore(s);
}

function restore(s: Snapshot): void {
  working.value = s.img;
  posX.value = s.posX;
  posY.value = s.posY;
  version.value++;
}

function undo(): void {
  const s = undoStack.value[undoStack.value.length - 1];
  if (!s) return;
  undoStack.value = undoStack.value.slice(0, -1);
  redoStack.value = [...redoStack.value, snap()];
  restore(s);
}

function redo(): void {
  const s = redoStack.value[redoStack.value.length - 1];
  if (!s) return;
  redoStack.value = redoStack.value.slice(0, -1);
  undoStack.value = capped([...undoStack.value, snap()]);
  restore(s);
}

const modified = computed(() => {
  void version.value;
  const o = original.value;
  return (
    !!o && (o.posX !== posX.value || o.posY !== posY.value || !px.sameImage(o.img, working.value))
  );
});

const encodedSize = computed(() => {
  void version.value;
  try {
    return encodeSprite(working.value).length;
  } catch {
    return MAX_IMAGE_BYTES + 1;
  }
});

/**
 * Applies `fn` to the selection (or whole image) as one undo step. Returns
 * the opaque pixels lost because a rotated selection reached past the edge.
 */
function transform(fn: (d: px.Img) => px.Img): number {
  begin();
  const sel = selection.value;
  if (!sel) {
    commit(fn(working.value));
    return 0;
  }
  const { base: out, part } = px.lift(working.value, sel);
  const t = fn(part);
  const clipped = px.paste(out, t, sel.x, sel.y);
  const w = working.value;
  const x = Math.min(sel.x, w.width - 1);
  const y = Math.min(sel.y, w.height - 1);
  selection.value = {
    x,
    y,
    w: Math.min(t.width, w.width - x),
    h: Math.min(t.height, w.height - y),
  };
  commit(out);
  return clipped;
}

const wholeImage = (): px.Rect => ({ x: 0, y: 0, w: working.value.width, h: working.value.height });

function selectAll(): void {
  selection.value = wholeImage();
}

/** Makes the selection transparent. */
function clearSelection(): void {
  const s = selection.value;
  if (!s) return;
  begin();
  const out = px.cloneImg(working.value);
  px.rect(out, s, TRANSPARENT, true);
  commit(out);
}

/** Copies the selection, or the whole image, with its position for paste in place. */
function copy(): void {
  const s = selection.value ?? wholeImage();
  clipboard.value = { img: px.copyRect(working.value, s), x: s.x, y: s.y };
}

/** Pastes the clipboard at `at` (default where it was copied) and selects it. Returns clipped pixels. */
function paste(at?: { x: number; y: number }): number {
  const c = clipboard.value;
  if (!c) return 0;
  begin();
  const out = px.cloneImg(working.value);
  const x = at ? at.x : c.x;
  const y = at ? at.y : c.y;
  const clipped = px.paste(out, c.img, x, y);
  selection.value = { x, y, w: c.img.width, h: c.img.height };
  commit(out);
  return clipped;
}

/** Moves the selection (or the whole image) by (dx, dy) as one undo step. Returns clipped pixels. */
function nudge(dx: number, dy: number): number {
  const s = selection.value;
  begin();
  const { base, part } = px.lift(working.value, s);
  const clipped = px.paste(base, part, (s?.x ?? 0) + dx, (s?.y ?? 0) + dy);
  if (s) selection.value = { ...s, x: s.x + dx, y: s.y + dy };
  commit(base);
  return clipped;
}

export function usePixelEditor() {
  return {
    working,
    posX,
    posY,
    original,
    tool,
    fg,
    bg,
    brush,
    zoom,
    grid,
    onionPrev,
    onionNext,
    arenaBg,
    flipPreview,
    selection,
    clipboard,
    version,
    undoStack,
    redoStack,
    modified,
    encodedSize,
    tooLarge: computed(() => encodedSize.value > MAX_IMAGE_BYTES),
    load,
    begin,
    commit,
    dropIfUnchanged,
    abortStroke,
    undo,
    redo,
    transform,
    selectAll,
    clearSelection,
    copy,
    paste,
    nudge,
  };
}
