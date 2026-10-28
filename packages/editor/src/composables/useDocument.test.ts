import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AFFile } from '@omf/formats';
import { newFighter } from '../lib/templates';
import { serializeDocument } from '../lib/doc';

const saveAsCalls: string[] = [];
vi.mock('../lib/files', async (orig) => ({
  ...(await orig<typeof import('../lib/files')>()),
  saveAs: vi.fn(async (name: string) => {
    saveAsCalls.push(name);
    return { handle: null, name };
  }),
}));

type Writable = {
  write: () => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
};

/** A file handle whose writes wait for `release()`, or fail with `fail`. */
function fakeHandle(opts: { fail?: DOMException } = {}) {
  const written: number[][] = [];
  let release: (() => void) | null = null;
  const aborted = { n: 0 };
  const handle = {
    name: 'F.AF',
    kind: 'file',
    queryPermission: async () => 'granted',
    createWritable: async (): Promise<Writable> => {
      if (opts.fail && opts.fail.name === 'NotFoundError') throw opts.fail;
      return {
        write: (b?: unknown) =>
          new Promise<void>((res, rej) => {
            if (opts.fail) return rej(opts.fail);
            release = () => {
              written.push(Array.from(b as Uint8Array));
              res();
            };
          }),
        close: async () => undefined,
        abort: async () => {
          aborted.n++;
        },
      };
    },
  } as unknown as FileSystemFileHandle;
  return { handle, written, aborted, release: () => release?.() };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function load() {
  vi.resetModules();
  saveAsCalls.length = 0;
  const { useDocument } = await import('./useDocument');
  const docs = useDocument();
  const bytes = serializeDocument(newFighter());
  return { docs, bytes };
}

const health = (d: unknown) => (d as AFFile).health;
const setHealth = (v: number) => (d: AFFile) => {
  d.health = v;
};

describe('useDocument dirty state and history (D13, D14)', () => {
  beforeEach(() => vi.useRealTimers());

  it('undo back to the opened state is clean; redo is dirty again', async () => {
    const { docs, bytes } = await load();
    docs.openBytes('F.AF', bytes);
    docs.mutate('set health', setHealth(111));
    expect(docs.dirty.value).toBe(true);
    docs.undo();
    expect(docs.dirty.value).toBe(false);
    docs.redo();
    expect(docs.dirty.value).toBe(true);
  });

  it('discrete operations with the same label stay separate steps; value edits coalesce', async () => {
    const { docs, bytes } = await load();
    docs.openBytes('F.AF', bytes);
    docs.mutate('add extra string 11', () => undefined);
    docs.mutate('add extra string 11', () => undefined);
    expect(docs.historyLength()).toBe(2);
    docs.mutate('set health', setHealth(1));
    docs.mutate('set health', setHealth(2));
    expect(docs.historyLength()).toBe(3);
  });

  it('an edit after a save does not merge with the step before it', async () => {
    const { docs, bytes } = await load();
    docs.openBytes('F.AF', bytes);
    docs.mutate('set health', setHealth(111));
    expect(await docs.saveAs()).toBe(true);
    expect(docs.dirty.value).toBe(false);
    docs.mutate('set health', setHealth(222));
    docs.undo();
    expect(health(docs.doc.value)).toBe(111);
    expect(docs.dirty.value).toBe(false);
  });

  it('byteSize is null, not 0, when the document cannot be written', async () => {
    const { docs, bytes } = await load();
    docs.openBytes('F.AF', bytes);
    expect(docs.byteSize.value).toBe(bytes.length);
    docs.mutate('set health', setHealth(70000)); // u16
    expect(docs.byteSize.value).toBeNull();
  });
});

describe('useDocument pending edits (D2, D3)', () => {
  it('undo first commits the working script, then undoes it', async () => {
    const { docs, bytes } = await load();
    const { useWorkingScript } = await import('./useWorkingScript');
    const ws = useWorkingScript();
    docs.openBytes('F.AF', bytes);
    const id = 1;
    const before = ws.textFor(id, 'base');
    docs.mutate('set health', setHealth(5));
    ws.set(id, 'base', 'A9');
    docs.undo();
    expect(ws.pending.value).toBe(false);
    expect(ws.textFor(id, 'base')).toBe(before);
    expect(health(docs.doc.value)).toBe(5);
    docs.redo();
    expect(ws.textFor(id, 'base')).toBe('A9');
  });

  it('save commits the focused field before serialising', async () => {
    const { docs, bytes } = await load();
    docs.openBytes('F.AF', bytes);
    const input = document.createElement('input');
    document.body.append(input);
    input.addEventListener('blur', () => docs.mutate('set health', setHealth(321)));
    input.focus();
    const { handle, written, release } = fakeHandle();
    docs.handle.value = handle;
    const p = docs.save();
    await flush();
    release();
    expect(await p).toBe(true);
    expect(written.length).toBe(1);
    const { readAF } = await import('@omf/formats');
    expect(readAF(Uint8Array.from(written[0]!)).health).toBe(321);
    expect(document.activeElement).toBe(input);
    expect(docs.dirty.value).toBe(false);
    input.remove();
  });
});

describe('useDocument save (D4, D7)', () => {
  it('edits made while the write is pending keep the document dirty', async () => {
    const { docs, bytes } = await load();
    docs.openBytes('F.AF', bytes);
    const { handle, release } = fakeHandle();
    docs.handle.value = handle;
    docs.mutate('set health', setHealth(111));
    const p = docs.save();
    await flush();
    docs.mutate('set health', setHealth(222));
    release();
    expect(await p).toBe(true);
    expect(docs.dirty.value).toBe(true);
  });

  it('a document opened during the write keeps its own name and handle', async () => {
    const { docs, bytes } = await load();
    docs.openBytes('F.AF', bytes);
    const { handle, release } = fakeHandle();
    docs.handle.value = handle;
    docs.mutate('set health', setHealth(111));
    const p = docs.save();
    await flush();
    docs.newDocument(newFighter(), 'Untitled.AF');
    release();
    await p;
    expect(docs.fileName.value).toBe('Untitled.AF');
    expect(docs.handle.value).toBeNull();
    expect(docs.dirty.value).toBe(true);
  });

  it('a second save waits for the first and writes the latest edits', async () => {
    const { docs, bytes } = await load();
    docs.openBytes('F.AF', bytes);
    const { handle, written, release } = fakeHandle();
    docs.handle.value = handle;
    docs.mutate('set health', setHealth(111));
    const p1 = docs.save();
    await flush();
    docs.mutate('set health', setHealth(222));
    const p2 = docs.save();
    release();
    await p1;
    await flush();
    release();
    await p2;
    const { readAF } = await import('@omf/formats');
    expect(written.map((w) => readAF(Uint8Array.from(w)).health)).toEqual([111, 222]);
    expect(docs.dirty.value).toBe(false);
  });

  it('a vanished file falls back to Save as', async () => {
    const { docs, bytes } = await load();
    docs.openBytes('F.AF', bytes);
    docs.handle.value = fakeHandle({ fail: new DOMException('gone', 'NotFoundError') }).handle;
    docs.mutate('set health', setHealth(111));
    expect(await docs.save()).toBe(true);
    expect(saveAsCalls).toEqual(['F.AF']);
    expect(docs.dirty.value).toBe(false);
  });

  it('a failed write is aborted and the document stays dirty', async () => {
    const { docs, bytes } = await load();
    docs.openBytes('F.AF', bytes);
    const h = fakeHandle({ fail: new DOMException('disk full', 'QuotaExceededError') });
    docs.handle.value = h.handle;
    docs.mutate('set health', setHealth(111));
    expect(await docs.save()).toBe(false);
    expect(h.aborted.n).toBe(1);
    expect(docs.dirty.value).toBe(true);
    expect(saveAsCalls).toEqual([]);
  });
});
