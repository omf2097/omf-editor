// Spec 17 §2 fixtures and §4 corner cases that had no test of their own (T6).

import { readAF } from '@omf/formats';
import { test, expect, fixture } from './helpers';

test.describe('corner cases (spec 17 §4)', () => {
  test('an animation with no sprites and a frame showing a missing sprite', async ({
    app,
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await app.open('corner.af', '/animations/1');
    await expect(page.getByTestId('anim-title')).toContainText('1');
    await app.hooks((h, p: string) => h.navigate(p), '/animations/1/sprites');
    await expect(page.locator('[data-testid^="sprites.cell."]')).toHaveCount(0);
    await app.hooks((h, p: string) => h.navigate(p), '/animations/1/script');
    await expect(page.getByTestId('script.diagnostics')).toContainText(
      'frame A refers to a sprite that does not exist',
    );
    await app.hooks((h) => h.stepTicks(3));
    // Z (index 25) with only A–C: nothing is drawn on that frame.
    await app.hooks((h, p: string) => h.navigate(p), '/animations/2/script');
    await expect(page.getByTestId('script.diagnostics')).toContainText('frame Z draws nothing');
    await page.getByTestId('playback.scrub').fill('3');
    await expect.poll(async () => (await app.hooks((h) => h.playback())).frameIndex).toBe(1);
    const empty = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="scene-canvas"]')!;
      const d = new Uint32Array(
        c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.buffer,
      );
      return d.every((v) => v === d[0]);
    });
    expect(empty).toBe(true);
    await app.hooks((h, p: string) => h.navigate(p), '/problems');
    const { bytes } = await app.saveDownload();
    expect(bytes).toEqual(fixture('corner.af'));
    expect(errors).toEqual([]);
  });

  test('a 21-byte move string has no NUL; 22 bytes are refused by the field', async ({
    app,
    page,
  }) => {
    await app.open('corner.af', '/animations/3');
    const raw = page.getByTestId('trigger.raw');
    await expect(raw).toHaveValue('ABCDEFGHIJKLMNOPQRSTU');
    // Stored as all 21 bytes, no terminator.
    expect(Array.from(readAF(fixture('corner.af')).moves.get(3)!.moveStringRaw!)).toEqual(
      Array.from('ABCDEFGHIJKLMNOPQRSTU', (c) => c.charCodeAt(0)),
    );
    await raw.fill('ABCDEFGHIJKLMNOPQRSTUV');
    await expect(raw).toHaveClass(/is-invalid/);
    expect(readAF(await app.bytes()).moves.get(3)!.moveString).toBe('ABCDEFGHIJKLMNOPQRSTU');
    await raw.fill('K2');
    await expect.poll(async () => readAF(await app.bytes()).moves.get(3)!.moveString).toBe('K2');
  });

  test('characters outside cp437 are refused with an explanation', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    const before = await app.bytes();
    const enemy = page.getByTestId('ov.enemy_string');
    await enemy.fill('A1€');
    await enemy.press('Enter');
    await expect(enemy).toHaveClass(/is-invalid/);
    await expect(enemy).toHaveAttribute('title', /cp437/);
    const raw = page.getByTestId('trigger.raw');
    await raw.fill('K2€');
    await expect(raw).toHaveClass(/is-invalid/);
    expect(await app.bytes()).toEqual(before);
    expect(await app.dirty()).toBe(false);
    // The script text keeps what was typed, but saving is refused with the reason.
    await app.hooks((h, p: string) => h.navigate(p), '/animations/20/script');
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').fill('A1€');
    await page.getByTestId('script.text').blur();
    await expect.poll(() => app.dirty()).toBe(true);
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast.error').last()).toContainText('outside cp437');
    expect(await app.dirty()).toBe(true);
  });

  test('a resized window keeps the pixel editor working copy', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await app.paletteSource();
    await app.hooks((h, p: string) => h.navigate(p), '/animations/11/sprites/0/edit');
    await page.getByTestId('pixels.zoom').selectOption('8');
    await page.getByTestId('pixels.tool.pencil').click();
    await page.getByTestId('pixels.palette.9').click();
    const b = (await page.getByTestId('pixels.overlay').boundingBox())!;
    await page.mouse.click(b.x + 2 * 8 + 4, b.y + 3 * 8 + 4);
    await page.setViewportSize({ width: 1024, height: 700 });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('view.pixels')).toBeVisible();
    await page.getByTestId('pixels.apply').click();
    expect((await app.sprite(11, 0))!.pixels[3 * 8 + 2]).toBe(9);
  });

  test('JSON of a BK with a background of the wrong length names the path', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/file');
    const before = await app.bytes();
    await app.chooseFile('bad-background.json', async () => {
      await page.getByTestId('file-menu').click();
      await page.getByTestId('menu.import-json').click();
    });
    await expect(page.getByTestId('toast.error').last()).toContainText('background');
    expect(await app.bytes()).toEqual(before);
    await expect(page.getByTestId('doc-title')).toHaveText('arena.bk');
  });
});

test.describe('RGBA PNG import (spec 17 §2)', () => {
  test('alpha below 128 is transparent, the rest matches the palette', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11/sprites');
    await app.paletteSource();
    await app.chooseFile('alpha.png', () => page.getByTestId('sprite.import').click());
    await expect.poll(async () => (await app.sprite(11, 0))!.width).toBe(4);
    const s = (await app.sprite(11, 0))!;
    expect(s.pixels).toEqual([256, 256, 0x63, 0x64]);
  });

  test('an image too large for a sprite is refused and the sprite kept', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11/sprites');
    await app.paletteSource();
    const before = await app.bytes();
    await app.chooseFile('oversized.png', () => page.getByTestId('sprite.import').click());
    await expect(page.getByTestId('toast.error').last()).toContainText('65535');
    expect(await app.bytes()).toEqual(before);
  });
});
