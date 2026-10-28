// Sprite deletion and adding (sharing, strings, image indices).
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

test.describe('deleting sprites', () => {
  test('rewrites base and extra strings and removes the frames that showed it (G4)', async ({
    app,
    page,
  }) => {
    const f = fighter();
    f.moves.set(
      30,
      move({
        baseString: 'A1-B2-C3',
        extraStrings: ['C1-A1', 'B4-A4'],
        sprites: [sprite({ index: 30 }), sprite({ index: 31 }), sprite({ index: 32 })],
      }),
    );
    await openDoc(app, 'del.af', f, '/animations/30/sprites');
    await page.getByTestId('sprites.cell.1').click();
    await page.getByTestId('sprite.delete').click();
    await expect(page.getByTestId('confirm.details')).toContainText('base string, frame 2');
    await expect(page.getByTestId('confirm.details')).toContainText('extra string 1, frame 1');
    await page.getByTestId('confirm.delete').click();
    const a = (await app.animation(30))!;
    expect(a.sprites).toBe(2);
    expect(a.baseString).toBe('A1-B3');
    expect(a.extraStrings).toEqual(['B1-A1', 'A4']);
  });

  test('refuses when a string only shows that sprite', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await page.getByTestId('sprites.cell.1').click();
    await page.getByTestId('sprite.delete').click();
    await expect(page.getByText(/extra string 1 only shows this sprite/)).toBeVisible();
    expect((await app.animation(20))!.sprites).toBe(3);
  });

  test('deleting an image owner lists its sharers and can hand the image over (G5)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11/sprites');
    const owner = (await app.sprite(11, 1))!;
    await page.getByTestId('sprites.cell.1').click();
    await page.getByTestId('sprite.delete').click();
    await expect(page.getByTestId('confirm')).toContainText('12/A');
    await page.getByTestId('confirm.keep').click();
    const heir = (await app.sprite(12, 0))!;
    expect(heir.missing).toBe(false);
    expect(heir.pixels).toEqual(owner.pixels);
  });

  test('deleting an animation that owns shared images can hand them over (G5)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11');
    await page.getByTestId('anim-delete').click();
    await expect(page.getByTestId('confirm')).toContainText('12/A');
    await page.getByTestId('confirm.keep').click();
    expect((await app.sprite(12, 0))!.missing).toBe(false);
  });
});

test.describe('adding sprites', () => {
  test('import PNG adds a sprite under a fresh index without a sharing prompt (G14)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/11/sprites');
    await app.paletteSource();
    await app.chooseFile('exact.png', () => page.getByTestId('sprites.import').click());
    await expect(page.getByTestId('sprites.cell.2')).toBeVisible();
    await expect(page.getByTestId('confirm')).toHaveCount(0);
    const s = (await app.sprite(11, 2))!;
    expect([s.width, s.height, s.missing]).toEqual([4, 4, false]);
    expect(s.index).toBeGreaterThan(8);
    expect(await app.hooks((h) => h.historyLength())).toBe(1);
  });

  test('import PNG refuses a 256th sprite before asking for a file (G14)', async ({
    app,
    page,
  }) => {
    await app.open('edge.af', '/animations/1/sprites');
    await page.getByTestId('sprites.import').click();
    await expect(page.getByText('An animation can have at most 255 sprites')).toBeVisible();
  });

  test('new animations and sprites never take image index 0 (G2)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11/sprites');
    await page.getByTestId('sprites.add').click();
    expect((await app.sprite(11, 2))!.index).not.toBe(0);
  });
});
