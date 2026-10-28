import { test, expect, type App } from './helpers';

const blur = (app: App) =>
  app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
const playback = (app: App) => app.hooks((h) => h.playback());

test.describe('shortcuts', () => {
  test('in text fields Ctrl+A and Ctrl+Z keep their text meaning (K1)', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palette-grid.200').click();
    const hex = page.getByTestId('color-editor.hex');
    await hex.click();
    await page.keyboard.press('ControlOrMeta+KeyA');
    await expect(page.getByTestId('palettes.selection')).toContainText('(1)');
    expect(
      await hex.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!),
    ).toBe(7);
    await app.setField('color-editor.R', 9);
    const h1 = await app.hooks((h) => h.historyLength());
    await page.getByTestId('color-editor.G').click();
    await page.keyboard.type('1');
    await page.keyboard.press('ControlOrMeta+KeyZ');
    expect(await app.hooks((h) => h.historyLength())).toBe(h1);
    await expect(page.getByTestId('color-editor.R')).toHaveValue('9');
    // Outside a text field Ctrl+Z undoes.
    await blur(app);
    await page.keyboard.press('ControlOrMeta+KeyZ');
    await expect(page.getByTestId('color-editor.R')).toHaveValue('8');
  });

  test('Ctrl+M still switches the script mode from inside the text area (K1)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').click();
    await page.keyboard.press('ControlOrMeta+KeyM');
    await expect(page.getByTestId('script.timeline')).toBeVisible();
  });

  test('sliders and radio buttons keep their arrow keys (K2)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11/script');
    const speed = page.getByTestId('playback.speed');
    const v0 = Number(await speed.inputValue());
    await speed.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page).toHaveURL(/animations\/11\/script$/);
    await expect(speed).toHaveValue(String(v0 - 1));
    await app.page.evaluate(() => (location.hash = '/animations/20'));
    await page.getByTestId('trigger.mode.sequence').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page).toHaveURL(/animations\/20$/);
    // Outside such a control the arrow moves through the animations.
    await blur(app);
    await page.keyboard.press('ArrowDown');
    await expect(page).toHaveURL(/animations\/21$/);
  });

  test('playback keys: Space , . Home End (K16)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await expect.poll(async () => (await playback(app)).total).toBe(9);
    await blur(app);
    await page.keyboard.press('End');
    expect((await playback(app)).frameIndex).toBe(2);
    await page.keyboard.press('Home');
    expect((await playback(app)).frameIndex).toBe(0);
    await page.keyboard.press('Period');
    expect((await playback(app)).frameIndex).toBe(1);
    await page.keyboard.press('Comma');
    expect((await playback(app)).frameIndex).toBe(0);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('playback.toggle')).toHaveAttribute('aria-label', 'Pause');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('playback.toggle')).toHaveAttribute('aria-label', 'Play');
  });

  test('zoom and overlay keys: + - F B H O G (K16)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    // The preview opens fitted (a fractional zoom); start from a whole step.
    await page.getByTestId('zoom.2').click();
    await blur(app);
    await expect(page.getByTestId('zoom.2')).toHaveClass(/btn-secondary/);
    await page.keyboard.press('Equal');
    await expect(page.getByTestId('zoom.3')).toHaveClass(/btn-secondary/);
    await page.keyboard.press('Minus');
    await page.keyboard.press('Minus');
    await expect(page.getByTestId('zoom.1')).toHaveClass(/btn-secondary/);
    for (const [key, toggle] of [
      ['KeyF', 'flip'],
      ['KeyB', 'bg'],
      ['KeyH', 'hits'],
      ['KeyO', 'origin'],
      ['KeyG', 'grid'],
    ] as const) {
      const t = page.getByTestId(`toggle.${toggle}`);
      const before = await t.getAttribute('aria-pressed');
      await page.keyboard.press(key);
      await expect(t).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
    }
  });

  test('Palettes: Enter edits the colour, I picks from the preview (K16)', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palette-grid.200').click();
    await blur(app);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('color-editor.R')).toBeFocused();
    await blur(app);
    // The preview is 400 px wide for 320 logical: css x 100 is background index 80.
    await page.getByTestId('palette-preview.canvas').hover({ position: { x: 100, y: 10 } });
    await page.keyboard.press('KeyI');
    await expect(page.getByTestId('palettes.selection')).toContainText('0x50–0x50 (1)');
  });

  test('Ctrl+Space opens the effect picker on the selected frame (K16)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('script.timeline.segment.1').click();
    await blur(app);
    await page.keyboard.press('Control+Space');
    await expect(page.getByTestId('script.frame.1').getByTestId('effect-picker')).toBeVisible();
    await expect(page.getByTestId('effect-picker')).toHaveCount(1);
  });

  test('reference lists the shortcuts of views opened before, and the limits (K13)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/script');
    await expect(page.getByTestId('view.script')).toBeVisible();
    await page.evaluate(() => (location.hash = '/reference'));
    const table = page.getByTestId('ref.shortcuts');
    await expect(table).toContainText('Duplicate the selected frame');
    await expect(table).toContainText('Play / pause');
    await expect(table).toContainText('Ctrl+S');
    await expect(page.getByTestId('ref.limits')).toContainText('≤ 1023 bytes');
  });
});
