// Undo and redo stacks of whole document values (spec 11 "Mutation and undo").
// Values share their large buffers (cloneDoc), so an entry is cheap.

import { computed, shallowRef } from 'vue';
import type { Doc } from '../lib/doc';

export interface HistoryEntry {
  label: string;
  /** Undo: the document before the change. Redo: the document the undo left. */
  doc: Doc;
  /** performance.now() of the last coalesced change; 0 or -Infinity never coalesces. */
  at: number;
}

export const HISTORY_LIMIT = 200;
const COALESCE_MS = 500;

const undoStack = shallowRef<HistoryEntry[]>([]);
const redoStack = shallowRef<HistoryEntry[]>([]);

/**
 * Value edits coalesce: labels starting with "set " or "edit ". Discrete
 * operations (add, delete, duplicate, import, …) are always their own step.
 */
const coalescing = (label: string): boolean => /^(set|edit) /.test(label);

/** Records `previous` before a change labelled `label`. Rapid value edits with the same label coalesce. */
function commit(label: string, previous: Doc, now = performance.now(), coalesce = true): void {
  const top = undoStack.value[undoStack.value.length - 1];
  redoStack.value = [];
  if (coalesce && coalescing(label) && top && top.label === label && now - top.at < COALESCE_MS) {
    undoStack.value = [...undoStack.value.slice(0, -1), { ...top, at: now }];
    return;
  }
  const next = [...undoStack.value, { label, doc: previous, at: now }];
  undoStack.value = next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/** Pops an undo entry; `current` goes onto the redo stack. */
function undo(current: Doc): Doc | null {
  const top = undoStack.value[undoStack.value.length - 1];
  if (!top) return null;
  undoStack.value = undoStack.value.slice(0, -1);
  redoStack.value = [...redoStack.value, { label: top.label, doc: current, at: 0 }];
  return top.doc;
}

function redo(current: Doc): Doc | null {
  const top = redoStack.value[redoStack.value.length - 1];
  if (!top) return null;
  redoStack.value = redoStack.value.slice(0, -1);
  undoStack.value = [...undoStack.value, { label: top.label, doc: current, at: 0 }];
  return top.doc;
}

/** The next commit starts a new entry (after a save, so undo can return to the saved state). */
function seal(): void {
  const top = undoStack.value[undoStack.value.length - 1];
  if (top) undoStack.value = [...undoStack.value.slice(0, -1), { ...top, at: -Infinity }];
}

function clear(): void {
  undoStack.value = [];
  redoStack.value = [];
}

export function useHistory() {
  return {
    undoStack,
    redoStack,
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    undoLabel: computed(() => undoStack.value[undoStack.value.length - 1]?.label ?? ''),
    redoLabel: computed(() => redoStack.value[redoStack.value.length - 1]?.label ?? ''),
    commit,
    undo,
    redo,
    seal,
    clear,
  };
}
