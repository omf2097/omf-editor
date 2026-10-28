// Export, sprite sheet and resize dialogs share useModal (spec 12 §11).

import { test, expect, type App } from './helpers';

const inside = (app: App, testid: string) =>
  app.page.evaluate((id) => !!document.activeElement?.closest(`[data-testid="${id}"]`), testid);

for (const [button, dialog] of [
  ['sprites.export', 'export-dialog'],
  ['sprites.sheet', 'sheet-dialog'],
] as const) {
  test(`${dialog}: modal, focused, Tab trapped, shortcuts off, Esc restores focus`, async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await app.setField('sprite.pos_x', -9);
    const h0 = await app.hooks((h) => h.historyLength());
    await page.getByTestId(button).click();
    const d = page.getByTestId(dialog);
    await expect(d).toHaveAttribute('aria-modal', 'true');
    expect(await inside(app, dialog)).toBe(true);
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press(i % 2 ? 'Tab' : 'Shift+Tab');
      expect(await inside(app, dialog)).toBe(true);
    }
    // No shortcut fires behind the dialog.
    await page.keyboard.press('ControlOrMeta+KeyZ');
    await page.keyboard.press('Control+Alt+Digit6');
    expect(await app.hooks((h) => h.historyLength())).toBe(h0);
    await expect(page).toHaveURL(/animations\/20\/sprites/);
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    await expect(page.getByTestId(button)).toBeFocused();
    // Shortcuts are back.
    await page.keyboard.press('Control+Alt+Digit6');
    await expect(page.getByTestId('view.reference')).toBeVisible();
  });
}

test('resize dialog: modal, focused, Tab trapped, Esc closes only the dialog', async ({
  app,
  page,
}) => {
  await app.open('fighter.af', '/animations/11/sprites/0/edit');
  await page.getByTestId('pixels.resize').click();
  const d = page.getByTestId('resize-dialog');
  await expect(d).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('resize.w')).toBeFocused();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    expect(await inside(app, 'resize-dialog')).toBe(true);
  }
  // X is the eraser key; no tool switches while the dialog is open.
  await d.getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('KeyX');
  await expect(page.getByTestId('pixels.tool.eraser')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  await expect(page.getByTestId('view.pixels')).toBeVisible();
  await expect(page.getByTestId('pixels.resize')).toBeFocused();
});
