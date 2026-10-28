import type { Page } from '@playwright/test';
import { test, expect } from './helpers';
import { readAF, readBK } from '@omf/formats';

/** Autosave snapshots in IndexedDB right now. */
const snapshots = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('omf-editor');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('snapshots').objectStore('snapshots').count();
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );

test.describe('file lifecycle', () => {
  test('new fighter has the 16 base animations and saves loadable', async ({ app, page }) => {
    await app.goto('/');
    await page.getByTestId('start.new-fighter').click();
    await expect(page.getByTestId('doc-title')).toContainText('Untitled.AF');
    expect(await app.dirty()).toBe(true);
    const { name, bytes } = await app.saveDownload();
    expect(name).toBe('Untitled.AF');
    const af = readAF(bytes);
    expect([...af.moves.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 48, 49]);
    expect(af.moves.get(48)!.moveString).toBe('n');
    expect(af.health).toBe(200);
  });

  test('new scene; new from leaves the source untouched; duplicate', async ({ app, page }) => {
    await app.goto('/');
    await page.getByTestId('start.new-scene').click();
    const bk = readBK(await app.bytes());
    expect([
      bk.backgroundWidth,
      bk.backgroundHeight,
      bk.palettes.length,
      bk.animations.size,
    ]).toEqual([320, 200, 1, 0]);
    await app.goto('/');
    await app.chooseFile('fighter.af', () => page.getByTestId('start.new-from').click());
    // The new scene is unsaved, so it asks first.
    await page.getByTestId('confirm.discard').click();
    await expect(page.getByTestId('doc-title')).toContainText('Copy of fighter.AF');
    await page.getByTestId('file-menu').click();
    await page.getByTestId('menu.duplicate').click();
    await expect(page.getByTestId('doc-title')).toContainText('Copy of Copy of fighter.AF');
  });

  test('autosave snapshot survives a reload; restore, discard and save remove it', async ({
    app,
    page,
  }) => {
    await page.clock.install();
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 222);
    await page.clock.runFor(6000);
    await expect.poll(() => snapshots(page)).toBe(1);
    await page.reload();
    await app.goto('/');
    await expect(page.getByTestId('recover.card')).toHaveCount(1);
    await page.getByTestId('recover.restore').click();
    await expect(page.getByTestId('doc-title')).toContainText('fighter.af');
    await page.goto('./#/file');
    await expect(page.getByTestId('file.health')).toHaveValue('222');
    await app.setField('file.health', 223);
    await page.clock.runFor(6000);
    await app.saveDownload();
    // Saving removes the snapshot.
    await expect.poll(() => snapshots(page)).toBe(0);
    await page.reload();
    await app.goto('/');
    await expect(page.getByTestId('recover.card')).toHaveCount(0);
  });

  test('autosave keeps at most five snapshots', async ({ app, page }) => {
    await page.clock.install();
    await app.goto('/');
    for (let i = 0; i < 7; i++) {
      await app.open('fighter.af', '/file');
      await app.setField('file.health', 300 + i);
      await page.clock.runFor(6000);
      await expect.poll(() => snapshots(page)).toBeGreaterThanOrEqual(Math.min(i + 1, 5));
      await page.reload();
      await app.goto('/');
    }
    await expect(page.getByTestId('recover.card')).toHaveCount(5);
    await page.getByTestId('recover.discard').first().click();
    await expect(page.getByTestId('recover.card')).toHaveCount(4);
  });
});
