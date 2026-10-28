import { readAF } from '@omf/formats';
import { test, expect, type App } from './helpers';

const base = async (app: App, id: number): Promise<string> => (await app.animation(id))!.baseString;
const errorsOf = (app: App): string[] => {
  const e: string[] = [];
  app.page.on('pageerror', (x) => e.push(x.message));
  return e;
};

test.describe('script editing', () => {
  test('a canvas drag ends when its tag, frame or animation changes (K3)', async ({
    app,
    page,
  }) => {
    await app.open('edge.af', '/animations/2/script');
    await page.getByTestId('script.frame.2').click();
    await page.getByTestId('frame.2.tag.0.drag').click();
    await expect(page.getByTestId('script.drag-hint')).toBeVisible();
    const codes = await page
      .locator('[data-testid^="frame.2.tag."][data-testid$=".code"]')
      .allInnerTexts();
    await page.getByTestId('frame.2.tag.0.remove').click();
    await expect(page.getByTestId('script.drag-hint')).toBeHidden();
    const c = page.getByTestId('scene-canvas.overlay');
    const b = (await c.boundingBox())!;
    await page.mouse.move(b.x + 200, b.y + 100);
    await page.mouse.down();
    await page.mouse.move(b.x + 160, b.y + 100, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('[data-testid^="frame.2.tag."][data-testid$=".code"]')).toHaveText(
      codes.slice(1),
    );
    // Undo brings the tag back; a drag started again ends on undo too.
    await page.getByTestId('frame.2.tag.0.drag').click();
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('script.drag-hint')).toBeHidden();
  });

  test('canvas drag stays inside the tag range (K10)', async ({ app, page }) => {
    await app.open('edge.af', '/animations/2/script');
    await page.getByTestId('script.frame.2').click();
    await app.setField('frame.2.tag.0.value', 505);
    await page.getByTestId('frame.2.tag.0.drag').click();
    const b = (await page.getByTestId('scene-canvas.overlay').boundingBox())!;
    await page.mouse.move(b.x + 200, b.y + 100);
    await page.mouse.down();
    await page.mouse.move(b.x + 240, b.y + 100, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('frame.2.tag.0.value')).toHaveValue('511');
  });

  test('at most 10 extra strings (K10)', async ({ app, page }) => {
    // Animation 3 has 341 frames, slow to render under load.
    await app.open('edge.af', '/animations/3/script');
    await expect(page.getByTestId('script.extra.add')).toBeDisabled({ timeout: 20_000 });
    await app.open('fighter.af', '/animations/20/script');
    await expect(page.getByTestId('script.extra.add')).toBeEnabled();
  });

  test('the trigger editor forgets the previous move (K4)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/12');
    await expect(page.getByTestId('trigger.mode.special')).toBeChecked();
    await page.evaluate(() => (location.hash = '/animations/20'));
    await expect(page.getByTestId('trigger.mode.sequence')).toBeChecked();
    await page.getByTestId('trigger.mode.special').check();
    const af = readAF(await app.bytes());
    expect(af.moves.get(20)!.moveString).toBe('!');
    expect(af.moves.get(12)!.moveString).toBe('"!"');
  });

  test('frame sprite choices stop at Z (K5)', async ({ app, page }) => {
    await app.open('edge.af', '/animations/1/script');
    await expect(page.getByTestId('frame.0.sprite').locator('option')).toHaveCount(26);
    await expect(page.getByTestId('frame.0.sprite.limit')).toBeVisible();
  });

  test('Ctrl+D with an out-of-range ?frame or an empty script does not crash (K6)', async ({
    app,
    page,
  }) => {
    const errors = errorsOf(app);
    await app.open('fighter.af', '/animations/11/script?frame=99');
    await expect(page.getByTestId('script.frame.1')).toHaveClass(/border-primary/);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('ControlOrMeta+KeyD');
    await expect.poll(() => base(app, 11)).toBe('A10-B10-B10');
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').fill('');
    await page.getByTestId('script.text').blur();
    await page.getByTestId('script.mode.visual').click();
    await expect(page.getByTestId('script.summary')).toContainText('0 frames');
    await page.keyboard.press('ControlOrMeta+KeyD');
    await expect(page.getByTestId('script.summary')).toContainText('0 frames');
    expect(errors).toEqual([]);
  });

  test('selection follows the frame acted on; trash asks first (K9)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    const selected = page.locator('[data-testid^="script.frame."].border-primary');
    await page.getByTestId('script.frame.2').click();
    await page.getByTestId('script.frame.2').getByRole('button', { name: 'Move up' }).click();
    await expect(selected).toHaveAttribute('data-testid', 'script.frame.1');
    await page
      .getByTestId('script.timeline.segment.1')
      .dragTo(page.getByTestId('script.timeline.segment.0'));
    await expect(selected).toHaveAttribute('data-testid', 'script.frame.0');
    expect(await base(app, 20)).toBe('C2-A3-bl3B4');
    // Deleting an earlier frame keeps the same frame selected.
    await page.getByTestId('script.frame.2').click();
    await page.getByTestId('frame.0.delete').click();
    await expect(page.getByTestId('confirm')).toBeVisible();
    await page.getByTestId('confirm.cancel').click();
    expect(await base(app, 20)).toBe('C2-A3-bl3B4');
    await page.getByTestId('frame.0.delete').click();
    await page.getByTestId('confirm.ok').click();
    await expect.poll(() => base(app, 20)).toBe('A3-bl3B4');
    await expect(selected).toHaveAttribute('data-testid', 'script.frame.1');
    // Inserts are labelled undo steps.
    await page.getByTestId('frame.0.menu').click();
    await page.getByTestId('frame.menu.after').click();
    await expect(page.getByTestId('undo')).toHaveAttribute('title', /insert frame/);
    await expect(selected).toHaveAttribute('data-testid', 'script.frame.1');
  });

  test('a cancelled drag never reorders later; a cancelled resize is dropped (K8)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/script');
    const dt = await page.evaluateHandle(() => new DataTransfer());
    await page
      .getByTestId('script.timeline.segment.2')
      .dispatchEvent('dragstart', { dataTransfer: dt });
    await page
      .getByTestId('script.timeline.segment.2')
      .dispatchEvent('dragend', { dataTransfer: dt });
    await page.getByTestId('script.timeline.segment.0').dispatchEvent('drop', { dataTransfer: dt });
    expect(await base(app, 20)).toBe('A3-bl3B4-C2');
    const edge = page.getByTestId('script.timeline.edge.2');
    const box = (await edge.boundingBox())!;
    await page.mouse.move(box.x + 3, box.y + 10);
    await page.mouse.down();
    await edge.dispatchEvent('pointercancel');
    await page.mouse.move(box.x + 3 + 6 * 4, box.y + 10, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('frame.2.duration')).toHaveValue('2');
    // Trigger chips.
    await page.evaluate(() => (location.hash = '/animations/20'));
    await page.getByTestId('trigger.chip.2').dispatchEvent('dragstart', { dataTransfer: dt });
    await page.getByTestId('trigger.chip.2').dispatchEvent('dragend', { dataTransfer: dt });
    await page.getByTestId('trigger.chip.0').dispatchEvent('drop', { dataTransfer: dt });
    expect(readAF(await app.bytes()).moves.get(20)!.moveString).toBe('P632');
  });

  test('a NUL in the script text is refused (A12)', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('script.mode.text').click();
    // Set like a paste would; typing cannot produce a NUL.
    await page.getByTestId('script.text').evaluate((el: HTMLTextAreaElement) => {
      el.value = 'A3\u0000B4';
      el.dispatchEvent(new Event('input'));
    });
    await page.getByTestId('script.text').blur();
    await expect(page.getByTestId('script.text.nul')).toBeVisible();
    expect(await base(app, 20)).toBe('A3-bl3B4-C2');
  });
});
