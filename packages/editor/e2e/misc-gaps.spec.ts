// Accessibility of the views the axe sweep skipped, the dark theme, and the
// ALTPALS / JSON drop paths (T14).

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { readAF } from '@omf/formats';
import { test, expect, fixture } from './helpers';

async function serious(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).disableRules(['color-contrast', 'region']).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target}`);
}

async function drop(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  const dt = await page.evaluateHandle(
    ([n, b]) => {
      const t = new DataTransfer();
      t.items.add(new File([new Uint8Array(b as number[])], n as string));
      return t;
    },
    [name, Array.from(bytes)] as const,
  );
  await page.locator('.app-shell').dispatchEvent('dragenter', { dataTransfer: dt });
  await page.locator('.app-shell').dispatchEvent('drop', { dataTransfer: dt });
}

test.describe('axe on the remaining views', () => {
  test('pixel editor', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/sprites/0/edit');
    await expect(page.getByTestId('view.pixels')).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });

  test('background view', async ({ app, page }) => {
    await app.open('arena.bk', '/background');
    await expect(page.getByTestId('view.background')).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });

  for (const route of ['/', '/file', '/animations/20/script', '/palettes', '/reference'])
    test(`dark theme: ${route}`, async ({ app, page }) => {
      await app.open('fighter.af', route);
      await page.evaluate(() => localStorage.setItem('omf-theme', 'dark'));
      await page.reload();
      await app.open('fighter.af', route);
      expect(await page.evaluate(() => document.documentElement.dataset.bsTheme)).toBe('dark');
      expect(await serious(page)).toEqual([]);
    });
});

test.describe('dropping other files', () => {
  test('ALTPALS.DAT loads the HAR colours; a bad one is refused', async ({ app, page }) => {
    await app.open('fighter.af', '/palettes');
    await app.paletteSource();
    await expect(page.getByTestId('har.p1.0')).toHaveCount(0);
    await drop(page, 'ALTPALS.DAT', fixture('altpals.dat'));
    await expect(page.getByTestId('toast.success').last()).toContainText('Loaded ALTPALS.DAT');
    await expect(page.getByTestId('doc-title')).toHaveText('fighter.af');
    await expect(page.getByTestId('har.p1.0')).toBeEnabled();
    await drop(page, 'altpals.dat', Uint8Array.from([1, 2, 3]));
    await expect(page.getByTestId('toast.error').last()).toContainText('not an ALTPALS.DAT');
    await expect(page.getByTestId('har.p1.0')).toBeEnabled();
  });

  test('a JSON file is imported; while dirty it asks first', async ({ app, page }) => {
    await app.open('arena.bk', '/file');
    await drop(page, 'fighter.json', fixture('fighter.json'));
    await expect(page).toHaveURL(/#\/animations/);
    await expect(page.getByTestId('doc-title')).toContainText('fighter');
    expect(readAF(await app.bytes())).toEqual(readAF(fixture('fighter.af')));
    await app.hooks((h, p: string) => h.navigate(p), '/file');
    await app.setField('file.health', 3);
    await drop(page, 'fighter.json', fixture('fighter.json'));
    await expect(page.getByTestId('confirm')).toBeVisible();
    await page.getByTestId('confirm.cancel').click();
    expect(await app.dirty()).toBe(true);
    expect(readAF(await app.bytes()).health).toBe(3);
  });
});
