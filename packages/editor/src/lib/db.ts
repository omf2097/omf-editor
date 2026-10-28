// IndexedDB storage: recent files, autosave snapshots, settings and cached files.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface RecentEntry {
  id?: number;
  name: string;
  kind: 'af' | 'bk';
  openedAt: number;
  handle: FileSystemFileHandle;
}

export interface Snapshot {
  session: string;
  name: string;
  kind: 'af' | 'bk';
  savedAt: number;
  bytes: Uint8Array;
  route: string;
  paletteSource: string | null;
}

interface OmfDB extends DBSchema {
  recent: { key: number; value: RecentEntry; indexes: { byName: string } };
  snapshots: { key: string; value: Snapshot };
  settings: { key: string; value: unknown };
  files: { key: string; value: { name: string; bytes: Uint8Array } };
}

let dbp: Promise<IDBPDatabase<OmfDB>> | null = null;

export function db(): Promise<IDBPDatabase<OmfDB>> {
  dbp ??= openDB<OmfDB>('omf-editor', 1, {
    upgrade(d) {
      const recent = d.createObjectStore('recent', { keyPath: 'id', autoIncrement: true });
      recent.createIndex('byName', 'name');
      d.createObjectStore('snapshots', { keyPath: 'session' });
      d.createObjectStore('settings');
      d.createObjectStore('files');
    },
  });
  return dbp;
}

/** Errors (private windows, blocked storage) are swallowed: storage is a convenience. */
export async function safely<T>(f: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await f();
  } catch {
    return fallback;
  }
}

export const getSetting = <T>(key: string, fallback: T): Promise<T> =>
  safely(
    async () => ((await (await db()).get('settings', key)) as T | undefined) ?? fallback,
    fallback,
  );

export const setSetting = (key: string, value: unknown): Promise<void> =>
  safely(async () => {
    await (await db()).put('settings', value, key);
  }, undefined);

export const getCachedFile = (
  key: string,
): Promise<{ name: string; bytes: Uint8Array } | undefined> =>
  safely(async () => (await db()).get('files', key), undefined);

export const setCachedFile = (key: string, name: string, bytes: Uint8Array): Promise<void> =>
  safely(async () => {
    await (await db()).put('files', { name, bytes }, key);
  }, undefined);
