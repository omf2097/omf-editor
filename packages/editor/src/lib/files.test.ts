import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensurePermission, fileAccess, pickFile, saveAs, writeHandle } from './files';

type Perm = PermissionState;

function handle(query?: Perm, request?: Perm) {
  const calls: string[] = [];
  const h = {
    name: 'a.af',
    ...(query && {
      queryPermission: vi.fn(async (d: { mode: string }) => {
        calls.push(`query:${d.mode}`);
        return query;
      }),
    }),
    ...(request && {
      requestPermission: vi.fn(async (d: { mode: string }) => {
        calls.push(`request:${d.mode}`);
        return request;
      }),
    }),
  };
  return { h: h as unknown as FileSystemFileHandle, calls };
}

function writable(fail?: 'write' | 'close') {
  const log: string[] = [];
  const w = {
    write: vi.fn(async (b: Uint8Array) => {
      log.push(`write:${b.length}`);
      if (fail === 'write') throw new Error('disk full');
    }),
    close: vi.fn(async () => {
      log.push('close');
      if (fail === 'close') throw new Error('close failed');
    }),
    abort: vi.fn(async () => {
      log.push('abort');
    }),
  };
  const h = { name: 'a.af', createWritable: async () => w } as unknown as FileSystemFileHandle;
  return { h, log };
}

const win = window as unknown as Record<string, unknown>;

afterEach(() => {
  delete win.showOpenFilePicker;
  delete win.showSaveFilePicker;
  fileAccess.useNativePicker = false;
});

describe('ensurePermission', () => {
  it('is true without the permission API (Firefox handles never exist; older Chromium)', async () => {
    expect(await ensurePermission(handle().h, 'readwrite')).toBe(true);
  });

  it('granted on query does not prompt', async () => {
    const { h, calls } = handle('granted', 'denied');
    expect(await ensurePermission(h, 'readwrite')).toBe(true);
    expect(calls).toEqual(['query:readwrite']);
  });

  it('prompts when not granted, with the same mode', async () => {
    const yes = handle('prompt', 'granted');
    expect(await ensurePermission(yes.h, 'read')).toBe(true);
    expect(yes.calls).toEqual(['query:read', 'request:read']);
    const no = handle('prompt', 'denied');
    expect(await ensurePermission(no.h, 'readwrite')).toBe(false);
    const dismissed = handle('denied', 'prompt');
    expect(await ensurePermission(dismissed.h, 'readwrite')).toBe(false);
  });

  it('a query without a request method is a refusal', async () => {
    expect(await ensurePermission(handle('prompt').h, 'readwrite')).toBe(false);
  });
});

describe('writeHandle', () => {
  it('writes the bytes and closes', async () => {
    const { h, log } = writable();
    await writeHandle(h, new Uint8Array(5));
    expect(log).toEqual(['write:5', 'close']);
  });

  it.each(['write', 'close'] as const)('a failed %s aborts and rethrows', async (fail) => {
    const { h, log } = writable(fail);
    await expect(writeHandle(h, new Uint8Array(3))).rejects.toThrow();
    expect(log.at(-1)).toBe('abort');
  });
});

describe('pickers', () => {
  it('pickFile reads the picked handle; a cancel is null; other errors throw', async () => {
    fileAccess.useNativePicker = true;
    const file = new File([new Uint8Array([1, 2, 3])], 'x.bk');
    const h = { name: 'x.bk', getFile: async () => file };
    win.showOpenFilePicker = vi.fn(async () => [h]);
    const p = await pickFile();
    expect(p?.name).toBe('x.bk');
    expect(Array.from(p!.bytes)).toEqual([1, 2, 3]);
    expect(p?.handle).toBe(h);
    win.showOpenFilePicker = async () => {
      throw new DOMException('cancel', 'AbortError');
    };
    expect(await pickFile()).toBeNull();
    win.showOpenFilePicker = async () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    await expect(pickFile()).rejects.toThrow('blocked');
  });

  it('saveAs writes through the save picker and returns its handle and name', async () => {
    fileAccess.useNativePicker = true;
    const { h, log } = writable();
    (h as unknown as { name: string }).name = 'chosen.af';
    const spy = vi.fn(async () => h);
    win.showSaveFilePicker = spy;
    const r = await saveAs('suggest.af', new Uint8Array(4));
    expect(r).toEqual({ handle: h, name: 'chosen.af' });
    expect((spy.mock.calls[0] as unknown[])[0]).toMatchObject({ suggestedName: 'suggest.af' });
    expect(log).toEqual(['write:4', 'close']);
    win.showSaveFilePicker = async () => {
      throw new DOMException('cancel', 'AbortError');
    };
    expect(await saveAs('s.af', new Uint8Array(1))).toBeNull();
  });

  it('saveAs without the native picker downloads under the suggested name', async () => {
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    URL.createObjectURL ??= () => 'blob:x';
    const r = await saveAs('plain.af', new Uint8Array(2));
    expect(r).toEqual({ handle: null, name: 'plain.af' });
    expect(clicked).toEqual(['plain.af']);
    click.mockRestore();
  });
});
