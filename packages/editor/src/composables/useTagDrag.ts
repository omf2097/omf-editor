import { ref, watch } from 'vue';
import type { Point } from '../lib/scene';
import * as ops from '../lib/scriptOps';
import { draggedTagValue } from '../lib/tagMeta';
import { usePlayback } from './usePlayback';
import { useScriptEditor } from './useScriptEditor';
import { useSelection } from './useSelection';

/** A pointer event of the scene canvas, in scene coordinates. */
export interface ScenePointer {
  type: string;
  p: Point;
  ev: PointerEvent | MouseEvent;
}

/**
 * Script view: setting a position tag of the selected frame by dragging on the
 * canvas (spec 15 §3.2). While a tag is armed, playback holds the frame; each
 * move edits the working string (useWorkingScript), which the release commits.
 */
export function useTagDrag() {
  const sel = useSelection();
  const pb = usePlayback();
  const ed = useScriptEditor();
  /** Index of the armed tag in the selected frame, or null. */
  const dragTag = ref<number | null>(null);
  let dragStart: { p: Point; value: number } | null = null;

  /** What the drag was started on; any change (animation, string, frame, tags) ends it. */
  const dragContext = (): string =>
    JSON.stringify([
      sel.animId.value,
      pb.source.value,
      ed.selectedFrame.value,
      ed.script.value?.frames[ed.selectedFrame.value]?.tags.map((t) => t.key) ?? null,
    ]);
  let dragCtx = '';
  watch(dragContext, (c) => {
    if (dragTag.value !== null && c !== dragCtx) stopDrag();
  });

  function startDrag(tag: number | null): void {
    dragTag.value = tag;
    dragCtx = dragContext();
    if (tag !== null) {
      pb.pause();
      pb.holdFrame.value = ed.selectedFrame.value;
      pb.seekFrame(ed.selectedFrame.value);
    }
  }
  function stopDrag(): void {
    dragTag.value = null;
    dragStart = null;
  }
  function onPointer(e: ScenePointer): void {
    const s = ed.script.value;
    if (dragTag.value === null || !s) return;
    const frame = s.frames[ed.selectedFrame.value];
    const tag = frame?.tags[dragTag.value];
    if (!tag || tag.value === null) return;
    if (e.type === 'down') {
      (e.ev.target as HTMLElement).setPointerCapture?.((e.ev as PointerEvent).pointerId);
      dragStart = { p: e.p, value: tag.value };
    } else if (e.type === 'move' && dragStart) {
      // x+ x- x= move along the facing (the enemy string's opponent faces
      // left by default), so the value follows the pointer on screen.
      const mirrored = pb.facingLeft.value && /^x[-+=]$/.test(tag.key);
      const v = draggedTagValue(
        tag.key,
        dragStart.value,
        (e.p.x - dragStart.p.x) * (mirrored ? -1 : 1),
        e.p.y - dragStart.p.y,
      );
      if (v !== tag.value) ed.apply(ops.setTagValue(s, ed.selectedFrame.value, dragTag.value, v));
    } else if (e.type === 'up') {
      dragStart = null;
      ed.flush();
    }
  }

  return { dragTag, startDrag, stopDrag, onPointer };
}
