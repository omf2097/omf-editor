// Animation export: worker, timing and loop count.
import { readFileSync } from 'node:fs';
import { writeBK } from '@omf/formats';
import { test, expect } from './helpers';
import { arena } from './fixtures/build';

/** GIF graphic control extension delays, in centiseconds. */
function gifDelays(bytes: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i + 5 < bytes.length; i++)
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4)
      out.push(bytes[i + 4]! | (bytes[i + 5]! << 8));
  return out;
}

test.describe('animation export', () => {
  test('fast BK frames become GIF frames of at least 20 ms (X2)', async ({ app, page }) => {
    const bk = arena();
    bk.animations.get(6)!.baseString = 'A1-B1-A1-B1-A1-B1';
    await app.goto('/');
    await app.hooks(
      (h, a: [string, number[]]) => h.open(a[0], a[1]),
      ['fast.bk', Array.from(writeBK(bk))],
    );
    await page.evaluate(() => (location.hash = '/animations/6/sprites'));
    await page.getByTestId('sprites.export').click();
    await page.getByTestId('export.gif').click();
    const gif = new Uint8Array(
      readFileSync(await app.download(() => page.getByTestId('export.run').click())),
    );
    const delays = gifDelays(gif);
    expect(delays.length).toBeGreaterThan(0);
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(2);
    expect(delays.reduce((s, d) => s + d, 0)).toBe(6);
  });

  test('one play means no loop in GIF and num_plays 1 in APNG (X3)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await page.getByTestId('sprites.export').click();
    await page.getByTestId('export.gif').click();
    await page.getByTestId('export.plays').fill('1');
    const gif = readFileSync(await app.download(() => page.getByTestId('export.run').click()));
    expect(gif.includes(Buffer.from('NETSCAPE2.0'))).toBe(false);
    await page.getByTestId('sprites.export').click();
    await page.getByTestId('export.plays').fill('1');
    const apng = readFileSync(await app.download(() => page.getByTestId('export.run').click()));
    const at = apng.indexOf(Buffer.from('acTL'));
    expect(apng.readUInt32BE(at + 8)).toBe(1);
  });

  test('asks before a very long export (X4)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await page.getByTestId('sprites.export').click();
    await page.getByTestId('export.end').fill('6000');
    await page.getByTestId('export.run').click();
    await expect(page.getByTestId('confirm')).toContainText('6,000 ticks');
    await page.getByTestId('confirm.cancel').click();
    await expect(page.getByTestId('export-dialog')).toBeVisible();
  });
});
