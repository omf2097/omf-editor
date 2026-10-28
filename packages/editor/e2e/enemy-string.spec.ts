// The enemy string in the Script view (spec 15 §6.1): edited like the other
// strings, its frame letters are the opponent's move 9 sprites, and the
// preview plays it on the opponent. Fixture enemy.af (fixtures/build.ts).
import type { Page } from '@playwright/test';
import { readAF } from '@omf/formats';
import { test, expect, fixture, type App } from './helpers';

/** Pixels of the scene canvas that have palette index `index`'s colour. */
async function countIndex(app: App, page: Page, index: number): Promise<number> {
  const lut = await app.hooks((h) => h.lut());
  return page.evaluate((want) => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="scene-canvas"]')!;
    const d = new Uint32Array(
      c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.buffer,
    );
    return d.filter((v) => v === want).length;
  }, lut[index]!);
}

async function openEnemy(app: App, page: Page, id = 31): Promise<void> {
  await app.open('enemy.af', `/animations/${id}/script`);
  await app.paletteSource();
  // The arena background has every colour; counted pixels are the sprites'.
  await page.getByTestId('toggle.bg').click();
  await page.getByTestId('script.target').selectOption('enemy');
}

test.describe('enemy string: editing', () => {
  test('the string selector offers it for AF moves only', async ({ app, page }) => {
    await app.open('enemy.af', '/animations/31/script');
    await expect(page.getByTestId('script.target').locator('option[value="enemy"]')).toHaveText(
      'Enemy string',
    );
    await page.getByTestId('script.target').selectOption('enemy');
    await expect(page.locator('[data-testid^="script.timeline.segment."]')).toHaveCount(3);
    await expect(page.getByTestId('frame.1.tag.0.code')).toHaveText('x-3');
    await expect(page.getByTestId('script.enemy-note')).toBeVisible();
    await expect(page.getByTestId('script.bytes')).toContainText('11/510 bytes');
    await expect(page.getByTestId('script.extra.delete')).toHaveCount(0);
    await app.open('arena.bk', '/animations/6/script');
    await expect(page.getByTestId('script.target').locator('option[value="enemy"]')).toHaveCount(0);
  });

  test('visual and text edits, undo, and a byte-exact save', async ({ app, page }) => {
    await page.clock.install();
    await openEnemy(app, page);
    await app.setField('frame.0.duration', 4);
    await page.clock.runFor(500);
    let m = readAF(Uint8Array.from((await app.hooks((h) => h.bytes()))!)).moves.get(31)!;
    expect(m.enemyString).toBe('A4-x-3B3-C2');
    expect(m.baseString).toBe('A3-B3-C3');

    await page.getByTestId('script.mode.text').click();
    await expect(page.getByTestId('script.text')).toHaveValue('A4-x-3B3-C2');
    await page.getByTestId('script.text').fill('A1-E2');
    await page.clock.runFor(700);
    m = readAF(Uint8Array.from((await app.hooks((h) => h.bytes()))!)).moves.get(31)!;
    expect(m.enemyString).toBe('A1-E2');

    await page.getByTestId('undo').click();
    await expect(page.getByTestId('script.text')).toHaveValue('A4-x-3B3-C2');
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('script.text')).toHaveValue('A2-x-3B3-C2');
    expect(await app.hooks((h) => h.dirty())).toBe(false);
    // Unedited, every byte is as read.
    expect(Uint8Array.from((await app.hooks((h) => h.bytes()))!)).toEqual(fixture('enemy.af'));
  });

  test('thumbnails and the sprite picker are the opponent move 9 sprites', async ({
    app,
    page,
  }) => {
    await openEnemy(app, page);
    // Move 31 has three sprites, move 9 five.
    await expect(page.getByTestId('frame.0.sprite').locator('option')).toHaveCount(5);
    await expect(page.locator('[data-testid^="strip."]')).toHaveCount(5);
    await page.getByTestId('frame.0.sprite').selectOption('4');
    await expect(page.getByTestId('frame.0.sprite')).toHaveValue('4');
    // The thumbnail shows move 9 sprite E (0x15), as player 2 (+48).
    const lut = await app.hooks((h) => h.lut());
    const px = await page
      .getByTestId('script.frame.0')
      .locator('canvas')
      .first()
      .evaluate((c: HTMLCanvasElement) =>
        Array.from(c.getContext('2d')!.getImageData(2, 2, 1, 1).data),
      );
    const want = lut[0x15 + 48]!;
    expect(px).toEqual([want & 255, (want >> 8) & 255, (want >> 16) & 255, (want >>> 24) & 255]);
  });

  test('"sprite does not exist" is checked against move 9', async ({ app, page }) => {
    await page.clock.install();
    await openEnemy(app, page);
    await page.getByTestId('script.mode.text').click();
    // E exists in move 9 (five sprites) though move 31 has only A–C.
    await page.getByTestId('script.text').fill('A1-E2');
    await page.clock.runFor(700);
    await expect(page.getByTestId('script.diagnostics')).toHaveCount(0);
    await page.getByTestId('script.text').fill('A1-F2');
    await page.clock.runFor(700);
    await expect(page.getByTestId('script.diagnostics')).toContainText(
      'Frame 2: frame F refers to a sprite that does not exist',
    );
  });

  test('a string over 510 bytes is flagged and blocks saving', async ({ app, page }) => {
    await page.clock.install();
    await openEnemy(app, page);
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').fill('A1-'.repeat(170) + 'A11');
    await page.clock.runFor(700);
    await expect(page.getByTestId('script.too-long')).toBeVisible();
    await expect(page.getByTestId('script.bytes')).toContainText('513/510');
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast.error')).toContainText(
      'enemy string longer than 510 bytes',
    );
  });

  test('the Overview link opens the Script view on the enemy string', async ({ app, page }) => {
    await app.open('enemy.af', '/animations/31');
    await expect(page.getByTestId('ov.enemy_string')).toHaveValue('A2-x-3B3-C2');
    await page.getByTestId('ov.edit-enemy').click();
    await expect(page.getByTestId('view.script')).toBeVisible();
    await expect(page.getByTestId('script.target')).toHaveValue('enemy');
    await expect(page.getByTestId('enemy.panel')).toBeVisible();
  });
});

test.describe('enemy string: standalone preview', () => {
  test('plays the opponent move 9, as player 2, facing the attacker', async ({ app, page }) => {
    await openEnemy(app, page);
    // Sprite A of move 9 is 0x11; player 2 adds 48.
    await expect.poll(() => countIndex(app, page, 0x11 + 48)).toBe(10 * 12);
    expect(await countIndex(app, page, 0x08)).toBe(0);
    // Frame 2 has x-3: facing left, the opponent moves right, away from the attacker.
    await app.hooks((h) => h.stepTicks(3));
    const st = await app.hooks((h) => h.playback());
    expect(st).toMatchObject({ frameIndex: 1, x: 6 });
    await expect.poll(() => countIndex(app, page, 0x12 + 48)).toBe(10 * 12);
    // Flip turns the pair around: the opponent then faces right.
    await page.getByTestId('toggle.flip').click();
    await app.hooks((h) => h.stepTicks(3));
    expect((await app.hooks((h) => h.playback())).x).toBeLessThan(0);
  });

  test('Centred framing follows the opponent', async ({ app, page }) => {
    await openEnemy(app, page);
    await page.getByTestId('mode.centred').click();
    await expect.poll(() => countIndex(app, page, 0x11 + 48)).toBe(10 * 12);
    await app.hooks((h) => h.stepTicks(4));
    // The movement is cancelled out: sprite B is drawn whole on the stage.
    await expect.poll(() => countIndex(app, page, 0x12 + 48)).toBe(10 * 12);
  });

  test('a fighter without move 9 says so', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('script.target').selectOption('enemy');
    await expect(page.getByTestId('enemy.no-damage')).toBeVisible();
    await expect(page.getByTestId('frame.0.sprite')).toHaveClass(/is-invalid/);
  });
});
