import { test, expect, fixture } from './helpers';

test.describe('background view', () => {
  test('export then import is identical; a different size asks to resize; overlay', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/background');
    const before = await app.bytes();
    const path = await app.download(() => page.getByTestId('bg.export').click());
    await app.chooseFile(path, () => page.getByTestId('bg.import').click());
    expect(await app.bytes()).toEqual(before);
    await app.open('menu.bk', '/background');
    await app.chooseFile(path, () => page.getByTestId('bg.import').click());
    await expect(page.getByTestId('confirm')).toContainText('320×200');
    await page.getByTestId('confirm.ok').click();
    const b = await app.bytes();
    expect([b[5]! | (b[6]! << 8), b[7]! | (b[8]! << 8)]).toEqual([320, 200]);
    await page.getByTestId('bg.overlay').selectOption('1');
    await expect(page.getByTestId('bg.canvas')).toBeVisible();
  });

  test('unmatched colours block the import like for sprites', async ({ app, page }) => {
    await app.open('arena.bk', '/background');
    await app.chooseFile('unmatched.png', () => page.getByTestId('bg.import').click());
    await expect(page.getByTestId('confirm.details').locator('li')).toHaveCount(3);
    await page.getByTestId('confirm.cancel').click();
    expect(await app.bytes()).toEqual(fixture('arena.bk'));
  });
});

test.describe('problems view', () => {
  test('lists problems from edge.af; severity filter; jump link selects', async ({ app, page }) => {
    await app.open('edge.af', '/problems');
    const rows = page.locator('[data-testid^="problems.row."]:not([data-testid$=".go"])');
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    await expect(page.getByTestId('problems.table')).toContainText('belongs to sprite 5');
    await page.getByTestId('problems.filter.info').check();
    await expect(page.getByTestId('problems.table')).toContainText('written with');
    expect(await rows.count()).toBeGreaterThan(n);
    const row = page.locator('tr', { hasText: 'belongs to sprite 5' });
    await row.getByRole('button').click();
    await expect(page).toHaveURL(/animations\/2\/collisions/);
    await expect(page.getByTestId('collisions.row.1')).toHaveClass(/table-warning/);
  });
});
