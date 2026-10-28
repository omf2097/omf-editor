import { test, expect } from './helpers';

const position = (page: import('@playwright/test').Page) =>
  page.getByTestId('script.preview-column').evaluate((el) => getComputedStyle(el).position);

test('the Script preview is sticky only beside the frames, never covering them', async ({
  app,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await app.open('fighter.af', '/animations/20/script');
  await expect.poll(() => position(page)).toBe('sticky');
  // Narrow window: the row wraps, the preview sits above the frames and scrolls away.
  await page.setViewportSize({ width: 1024, height: 700 });
  await expect.poll(() => position(page)).toBe('static');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => position(page)).toBe('sticky');
});
