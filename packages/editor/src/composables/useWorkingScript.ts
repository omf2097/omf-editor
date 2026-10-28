import { computed, ref, watch } from 'vue';
import { useDocument } from './useDocument';
import { animationsOf, isAF } from '../lib/doc';

/**
 * Which string of an animation: the base string, an extra string by index, or
 * (AF moves) the enemy string, which the opponent plays (spec 15 §6.1).
 */
export type ScriptTarget = 'base' | number | 'enemy';

/**
 * An uncommitted animation string being edited (spec 15 §1). Playback reads
 * it so edits preview immediately; it is committed after 400 ms idle or on flush().
 */
export interface WorkingString {
  animId: number;
  target: ScriptTarget;
  text: string;
}

export const COMMIT_DELAY_MS = 400;

const working = ref<WorkingString | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;
const { doc, mutate, generation, beforeSerialize } = useDocument();

watch(generation, () => {
  cancel();
});
// Saving and exporting commit the pending edit first.
beforeSerialize(() => flush());

function currentText(animId: number, target: ScriptTarget): string {
  const d = doc.value;
  if (target === 'enemy') return d && isAF(d) ? (d.moves.get(animId)?.enemyString ?? '') : '';
  const a = d ? animationsOf(d).get(animId) : undefined;
  if (!a) return '';
  return target === 'base' ? a.baseString : (a.extraStrings[target] ?? '');
}

function editLabel(w: WorkingString): string {
  if (w.target === 'base') return `edit script ${w.animId}`;
  if (w.target === 'enemy') return `edit enemy string ${w.animId}`;
  return `edit extra string ${w.animId}/${w.target}`;
}

/**
 * Debounced (typing, value edits) unless `label` is given: then the change is a
 * discrete operation and is committed at once as its own undo step.
 */
function set(animId: number, target: ScriptTarget, text: string, label?: string): void {
  if (label) {
    flush();
    if (text !== currentText(animId, target)) commitText({ animId, target, text }, label, false);
    return;
  }
  if (working.value && (working.value.animId !== animId || working.value.target !== target))
    flush();
  working.value = { animId, target, text };
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, COMMIT_DELAY_MS);
}

function flush(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const w = working.value;
  working.value = null;
  if (!w || w.text === currentText(w.animId, w.target)) return;
  commitText(w, editLabel(w), true);
}

function commitText(w: WorkingString, label: string, coalesce: boolean): void {
  mutate(
    label,
    (d) => {
      if (w.target === 'enemy') {
        const m = isAF(d) ? d.moves.get(w.animId) : undefined;
        if (m) m.enemyString = w.text;
        return;
      }
      const a = animationsOf(d).get(w.animId);
      if (!a) return;
      if (w.target === 'base') a.baseString = w.text;
      else a.extraStrings[w.target] = w.text;
    },
    { coalesce },
  );
}

function cancel(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  working.value = null;
}

/** The text to show/play: working copy when it matches, else the document's. */
function textFor(animId: number, target: ScriptTarget): string {
  const w = working.value;
  if (w && w.animId === animId && w.target === target) return w.text;
  return currentText(animId, target);
}

export function useWorkingScript() {
  return { working, set, flush, cancel, textFor, pending: computed(() => working.value !== null) };
}
