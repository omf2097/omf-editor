// Pixel editor regressions.
import { writeAF, type AFFile } from '@omf/formats';
import { test, expect, type App } from './helpers';
import { fighter, move, sprite } from './fixtures/build';

async function openDoc(app: App, name: string, doc: AFFile, hash: string): Promise<void> {
  await app.goto('/');
  await app.hooks(
    (h, a: [string, number[]]) => h.open(a[0], a[1]),
    [name, Array.from(writeAF(doc))],
  );
  await app.page.evaluate((h) => (location.hash = h), hash);
}

test.describe('pixel editor', () => {
  test('a sprite without pixels and a garbage header size opens as 1×1 (G1)', async ({
    app,
    page,
  }) => {
    const f = fighter();
    f.moves.set(
      30,
      move({
        sprites: [
          { ...sprite({ index: 30 }), width: 60537, height: 60537, image: new Uint8Array(0) },
        ],
      }),
    );
    await openDoc(app, 'garbage.af', f, '/animations/30/sprites/0/edit');
    await expect(page.getByTestId('pixels.size')).toContainText('1×1');
  });

  test('painting palette index 0 stores transparency (A4)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await app.paletteSource();
    await page.goto('./#/animations/11/sprites/0/edit');
    await page.getByTestId('pixels.zoom').selectOption('8');
    await page.getByTestId('pixels.palette.0').click();
    await expect(page.getByTestId('pixels.fg')).toHaveText('⊘');
    const b = (await page.getByTestId('pixels.overlay').boundingBox())!;
    await page.mouse.click(b.x + 4, b.y + 4);
    await page.getByTestId('pixels.apply').click();
    expect((await app.sprite(11, 0))!.pixels[0]).toBe(256);
  });

  test('Alt with the rectangle draws filled from the first press (G17)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await app.paletteSource();
    await page.goto('./#/animations/11/sprites/0/edit');
    await page.getByTestId('pixels.zoom').selectOption('8');
    await page.getByTestId('pixels.palette.12').click();
    await page.getByTestId('pixels.tool.rect').click();
    const b = (await page.getByTestId('pixels.overlay').boundingBox())!;
    const at = (x: number, y: number) => [b.x + x * 8 + 4, b.y + y * 8 + 4] as const;
    await page.keyboard.down('Alt');
    await page.mouse.move(...at(1, 1));
    await page.mouse.down();
    await page.mouse.move(...at(3, 3), { steps: 2 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(page.getByTestId('pixels.fg')).toHaveText('12');
    await page.getByTestId('pixels.apply').click();
    expect((await app.sprite(11, 0))!.pixels[2 * 8 + 2]).toBe(12);
  });

  test('a fill with the colour already there adds no undo step (G18)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await page.goto('./#/animations/11/sprites/0/edit');
    await page.getByTestId('pixels.zoom').selectOption('8');
    await page.getByTestId('pixels.tool.picker').click();
    const b = (await page.getByTestId('pixels.overlay').boundingBox())!;
    await page.mouse.click(b.x + 4, b.y + 4);
    await page.getByTestId('pixels.tool.fill').click();
    await page.mouse.click(b.x + 4, b.y + 4);
    await expect(page.getByTestId('pixels.undo')).toBeDisabled();
  });

  test('zoom keys step through the listed zooms; Esc closes only the resize dialog (G21)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11');
    await page.goto('./#/animations/11/sprites/0/edit');
    await page.getByTestId('pixels.zoom').selectOption('8');
    await page.keyboard.press('Equal');
    await expect(page.getByTestId('pixels.zoom')).toHaveValue('12');
    await page.getByTestId('pixels.resize').click();
    await page.getByTestId('resize.w').fill('9');
    // The modal takes Esc, wherever focus is in it: the editor is not cancelled.
    await page.getByTestId('resize.w').press('Escape');
    await expect(page.getByTestId('resize-dialog')).toHaveCount(0);
    await expect(page.getByTestId('pixels.resize')).toBeFocused();
    await expect(page.getByTestId('view.pixels')).toBeVisible();
    await expect(page.getByTestId('pixels.size')).not.toContainText('9×');
  });

  test('resize shows a preview and caps large sizes at 16383 (A3, G21)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await page.goto('./#/animations/11/sprites/0/edit');
    await page.getByTestId('pixels.resize').click();
    await expect(page.getByTestId('resize.preview').locator('canvas')).toBeVisible();
    await page.getByTestId('resize.large').check();
    await page.getByTestId('resize.w').fill('16384');
    await expect(page.getByTestId('resize.w')).toHaveClass(/is-invalid/);
    await app.setField('resize.w', 16383);
    await app.setField('resize.h', 1);
    await page.getByTestId('resize.ok').click();
    await expect(page.getByTestId('pixels.size')).toContainText('16383×1');
  });

  test('flip mirrors the view while editing stays unflipped (G21)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await app.paletteSource();
    await page.goto('./#/animations/11/sprites/0/edit');
    await page.getByTestId('pixels.zoom').selectOption('8');
    await page.getByTestId('pixels.flip').check();
    await page.getByTestId('pixels.palette.9').click();
    const b = (await page.getByTestId('pixels.overlay').boundingBox())!;
    // The left edge on screen is the sprite's right column.
    await page.mouse.click(b.x + 4, b.y + 4);
    await page.getByTestId('pixels.apply').click();
    expect((await app.sprite(11, 0))!.pixels[7]).toBe(9);
  });
});
