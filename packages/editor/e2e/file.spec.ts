import { test, expect } from './helpers';

test.describe('file view', () => {
  test('header fields clamp to their width; fixed point stores value × 256', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 65535);
    await expect(page.getByTestId('file.health')).toHaveValue('65535');
    await page.getByTestId('file.health').fill('65536');
    await expect(page.getByTestId('file.health')).toHaveClass(/is-invalid/);
    await page.getByTestId('file.health').press('Enter');
    const b = await app.bytes();
    // health is the u16 at offset 9 (after fighter_id, exec_window, endurance, jump limit)
    expect(b[9]! | (b[10]! << 8)).toBe(65535);
    await app.setField('file.forward_speed', '5.5');
    await expect(page.getByTestId('file.forward_speed.raw')).toHaveText('1408');
    await app.setField('file.jump_speed', '−14.5');
    await expect(page.getByTestId('file.jump_speed.raw')).toHaveText('-3712');
    await expect(page.getByTestId('file.jump_speed')).toHaveValue('-14.5');
  });

  test('sound table accepts hex and arrow increments', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await expect(page.locator('[data-testid^="file.sound."]')).toHaveCount(30);
    await app.setField('file.sound.3', '0x1f');
    await expect(page.getByTestId('file.sound.3')).toHaveValue('31');
    await page.getByTestId('file.sound.3').press('ArrowUp');
    await page.getByTestId('file.sound.3').press('Shift+ArrowUp');
    await expect(page.getByTestId('file.sound.3')).toHaveValue('42');
  });

  test('BK music mask toggles bits; an unknown set bit is listed and kept', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/file');
    await expect(page.getByTestId('file.music_mask.hex')).toContainText('0x00000008');
    await page.getByTestId('file.music_mask.MENU').check();
    await expect(page.getByTestId('file.music_mask.hex')).toContainText('0x0000000C');
    // set bit 0x100 through JSON-like edit: open a BK whose mask has an unknown bit
    const bytes = await app.bytes();
    bytes[1] = 0x01;
    await app.hooks((h, a: number[]) => h.open('x.bk', a), Array.from(bytes));
    await page.goto('./#/file');
    await expect(page.getByTestId('file.music_mask.unknown')).toContainText('0x100');
    expect((await app.bytes())[1]).toBe(1);
  });

  test('HAR select names known ids and keeps unknown ones', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await expect(page.getByTestId('file.fighter_id').locator('option:checked')).toHaveText(
      '0 Jaguar',
    );
    await app.setField('file.fighter_id.raw', 42);
    await expect(page.getByTestId('file.fighter_id').locator('option:checked')).toHaveText(
      'Unknown (42)',
    );
  });
});
