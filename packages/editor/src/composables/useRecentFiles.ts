import { ref } from 'vue';
import { db, safely, type RecentEntry } from '../lib/db';
import { ensurePermission, isNotFound, readHandle, type PickedFile } from '../lib/files';
import { errorMessage, useToasts } from './useToasts';

const MAX = 8;
const entries = ref<RecentEntry[]>([]);

async function refresh(): Promise<void> {
  entries.value = await safely(async () => {
    const all = await (await db()).getAll('recent');
    return all.sort((a, b) => b.openedAt - a.openedAt).slice(0, MAX);
  }, []);
}

let lastOpenedAt = 0;
let queue: Promise<void> = Promise.resolve();

/**
 * Records an opened file. Adds run one at a time, and the delete, insert and
 * trim happen in one transaction, so quick opens or a reload in between never
 * lose or duplicate an entry. Timestamps strictly increase, so the order is exact.
 */
function add(handle: FileSystemFileHandle, kind: 'af' | 'bk'): Promise<void> {
  queue = queue.then(() => addNow(handle, kind));
  return queue;
}

async function addNow(handle: FileSystemFileHandle, kind: 'af' | 'bk'): Promise<void> {
  await safely(async () => {
    const d = await db();
    const all = await d.getAll('recent');
    // isSameEntry is not an IndexedDB request, so it runs before the transaction.
    const same: number[] = [];
    for (const e of all)
      if (e.id !== undefined && (await e.handle.isSameEntry(handle))) same.push(e.id);
    lastOpenedAt = Math.max(Date.now(), lastOpenedAt + 1);
    const keep = all
      .filter((e) => e.id !== undefined && !same.includes(e.id))
      .sort((a, b) => b.openedAt - a.openedAt);
    const tx = d.transaction('recent', 'readwrite');
    for (const id of same) void tx.store.delete(id);
    for (const e of keep.slice(MAX - 1)) void tx.store.delete(e.id!);
    void tx.store.add({ name: handle.name, kind, openedAt: lastOpenedAt, handle });
    await tx.done;
  }, undefined);
  await refresh();
}

/** Null when permission is refused or the file cannot be read (a toast says why). */
async function reopen(e: RecentEntry): Promise<PickedFile | null> {
  try {
    if (!(await ensurePermission(e.handle, 'read'))) return null;
    return await readHandle(e.handle);
  } catch (err) {
    if (isNotFound(err)) {
      useToasts().error(`${e.name} was moved or deleted. It was removed from recent files.`);
      await forget(e);
    } else useToasts().error(`Could not open ${e.name}: ${errorMessage(err)}`);
    return null;
  }
}

async function forget(e: RecentEntry): Promise<void> {
  if (e.id !== undefined) await safely(async () => (await db()).delete('recent', e.id!), undefined);
  await refresh();
}

export function useRecentFiles() {
  return { entries, refresh, add, reopen, forget };
}
