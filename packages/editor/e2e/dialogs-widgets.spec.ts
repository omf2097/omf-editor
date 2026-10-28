import { readAF, readBK, writeBK, writeSounds, type Sound } from '@omf/formats';
import { test, expect, fixture, type App } from './helpers';

const activeTestId = (app: App) =>
  app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid ?? null);
const blur = (app: App) =>
  app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test.describe('dialogs and popups', () => {
  test('confirm: focus inside, Tab trapped, shortcuts off, Esc restores focus (Y1)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('frame.0.duplicate').click();
    const h0 = await app.hooks((h) => h.historyLength());
    await page.getByTestId('frame.1.delete').click();
    await expect(page.getByTestId('confirm')).toBeVisible();
    await expect(page.getByTestId('confirm.ok')).toBeFocused();
    await page.keyboard.press('ControlOrMeta+KeyZ');
    expect(await app.hooks((h) => h.historyLength())).toBe(h0);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await activeTestId(app)).toMatch(/^confirm\./);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm')).toBeHidden();
    await expect(page.getByTestId('frame.1.delete')).toBeFocused();
    await expect(page.locator('[data-testid^="script.timeline.segment."]')).toHaveCount(4);
  });

  test('new file dialog: focus inside, Esc closes (Y1)', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await blur(app);
    await page.keyboard.press('Control+Alt+KeyN');
    await expect(page.getByTestId('new-dialog')).toBeVisible();
    expect(await activeTestId(app)).toBe('new.har');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('new-dialog')).toBeHidden();
  });

  test('add animation dialog: modal, focused, Esc closes (Y1)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await page.getByTestId('anim-add').click();
    await expect(page.getByTestId('add-dialog')).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByTestId('add-dialog.id')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('add-dialog')).toBeHidden();
    await expect(page.getByTestId('anim-add')).toBeFocused();
  });

  test('effect picker, frame menu and file menu close on Esc and outside click (Y1)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/script');
    const picker = page.getByTestId('effect-picker');
    await page.getByTestId('frame.0.add-effect').click();
    await expect(picker).toBeVisible();
    await blur(app);
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await page.getByTestId('frame.0.add-effect').click();
    await page.getByTestId('script.summary').click();
    await expect(picker).toBeHidden();
    await page.getByTestId('frame.0.menu').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('frame.menu.before')).toBeHidden();
    await page.getByTestId('frame.0.menu').click();
    await page.getByTestId('script.summary').click();
    await expect(page.getByTestId('frame.menu.before')).toBeHidden();
    await page.getByTestId('file-menu').click();
    await expect(page.getByTestId('menu.open')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu.open')).toBeHidden();
    await page.getByTestId('file-menu').click();
    const box = (await page.getByTestId('script.summary').boundingBox())!;
    await page.mouse.click(box.x + 2, box.y + 2);
    await expect(page.getByTestId('menu.open')).toBeHidden();
  });

  test('keyboard reachable: timeline, sidebar rows, swatches, trigger chips; named inputs (Y2)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/script');
    const seg = page.getByTestId('script.timeline.segment.2');
    await seg.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('script.frame.2')).toHaveClass(/border-primary/);
    const row = page.getByTestId('anim-row.21');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/animations\/21/);
    await page.evaluate(() => (location.hash = '/animations/20'));
    const chip = page.getByTestId('trigger.chip.0');
    await expect(chip).toHaveAttribute('tabindex', '0');
    await chip.focus();
    await page.keyboard.press('Enter');
    // Chips run oldest first: chip 0 is the 2 of P632.
    expect(readAF(await app.bytes()).moves.get(20)!.moveString).toBe('P63');
    await app.open('edge.af', '/animations/2/script');
    await expect(page.getByTestId('frame.2.tag.0.value')).toHaveAccessibleName(/.+/);
    await app.open('arena.bk', '/palettes');
    const sw = page.getByTestId('palette-grid.0');
    await expect(sw).toHaveAttribute('tabindex', '0');
    await sw.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('palette-grid.1')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('palettes.selection')).toContainText('0x1–0x1 (1)');
    await expect(page.getByTestId('palette-preview.canvas')).toHaveAccessibleName(/palette 0/);
    await page.getByTestId('palettes.tab.remaps').click();
    await expect(page.getByTestId('remap.entry')).toHaveAccessibleName(/Target of entry/);
  });
});

test.describe('widgets', () => {
  test('a shown fixed-point value commits back to the same raw value (K7)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/file');
    await expect(page.getByTestId('file.fall_speed.raw')).toHaveText('294');
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('file.fall_speed').focus();
      await page.getByTestId('file.fall_speed').blur();
    }
    await expect(page.getByTestId('file.fall_speed.raw')).toHaveText('294');
    expect(await app.dirty()).toBe(false);
  });

  test('hex fields show negative values as -0x (K11)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').fill('mp-1A3');
    await page.getByTestId('script.text').blur();
    await page.getByTestId('script.mode.visual').click();
    await expect(page.getByTestId('frame.0.tag.0.value')).toHaveValue('-0x1');
  });

  test('unknown flag bits can be cleared (K12)', async ({ app, page }) => {
    await app.goto('/');
    const bk = readBK(fixture('arena.bk'));
    bk.musicMask = 0x08 | 0x100;
    await app.hooks((h, a: number[]) => h.open('music.bk', a), Array.from(writeBK(bk)));
    await page.evaluate(() => (location.hash = '/file'));
    await expect(page.getByTestId('file.music_mask.unknown')).toContainText('0x100');
    await page.getByTestId('file.music_mask.unknown.clear.256').click();
    expect(readBK(await app.bytes()).musicMask).toBe(0x08);
  });

  test('new fighter fields are validated; invalid text never reaches the file (K14)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/file');
    await page.getByTestId('file-menu').click();
    await page.getByTestId('menu.new').click();
    await page.getByTestId('new.health').fill('abc');
    await expect(page.getByTestId('new.health')).toHaveClass(/is-invalid/);
    await page.getByTestId('new.health').blur();
    await page.getByTestId('new.endurance').fill('1e99');
    await page.getByTestId('new.endurance').blur();
    await app.setField('new.forward_speed', '6');
    await page.getByTestId('new.fighter').click();
    await expect(page).toHaveURL(/animations/);
    const af = readAF(await app.bytes());
    expect([af.health, af.endurance, af.forwardSpeed, af.fallSpeed]).toEqual([
      200, 14080, 1536, 294,
    ]);
  });

  test('enemy and footer strings stop at 510 bytes (A1)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    await expect(page.getByTestId('ov.enemy_string.count')).toContainText('/510');
    await page.getByTestId('ov.enemy_string').fill('x'.repeat(511));
    await page.getByTestId('ov.enemy_string').blur();
    await expect(page.getByTestId('ov.enemy_string')).toHaveClass(/is-invalid/);
    expect(readAF(await app.bytes()).moves.get(20)!.enemyString).toBe('A1');
    await app.open('arena.bk', '/animations/6');
    await expect(page.getByTestId('ov.footer_string.count')).toContainText('/510');
  });

  test('a NUL typed into a string field is refused (A12)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    await page.getByTestId('ov.enemy_string').evaluate((el: HTMLInputElement) => {
      el.value = 'A\u0000B';
      el.dispatchEvent(new Event('input'));
    });
    await page.getByTestId('ov.enemy_string').blur();
    await expect(page.getByTestId('ov.enemy_string')).toHaveClass(/is-invalid/);
    expect(readAF(await app.bytes()).moves.get(20)!.enemyString).toBe('A1');
  });

  test('the sound browser offers only sounds the one-byte table can hold (A16)', async ({
    app,
    page,
  }) => {
    await app.open('sound.af', '/file');
    const bank: Sound[] = Array.from({ length: 299 }, () => ({
      freqKey: 131,
      data: new Uint8Array(10).fill(128),
    }));
    await app.hooks(
      (h, a: number[]) => h.loadSounds('sounds.dat', a),
      Array.from(writeSounds(bank)),
    );
    await page.getByTestId('sound-table.choose.5').click();
    const dlg = page.getByTestId('sound-browser');
    await expect(page.getByTestId('sound-browser.row.255')).toBeVisible();
    await expect(page.getByTestId('sound-browser.row.256')).toHaveCount(0);
    await expect(dlg.locator('[data-testid^="sound-browser.row."]')).toHaveCount(256);
    await expect(page.getByTestId('sound-browser.unreachable')).toContainText('44 sounds');
    // Values 128–255 are fine: no warning in the table.
    await page.getByTestId('sound-browser.use.200').click();
    await expect(page.getByTestId('sound-table')).not.toContainText('not in SOUNDS.DAT');
  });
});
