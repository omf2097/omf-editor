import { test, expect } from './helpers';

test.describe('state reset when another document opens (D8)', () => {
  test('the selected script frame starts at 1 again', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('script.frame.2').click();
    await expect(page.getByTestId('script.frame.2')).toHaveClass(/border-primary/);
    await app.open('fighter.af', '/animations/20/script');
    await expect(page.getByTestId('script.frame.0')).toHaveClass(/border-primary/);
    await expect(page.getByTestId('script.frame.2')).not.toHaveClass(/border-primary/);
  });

  test('the Palettes preview fighter is dropped', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await app.chooseFile('fighter.af', () => page.getByTestId('palette-preview.fighter').click());
    await expect(page.getByTestId('palette-preview.fighter')).toHaveText('fighter.af');
    await page.getByTestId('usage.fighter').check();
    await app.open('arena.bk', '/palettes');
    await expect(page.getByTestId('palette-preview.fighter')).toHaveText('Load fighter…');
    await expect(page.getByTestId('usage.fighter')).not.toBeChecked();
  });
});
