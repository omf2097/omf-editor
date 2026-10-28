import type { Locator, Page } from '@playwright/test';
import { test, expect, type App } from './helpers';

/** Sets the "Show file field names" setting (useDisplay, localStorage) and reloads. */
async function fieldCodes(app: App, page: Page, on: boolean, route: string): Promise<void> {
  await app.open('fighter.af', route);
  await page.evaluate((v) => localStorage.setItem('omf-field-codes', v), on ? 'on' : 'off');
  await page.reload();
  await app.open('fighter.af', route);
}

/** Field names (the byte counters share the class for their look and carry a testid). */
const NAMES = '.field-code:not([data-testid])';

const box = async (l: Locator) => (await l.boundingBox())!;

test.describe('field labels, widths and chaining rows', () => {
  test('field names are hidden by default and kept in the tooltip', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await expect(page.getByTestId('view.file')).toBeVisible();
    await expect(page.locator(NAMES)).toHaveCount(0);
    const health = page.locator('label', { has: page.getByTestId('file.health') });
    await expect(health).toHaveText(/^\s*Health\s*$/);
    await expect(health).toHaveAttribute('title', /health/);
    await expect(
      page.locator('label', { has: page.getByTestId('file.fighter_id') }),
    ).toHaveAttribute('title', 'fighter_id');
    await expect(page.getByTestId('sound-table').locator('h6')).toHaveAttribute(
      'title',
      'sound_table',
    );

    await app.hooks((h, p: string) => h.navigate(p), '/animations/20');
    await expect(page.getByTestId('view.overview')).toBeVisible();
    await expect(page.locator(NAMES)).toHaveCount(0);
    await expect(page.getByTestId('trigger').locator('label', { hasText: 'Raw' })).toHaveAttribute(
      'title',
      'move_string',
    );
  });

  test('the setting shows the field names next to the labels', async ({ app, page }) => {
    await fieldCodes(app, page, true, '/file');
    const health = page.locator('label', { has: page.getByTestId('file.health') });
    await expect(health.locator('.field-code')).toHaveText('health');
    await expect(page.getByTestId('sound-table').locator('.field-code')).toHaveText('sound_table');
    await app.hooks((h, p: string) => h.navigate(p), '/animations/20');
    await expect(page.getByTestId('view.overview').locator('.field-code').first()).toBeVisible();
    await expect(page.getByTestId('view.overview')).toContainText('next_animation_id');
    // The top bar toggle switches them live.
    await page.getByTestId('field-codes').click();
    await expect(page.locator(NAMES)).toHaveCount(0);
    await page.getByTestId('field-codes').click();
    await expect(page.getByTestId('view.overview')).toContainText('next_animation_id');
    await fieldCodes(app, page, false, '/file');
    await expect(page.locator(NAMES)).toHaveCount(0);
  });

  test('inputs are sized to their range; fixed point shows the raw value inside the field', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/file');
    const u8 = await box(page.getByTestId('file.version_1'));
    const u16 = await box(page.getByTestId('file.health'));
    expect(u8.width).toBeLessThan(u16.width);
    expect(u8.width).toBeLessThan(60);

    const input = await box(page.getByTestId('file.forward_speed'));
    const raw = page.getByTestId('file.forward_speed.raw');
    await expect(raw).toHaveText(/^-?\d+$/);
    await expect(raw).toHaveClass(/input-group-text/);
    const r = await box(raw);
    expect(Math.abs(r.x - (input.x + input.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(r.y - input.y)).toBeLessThanOrEqual(1);
  });

  for (const on of [false, true])
    test(`chaining rows keep the go-to button and target next to the field (names ${on ? 'on' : 'off'})`, async ({
      app,
      page,
    }) => {
      await fieldCodes(app, page, on, '/animations/20');
      for (const id of ['ov.next_animation_id', 'ov.successor_id']) {
        const input = await box(page.getByTestId(id));
        const go = await box(page.getByTestId(`${id}.go`));
        const name = await box(page.getByTestId(`${id}.name`));
        expect(go.x - (input.x + input.width), id).toBeGreaterThanOrEqual(0);
        expect(go.x - (input.x + input.width), id).toBeLessThanOrEqual(8);
        expect(name.x - (go.x + go.width), id).toBeLessThanOrEqual(8);
        // Same row: vertical centres within a few pixels.
        expect(Math.abs(go.y + go.height / 2 - (input.y + input.height / 2)), id).toBeLessThan(3);
      }
      await expect(page.getByTestId('ov.next_animation_id.name')).toHaveText(/\S/);
      await expect(page.getByLabel('Next animation', { exact: true })).toHaveValue(/\d+/);
    });
});
