// The shipped-bug corpus (omf-formats test/corpus.ts) in the editor: the odd
// data of the game files opens in every view and is saved back byte for byte,
// so CI without game data covers it too.

import { test, expect, fixture } from './helpers';

test.describe('shipped-bug corpus', () => {
  test('corpus.af: every view opens; text openomf drops is listed; saved byte-exact', async ({
    app,
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await app.open('corpus.af', '/animations/9');
    await expect(page.getByTestId('anim-title')).toContainText('9');
    await app.hooks((h, path: string) => h.navigate(path), '/animations/9/sprites');
    // The empty 60537×60537 sprite is listed with its header size, not drawn at it.
    await page.getByTestId('sprites.cell.6').click();
    await expect(page.getByTestId('sprite.size')).toContainText('60537');
    await app.hooks((h, path: string) => h.navigate(path), '/animations/20/script');
    await expect(page.getByTestId('view.script')).toBeVisible();
    await app.hooks((h, path: string) => h.navigate(path), '/animations/20/sprites');
    for (const i of [0, 1, 2, 3]) await page.getByTestId(`sprites.cell.${i}`).click();
    await app.hooks((h, path: string) => h.navigate(path), '/problems');
    await page.getByTestId('problems.filter.warning').check();
    const table = page.getByTestId('problems.table');
    for (const t of ['rff10-', 'hx+8-', 'uabeujf2jfE3-', 'usw30X1-'])
      await expect(table).toContainText(t);
    expect(await app.dirty()).toBe(false);
    const { bytes } = await app.saveDownload();
    expect(bytes).toEqual(fixture('corpus.af'));
    expect(errors).toEqual([]);
  });

  test('corpus.bk: garbage and 0×1 sprites open; saved byte-exact', async ({ app, page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await app.open('corpus.bk', '/animations/14/sprites');
    await page.getByTestId('sprites.cell.0').click();
    await expect(page.getByTestId('sprite.size')).toContainText('60537');
    await app.hooks((h, path: string) => h.navigate(path), '/animations/20/sprites');
    await page.getByTestId('sprites.cell.1').click();
    await expect(page.getByTestId('sprite.size')).toContainText('0');
    await app.hooks((h, path: string) => h.navigate(path), '/animations/20');
    await app.hooks((h, path: string) => h.navigate(path), '/background');
    await app.hooks((h, path: string) => h.navigate(path), '/palettes');
    expect(await app.dirty()).toBe(false);
    const { bytes } = await app.saveDownload();
    expect(bytes).toEqual(fixture('corpus.bk'));
    expect(errors).toEqual([]);
  });
});
