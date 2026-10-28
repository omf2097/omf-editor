import { test, expect, type App } from './helpers';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { decodeApng, decode as decodePngFile, encode as encodePngFile } from 'fast-png';
import type { Page } from '@playwright/test';

async function exportSheet(app: App, page: Page): Promise<{ png: string; json: string }> {
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

/** Shifts the first cell (cellW × cellH at the top left) right by `dx`, filling with `key`. */
function shiftCellRight(
  data: Uint8Array,
  w: number,
  cellW: number,
  cellH: number,
  dx: number,
  key: number,
): Uint8Array {
  const moved = Uint8Array.from(data);
  for (let y = 0; y < cellH; y++) {
    moved.fill(key, y * w, y * w + dx);
    moved.set(data.subarray(y * w, y * w + cellW - dx), y * w + dx);
  }
  return moved;
}

test.describe('sprite sheets and export', () => {
  test('export then import unchanged keeps bytes; shifting a sprite changes pos_x', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await app.paletteSource();
    const before = await app.bytes();
    const { png, json } = await exportSheet(app, page);
    await page.getByTestId('sprites.sheet').click();
    await page.getByTestId('sheet.tab.import').click();
    await app.chooseFile(png, () => page.getByTestId('sheet.pick-png').click());
    await app.chooseFile(json, () => page.getByTestId('sheet.pick-json').click());
    await page.getByTestId('sheet.analyse').click();
    await expect(page.getByTestId('sheet.changes')).toContainText('unchanged');
    await expect(page.getByTestId('sheet.apply')).toBeDisabled();
    expect(await app.bytes()).toEqual(before);

    // Move sprite A three pixels right inside its cell.
    const meta = JSON.parse(readFileSync(json, 'utf8'));
    const img = decodePngFile(readFileSync(png));
    const w = img.width;
    const data = Uint8Array.from(img.data as Uint8Array);
    const key = meta.transparent_index;
    const cellW = meta.cell.w;
    const moved = shiftCellRight(data, w, cellW, meta.cell.h, 3, key);
    const out = `${png}-moved.png`;
    writeFileSync(
      out,
      encodePngFile({
        width: w,
        height: img.height,
        data: moved,
        depth: 8,
        channels: 1,
        palette: img.palette,
        transparency: img.transparency,
      } as never),
    );
    await page.getByTestId('sheet.pick-png').click({ trial: true });
    await app.chooseFile(out, () => page.getByTestId('sheet.pick-png').click());
    await page.getByTestId('sheet.analyse').click();
    const posBefore = (await app.sprite(20, 0))!.posX;
    await page.getByTestId('sheet.apply').click();
    expect((await app.sprite(20, 0))!.posX).toBe(posBefore + 3);
  });

  test('sheet without JSON asks for a layout', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await page.getByTestId('sprites.sheet').click();
    await page.getByTestId('sheet.tab.import').click();
    await expect(page.getByTestId('sheet.manual.w')).toBeVisible();
  });

  test('unmatched colours block a sheet import', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/21/sprites');
    await app.paletteSource();
    await page.getByTestId('sprites.sheet').click();
    await page.getByTestId('sheet.tab.import').click();
    await app.chooseFile('unmatched.png', () => page.getByTestId('sheet.pick-png').click());
    await page.getByTestId('sheet.analyse').click();
    await expect(page.getByTestId('confirm.details').locator('li')).toHaveCount(3);
  });

  test('APNG and GIF export', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await app.paletteSource();
    await page.getByTestId('sprites.export').click();
    const apng = await app.download(() => page.getByTestId('export.run').click());
    const d = decodeApng(readFileSync(apng));
    // A3-bl3B4-C2: the shake makes each tick of frame 2 differ, so more than 3 frames.
    expect(d.numberOfFrames).toBeGreaterThanOrEqual(3);
    expect(d.width).toBe(640);
    await page.getByTestId('sprites.export').click();
    await page.getByTestId('export.gif').click();
    const gif = await app.download(() => page.getByTestId('export.run').click());
    expect(new TextDecoder().decode(readFileSync(gif).subarray(0, 6))).toBe('GIF89a');
  });
});
