import { test, expect } from './helpers';

test.describe('reference view', () => {
  test('every tag once; search filters; usage links to frames', async ({ app, page }) => {
    await app.open('fighter.af', '/reference');
    await expect(page.locator('[data-testid^="ref.tag."]:not([data-testid$=".uses"])')).toHaveCount(
      153,
    );
    await page.getByTestId('ref.tags.search').fill('screen shake');
    await expect(page.locator('[data-testid^="ref.tag."]:not([data-testid$=".uses"])')).toHaveCount(
      2,
    );
    await page.getByTestId('ref.tag.bl.uses').click();
    await expect(page).toHaveURL(/animations\/20\/script\?string=base&frame=1/);
    await expect(page.getByTestId('script.frame.1')).toHaveClass(/border-primary/);
  });

  test('trigger table lists every move; shortcuts come from the registry', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/reference');
    await expect(page.getByTestId('ref.trigger-table').locator('tbody tr')).toHaveCount(7);
    await expect(page.getByTestId('ref.shortcuts')).toContainText('Ctrl+S');
  });
});
