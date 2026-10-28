import { readAF } from '@omf/formats';
import { test, expect } from './helpers';

test.describe('document state: pending edits, saving, status bar', () => {
  test('Ctrl+S right after typing in the script text saves the typed string (D3)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').fill('A9');
    const { bytes } = await app.saveDownload(() => page.keyboard.press('Control+s'));
    expect(readAF(bytes).moves.get(20)!.baseString).toBe('A9');
    await expect(page.getByTestId('script.text')).toBeFocused();
    expect(await app.dirty()).toBe(false);
  });

  test('Ctrl+S with an uncommitted number field saves the typed value (D3)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/file');
    await page.getByTestId('file.health').fill('123');
    const { bytes } = await app.saveDownload(() => page.keyboard.press('Control+s'));
    expect(readAF(bytes).health).toBe(123);
    expect(await app.dirty()).toBe(false);
  });

  test('a script edit still being typed counts as unsaved when opening another file (D10)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').fill('A9');
    await page.keyboard.press('Control+o');
    await expect(page.getByTestId('confirm')).toBeVisible();
    await page.getByTestId('confirm.cancel').click();
    expect((await app.animation(20))!.baseString).toBe('A9');
  });

  test('undo back to the saved state clears Modified (D14)', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 111);
    await app.saveDownload();
    await expect(page.getByTestId('status.modified')).toHaveCount(0);
    await app.setField('file.health', 222);
    await expect(page.getByTestId('status.modified')).toBeVisible();
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('file.health')).toHaveValue('111');
    await expect(page.getByTestId('status.modified')).toHaveCount(0);
  });

  test('two quick Add extra string clicks are two undo steps (D13)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11/script');
    await page.getByTestId('script.extra.add').click();
    await page.getByTestId('script.extra.add').click();
    expect((await app.animation(11))!.extraStrings).toHaveLength(2);
    await page.getByTestId('undo').click();
    expect((await app.animation(11))!.extraStrings).toHaveLength(1);
  });
});

test.describe('status bar number format follows the browser (K15)', () => {
  test.use({ locale: 'en-US' });

  test('en-US groups with a comma', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await expect(page.getByTestId('status.size')).toHaveText(/^\d{1,3}(,\d{3})+ B$/);
  });
});
