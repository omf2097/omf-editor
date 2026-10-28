import { test, expect, fixture } from './helpers';

test.describe('start, open, routing', () => {
  test('open via file chooser goes to the first animation', async ({ app, page }) => {
    await app.goto('/');
    await app.chooseFile('fighter.af', () => page.getByTestId('start.open').click());
    await expect(page).toHaveURL(/#\/animations\/11$/);
    await expect(page.getByTestId('anim-title')).toContainText('11 · Idle');
    await expect(page.getByTestId('doc-title')).toHaveText('fighter.af');
  });

  test('drag and drop opens; dropping while dirty asks and cancel keeps the document', async ({
    app,
    page,
  }) => {
    await app.goto('/');
    const drop = async (name: string): Promise<void> => {
      const data = Array.from(fixture(name));
      const dt = await page.evaluateHandle(
        ([n, b]) => {
          const t = new DataTransfer();
          t.items.add(new File([new Uint8Array(b as number[])], n as string));
          return t;
        },
        [name, data] as const,
      );
      await page.locator('.app-shell').dispatchEvent('dragenter', { dataTransfer: dt });
      await page.locator('.app-shell').dispatchEvent('drop', { dataTransfer: dt });
    };
    await drop('fighter.af');
    await expect(page.getByTestId('doc-title')).toHaveText('fighter.af');
    await app.setField('ov.points', 7);
    await expect(page.getByTestId('doc-title')).toContainText('●');
    await drop('arena.bk');
    await expect(page.getByTestId('confirm')).toBeVisible();
    await page.getByTestId('confirm.cancel').click();
    await expect(page.getByTestId('doc-title')).toContainText('fighter.af');
  });

  test('wrong extension is detected by content', async ({ app, page }) => {
    await app.goto('/');
    await page.evaluate(
      ([b]) =>
        (
          window as unknown as { __omf: { testHooks: { open(n: string, b: number[]): void } } }
        ).__omf.testHooks.open('scene.AF', b as number[]),
      [Array.from(fixture('arena.bk'))],
    );
    await expect(page.getByTestId('toast.info')).toContainText('scene (BK)');
  });

  test('corrupt file shows an error with offset and keeps the previous document', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af');
    for (const cut of [5, 40, 2000]) {
      await app.chooseFile(`truncated-${cut}.bk`, async () => {
        await page.getByTestId('file-menu').click();
        await page.getByTestId('menu.open').click();
      });
      await expect(page.getByTestId('toast.error').last()).toContainText('offset');
      await expect(page.getByTestId('doc-title')).toHaveText('fighter.af');
    }
  });

  test('deep link without a document redirects to start and returns after opening', async ({
    app,
    page,
  }) => {
    await app.goto('/animations/20/script');
    await expect(page).toHaveURL(/#\/$/);
    await app.chooseFile('fighter.af', () => page.getByTestId('start.open').click());
    await expect(page).toHaveURL(/#\/animations\/20\/script$/);
  });

  test('unknown route goes to start; back and forward move between views', async ({
    app,
    page,
  }) => {
    await app.goto('/nope/nothing');
    await expect(page).toHaveURL(/#\/$/);
    await app.open('fighter.af', '/file');
    await page.getByTestId('nav.palettes').click();
    await expect(page.getByTestId('view.palettes.af')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('view.file')).toBeVisible();
    await page.goForward();
    await expect(page.getByTestId('view.palettes.af')).toBeVisible();
  });

  test('AF without palette source shows the banner; choosing a source removes it and survives reload', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af');
    await expect(page.getByTestId('palette-banner')).toBeVisible();
    await app.chooseFile('arena.bk', () => page.getByTestId('palette-banner.choose').click());
    await expect(page.getByTestId('palette-banner')).toHaveCount(0);
    await page.reload();
    await app.goto('/');
    await app.open('fighter.af');
    await expect(page.getByTestId('statusbar')).toContainText('arena.bk');
    await expect(page.getByTestId('palette-banner')).toHaveCount(0);
  });
});
