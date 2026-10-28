// Crash recovery (spec 19 §3): while the document is dirty its bytes are
// written to IndexedDB every few seconds, one snapshot per tab session. Each
// tab holds a Web Lock named after its session, so the Start view can tell the
// snapshots of closed tabs (offered for recovery) from those of open ones.

import { ref, watch } from 'vue';
import { useEventListener } from '@vueuse/core';
import { router } from '../router';
import { db, safely, type Snapshot } from '../lib/db';
import { serializeDocument, parseDocument } from '../lib/doc';
import { download } from '../lib/files';
import { useDocument } from './useDocument';
import { usePalette } from './usePalette';
import { useToasts } from './useToasts';

/** Snapshot interval while dirty (spec 19 §3). */
export const AUTOSAVE_MS = 5000;
export const MAX_SNAPSHOTS = 5;

const session = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const recoverable = ref<Snapshot[]>([]);
let timer: ReturnType<typeof setInterval> | null = null;
let installed = false;
/** Re-lists while snapshots of other open tabs are hidden, so they appear once those close. */
let relist: ReturnType<typeof setTimeout> | null = null;
const RELIST_MS = 2000;

const docs = useDocument();
const palette = usePalette();
const toasts = useToasts();

const lockName = (s: string): string => `omf-editor-session-${s}`;
type Locks = {
  request(name: string, cb: () => Promise<void>): Promise<void>;
  query(): Promise<{ held?: { name?: string }[] }>;
};
const locks = (): Locks | undefined =>
  (globalThis.navigator as unknown as { locks?: Locks } | undefined)?.locks;

/** Sessions alive in other tabs (each holds its session lock until it closes). */
async function liveSessions(): Promise<Set<string>> {
  const l = locks();
  if (!l) return new Set();
  const q = await l.query().catch(() => ({ held: [] }));
  return new Set((q.held ?? []).map((h) => h.name ?? ''));
}

/** The current document as a snapshot; null when it is clean or cannot be serialised now. */
function takeSnapshot(): Snapshot | null {
  // The debounced script edit belongs in the snapshot (the focused field is left alone).
  docs.flushPending();
  const d = docs.doc.value;
  if (!d || !docs.dirty.value) return null;
  let bytes: Uint8Array;
  try {
    bytes = serializeDocument(d);
  } catch {
    return null; // a range error; the next edit retries
  }
  return {
    session,
    name: docs.fileName.value,
    kind: docs.kind.value ?? 'af',
    savedAt: Date.now(),
    bytes,
    route: router.currentRoute.value.fullPath,
    paletteSource: palette.sourceName.value,
  };
}

/** Writes this tab's snapshot and drops the oldest beyond MAX_SNAPSHOTS. */
async function snapshotNow(): Promise<void> {
  const snap = takeSnapshot();
  if (!snap) return;
  const gen = docs.generation.value;
  await safely(async () => {
    const store = await db();
    // A document opened meanwhile must not get the old one's bytes as its snapshot.
    if (gen !== docs.generation.value) return;
    await store.put('snapshots', snap);
    const all = (await store.getAll('snapshots')).sort((a, b) => b.savedAt - a.savedAt);
    for (const s of all.slice(MAX_SNAPSHOTS)) await store.delete('snapshots', s.session);
  }, undefined);
}

async function discardOwn(): Promise<void> {
  await safely(async () => (await db()).delete('snapshots', session), undefined);
}

/** Snapshots of sessions that are gone: not this tab's, not another open tab's. */
async function listRecoverable(): Promise<Snapshot[]> {
  stopListing();
  const all = await safely(async () => (await db()).getAll('snapshots'), [] as Snapshot[]);
  const live = await liveSessions();
  const others = all.filter((s) => s.session !== session);
  recoverable.value = others
    .filter((s) => !live.has(lockName(s.session)))
    .sort((a, b) => b.savedAt - a.savedAt);
  if (recoverable.value.length < others.length)
    relist = setTimeout(() => void listRecoverable(), RELIST_MS);
  return recoverable.value;
}

function stopListing(): void {
  if (relist) clearTimeout(relist);
  relist = null;
}

async function discard(s: Snapshot): Promise<void> {
  await safely(async () => (await db()).delete('snapshots', s.session), undefined);
  await listRecoverable();
}

/** Opens a snapshot as a dirty document. Corrupt snapshots are offered as a download. */
async function restore(s: Snapshot): Promise<boolean> {
  try {
    const d = parseDocument(s.name, s.bytes);
    docs.newDocument(d, s.name);
    await discard(s);
    if (s.kind === 'af' && s.paletteSource && s.paletteSource !== palette.sourceName.value)
      toasts.info(
        `This snapshot was edited with the palette source ${s.paletteSource}. Load it in Palettes to see the same colours.`,
      );
    return true;
  } catch {
    toasts.error(`The snapshot of ${s.name} is damaged; it was downloaded as raw bytes instead.`);
    download(`${s.name}.recovered`, s.bytes);
    return false;
  }
}

/** Takes the session lock and starts snapshotting (once per page). */
function install(): void {
  if (installed) return;
  installed = true;
  // Held until this tab closes: other tabs do not offer its snapshot for recovery.
  void locks()
    ?.request(lockName(session), () => new Promise<void>(() => undefined))
    .catch(() => undefined);
  timer = setInterval(() => void snapshotNow(), AUTOSAVE_MS);
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') void snapshotNow();
  });
  useEventListener(window, 'pagehide', () => void snapshotNow());
  docs.onSaved(() => void discardOwn());
  // Opening, creating or closing a document drops the previous one's snapshot,
  // also when its edits were discarded.
  watch(docs.generation, () => void discardOwn());
}

export function useAutosave() {
  return {
    recoverable,
    snapshotNow,
    listRecoverable,
    stopListing,
    discard,
    restore,
    install,
    uninstall() {
      if (timer) clearInterval(timer);
    },
  };
}
