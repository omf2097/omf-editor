import { test, expect } from './helpers';

test('a collision point drag is one undo step', async ({ app, page }) => {
  await app.open('fighter.af', '/animations/21/collisions');
  await page.getByTestId('collisions.add').click();
  const before = await app.hooks((h) => h.historyLength());
  const b = (await page.getByTestId('scene-canvas.overlay').boundingBox())!;
  const z = b.width / 320;
  const at = (x: number, y: number) => [b.x + (x + 0.5) * z, b.y + (y + 0.5) * z] as const;
  // Centred origin (160, 104); the new point is at (0, -4) from it.
  await page.mouse.move(...at(160, 100));
  await page.mouse.down();
  await page.mouse.move(...at(170, 90), { steps: 8 });
  await page.mouse.up();
  expect((await app.animation(21))!.hitCoords[0]).toMatchObject({ x: 10, y: -14 });
  expect(await app.hooks((h) => h.historyLength())).toBe(before + 1);
  await page.getByTestId('undo').click();
  expect((await app.animation(21))!.hitCoords[0]).toMatchObject({ x: 0, y: -4 });
});
