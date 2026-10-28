import { test, expect } from './helpers';

test.describe('recovery and routing across documents (spec 19)', () => {
  test('discarded edits are not offered for recovery after opening another file (D5)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 321);
    await app.hooks((h) => h.snapshot());
    // "Discard" and open another file
    await app.open('arena.bk', '/file');
    await app.hooks((h) => h.snapshot());
    await page.reload();
    await app.goto('/');
    await expect(page.getByTestId('start.open')).toBeVisible();
    await expect(page.getByTestId('recover.card')).toHaveCount(0);
  });

  test("another open tab's snapshot is offered only once that tab closes (D17)", async ({
    app,
    page,
    context,
  }) => {
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 321);
    await app.hooks((h) => h.snapshot());
    const other = await context.newPage();
    await other.goto('./#/');
    await expect(other.getByTestId('start.open')).toBeVisible();
    await expect(other.getByTestId('recover.card')).toHaveCount(0);
    await page.close();
    await expect(other.getByTestId('recover.card')).toHaveCount(1, { timeout: 8000 });
    await other.close();
  });

  test('restoring a snapshot made with another palette source says so (D17)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/file');
    await app.paletteSource('arena.bk');
    await app.setField('file.health', 321);
    await app.hooks((h) => h.snapshot());
    await page.reload();
    await app.ready();
    await app.paletteSource('menu.bk');
    await app.goto('/');
    await page.getByTestId('recover.restore').click();
    await expect(page.getByTestId('toast.info')).toContainText('arena.bk');
  });

  test('#/animations asked for before opening goes to the first animation (D11)', async ({
    app,
    page,
  }) => {
    await app.goto('/animations');
    await expect(page.getByTestId('start.open')).toBeVisible();
    await app.chooseFile('fighter.af', () => page.getByTestId('start.open').click());
    await expect(page).toHaveURL(/#\/animations\/11$/);
    await expect(page.getByTestId('anim-empty')).toHaveCount(0);
  });

  test('a pending route is used up by New, not kept for a later Open (D11)', async ({
    app,
    page,
  }) => {
    await app.goto('/palettes');
    await page.getByTestId('start.new-fighter').click();
    await expect(page).toHaveURL(/#\/animations\/\d+$/);
    await page.getByTestId('file-menu').click();
    await page.getByTestId('menu.close').click();
    await page.getByTestId('confirm.discard').click();
    await expect(page.getByTestId('start.open')).toBeVisible();
    await app.chooseFile('fighter.af', () => page.getByTestId('start.open').click());
    await expect(page).toHaveURL(/#\/animations\/11$/);
  });

  test('undo of Add animation while viewing it goes to another animation (D21)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20');
    await page.getByTestId('anim-add').click();
    await page.getByTestId('add-dialog.id').fill('50');
    await page.getByTestId('add-dialog.ok').click();
    await expect(page).toHaveURL(/#\/animations\/50$/);
    await page.getByTestId('undo').click();
    await expect(page).not.toHaveURL(/#\/animations\/50$/);
    await expect(page.getByTestId('anim-title')).toBeVisible();
    await expect(page.getByTestId('anim-empty')).toHaveCount(0);
  });
});
