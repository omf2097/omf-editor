import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleted: number[] = [];
vi.mock('../lib/db', () => ({
  db: async () => ({
    getAll: async () => [],
    delete: async (_store: string, id: number) => {
      deleted.push(id);
    },
  }),
  safely: async <T>(f: () => Promise<T>, fallback: T) => {
    try {
      return await f();
    } catch {
      return fallback;
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  deleted.length = 0;
});

describe('useConfirm (D12)', () => {
  it('a request replaced by another one resolves as cancel', async () => {
    const { useConfirm } = await import('./useConfirm');
    const c = useConfirm();
    const first = c.confirm('A', 'first');
    const second = c.confirm('B', 'second');
    expect(await first).toBe(false);
    expect(c.current.value?.title).toBe('B');
    c.current.value!.resolve('ok');
    expect(await second).toBe(true);
  });
});

describe('file reading errors (D6, D18)', () => {
  it('the fallback picker rejects when the chosen file cannot be read', async () => {
    const { pickFile, fileAccess } = await import('../lib/files');
    fileAccess.useNativePicker = false;
    const p = pickFile();
    const input = document.querySelector<HTMLInputElement>('[data-testid="file-input"]')!;
    Object.defineProperty(input, 'files', {
      value: [{ name: 'X.AF', arrayBuffer: () => Promise.reject(new Error('gone')) }],
    });
    input.dispatchEvent(new Event('change'));
    await expect(p).rejects.toThrow('gone');
  });

  it('Open shows a toast instead of an unhandled rejection', async () => {
    const files = await import('../lib/files');
    files.fileAccess.useNativePicker = false;
    const { useDocument } = await import('./useDocument');
    const { useToasts } = await import('./useToasts');
    const p = useDocument().openFile();
    const input = document.querySelector<HTMLInputElement>('[data-testid="file-input"]')!;
    Object.defineProperty(input, 'files', {
      value: [{ name: 'X.AF', arrayBuffer: () => Promise.reject(new Error('gone')) }],
    });
    input.dispatchEvent(new Event('change'));
    expect(await p).toBeNull();
    expect(
      useToasts()
        .toasts.value.map((t) => t.message)
        .join(),
    ).toContain('gone');
  });

  it('a recent file that was moved is reported and forgotten', async () => {
    const { useRecentFiles } = await import('./useRecentFiles');
    const { useToasts } = await import('./useToasts');
    const handle = {
      name: 'GONE.AF',
      queryPermission: async () => 'granted',
      getFile: async () => {
        throw new DOMException('not found', 'NotFoundError');
      },
    } as unknown as FileSystemFileHandle;
    const r = await useRecentFiles().reopen({
      id: 7,
      name: 'GONE.AF',
      kind: 'af',
      openedAt: 0,
      handle,
    });
    expect(r).toBeNull();
    expect(deleted).toEqual([7]);
    expect(
      useToasts()
        .toasts.value.map((t) => t.message)
        .join(),
    ).toContain('GONE.AF');
  });
});
