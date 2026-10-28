import type { Page } from '@playwright/test';
import { test, expect } from './helpers';

/** Replaces the edited string through text mode and goes back to the cards. */
async function setScript(page: Page, text: string): Promise<void> {
  await page.getByTestId('script.mode.text').click();
  await page.getByTestId('script.text').fill(text);
  await page.getByTestId('script.text').blur();
  await page.getByTestId('script.mode.visual').click();
}

const middle = async (page: Page, testid: string): Promise<number> => {
  const b = (await page.getByTestId(testid).boundingBox())!;
  return b.y + b.height / 2;
};

test.describe('script view layout (spec 15 §3)', () => {
  test('a frame without effects is one compact row', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    // Frame 0 (A3) has no effects: number, sprite, duration, add effect and
    // the frame actions share one line.
    const row = await middle(page, 'frame.0.sprite');
    for (const id of [
      'frame.0.number',
      'frame.0.duration',
      'frame.0.ms',
      'frame.0.add-effect',
      'frame.0.duplicate',
      'frame.0.delete',
      'frame.0.menu',
    ])
      expect(Math.abs((await middle(page, id)) - row), id).toBeLessThan(4);
    const card = (await page.getByTestId('script.frame.0').boundingBox())!;
    expect(card.height).toBeLessThan(48);
    // Screen readers read "Frame 1"; the word is visually hidden.
    await expect(page.getByTestId('frame.0.number')).toHaveText('Frame 1');
    await expect(page.getByTestId('frame.0.add-effect')).toHaveAccessibleName('Add effect');
  });

  test('effects are rows below the frame row in the same card', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    const card = (await page.getByTestId('script.frame.1').boundingBox())!;
    const row = (await page.getByTestId('frame.1.sprite').boundingBox())!;
    const tag = (await page.getByTestId('frame.1.tag.0').boundingBox())!;
    expect(tag.y).toBeGreaterThanOrEqual(row.y + row.height - 1);
    expect(tag.y + tag.height).toBeLessThanOrEqual(card.y + card.height);
    // The effect row's label, value, code and remove button stay on one line.
    const line = await middle(page, 'frame.1.tag.0.value');
    for (const id of ['frame.1.tag.0.code', 'frame.1.tag.0.remove'])
      expect(Math.abs((await middle(page, id)) - line), id).toBeLessThan(4);
  });

  test('about twice as many frames fit at 1440×900', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await setScript(page, Array.from({ length: 20 }, (_, i) => `${'ABC'[i % 3]}2`).join('-'));
    await expect(page.locator('[data-testid^="script.frame."]')).toHaveCount(20);
    const visible = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-testid^="script.frame."]')].filter((c) => {
          const r = c.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight;
        }).length,
    );
    // The two-row cards showed 8.
    expect(visible).toBeGreaterThanOrEqual(14);
  });

  test('timeline segments are at least 36 px with text of at least 12 px', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/script');
    await setScript(page, 'A1-B0-C2');
    for (let i = 0; i < 3; i++) {
      const seg = page.getByTestId(`script.timeline.segment.${i}`);
      // Firefox reports layout widths with float error (35.9999…).
      expect((await seg.boundingBox())!.width).toBeGreaterThanOrEqual(35.99);
      const sizes = await seg.evaluate((el) =>
        [...el.querySelectorAll('div')].map((d) => parseFloat(getComputedStyle(d).fontSize)),
      );
      expect(sizes).toHaveLength(2);
      for (const s of sizes) expect(s).toBeGreaterThanOrEqual(12);
    }
    await expect(page.getByTestId('script.timeline.segment.2')).toContainText('C');
    await expect(page.getByTestId('script.timeline.segment.2')).toContainText('2');
  });
});
