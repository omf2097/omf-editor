import { test, expect, type App } from './helpers';
import type { Page } from '@playwright/test';

async function pixelEditor(
  app: App,
  page: Page,
  anim = 11,
  sprite = 0,
): Promise<(x: number, y: number, shift?: boolean) => Promise<void>> {
  await app.paletteSource();
  await page.goto(`./#/animations/${anim}/sprites/${sprite}/edit`);
  await page.getByTestId('pixels.zoom').selectOption('8');
  const box = async () => (await page.getByTestId('pixels.overlay').boundingBox())!;
  return async (x, y, shift = false) => {
    const b = await box();
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(b.x + x * 8 + 4, b.y + y * 8 + 4);
    if (shift) await page.keyboard.up('Shift');
  };
}

const T = 256;

test.describe('sprites view', () => {
  test('grid shows sizes, empty sprites and survives 255 sprites', async ({ app, page }) => {
    await app.open('edge.af', '/animations/0/sprites');
    await expect(page.getByTestId('sprites.cell.0')).toContainText('∅');
    await page.goto('./#/animations/1/sprites');
    await expect(page.locator('[data-testid^="sprites.cell."]')).toHaveCount(255);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  test('export PNG then import it back keeps pixels and size', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11/sprites');
    await app.paletteSource();
    const before = await app.sprite(11, 0);
    const path = await app.download(() => page.getByTestId('sprite.export').click());
    await app.chooseFile(path, () => page.getByTestId('sprite.import').click());
    const after = await app.sprite(11, 0);
    expect(after!.pixels).toEqual(before!.pixels);
    expect(after!.imageLen).toBeLessThanOrEqual(before!.imageLen);
  });

  test('import with unmatched colours lists them; cancel keeps the sprite; nearest imports', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11/sprites');
    await app.paletteSource();
    const before = await app.sprite(11, 0);
    await app.chooseFile('unmatched.png', () => page.getByTestId('sprite.import').click());
    await expect(page.getByTestId('confirm.details').locator('li')).toHaveCount(3);
    await page.getByTestId('confirm.cancel').click();
    expect((await app.sprite(11, 0))!.pixels).toEqual(before!.pixels);
    await app.chooseFile('unmatched.png', () => page.getByTestId('sprite.import').click());
    await page.getByTestId('confirm.nearest').click();
    const after = await app.sprite(11, 0);
    expect([after!.width, after!.height]).toEqual([4, 1]);
    expect(after!.pixels[3]).toBe(0x61);
  });

  test('import into a shared sprite: only this de-shares; update all changes the owner', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/12/sprites');
    await app.paletteSource();
    const owner = await app.sprite(11, 1);
    await app.chooseFile('exact.png', () => page.getByTestId('sprite.import').click());
    await page.getByTestId('confirm.only').click();
    expect((await app.sprite(12, 0))!.missing).toBe(false);
    expect((await app.sprite(11, 1))!.pixels).toEqual(owner!.pixels);
    await page.getByTestId('undo').click();
    expect((await app.sprite(12, 0))!.missing).toBe(true);
    await app.chooseFile('exact.png', () => page.getByTestId('sprite.import').click());
    await page.getByTestId('confirm.all').click();
    expect((await app.sprite(12, 0))!.missing).toBe(true);
    expect((await app.sprite(11, 1))!.width).toBe(4);
  });

  test('reorder sprites: rewrite keeps frames on the same images; reorder only does not', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await page.getByTestId('sprites.cell.2').dragTo(page.getByTestId('sprites.cell.0'));
    await page.getByTestId('confirm.rewrite').click();
    expect((await app.animation(20))!.baseString).toBe('B3-bl3C4-A2');
    await page.getByTestId('undo').click();
    await page.getByTestId('sprites.cell.2').dragTo(page.getByTestId('sprites.cell.0'));
    await page.getByTestId('confirm.keep').click();
    expect((await app.animation(20))!.baseString).toBe('A3-bl3B4-C2');
  });

  test('deleting a sprite used by frames lists them', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await page.getByTestId('sprites.cell.2').click();
    await page.getByTestId('sprite.delete').click();
    await expect(page.getByTestId('confirm.details')).toContainText('frame 3');
    await page.getByTestId('confirm.delete').click();
    expect((await app.animation(20))!.sprites).toBe(2);
  });
});

test.describe('pixel editor', () => {
  test('pencil, eraser, line, rectangles and fills paint the expected pixels', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11');
    const click = await pixelEditor(app, page);
    const idx = (x: number, y: number) => y * 8 + x;
    // pencil with FG 9
    await page.getByTestId('pixels.palette.9').click();
    await click(0, 0);
    await page.getByTestId('pixels.tool.eraser').click();
    await click(1, 0);
    await page.getByTestId('pixels.tool.line').click();
    const b = (await page.getByTestId('pixels.overlay').boundingBox())!;
    const at = (x: number, y: number) => [b.x + x * 8 + 4, b.y + y * 8 + 4] as const;
    await page.mouse.move(...at(0, 7));
    await page.mouse.down();
    await page.mouse.move(...at(7, 7), { steps: 3 });
    await page.mouse.up();
    await page.getByTestId('pixels.tool.rect').click();
    await page.mouse.move(...at(2, 2));
    await page.mouse.down();
    await page.mouse.move(...at(4, 4), { steps: 3 });
    await page.mouse.up();
    await page.getByTestId('pixels.palette.12').click();
    await page.keyboard.down('Alt');
    await page.mouse.move(...at(5, 1));
    await page.mouse.down();
    await page.mouse.move(...at(6, 2), { steps: 2 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.getByTestId('pixels.apply').click();
    const s = (await app.sprite(11, 0))!;
    expect(s.pixels[idx(0, 0)]).toBe(9);
    expect(s.pixels[idx(1, 0)]).toBe(T);
    expect([0, 3, 7].map((x) => s.pixels[idx(x, 7)])).toEqual([9, 9, 9]);
    expect([s.pixels[idx(2, 2)], s.pixels[idx(3, 3)], s.pixels[idx(4, 4)]]).toEqual([
      9,
      1 + ((3 + 3) % 4),
      9,
    ]);
  });

  test('fill contiguous and global; undo per stroke; one history entry on apply', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11');
    const click = await pixelEditor(app, page, 11, 1);
    // sprite B is a solid 8×8 of index 5
    await page.getByTestId('pixels.palette.7').click();
    await page.getByTestId('pixels.tool.pencil').click();
    for (let y = 0; y < 8; y++) await click(4, y);
    await page.getByTestId('pixels.tool.fill').click();
    await page.getByTestId('pixels.palette.8').click();
    await click(0, 0);
    await page.getByTestId('pixels.palette.6').click();
    await click(7, 0, true); // global: every 5 becomes 6
    await page.getByTestId('pixels.undo').click();
    const before = await app.hooks((h) => h.historyLength());
    await page.getByTestId('pixels.apply').click();
    // Sprite B's image is shared with move 12.
    await page.getByTestId('confirm.all').click();
    expect(await app.hooks((h) => h.historyLength())).toBe(before + 1);
    const s = (await app.sprite(11, 1))!;
    expect(s.pixels[0]).toBe(8);
    expect(s.pixels[4]).toBe(7);
    expect(s.pixels[7]).toBe(5);
  });

  test('select and move clips with a warning; flip and rotate', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await pixelEditor(app, page);
    const b = (await page.getByTestId('pixels.overlay').boundingBox())!;
    const at = (x: number, y: number) => [b.x + x * 8 + 4, b.y + y * 8 + 4] as const;
    await page.getByTestId('pixels.tool.select').click();
    await page.mouse.move(...at(0, 0));
    await page.mouse.down();
    await page.mouse.move(...at(1, 1), { steps: 2 });
    await page.mouse.up();
    await page.getByTestId('pixels.tool.move').click();
    await page.mouse.move(...at(0, 0));
    await page.mouse.down();
    await page.mouse.move(...at(-1, 0), { steps: 2 });
    await page.mouse.up();
    await expect(page.getByTestId('toast.info')).toContainText('clipped');
    await page.keyboard.press('Control+d');
    await page.getByTestId('pixels.flipH').click();
    await page.getByTestId('pixels.rotate').click();
    await page.getByTestId('pixels.apply').click();
    const s = (await app.sprite(11, 0))!;
    expect([s.width, s.height]).toEqual([8, 8]);
  });

  test('cancel after edits asks to confirm', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    const click = await pixelEditor(app, page);
    await click(3, 3);
    await page.getByTestId('pixels.cancel').click();
    await expect(page.getByTestId('confirm')).toBeVisible();
    await page.getByTestId('confirm.ok').click();
    await expect(page).toHaveURL(/sprites\?sprite=0/);
  });

  test('resize with an anchor keeps the content in scene position', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await pixelEditor(app, page);
    const before = (await app.sprite(11, 0))!;
    await page.getByTestId('pixels.resize').click();
    await app.setField('resize.h', 12);
    await page.getByTestId('resize.anchor.b').click();
    await page.getByTestId('resize.ok').click();
    await page.getByTestId('pixels.apply').click();
    const after = (await app.sprite(11, 0))!;
    expect(after.height).toBe(12);
    expect(after.posY).toBe(before.posY - 4);
    expect(after.pixels[4 * 8]).toBe(before.pixels[0]);
  });

  test('encoded size over 65 535 bytes turns red and disables apply', async ({ app, page }) => {
    await app.open('big.bk', '/animations/0/sprites/0/edit');
    await page.getByTestId('pixels.zoom').selectOption('1');
    await expect(page.getByTestId('pixels.apply')).toBeEnabled();
    await page.getByTestId('pixels.transparent').click();
    await page.getByTestId('pixels.tool.fill').click();
    const b = (await page.getByTestId('pixels.overlay').boundingBox())!;
    await page.keyboard.down('Shift');
    await page.mouse.click(b.x + 10.5, b.y + 3.5);
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('pixels.encoded')).toContainText('too large');
    await expect(page.getByTestId('pixels.apply')).toBeDisabled();
  });

  test('onion skin and live preview render', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await pixelEditor(app, page, 11, 1);
    await page.getByTestId('pixels.onion-prev').check();
    const px = await app.sample(80 + 2, 190 - 4, 'pixels.preview');
    expect(px?.[3]).toBe(255);
  });
});
