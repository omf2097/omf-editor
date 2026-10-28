import { test, expect } from './helpers';
import { readAF, readBK } from '@omf/formats';

test.describe('undo and redo', () => {
  test('undo across views; redo cleared by a new edit', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 111);
    await page.goto('./#/animations/20');
    await app.setField('ov.points', 9);
    await page.goto('./#/file');
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    expect(readAF(await app.bytes()).health).toBe(200);
    await page.getByTestId('redo').click();
    expect(readAF(await app.bytes()).health).toBe(111);
    await app.setField('file.health', 112);
    await expect(page.getByTestId('redo')).toBeDisabled();
  });

  test('rapid edits to one field coalesce into one entry', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    const f = page.getByTestId('file.health');
    await f.focus();
    for (let i = 0; i < 5; i++) await f.press('ArrowUp');
    expect(await app.hooks((h) => h.historyLength())).toBe(1);
  });

  test('history is capped at 200 entries', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    const original = readAF(await app.bytes()).soundTable;
    // The field path itself is covered above; 205 edits through it take
    // half a minute, so they go through the same mutate() by hook.
    await app.setField('file.sound.0', 1);
    await app.hooks((h) => {
      for (let i = 1; i < 205; i++) h.setSound(i % 30, (i * 7) % 256);
    });
    expect(await app.hooks((h) => h.historyLength())).toBe(200);
    const final = readAF(await app.bytes()).soundTable;
    await expect(page.getByTestId('file.sound.4')).toHaveValue(String(final[4]));
    // 200 undos go back to the document after the 5th edit; the 5 oldest are gone.
    await app.hooks((h) => {
      for (let i = 0; i < 200; i++) h.undo();
    });
    await expect(page.getByTestId('undo')).toBeDisabled();
    const expected = [...original];
    expected[0] = 1;
    for (let i = 1; i < 5; i++) expected[i] = (i * 7) % 256;
    expect(readAF(await app.bytes()).soundTable).toEqual(expected);
    await page.getByTestId('redo').click();
    expect(readAF(await app.bytes()).soundTable[5]).toBe(35);
  });

  test('undo of a palette tool restores palette and pixels; undo after pixel apply restores the image', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    const before = await app.bytes();
    await page.getByTestId('palette-grid.16').click();
    await page.getByTestId('palette-grid.31').click({ modifiers: ['Shift'] });
    await page.getByTestId('tool.swap').click();
    await page.getByTestId('swap.target').fill('64');
    await page.getByTestId('swap.apply').click();
    expect(await app.bytes()).not.toEqual(before);
    await page.getByTestId('undo').click();
    expect(await app.bytes()).toEqual(before);
    await page.goto('./#/animations/6/sprites/0/edit');
    await page.getByTestId('pixels.zoom').selectOption('8');
    const b = (await page.getByTestId('pixels.overlay').boundingBox())!;
    await page.mouse.click(b.x + 4, b.y + 4);
    await page.getByTestId('pixels.apply').click();
    expect(readBK(await app.bytes()).animations.get(6)!.sprites[0]!.image).not.toEqual(
      readBK(before).animations.get(6)!.sprites[0]!.image,
    );
    await page.getByTestId('undo').click();
    expect(await app.bytes()).toEqual(before);
  });

  test('undo right after opening does nothing', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await expect(page.getByTestId('undo')).toBeDisabled();
    await page.keyboard.press('Control+z');
    expect(await app.dirty()).toBe(false);
  });
});
