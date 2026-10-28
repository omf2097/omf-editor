// Preview and collision regressions on unusual sprites.
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

test('a sprite pinned in the preview does not carry over to another animation (P4)', async ({
  app,
  page,
}) => {
  const f = fighter();
  f.moves.set(
    30,
    move({ baseString: 'A5', sprites: [sprite({ index: 30 }), sprite({ index: 31 })] }),
  );
  f.moves.set(
    31,
    move({ baseString: 'A5-B5', sprites: [sprite({ index: 32 }), sprite({ index: 33 })] }),
  );
  await openDoc(app, 'pin.af', f, '/animations/30');
  await page.getByTestId('strip.1').click();
  await expect(page.getByTestId('strip.1')).toHaveClass(/active/);
  await page.evaluate(() => (location.hash = '/animations/31'));
  await expect(page.getByTestId('strip.0')).toHaveClass(/active/);
  await expect(page.getByTestId('strip.1')).not.toHaveClass(/active/);
});

test('Add places a collision point on an empty garbage-size sprite at its offset (G20)', async ({
  app,
  page,
}) => {
  const f = fighter();
  const empty = { ...sprite({ index: 30 }), posX: -3, posY: -7, width: 60537, height: 60537 };
  f.moves.set(30, move({ sprites: [{ ...empty, image: new Uint8Array(0) }] }));
  await openDoc(app, 'coll.af', f, '/animations/30/collisions');
  await page.getByTestId('collisions.add').click();
  expect((await app.animation(30))!.hitCoords[0]).toMatchObject({ x: -3, y: -7 });
});
