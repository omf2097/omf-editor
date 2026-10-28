import { test, expect } from './helpers';

test.describe('collisions view', () => {
  test('table filters by sprite; show all dims others', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/collisions');
    await expect(page.locator('[data-testid^="collisions.row."][data-testid$=".x"]')).toHaveCount(
      1,
    );
    await page.getByTestId('collisions.show-all').check();
    await expect(page.locator('[data-testid^="collisions.row."][data-testid$=".x"]')).toHaveCount(
      2,
    );
    await expect(page.getByTestId('collisions.row.1')).toHaveClass(/text-secondary/);
  });

  test('add at centre, drag on canvas, nudge, axis lock, place mode', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/21/collisions');
    await page.getByTestId('collisions.add').click();
    let c = (await app.animation(21))!.hitCoords[0]!;
    expect([c.x, c.y]).toEqual([0, -4]); // sprite 8×8 at (-4, -8): centre (0, -4)
    const ov = page.getByTestId('scene-canvas.overlay');
    const b = (await ov.boundingBox())!;
    const z = b.width / 320;
    const at = (x: number, y: number) => [b.x + (x + 0.5) * z, b.y + (y + 0.5) * z] as const;
    // Without an arena the sprites are centred: the 8×8 box (-4..4, -8..0) puts the origin at (160, 104).
    const oy = 104;
    await page.mouse.move(...at(160, oy - 4));
    await page.mouse.down();
    await page.mouse.move(...at(165, oy - 10), { steps: 4 });
    await page.mouse.up();
    c = (await app.animation(21))!.hitCoords[0]!;
    expect([c.x, c.y]).toEqual([5, -10]);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowDown');
    c = (await app.animation(21))!.hitCoords[0]!;
    expect([c.x, c.y]).toEqual([4, -2]);
    await page.mouse.move(...at(164, oy - 2));
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(...at(174, oy), { steps: 4 });
    await page.keyboard.up('Shift');
    await page.mouse.up();
    c = (await app.animation(21))!.hitCoords[0]!;
    expect([c.x, c.y]).toEqual([14, -2]);
    await page.getByTestId('collisions.place').click();
    await page.mouse.click(...at(150, oy - 20));
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('collisions.placing')).toHaveCount(0);
    const all = (await app.animation(21))!.hitCoords;
    expect(all[1]).toMatchObject({ x: -10, y: -20, spriteId: 0 });
  });

  test('boundary values', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/collisions');
    await app.setField('collisions.row.0.x', -512);
    await app.setField('collisions.row.0.y', 511);
    expect((await app.animation(20))!.hitCoords[0]).toMatchObject({ x: -512, y: 511 });
    await page.getByTestId('collisions.row.0.x').fill('-513');
    await expect(page.getByTestId('collisions.row.0.x')).toHaveClass(/is-invalid/);
    await page.getByTestId('collisions.row.0.y').fill('512');
    await expect(page.getByTestId('collisions.row.0.y')).toHaveClass(/is-invalid/);
  });

  test('points on missing sprites are flagged; copy from another sprite; clear with confirm', async ({
    app,
    page,
  }) => {
    await app.open('edge.af', '/animations/2/collisions');
    await page.getByTestId('collisions.show-all').check();
    await expect(page.getByTestId('collisions.row.1')).toHaveClass(/table-danger/);
    await app.open('fighter.af', '/animations/20/collisions');
    await page.getByTestId('collisions.sprite').selectOption('2');
    await page.getByTestId('collisions.copy').selectOption({ label: 'Sprite A' });
    expect((await app.animation(20))!.hitCoords.filter((h) => h.spriteId === 2)).toHaveLength(1);
    await page.getByTestId('collisions.clear').click();
    await page.getByTestId('confirm.ok').click();
    expect((await app.animation(20))!.hitCoords.filter((h) => h.spriteId === 2)).toHaveLength(0);
  });

  test('flip mirrors the point and a no-op drag keeps the stored value', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/collisions');
    await page.getByTestId('toggle.flip').click();
    const ov = page.getByTestId('scene-canvas.overlay');
    const b = (await ov.boundingBox())!;
    const z = b.width / 320;
    // sprites span (-5..5, -10..0), so the centred origin is (160, 105); (3, -5) mirrors to (157, 100)
    await page.mouse.move(b.x + 157.5 * z, b.y + 100.5 * z);
    await page.mouse.down();
    await page.mouse.up();
    expect((await app.animation(20))!.hitCoords[0]).toMatchObject({ x: 3, y: -5 });
    await expect(page.getByTestId('collisions.row.0')).toHaveClass(/table-warning/);
  });

  test('values survive save and reload bit-exact including null', async ({ app }) => {
    await app.open('edge.af', '/animations/2/collisions');
    const { bytes } = await app.saveDownload();
    await app.hooks((h, a: number[]) => h.open('e.af', a), Array.from(bytes));
    expect((await app.animation(2))!.hitCoords).toEqual([
      { x: -512, y: 511, spriteId: 0, null: 3 },
      { x: 511, y: -512, spriteId: 5, null: 0 },
    ]);
  });
});
