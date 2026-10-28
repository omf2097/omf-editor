import { test, expect } from './helpers';
import type { Page } from '@playwright/test';

/** Delays the lazy Start view chunk, as a loaded CI machine would. */
async function slowStartChunk(page: Page): Promise<void> {
  await page.route(/StartView-.*\.js$/, async (r) => {
    await new Promise((res) => setTimeout(res, 400));
    await r.continue();
  });
}

test.describe('test harness (spec 17 §1)', () => {
  test('App.open after a reload waits for the router', async ({ app, page }) => {
    await app.open('sound.af', '/file');
    await expect(page.getByTestId('view.file')).toBeVisible();
    await slowStartChunk(page);
    await page.reload();
    await app.open('sound.af', '/file');
    await expect(page.getByTestId('view.file')).toBeVisible({ timeout: 3000 });
  });

  test('App.open after a reload selects the fallback file access again', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await page.reload();
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 111);
    // The fallback saves as a download in Chromium too.
    const { name } = await app.saveDownload();
    expect(name).toBe('fighter.af');
  });
});

test('tests run with the fake AudioContext, so nothing reaches the audio device', async ({
  page,
}) => {
  await page.goto('./#/');
  const fake = await page.evaluate(
    () => '__audio' in window && new AudioContext().constructor.name !== 'AudioContext',
  );
  expect(fake).toBe(true);
});
