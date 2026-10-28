import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './helpers';

test.describe('keyboard and accessibility', () => {
  test('global and view shortcuts', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    await page.keyboard.press('Control+Alt+Digit1');
    await expect(page.getByTestId('view.file')).toBeVisible();
    await page.keyboard.press('Control+Alt+Digit2');
    await expect(page.getByTestId('view.animations')).toBeVisible();
    await page.keyboard.press('Digit2');
    await expect(page).toHaveURL(/\/script$/);
    await page.keyboard.press('Digit3');
    await expect(page).toHaveURL(/\/sprites$/);
    await page.keyboard.press('KeyE');
    await expect(page).toHaveURL(/\/sprites\/0\/edit$/);
    await page.keyboard.press('KeyX');
    await expect(page.getByTestId('pixels.tool.eraser')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/sprites\?sprite=0$/);
    await page.keyboard.press('Control+Alt+Digit6');
    await expect(page.getByTestId('view.reference')).toBeVisible();
  });

  test('shortcuts are suppressed while typing; Escape closes dialogs', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    await page.getByTestId('ov.enemy_string').focus();
    await page.keyboard.press('Digit2');
    await expect(page).toHaveURL(/animations\/20$/);
    await page.getByTestId('anim-delete').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm')).toHaveCount(0);
  });

  test('no serious axe violations on the start view', async ({ app, page }) => {
    await app.goto('/');
    const r = await new AxeBuilder({ page }).disableRules(['color-contrast', 'region']).analyze();
    const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  });

  for (const route of [
    '/file',
    '/animations/20',
    '/animations/20/script',
    '/animations/20/sprites',
    '/animations/20/collisions',
    '/palettes',
    '/problems',
    '/reference',
  ]) {
    test(`no serious axe violations on ${route}`, async ({ app, page }) => {
      await app.open('fighter.af', route);
      const r = await new AxeBuilder({ page }).disableRules(['color-contrast', 'region']).analyze();
      const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }

  test('BK palettes view has no serious axe violations', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    const r = await new AxeBuilder({ page }).disableRules(['color-contrast', 'region']).analyze();
    expect(
      r.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => v.id),
    ).toEqual([]);
  });

  test('tab reaches controls in the overview', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') ?? '',
      );
      seen.add(id);
    }
    expect(seen.has('save')).toBe(true);
    expect([...seen].some((s) => s.startsWith('zoom.'))).toBe(true);
  });
});
