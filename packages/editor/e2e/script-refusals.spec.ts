import { test, expect } from './helpers';

test('an effect the frame cannot hold is refused with a message', async ({ app, page }) => {
  await app.open('fighter.af', '/animations/20/script');
  await page.getByTestId('script.mode.text').click();
  await page.getByTestId('script.text').fill('bA1-B2');
  await page.getByTestId('script.text').blur();
  await expect.poll(async () => (await app.animation(20))!.baseString).toBe('bA1-B2');
  await page.getByTestId('script.mode.visual').click();
  const h0 = await app.hooks((h) => h.historyLength());
  // "bu" would read back as another tag (spec 08), so u cannot join b.
  await page.getByTestId('frame.0.add-effect').click();
  await page.getByTestId('effect-picker.search').fill('u');
  await page.getByTestId('effect-picker.item.u').click();
  await expect(page.getByTestId('toast.info').last()).toContainText(
    'u cannot go on frame 1: openomf would read it',
  );
  expect(await app.hooks((h) => h.historyLength())).toBe(h0);
  expect((await app.animation(20))!.baseString).toBe('bA1-B2');
  // The same tag twice is refused too.
  await page.getByTestId('frame.0.add-effect').click();
  await page.getByTestId('effect-picker.search').fill('b');
  await page.getByTestId('effect-picker.item.b').click();
  await expect(page.getByTestId('toast.info').last()).toContainText('Frame 1 already has b');
  // Another frame takes it.
  await page.getByTestId('frame.1.add-effect').click();
  await page.getByTestId('effect-picker.search').fill('u');
  await page.getByTestId('effect-picker.item.u').click();
  await expect.poll(async () => (await app.animation(20))!.baseString).toBe('bA1-uB2');
});
