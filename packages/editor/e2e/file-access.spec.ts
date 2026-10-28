// Chromium File System Access path (spec 17 §3.2, spec 19). The pickers are
// stubbed to return real origin-private (OPFS) file handles, so reads, writes,
// isSameEntry and IndexedDB storage of handles are the browser's own; only the
// pickers and permission prompts are scripted. Runs in the chromium project only.

import type { Page } from '@playwright/test';
import { test, expect, fixture, type App } from './helpers';

interface FsaState {
  /** Names showOpenFilePicker returns, one per call; empty means the user cancels. */
  picks: string[];
  /** Name showSaveFilePicker creates. */
  saveName: string;
  saveCalls: number;
  suggested: string[];
  /** What queryPermission and requestPermission answer. */
  query: PermissionState;
  request: PermissionState;
  requests: number;
  /** Name of the handle getAsFileSystemHandle gives a dropped file. */
  dropHandle: string | null;
  /**
   * Files whose createWritable throws NotFoundError, as for a file deleted on
   * disk (an OPFS handle would quietly create the file again).
   */
  gone: string[];
}

async function stubPickers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const st: FsaState = {
      picks: [],
      saveName: 'saved-as.af',
      saveCalls: 0,
      suggested: [],
      query: 'granted',
      request: 'granted',
      requests: 0,
      dropHandle: null,
      gone: [],
    };
    const w = window as unknown as Record<string, unknown>;
    w.__fsa = st;
    const dir = () => navigator.storage.getDirectory();
    w.showOpenFilePicker = async () => {
      const n = st.picks.shift();
      if (!n) throw new DOMException('The user aborted a request.', 'AbortError');
      return [await (await dir()).getFileHandle(n)];
    };
    w.showSaveFilePicker = async (o: { suggestedName: string }) => {
      st.saveCalls++;
      st.suggested.push(o.suggestedName);
      return (await dir()).getFileHandle(st.saveName, { create: true });
    };
    const proto = FileSystemHandle.prototype as unknown as Record<string, unknown>;
    proto.queryPermission = async () => st.query;
    proto.requestPermission = async () => {
      st.requests++;
      return st.request;
    };
    const fileProto = FileSystemFileHandle.prototype;
    const createWritable = fileProto.createWritable;
    fileProto.createWritable = function (this: FileSystemFileHandle, ...args) {
      if (st.gone.includes(this.name))
        return Promise.reject(
          new DOMException('A requested file could not be found.', 'NotFoundError'),
        );
      return createWritable.apply(this, args);
    };
    (DataTransferItem.prototype as unknown as Record<string, unknown>).getAsFileSystemHandle =
      async () => (st.dropHandle ? (await dir()).getFileHandle(st.dropHandle) : null);
  });
}

/** Runs `fn(state, arg)` on the stub state in the page. */
function fsa<T, A = undefined>(page: Page, fn: (st: FsaState, arg: A) => T, arg?: A): Promise<T> {
  return page.evaluate(
    ([src, a]) =>
      new Function('st', 'a', `return (${src})(st, a)`)(
        (window as unknown as { __fsa: FsaState }).__fsa,
        a,
      ) as T,
    [fn.toString(), arg] as const,
  );
}

async function putFile(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  await page.evaluate(
    async ([n, b]) => {
      const root = await navigator.storage.getDirectory();
      const w = await (await root.getFileHandle(n as string, { create: true })).createWritable();
      await w.write(new Uint8Array(b as number[]));
      await w.close();
    },
    [name, Array.from(bytes)] as const,
  );
}

async function readFile(page: Page, name: string): Promise<Uint8Array | null> {
  const b = await page.evaluate(async (n) => {
    try {
      const h = await (await navigator.storage.getDirectory()).getFileHandle(n);
      return Array.from(new Uint8Array(await (await h.getFile()).arrayBuffer()));
    } catch {
      return null;
    }
  }, name);
  return b && Uint8Array.from(b);
}

const removeFile = (page: Page, name: string): Promise<void> =>
  page.evaluate(async (n) => (await navigator.storage.getDirectory()).removeEntry(n), name);

const hooksReady = (page: Page) =>
  page.waitForFunction(() => (window as unknown as { __omf?: unknown }).__omf);

/**
 * Loads the app keeping the native pickers (App.goto selects the fallback) and
 * puts fixtures in OPFS; "3-fighter.af" holds fighter.af.
 */
async function start(page: Page, files: string[] = ['fighter.af']): Promise<void> {
  await stubPickers(page);
  await page.goto('./#/');
  await hooksReady(page);
  for (const f of files) await putFile(page, f, fixture(f.replace(/^\d+-/, '')));
}

/** Name of the newest entry in the recent-files store. */
function newestRecent(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((res) => {
        const r = indexedDB.open('omf-editor');
        r.onsuccess = () => {
          const q = r.result.transaction('recent').objectStore('recent').getAll();
          q.onsuccess = () => {
            const all = q.result as { name: string; openedAt: number }[];
            all.sort((a, b) => b.openedAt - a.openedAt);
            res(all[0]?.name ?? null);
            r.result.close();
          };
        };
      }),
  );
}

async function openNative(page: Page, name: string): Promise<void> {
  await fsa(page, (st, n: string) => st.picks.push(n), name);
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu.open').click();
  await expect(page.getByTestId('doc-title')).toHaveText(name);
}

async function editHealth(app: App, page: Page, value: number): Promise<void> {
  await page.getByTestId('nav.file').click();
  await app.setField('file.health', value);
  await expect(page.getByTestId('doc-title')).toContainText('●');
}

/** Collects downloads; a native save must not start one. */
function downloads(page: Page): string[] {
  const seen: string[] = [];
  page.on('download', (d) => seen.push(d.suggestedFilename()));
  return seen;
}

test.describe('File System Access (chromium)', () => {
  test('open through the picker, then save writes in place without a download', async ({
    app,
    page,
  }) => {
    await start(page);
    const dl = downloads(page);
    await fsa(page, (st) => st.picks.push('fighter.af'));
    await page.getByTestId('start.open').click();
    await expect(page.getByTestId('doc-title')).toHaveText('fighter.af');
    await expect(page).toHaveURL(/#\/animations\/11$/);
    await editHealth(app, page, 111);
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast.success')).toContainText('Saved fighter.af');
    await expect(page.getByTestId('doc-title')).toHaveText('fighter.af');
    const onDisk = await readFile(page, 'fighter.af');
    expect(onDisk).toEqual(await app.bytes());
    expect(onDisk).not.toEqual(fixture('fighter.af'));
    expect(await fsa(page, (st) => st.saveCalls)).toBe(0);
    expect(dl).toEqual([]);
    // The written file reads back with the edit.
    await page.reload();
    await hooksReady(page);
    await openNative(page, 'fighter.af');
    await page.getByTestId('nav.file').click();
    await expect(page.getByTestId('file.health')).toHaveValue('111');
  });

  test('a cancelled picker leaves the start view as it was', async ({ page }) => {
    await start(page);
    await page.getByTestId('start.open').click();
    await expect(page.getByTestId('start.open')).toBeVisible();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByTestId('toast.error')).toHaveCount(0);
    await expect(page.getByTestId('doc-title')).toHaveCount(0);
  });

  test('refused write permission falls back to Save As', async ({ app, page }) => {
    await start(page);
    const dl = downloads(page);
    await openNative(page, 'fighter.af');
    await editHealth(app, page, 112);
    await fsa(page, (st) => {
      st.query = 'prompt';
      st.request = 'denied';
    });
    await page.getByTestId('save').click();
    await expect(page.getByTestId('doc-title')).toHaveText('saved-as.af');
    expect(await fsa(page, (st) => [st.requests, st.saveCalls, st.suggested])).toEqual([
      1,
      1,
      ['fighter.af'],
    ]);
    expect(await readFile(page, 'fighter.af')).toEqual(fixture('fighter.af'));
    expect(await readFile(page, 'saved-as.af')).toEqual(await app.bytes());
    expect(dl).toEqual([]);
    // Later saves go to the new handle once its permission is granted.
    await fsa(page, (st) => {
      st.query = 'granted';
    });
    await app.setField('file.health', 113);
    await page.getByTestId('save').click();
    await expect(page.getByTestId('doc-title')).toHaveText('saved-as.af');
    await expect.poll(() => readFile(page, 'saved-as.af')).not.toEqual(fixture('fighter.af'));
    expect(await fsa(page, (st) => st.saveCalls)).toBe(1);
    expect(await readFile(page, 'saved-as.af')).toEqual(await app.bytes());
  });

  test('a granted permission prompt saves in place', async ({ app, page }) => {
    await start(page);
    await openNative(page, 'fighter.af');
    await editHealth(app, page, 114);
    await fsa(page, (st) => {
      st.query = 'prompt';
    });
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast.success')).toContainText('Saved fighter.af');
    expect(await fsa(page, (st) => [st.requests, st.saveCalls])).toEqual([1, 0]);
    expect(await readFile(page, 'fighter.af')).toEqual(await app.bytes());
  });

  test('a file deleted since opening is saved through Save As', async ({ app, page }) => {
    await start(page);
    await openNative(page, 'fighter.af');
    await editHealth(app, page, 115);
    await fsa(page, (st) => st.gone.push('fighter.af'));
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast.info')).toContainText('no longer where it was opened');
    await expect(page.getByTestId('doc-title')).toHaveText('saved-as.af');
    expect(await readFile(page, 'saved-as.af')).toEqual(await app.bytes());
    expect(await fsa(page, (st) => st.saveCalls)).toBe(1);
  });

  test('recent files: reopen after a reload, at most eight, stale entry removed', async ({
    page,
  }) => {
    const names = Array.from({ length: 9 }, (_, i) => `${i + 1}-fighter.af`);
    await start(page, names);
    for (const n of names) await openNative(page, n);
    // Opening one again moves it to the top instead of adding a second entry.
    await openNative(page, '3-fighter.af');
    // The recent list is written in the background; reload once it is stored.
    await expect.poll(() => newestRecent(page)).toBe('3-fighter.af');
    await page.reload();
    await hooksReady(page);
    const items = page.getByTestId('recent.item');
    await expect(items).toHaveText([
      '3-fighter.af',
      '9-fighter.af',
      '8-fighter.af',
      '7-fighter.af',
      '6-fighter.af',
      '5-fighter.af',
      '4-fighter.af',
      '2-fighter.af',
    ]);
    // The stored handle reopens the file.
    await items.filter({ hasText: '8-fighter.af' }).click();
    await expect(page.getByTestId('doc-title')).toHaveText('8-fighter.af');
    await page.getByTestId('file-menu').click();
    await page.getByTestId('menu.close').click();
    await expect(items.first()).toHaveText('8-fighter.af');
    // A deleted file is dropped from the list with a message.
    await removeFile(page, '5-fighter.af');
    await items.filter({ hasText: '5-fighter.af' }).click();
    await expect(page.getByTestId('toast.error')).toContainText('moved or deleted');
    await expect(items).toHaveCount(7);
    await expect(items.filter({ hasText: '5-fighter.af' })).toHaveCount(0);
    await expect(page.getByTestId('doc-title')).toHaveCount(0);
    // Refused read permission opens nothing and keeps the entry.
    await fsa(page, (st) => {
      st.query = 'prompt';
      st.request = 'denied';
    });
    await items.filter({ hasText: '6-fighter.af' }).click();
    await expect.poll(() => fsa(page, (st) => st.requests)).toBe(1);
    await expect(page.getByTestId('doc-title')).toHaveCount(0);
    await expect(items).toHaveCount(7);
    // Forget removes one entry.
    await page.getByRole('button', { name: 'Forget' }).first().click();
    await expect(items).toHaveCount(6);
    await expect(items.first()).toHaveText('3-fighter.af');
  });

  test('a dropped file keeps its handle: save writes it in place', async ({ app, page }) => {
    await start(page);
    const dl = downloads(page);
    await fsa(page, (st) => {
      st.dropHandle = 'fighter.af';
    });
    const dt = await page.evaluateHandle(
      (b) => {
        const t = new DataTransfer();
        t.items.add(new File([new Uint8Array(b)], 'fighter.af'));
        return t;
      },
      Array.from(fixture('fighter.af')),
    );
    await page.locator('.app-shell').dispatchEvent('dragenter', { dataTransfer: dt });
    await page.locator('.app-shell').dispatchEvent('drop', { dataTransfer: dt });
    await expect(page.getByTestId('doc-title')).toHaveText('fighter.af');
    await editHealth(app, page, 116);
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast.success')).toContainText('Saved fighter.af');
    expect(await readFile(page, 'fighter.af')).toEqual(await app.bytes());
    expect(await fsa(page, (st) => st.saveCalls)).toBe(0);
    expect(dl).toEqual([]);
    // The dropped file is in the recent list too.
    await page.getByTestId('file-menu').click();
    await page.getByTestId('menu.close').click();
    await expect(page.getByTestId('recent.item')).toHaveText(['fighter.af']);
  });

  test('Save As writes a new file and later saves go there; the original stays', async ({
    app,
    page,
  }) => {
    await start(page);
    const dl = downloads(page);
    await openNative(page, 'fighter.af');
    await editHealth(app, page, 117);
    await fsa(page, (st) => {
      st.saveName = 'copy.af';
    });
    await page.getByTestId('file-menu').click();
    await page.getByTestId('menu.saveas').click();
    await expect(page.getByTestId('doc-title')).toHaveText('copy.af');
    expect(await fsa(page, (st) => st.suggested)).toEqual(['fighter.af']);
    expect(await readFile(page, 'copy.af')).toEqual(await app.bytes());
    expect(await readFile(page, 'fighter.af')).toEqual(fixture('fighter.af'));
    await app.setField('file.health', 118);
    await page.getByTestId('save').click();
    await expect(page.getByTestId('doc-title')).toHaveText('copy.af');
    await expect.poll(async () => (await readFile(page, 'copy.af'))?.[9]).toBe(118);
    expect(await readFile(page, 'copy.af')).toEqual(await app.bytes());
    expect(await readFile(page, 'fighter.af')).toEqual(fixture('fighter.af'));
    expect(await fsa(page, (st) => st.saveCalls)).toBe(1);
    expect(dl).toEqual([]);
  });

  test('saving a new file goes through the save picker', async ({ app, page }) => {
    await start(page, []);
    const dl = downloads(page);
    await page.getByTestId('start.new-fighter').click();
    await expect(page.getByTestId('doc-title')).toContainText('Untitled');
    await fsa(page, (st) => {
      st.saveName = 'mine.af';
    });
    await page.getByTestId('save').click();
    await expect(page.getByTestId('doc-title')).toHaveText('mine.af');
    expect(await fsa(page, (st) => st.suggested)).toEqual(['Untitled.AF']);
    expect(await readFile(page, 'mine.af')).toEqual(await app.bytes());
    expect(dl).toEqual([]);
  });
});
