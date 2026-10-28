import { test, expect } from './helpers';

test.describe('animation list and overview', () => {
  test('filter by id, name and move string; arrow keys move; warning marker', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11');
    const rows = page.locator('[data-testid^="anim-row."]:not([data-testid$=".warn"])');
    await expect(rows).toHaveCount(7);
    await page.getByTestId('anim-filter').fill('20');
    await expect(rows).toHaveCount(1);
    await page.getByTestId('anim-filter').fill('idle');
    await expect(rows).toHaveCount(1);
    await page.getByTestId('anim-filter').fill('p63');
    await expect(rows).toHaveCount(2);
    await page.getByTestId('anim-filter').fill('');
    await page.getByTestId('anim-row.11').click();
    await page.keyboard.press('ArrowDown');
    await expect(page).toHaveURL(/animations\/12/);
    await app.open('edge.af', '/animations/0');
    await expect(page.getByTestId('anim-row.2.warn')).toBeVisible();
  });

  test('add animation: lowest free id; the dialog rejects used and too-large ids', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11');
    await page.getByTestId('anim-add').click();
    await expect(page.getByTestId('add-dialog.id')).toHaveValue('0');
    await app.setField('add-dialog.id', 11);
    await expect(page.getByTestId('add-dialog.error')).toContainText('already used');
    await app.setField('add-dialog.id', 70);
    await expect(page.getByTestId('add-dialog.error')).toContainText('up to 69');
    // Enter in the dialog adds (setField presses Enter).
    await app.setField('add-dialog.id', 30);
    await expect(page).toHaveURL(/animations\/30$/);
    await expect(page.getByTestId('ov.base_string')).toHaveText('A10');
    await app.open('arena.bk', '/animations/6');
    await page.getByTestId('anim-add').click();
    await app.setField('add-dialog.id', 50);
    await expect(page.getByTestId('add-dialog.error')).toContainText('up to 49');
  });

  test('deleting a referenced animation lists referrers; undo restores it', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11');
    await page.getByTestId('anim-delete').click();
    await expect(page.getByTestId('confirm.details')).toContainText('20: next_animation_id');
    await page.getByTestId('confirm.delete').click();
    await expect(page.getByTestId('anim-row.11')).toHaveCount(0);
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('anim-row.11')).toBeVisible();
  });

  test('overview fields: linked id navigates, flags show hex, unknown fields persist', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20');
    await page.getByTestId('ov.next_animation_id.go').click();
    await expect(page).toHaveURL(/animations\/11$/);
    await page.goBack();
    await page.getByTestId('ov.pos_constraint').getByRole('button').first().click();
    await page.getByTestId('ov.pos_constraint.NO_DIST_CHECK').check();
    await expect(page.getByTestId('ov.pos_constraint.hex')).toContainText('0x0003');
    await page.getByTestId('ov.unknown.toggle').click();
    await app.setField('ov.unknown_7', 77);
    await page.getByTestId('tab.anim-script').click();
    await page.getByTestId('tab.anim-overview').click();
    await page.getByTestId('ov.unknown.toggle').click();
    await expect(page.getByTestId('ov.unknown_7')).toHaveValue('77');
  });

  test('canvas zoom and overlay toggles; palette-source background for AF', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11');
    await page.getByTestId('zoom.4').click();
    await expect(page.getByTestId('scene-canvas')).toHaveCSS('width', '1280px');
    await page.getByTestId('zoom.2').click();
    const before = await app.sample(160, 50);
    expect(before?.[3]).toBe(0); // no source: transparent background
    await app.paletteSource();
    await expect.poll(async () => (await app.sample(160, 50))?.[3]).toBe(255);
    await page.getByTestId('toggle.bg').click();
    await expect.poll(async () => (await app.sample(160, 50))?.[3]).toBe(0);
  });

  test('AF sprites are centred without an arena and stand on the floor with one', async ({
    app,
    page,
  }) => {
    // Move 21: one 8×8 sprite at (-4, -8). Centred: origin (160, 104), drawn at (156..163, 96..103).
    await app.open('fighter.af', '/animations/21');
    await expect.poll(async () => (await app.sample(160, 100))?.[3]).toBe(255);
    expect((await app.sample(160, 186))?.[3]).toBe(0);
    // Banded greyscale: index 1 is shade 2/16 of the band, not near-black.
    expect((await app.sample(156, 96))?.slice(0, 3)).toEqual([32, 32, 32]);
    await app.paletteSource();
    await expect.poll(async () => (await app.sample(160, 186))?.slice(0, 3)).not.toEqual([0, 0, 0]);
    await expect(page.getByTestId('scene-canvas')).toBeVisible();
    // Background off: centred again.
    await page.getByTestId('toggle.bg').click();
    await expect.poll(async () => (await app.sample(160, 100))?.[3]).toBe(255);
    expect((await app.sample(160, 186))?.[3]).toBe(0);
  });

  test('playback: step, scrub, loop off stops; ms at arena speed and static timing', async ({
    app,
    page,
  }) => {
    await page.clock.install();
    await app.open('fighter.af', '/animations/11');
    await expect(page.getByTestId('playback.label')).toContainText('Frame 1/2');
    // openomf arena ticks: 48 − 4 · speed ms, 28 ms at the default speed 5.
    await expect(page.getByTestId('playback.label')).toContainText('280 ms');
    await page.getByTestId('playback.timing').selectOption('static');
    await expect(page.getByTestId('playback.label')).toContainText('100 ms');
    await page.getByTestId('playback.timing').selectOption('arena');
    await page.getByTestId('playback.speed').fill('0');
    await expect(page.getByTestId('playback.label')).toContainText('480 ms');
    await page.getByTestId('playback.speed').fill('5');
    await page.getByTestId('playback.next').click();
    await expect(page.getByTestId('playback.label')).toContainText('Frame 2/2');
    await page.getByTestId('playback.loop').click();
    await page.getByTestId('playback.first').click();
    await page.getByTestId('playback.toggle').click();
    await page.clock.runFor(2000);
    await expect(page.getByTestId('playback.toggle')).toHaveAttribute('aria-label', 'Play');
    await expect(page.getByTestId('playback.label')).toContainText('Frame 2/2');
  });

  test('sprite strip: click pauses on the sprite; shared sprite marked; unused dimmed', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11');
    await page.getByTestId('strip.1').click();
    await expect(page.getByTestId('playback.label')).toContainText('Frame 2/2');
    await page.goto('./#/animations/12');
    await expect(page.getByTestId('strip.0')).toContainText('↪');
    await page.goto('./#/animations/20');
    await expect(page.getByTestId('strip.2')).not.toHaveClass(/unused/);
    await app.open('edge.af', '/animations/1');
    await expect(page.getByTestId('strip.10')).toHaveClass(/unused/);
  });
});
