// Sprite sheet import checks.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { decode as decodePngFile, encode as encodePngFile } from 'fast-png';
import type { Page } from '@playwright/test';
import { test, expect, type App } from './helpers';

async function exportSheet(page: Page): Promise<{ png: string; json: string }> {
  await page.getByTestId('sprites.sheet').click();
  const downloads: string[] = [];
  const done = new Promise<void>((resolve) => {
    page.on('download', async (d) => {
      const p = await d.path();
      const named = `${p}-${d.suggestedFilename()}`;
      copyFileSync(p, named);
      downloads.push(named);
      if (downloads.length === 2) resolve();
    });
  });
  await page.getByTestId('sheet.export').click();
  await done;
  return {
    png: downloads.find((d) => d.endsWith('.png'))!,
    json: downloads.find((d) => d.endsWith('.json'))!,
  };
}

async function importSheet(app: App, page: Page, png: string, json: string): Promise<void> {
  await page.getByTestId('sprites.sheet').click();
  await page.getByTestId('sheet.tab.import').click();
  await app.chooseFile(png, () => page.getByTestId('sheet.pick-png').click());
  await app.chooseFile(json, () => page.getByTestId('sheet.pick-json').click());
  await page.getByTestId('sheet.analyse').click();
}

test.describe('sheet import', () => {
  test('asks before importing a sheet exported from another animation (G11)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/22/sprites');
    await app.paletteSource();
    const { png, json } = await exportSheet(page);
    await page.goto('./#/animations/23/sprites');
    await importSheet(app, page, png, json);
    await expect(page.getByTestId('confirm')).toContainText('fighter.af animation 22');
    await page.getByTestId('confirm.cancel').click();
    await expect(page.getByTestId('sheet.changes')).toHaveCount(0);
  });

  test('reads the transparent_index of the JSON without a tRNS chunk (G11)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await app.paletteSource();
    const before = await app.bytes();
    const { png, json } = await exportSheet(page);
    const img = decodePngFile(readFileSync(png));
    const plain = `${png}-no-trns.png`;
    writeFileSync(
      plain,
      encodePngFile({
        width: img.width,
        height: img.height,
        data: img.data,
        depth: 8,
        channels: 1,
        palette: img.palette!.map((c) => [c[0]!, c[1]!, c[2]!]),
      } as never),
    );
    await importSheet(app, page, plain, json);
    await expect(page.getByTestId('sheet.apply')).toBeDisabled();
    await expect(page.getByTestId('sheet.changes')).not.toContainText('px differ');
    expect(await app.bytes()).toEqual(before);
  });

  test('an included change can be unticked and ticked again (G15)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await app.paletteSource();
    const { png, json } = await exportSheet(page);
    const meta = JSON.parse(readFileSync(json, 'utf8'));
    meta.sprites[0].origin_in_cell.x += 2; // same pixels, other offset
    const moved = `${json}-moved.json`;
    writeFileSync(moved, JSON.stringify(meta));
    await importSheet(app, page, png, moved);
    const box = page.getByTestId('sheet.change.0').locator('input[type=checkbox]');
    await expect(box).toBeChecked();
    await expect(page.getByTestId('sheet.change.0')).toContainText(/[1-9]\d* px differ/);
    await box.uncheck();
    await expect(box).toBeEnabled();
    await box.check();
    await expect(page.getByTestId('sheet.apply')).toContainText('Apply 1');
  });
});
