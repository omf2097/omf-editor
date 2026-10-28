import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecentEntry } from '../lib/db';

// An in-memory "recent" store. Real IndexedDB would structured-clone the
// handles; these fakes keep their methods, which is all the composable uses.
const rows = new Map<number, RecentEntry>();
let nextId = 1;
const store = {
  getAll: async () => [...rows.values()].map((r) => ({ ...r })),
  add: async (_s: string, v: RecentEntry) => {
    rows.set(nextId, { ...v, id: nextId });
    return nextId++;
  },
  delete: async (_s: string, id: number) => {
    rows.delete(id);
  },
  // add() deletes, inserts and trims in one transaction.
  transaction: () => ({
    store: {
      add: (v: RecentEntry) => store.add('recent', v),
      delete: (id: number) => store.delete('recent', id),
    },
    done: Promise.resolve(),
  }),
};
vi.mock('../lib/db', () => ({
  db: async () => store,
  safely: async <T>(f: () => Promise<T>, fallback: T) => {
    try {
      return await f();
    } catch {
      return fallback;
    }
  },
}));

interface FakeHandle {
  name: string;
  path: string;
  gone?: boolean;
  perm?: PermissionState;
}

function fake(path: string, o: Partial<FakeHandle> = {}): FileSystemFileHandle {
  const h: FakeHandle & Record<string, unknown> = { name: path.split('/').pop()!, path, ...o };
  h.isSameEntry = async (other: FakeHandle) => other.path === h.path;
  h.queryPermission = async () => h.perm ?? 'granted';
  h.requestPermission = async () => h.perm ?? 'granted';
  h.getFile = async () => {
    if (h.gone) throw new DOMException('gone', 'NotFoundError');
    if (h.path.includes('broken')) throw new DOMException('locked', 'NoModificationAllowedError');
    return new File([new Uint8Array([7])], h.name);
  };
  return h as unknown as FileSystemFileHandle;
}

let now = 1000;
beforeEach(() => {
  vi.resetModules();
  rows.clear();
  nextId = 1;
  vi.spyOn(Date, 'now').mockImplementation(() => now++);
});

async function load() {
  const { useRecentFiles } = await import('./useRecentFiles');
  const { useToasts } = await import('./useToasts');
  return { recent: useRecentFiles(), toasts: useToasts() };
}
const names = (es: RecentEntry[]) => es.map((e) => e.name);

describe('useRecentFiles', () => {
  it('lists newest first and keeps at most eight', async () => {
    const { recent } = await load();
    for (let i = 1; i <= 10; i++) await recent.add(fake(`/d/f${i}.af`), 'af');
    expect(names(recent.entries.value)).toEqual([10, 9, 8, 7, 6, 5, 4, 3].map((i) => `f${i}.af`));
    // Trimmed from the store too, not only from the list.
    expect(rows.size).toBe(8);
  });

  it('the same file opened again moves to the top; same name elsewhere is another entry', async () => {
    const { recent } = await load();
    await recent.add(fake('/a/x.af'), 'af');
    await recent.add(fake('/b/x.af'), 'af');
    await recent.add(fake('/c/y.bk'), 'bk');
    await recent.add(fake('/a/x.af'), 'af');
    expect(recent.entries.value.map((e) => (e.handle as unknown as FakeHandle).path)).toEqual([
      '/a/x.af',
      '/c/y.bk',
      '/b/x.af',
    ]);
    expect(recent.entries.value[1]!.kind).toBe('bk');
  });

  it('reopen reads the file; a missing file is removed with a message', async () => {
    const { recent, toasts } = await load();
    const gone = fake('/d/gone.af');
    await recent.add(fake('/d/ok.af'), 'af');
    await recent.add(gone, 'af');
    const ok = recent.entries.value.find((e) => e.name === 'ok.af')!;
    const p = await recent.reopen(ok);
    expect(p?.name).toBe('ok.af');
    expect(Array.from(p!.bytes)).toEqual([7]);
    expect(p?.handle).toBe(ok.handle);
    (gone as unknown as FakeHandle).gone = true;
    expect(await recent.reopen(recent.entries.value[0]!)).toBeNull();
    expect(names(recent.entries.value)).toEqual(['ok.af']);
    expect(toasts.toasts.value.at(-1)?.message).toContain('moved or deleted');
  });

  it('a refused permission or another read error keeps the entry', async () => {
    const { recent, toasts } = await load();
    await recent.add(fake('/d/denied.af', { perm: 'denied' }), 'af');
    await recent.add(fake('/broken/b.af'), 'af');
    const [broken, denied] = recent.entries.value;
    expect(await recent.reopen(denied!)).toBeNull();
    expect(await recent.reopen(broken!)).toBeNull();
    expect(toasts.toasts.value.at(-1)?.message).toContain('Could not open b.af');
    expect(names(recent.entries.value)).toEqual(['b.af', 'denied.af']);
  });

  it('quick opens without waiting keep every entry once, in order, even with a frozen clock', async () => {
    const { recent } = await load();
    vi.spyOn(Date, 'now').mockImplementation(() => 5000);
    const opens = [1, 2, 3, 2].map((i) => recent.add(fake(`/q/f${i}.af`), 'af'));
    await Promise.all(opens);
    expect(names(recent.entries.value)).toEqual(['f2.af', 'f3.af', 'f1.af']);
    expect(rows.size).toBe(3);
  });

  it('forget removes one entry', async () => {
    const { recent } = await load();
    await recent.add(fake('/d/a.af'), 'af');
    await recent.add(fake('/d/b.af'), 'af');
    await recent.forget(recent.entries.value[0]!);
    expect(names(recent.entries.value)).toEqual(['a.af']);
  });
});
