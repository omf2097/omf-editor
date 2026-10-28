import { readAF } from '@omf/formats';
import { test, expect, fixture, type App } from './helpers';

const frameIndex = (app: App): Promise<number> => app.hooks((h) => h.playback().frameIndex);

test.describe('playback state', () => {
  test('undo of two added extra strings, then typing, still saves (D1)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11/script');
    await page.getByTestId('script.extra.add').click();
    await page.getByTestId('script.extra.add').click();
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('script.target')).toHaveValue('base');
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').fill('A5');
    await page.getByTestId('script.text').blur();
    await expect.poll(async () => (await app.animation(11))!.baseString).toBe('A5');
    expect((await app.animation(11))!.extraStrings).toEqual([]);
    await expect(page.getByTestId('status.size')).toHaveText(/\d B$/);
    const { bytes } = await app.saveDownload();
    expect(readAF(bytes).moves.get(11)!.baseString).toBe('A5');
  });

  test('selecting a frame while another frame is looped shows it (P2)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('playback.first').click();
    await page.getByTestId('playback.hold').click();
    await expect(page.getByTestId('playback.hold')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('script.frame.2').click();
    await expect.poll(() => frameIndex(app)).toBe(2);
  });

  test('a deep link to a frame of an extra string after switching strings (P3)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('script.target').selectOption('0');
    await app.hooks((h, p: string) => h.navigate(p), '/animations/20');
    await app.hooks((h, p: string) => h.navigate(p), '/animations/20/script?frame=2');
    await expect(page.getByTestId('script.target')).toHaveValue('base');
    await expect.poll(() => frameIndex(app)).toBe(2);
  });

  test('opening another file stops playback (D8)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('playback.toggle').click();
    await expect(page.getByTestId('playback.toggle')).toHaveAttribute('aria-label', 'Pause');
    await app.hooks((h, a: number[]) => h.open('fighter.af', a), Array.from(fixture('fighter.af')));
    await expect(page.getByTestId('playback.toggle')).toHaveAttribute('aria-label', 'Play');
  });
});
