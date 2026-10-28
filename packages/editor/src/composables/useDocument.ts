// The open document, its file and undo history (spec 11 "Mutation and undo",
// "Saving"). Every edit goes through mutate(), which replaces `doc` with an
// edited copy; `dirty` compares identities with the last saved value.

import { computed, ref, shallowRef } from 'vue';
import {
  afFromJSON,
  afToJSON,
  bkFromJSON,
  bkToJSON,
  documentDiagnostics,
  jsonWarnings,
} from '@omf/formats';
import {
  cloneDoc,
  isAF,
  kindOf,
  parseDocument,
  serializeDocument,
  type Doc,
  type DocKind,
} from '../lib/doc';
import {
  download,
  ensurePermission,
  isNotFound,
  pickFile,
  saveAs as pickSaveAs,
  writeHandle,
  type PickedFile,
} from '../lib/files';
import { useHistory } from './useHistory';
import { errorMessage, useToasts } from './useToasts';

const doc = shallowRef<Doc | null>(null);
const fileName = ref('');
const handle = shallowRef<FileSystemFileHandle | null>(null);
/** The document value that matches the file on disk; null when nothing does (new, imported). */
const cleanDoc = shallowRef<Doc | null>(null);
/** Undoing back to the saved value is clean again (identity: history keeps the same objects). */
const dirty = computed(() => doc.value !== null && doc.value !== cleanDoc.value);
/** Bumped on every document replacement (open, close, new); lets views reset local state. */
const generation = ref(0);
const listeners = new Set<(reason: 'open' | 'close') => void>();

const history = useHistory();
const toasts = useToasts();

const kind = computed<DocKind | null>(() => (doc.value ? kindOf(doc.value) : null));

/** Serialised size in bytes; null when the document cannot be written as it is. */
const byteSize = computed<number | null>(() => {
  if (!doc.value) return 0;
  try {
    return serializeDocument(doc.value).length;
  } catch {
    return null;
  }
});

function setDocument(
  d: Doc | null,
  name: string,
  h: FileSystemFileHandle | null,
  isDirty = false,
): void {
  doc.value = d;
  fileName.value = name;
  handle.value = h;
  cleanDoc.value = isDirty ? null : d;
  history.clear();
  generation.value++;
  for (const l of listeners) l(d ? 'open' : 'close');
}

/** Opens bytes as a document. Throws on parse errors; the current document is untouched. */
function openBytes(name: string, bytes: Uint8Array, h: FileSystemFileHandle | null = null): Doc {
  const d = parseDocument(name, bytes);
  const ext = name.toLowerCase().split('.').pop();
  const k = kindOf(d);
  if (ext !== k)
    toasts.info(
      `${name} is a ${k === 'af' ? 'fighter (AF)' : 'scene (BK)'} file despite its extension`,
    );
  setDocument(d, name, h);
  return d;
}

async function openPicked(p: PickedFile): Promise<boolean> {
  try {
    openBytes(p.name, p.bytes, p.handle ?? null);
    return true;
  } catch (e) {
    toasts.error(`Could not open ${p.name}: ${errorMessage(e)}`);
    return false;
  }
}

/** Picks a file; read errors become a toast and null. */
async function pickOrToast(...args: Parameters<typeof pickFile>): Promise<PickedFile | null> {
  try {
    return await pickFile(...args);
  } catch (e) {
    toasts.error(`Could not read the file: ${errorMessage(e)}`);
    return null;
  }
}

async function openFile(): Promise<PickedFile | null> {
  const p = await pickOrToast();
  if (!p) return null;
  return (await openPicked(p)) ? p : null;
}

/**
 * Applies `fn` to a copy of the document and records one history entry.
 * `coalesce: false` for discrete operations that must stay separate undo steps.
 */
function mutate<T extends Doc = Doc>(
  label: string,
  fn: (d: T) => void,
  opts: { coalesce?: boolean } = {},
): void {
  const current = doc.value;
  if (!current) return;
  const next = cloneDoc(current) as T;
  fn(next);
  history.commit(label, current, performance.now(), opts.coalesce ?? true);
  doc.value = next;
}

/** Replaces the document with an already-built value (e.g. remapImages output). */
function replace(label: string, next: Doc): void {
  const current = doc.value;
  if (!current) return;
  history.commit(label, current, performance.now(), false);
  doc.value = next;
}

/** Undo and redo first commit a pending edit, so they act on the latest change. */
function undo(): void {
  flushPending();
  if (!doc.value) return;
  const prev = history.undo(doc.value);
  if (prev) doc.value = prev;
}

function redo(): void {
  flushPending();
  if (!doc.value) return;
  const next = history.redo(doc.value);
  if (next) doc.value = next;
}

/** Pending edits (e.g. the working script) are committed before saving or exporting. */
const beforeSerialize = new Set<() => void>();

/** Commits debounced edits (the working script) into the document. */
function flushPending(): void {
  for (const f of beforeSerialize) f();
}

/**
 * Also commits the focused text field: fields commit on blur, so it is
 * blurred and focused again. For actions that read the whole document
 * (save, export, the unsaved-changes check), not for periodic work.
 */
function commitPending(): void {
  const el = typeof document === 'undefined' ? null : document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.blur();
    el.focus();
  }
  flushPending();
}

/** Serialises the current document (pending edits committed); null after an error toast. */
function serialize(): { doc: Doc; bytes: Uint8Array } | null {
  flushPending();
  const d = doc.value;
  if (!d) return null;
  const blocking = documentDiagnostics(d).filter((x) => x.blocksSave);
  if (blocking.length) {
    const b = blocking[0]!;
    toasts.error(
      `Cannot save: ${b.message}${b.animation !== undefined ? ` (animation ${b.animation})` : ''}.`,
    );
    return null;
  }
  try {
    return { doc: d, bytes: serializeDocument(d) };
  } catch (e) {
    toasts.error(`Cannot save: ${errorMessage(e)}`);
    return null;
  }
}

/** Saves run one after another: a second Ctrl+S waits for the first, then saves the latest edits. */
let saveQueue: Promise<unknown> = Promise.resolve();
function queued(f: () => Promise<boolean>): Promise<boolean> {
  commitPending();
  const p = saveQueue.then(f);
  saveQueue = p.catch(() => undefined);
  return p;
}

async function saveAsNow(): Promise<boolean> {
  const s = serialize();
  if (!s) return false;
  const gen = generation.value;
  try {
    const r = await pickSaveAs(fileName.value || defaultName(), s.bytes);
    if (!r) return false;
    markSaved(s.doc, gen, r.handle, r.name);
    return true;
  } catch (e) {
    toasts.error(`Save failed: ${errorMessage(e)}`);
    return false;
  }
}

async function saveNow(): Promise<boolean> {
  if (!doc.value) return false;
  const h = handle.value;
  if (!h) return saveAsNow();
  const s = serialize();
  if (!s) return false;
  const gen = generation.value;
  const name = fileName.value;
  try {
    if (!(await ensurePermission(h, 'readwrite'))) return saveAsNow();
    await writeHandle(h, s.bytes);
  } catch (e) {
    if (isNotFound(e) && gen === generation.value) {
      toasts.info(`${name} is no longer where it was opened from. Choose where to save it.`);
      return saveAsNow();
    }
    toasts.error(`Save failed: ${errorMessage(e)}`);
    return false;
  }
  markSaved(s.doc, gen, h, name);
  return true;
}

const savedListeners = new Set<() => void>();
/**
 * `saved` was written as `name` through `h`. Edits made while the write was
 * pending keep the document dirty; a document opened meanwhile is left alone.
 */
function markSaved(saved: Doc, gen: number, h: FileSystemFileHandle | null, name: string): void {
  toasts.success(`Saved ${name}`);
  if (gen !== generation.value) return;
  handle.value = h;
  fileName.value = name;
  cleanDoc.value = saved;
  history.seal();
  if (doc.value === saved) for (const l of savedListeners) l();
}

function defaultName(): string {
  return kind.value === 'bk' ? 'Untitled.BK' : 'Untitled.AF';
}

function close(): void {
  setDocument(null, '', null);
}

function newDocument(d: Doc, name: string): void {
  setDocument(d, name, null, true);
}

function exportJSON(): void {
  commitPending();
  if (!doc.value) return;
  const d = doc.value;
  for (const w of jsonWarnings(d)) toasts.info(`JSON: ${w.path}: ${w.message}`);
  const json = isAF(d) ? afToJSON(d) : bkToJSON(d);
  download(
    `${fileName.value || defaultName()}.json`,
    JSON.stringify(json, null, 2),
    'application/json',
  );
}

async function importJSON(): Promise<boolean> {
  const p = await pickOrToast([
    { description: 'pyomftools JSON', accept: { 'application/json': ['.json'] } },
  ]);
  if (!p) return false;
  return importJSONBytes(p.name, p.bytes);
}

function importJSONBytes(name: string, bytes: Uint8Array): boolean {
  try {
    const j = JSON.parse(new TextDecoder().decode(bytes));
    const isFighter = typeof j === 'object' && j !== null && 'moves' in j;
    const d = isFighter ? afFromJSON(j) : bkFromJSON(j);
    serializeDocument(d); // surfaces range errors before the document is replaced
    const base = name.replace(/\.json$/i, '');
    const fixed = /\.(af|bk)$/i.test(base) ? base : `${base}.${isFighter ? 'AF' : 'BK'}`;
    setDocument(d, fixed, null, true);
    return true;
  } catch (e) {
    toasts.error(`Could not import ${name}: ${errorMessage(e)}`);
    return false;
  }
}

export function useDocument() {
  return {
    doc,
    kind,
    fileName,
    handle,
    dirty,
    generation,
    byteSize,
    openBytes,
    openPicked,
    openFile,
    save: () => queued(saveNow),
    saveAs: () => queued(saveAsNow),
    flushPending,
    commitPending,
    close,
    newDocument,
    mutate,
    replace,
    undo,
    redo,
    exportJSON,
    importJSON,
    importJSONBytes,
    onDocumentChange: (f: (reason: 'open' | 'close') => void) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    beforeSerialize: (f: () => void) => {
      beforeSerialize.add(f);
      return () => beforeSerialize.delete(f);
    },
    historyLength: () => history.undoStack.value.length,
    onSaved: (f: () => void) => {
      savedListeners.add(f);
      return () => savedListeners.delete(f);
    },
  };
}
