import { test, expect } from './helpers';

test.describe('script view', () => {
  test('visual mode shows frames and labelled effects', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await expect(page.locator('[data-testid^="script.timeline.segment."]')).toHaveCount(3);
    const tag = page.getByTestId('frame.1.tag.0');
    await expect(tag).toContainText('Horizontal screen shake');
    await expect(page.getByTestId('frame.1.tag.0.code')).toHaveText('bl3');
    await expect(page.getByTestId('frame.1.tag.0.value')).toHaveValue('3');
  });

  test('add an effect through the picker; text and timeline update', async ({ app, page }) => {
    await page.clock.install();
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('frame.0.add-effect').click();
    await page.getByTestId('effect-picker.search').fill('spawn');
    await page.getByTestId('effect-picker.item.m').click();
    await app.setField('frame.0.tag.0.value', 11);
    await page.clock.runFor(500);
    await page.getByTestId('script.mode.text').click();
    await expect(page.getByTestId('script.text')).toHaveValue('m11A3-bl3B4-C2');
  });

  test('duration by typing and by dragging the timeline edge (Shift = 5)', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/script');
    await app.setField('frame.0.duration', 7);
    await expect(page.getByTestId('script.timeline.segment.0')).toContainText('7');
    const edge = page.getByTestId('script.timeline.edge.2');
    const box = (await edge.boundingBox())!;
    await page.mouse.move(box.x + 3, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 3 + 6 * 4, box.y + 10, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('frame.2.duration')).toHaveValue('6');
    const box2 = (await edge.boundingBox())!;
    await page.keyboard.down('Shift');
    await page.mouse.move(box2.x + 3, box2.y + 10);
    await page.mouse.down();
    await page.mouse.move(box2.x + 3 + 6 * 6, box2.y + 10, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('frame.2.duration')).toHaveValue('11');
  });

  test('insert, duplicate, delete and reorder frames; undo each', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    const segs = page.locator('[data-testid^="script.timeline.segment."]');
    await page.getByTestId('frame.0.duplicate').click();
    await expect(segs).toHaveCount(4);
    await page.getByTestId('frame.1.menu').click();
    await page.getByTestId('frame.menu.after').click();
    await expect(segs).toHaveCount(5);
    await page.getByTestId('frame.4.delete').click();
    await page.getByTestId('confirm.ok').click();
    await expect(segs).toHaveCount(4);
    await page
      .getByTestId('script.timeline.segment.3')
      .dragTo(page.getByTestId('script.timeline.segment.0'));
    await page.getByTestId('script.mode.text').click();
    await expect(page.getByTestId('script.text')).toHaveValue('bl3B4-A3-A3-A3');
    for (let i = 0; i < 4; i++) await page.getByTestId('undo').click();
    await expect(page.getByTestId('script.text')).toHaveValue('A3-bl3B4-C2');
  });

  test('hold frame keeps playback on the selected frame', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await expect.poll(async () => (await app.hooks((h) => h.playback())).total).toBe(9);
    await page.getByTestId('script.timeline.segment.1').click();
    await page.getByTestId('playback.hold').click();
    await app.hooks((h) => h.stepTicks(30));
    expect((await app.hooks((h) => h.playback())).frameIndex).toBe(1);
  });

  test('position tag drag on the canvas changes x+ live', async ({ app, page }) => {
    await app.open('edge.af', '/animations/2/script');
    await page.getByTestId('script.frame.2').click();
    await page.getByTestId('frame.2.tag.0.drag').click();
    // At 2×, the 20 px drag below is 10 scene pixels (the preview opens fitted otherwise).
    await page.getByTestId('zoom.2').click();
    const c = page.getByTestId('scene-canvas.overlay');
    const b = (await c.boundingBox())!;
    await page.mouse.move(b.x + 200, b.y + 100);
    await page.mouse.down();
    await page.mouse.move(b.x + 220, b.y + 100, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('frame.2.tag.0.value')).toHaveValue('13');
  });

  test('text openomf drops is reported, does not block saving, is saved verbatim', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/21/script');
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').fill('A4-#');
    await page.getByTestId('script.text').blur();
    await expect(page.getByTestId('script.diagnostics')).toContainText('openomf drops "#"');
    await page.getByTestId('nav.file').click();
    const { bytes } = await app.saveDownload();
    expect(new TextDecoder().decode(bytes)).toContain('A4-#');
  });

  test('errata chips fix single tags; normalise rewrites all', async ({ app, page }) => {
    await app.open('edge.af', '/animations/2/script');
    await expect(page.getByTestId('frame.0.tag.0.fix')).toBeVisible();
    await page.getByTestId('frame.0.tag.0.fix').click();
    await page.getByTestId('script.normalise').click();
    await page.getByTestId('confirm.ok').click();
    await page.getByTestId('script.mode.text').click();
    await expect(page.getByTestId('script.text')).toHaveValue(
      's5A5-cB1-x+3x-1x=2y=-3d2rfox1oy2m11q2nC1',
    );
  });

  test('advanced tags render with their raw code and survive a round trip', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/21/script');
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').fill('ufbk5A4');
    await page.getByTestId('script.text').blur();
    await page.getByTestId('script.mode.visual').click();
    await expect(page.getByTestId('frame.0.tag.0')).toContainText('Advanced: uf');
    await expect(page.getByTestId('frame.0.tag.1.code')).toHaveText('bk5');
    const { bytes } = await app.saveDownload();
    expect(new TextDecoder().decode(bytes)).toContain('ufbk5A4');
  });

  test('extra strings: add, edit, and preview drives playback', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/script');
    await page.getByTestId('script.target').selectOption('1');
    await expect(page.getByTestId('playback.label')).toContainText('B1');
    await page.getByTestId('script.extra.add').click();
    await expect(page.getByTestId('script.target')).toHaveValue('2');
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').fill('C9');
    await page.getByTestId('script.text').blur();
    await expect(page.getByTestId('playback.label')).toContainText('C9');
  });

  test('x= slides, r flips on entry, d re-enters', async ({ app, page }) => {
    const state = () => app.hooks((h) => h.playback());
    const ready = (total: number) => expect.poll(async () => (await state()).total).toBe(total);
    await app.open('fighter.af', '/animations/22/script');
    await ready(7);
    await app.hooks((h) => h.stepTicks(2));
    expect(await state()).toMatchObject({ frameIndex: 1, x: 10 });
    await app.hooks((h) => h.stepTicks(2));
    expect((await state()).x).toBe(20);
    await app.hooks((h) => h.stepTicks(2));
    expect(await state()).toMatchObject({ frameIndex: 2, x: 30 });

    await page.goto('./#/animations/23/script');
    await ready(6);
    await app.hooks((h) => h.stepTicks(2));
    expect(await state()).toMatchObject({ frameIndex: 1, flipX: true });
    await app.hooks((h) => h.stepTicks(2));
    // openomf clears the flip when the next frame starts.
    expect(await state()).toMatchObject({ frameIndex: 2, flipX: false });

    await page.goto('./#/animations/24/script');
    await ready(7);
    await app.hooks((h) => h.stepTicks(5));
    expect(await state()).toMatchObject({ frameIndex: 2, tick: 5 });
    await app.hooks((h) => h.stepTicks(1));
    expect(await state()).toMatchObject({ frameIndex: 0, tick: 2 });
  });
});
