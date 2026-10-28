import { test, expect } from './helpers';

const ROUTES = [
  '/file',
  '/animations/20',
  '/animations/20/script',
  '/animations/20/sprites',
  '/animations/20/collisions',
  '/palettes',
  '/problems',
  '/reference',
];

test.describe('1024×700 layout and themes', () => {
  for (const route of ROUTES) {
    test(`nothing overflows horizontally on ${route}`, async ({ app, page }) => {
      await app.open(
        route === '/palettes' ? 'arena.bk' : 'fighter.af',
        route.replace('/animations/20', route === '/palettes' ? '' : '/animations/20'),
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('palettes view: grid and preview side by side, nothing overflows (BK with tools, AF)', async ({
    app,
    page,
  }) => {
    const noOverflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('tool.ramp').click();
    expect(await noOverflow()).toBeLessThanOrEqual(0);
    let grid = (await page.getByTestId('palette-grid').boundingBox())!;
    let pv = (await page.getByTestId('palette-preview.canvas').boundingBox())!;
    expect(pv.x + pv.width).toBeLessThanOrEqual(grid.x);
    expect(grid.x + grid.width).toBeLessThanOrEqual(1024);
    await app.open('fighter.af', '/palettes');
    await app.chooseFile('arena.bk', () => page.getByTestId('af-palette.choose').click());
    await expect(page.getByTestId('af-palette.preview')).toBeVisible();
    expect(await noOverflow()).toBeLessThanOrEqual(0);
    grid = (await page.getByTestId('af-palette.grid').boundingBox())!;
    pv = (await page.getByTestId('af-palette.preview').boundingBox())!;
    expect(pv.x + pv.width).toBeLessThanOrEqual(grid.x);
    expect(grid.x + grid.width).toBeLessThanOrEqual(1024);
  });

  test('dark and light themes render', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    await page.getByTestId('theme').click();
    const t1 = await page.evaluate(() => document.documentElement.dataset.bsTheme);
    await page.getByTestId('theme').click();
    const t2 = await page.evaluate(() => document.documentElement.dataset.bsTheme);
    expect(new Set([t1, t2])).toEqual(new Set(['dark', 'light']));
    expect((await page.screenshot()).length).toBeGreaterThan(1000);
  });
});
