import { test, expect } from './helpers';
import { readAF } from '@omf/formats';

const moveString = async (app: { bytes(): Promise<Uint8Array> }, id: number) =>
  readAF(await app.bytes()).moves.get(id)!.moveString;

test.describe('move trigger editor', () => {
  test('build 236P by pad clicks, keyboard and raw typing', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/21');
    await page.getByTestId('trigger.clear').click();
    for (const d of ['2', '3', '6']) await page.getByTestId(`trigger.pad.${d}`).click();
    await page.getByTestId('trigger.button.P').click();
    await expect(page.getByTestId('trigger.raw')).toHaveValue('P632');
    await expect(page.getByTestId('trigger.notation')).toHaveText('236P');
    await expect(page.getByTestId('trigger.chip.0')).toContainText('2');
    await page.getByTestId('trigger.clear').click();
    await page.getByTestId('trigger.pad').focus();
    await page.keyboard.type('214k');
    expect(await moveString(app, 21)).toBe('K412');
    await page.getByTestId('trigger.raw').fill('P41236');
    expect(await moveString(app, 21)).toBe('P41236');
    await expect(page.getByTestId('trigger.bytes')).toContainText('6/21');
  });

  test('reorder chips; repeated direction refused with a hint', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    await page.getByTestId('trigger.chip.2').dragTo(page.getByTestId('trigger.chip.0'));
    expect(await moveString(app, 20)).toBe('P326');
    await page.getByTestId('trigger.pad.2').click();
    await page.getByTestId('trigger.pad.2').click();
    await expect(page.getByTestId('trigger.hint')).toContainText('repeated');
  });

  test('conflict warning for a lower-id prefix move clears when its trigger changes', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/21');
    // move 20 has P632, move 21 has P63: 21 is shadowed by nothing; make 21 longer than 20's prefix
    await page.getByTestId('trigger.raw').fill('P6321');
    await expect(page.getByTestId('trigger.conflicts')).toContainText('move 20');
    await page.getByTestId('trigger.raw').fill('K6321');
    await expect(page.getByTestId('trigger.conflicts')).toHaveCount(0);
  });

  test('special values round-trip untouched', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/21');
    for (const v of ['!', '"!"', '0', 'n', 'LINK17']) {
      await page.getByTestId('trigger.raw').fill(v);
      await expect(page.getByTestId('trigger.mode.special')).toBeChecked();
      expect(await moveString(app, 21)).toBe(v);
    }
  });

  test('try it selects the move with the fake clock and nothing after a long hold', async ({
    app,
    page,
  }) => {
    await page.clock.install();
    await app.open('fighter.af', '/animations/20');
    await page.getByText('Try it').click();
    const box = page.getByTestId('trigger.try');
    await box.focus();
    await page.keyboard.press('2');
    await page.clock.runFor(100);
    await page.keyboard.press('3');
    await page.clock.runFor(100);
    await page.keyboard.press('6');
    await page.keyboard.press('p');
    await expect(page.getByTestId('trigger.try.result')).toContainText('move 20');
    await page.keyboard.press('2');
    await page.clock.runFor(100);
    await page.keyboard.press('3');
    await page.clock.runFor(100);
    await page.keyboard.press('6');
    // openomf (har.c) only looks at the newest input when the button comes more
    // than 9 ticks after the buffer last changed.
    await page.clock.runFor(2000);
    await page.keyboard.press('p');
    await expect(page.getByTestId('trigger.try.result')).not.toContainText('move 20');
  });
});
