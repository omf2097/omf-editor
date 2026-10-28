// Pixel editor viewport (spec 13 §4): a fixed pane without scrollbars, the
// sprite centred on open, wheel zoom around the pointer, free panning and Fit.
import type { Page } from '@playwright/test';
import { test, expect, type App } from './helpers';

type Box = { x: number; y: number; width: number; height: number };

const box = async (page: Page, id: string): Promise<Box> =>
  (await page.getByTestId(id).boundingBox())!;
const centreOf = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const zoomOf = async (page: Page) => Number(await page.getByTestId('pixels.zoom').inputValue());

/** Image coordinate (fractional pixels) under client point (x, y), from the overlay's box. */
async function imagePoint(page: Page, x: number, y: number, width = 8) {
  const b = await box(page, 'pixels.overlay');
  const z = b.width / width;
  return { x: (x - b.x) / z, y: (y - b.y) / z };
}

/** Pane without scrollbars or scrolled content, and the page without overflow. */
async function expectNoScroll(page: Page): Promise<void> {
  const s = await page.getByTestId('pixels.pane').evaluate((el) => ({
    sw: el.scrollWidth - el.clientWidth,
    sh: el.scrollHeight - el.clientHeight,
    left: el.scrollLeft,
    top: el.scrollTop,
    overflow: getComputedStyle(el).overflow,
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(s.overflow).toBe('hidden');
  expect([s.left, s.top, s.page]).toEqual([0, 0, 0]);
}

async function expectCentred(page: Page): Promise<void> {
  const p = centreOf(await box(page, 'pixels.pane'));
  const o = centreOf(await box(page, 'pixels.overlay'));
  expect(Math.abs(p.x - o.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(p.y - o.y)).toBeLessThanOrEqual(1);
}

async function openEditor(app: App, page: Page): Promise<void> {
  await app.open('fighter.af', '/animations/11');
  await app.paletteSource();
  await page.goto('./#/animations/11/sprites/0/edit');
  await expect(page.getByTestId('pixels.overlay')).toBeVisible();
}

/** Drags from `a` by (dx, dy) with Space held, or with the middle button. */
async function panDrag(
  page: Page,
  a: { x: number; y: number },
  dx: number,
  dy: number,
  how: 'space' | 'middle',
): Promise<void> {
  await page.mouse.move(a.x, a.y);
  if (how === 'space') await page.keyboard.down('Space');
  await page.mouse.down({ button: how === 'middle' ? 'middle' : 'left' });
  await page.mouse.move(a.x + dx, a.y + dy, { steps: 4 });
  await page.mouse.up({ button: how === 'middle' ? 'middle' : 'left' });
  if (how === 'space') await page.keyboard.up('Space');
}

test.describe('pixel editor viewport (spec 13 §4)', () => {
  test('the sprite opens fitted and centred in a pane that never scrolls', async ({
    app,
    page,
  }) => {
    await openEditor(app, page);
    // 8×8 in a pane far larger than 256 px: the largest step, 32×.
    expect(await zoomOf(page)).toBe(32);
    await expectCentred(page);
    await expectNoScroll(page);
    const pane = await box(page, 'pixels.pane');
    await page.keyboard.press('Equal');
    await page.getByTestId('pixels.zoom').selectOption('1');
    await expectNoScroll(page);
    // The pane keeps its size whatever the zoom.
    expect(await box(page, 'pixels.pane')).toEqual(pane);
  });

  test('the wheel zooms around the pointer; keys and the select around the pane centre', async ({
    app,
    page,
  }) => {
    await openEditor(app, page);
    await page.getByTestId('pixels.zoom').selectOption('8');
    await expectCentred(page);
    const o = await box(page, 'pixels.overlay');
    // A point inside the sprite, off its centre.
    const at = { x: o.x + 10, y: o.y + 50 };
    const before = await imagePoint(page, at.x, at.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -100);
    await expect.poll(() => zoomOf(page)).toBe(12);
    const after = await imagePoint(page, at.x, at.y);
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.1);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.1);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => zoomOf(page)).toBe(8);
    const back = await box(page, 'pixels.overlay');
    expect(Math.abs(back.x - o.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.y - o.y)).toBeLessThanOrEqual(1);

    // Keys and the select keep the pane centre (here the sprite centre) in place.
    await page.keyboard.press('Equal');
    await expect.poll(() => zoomOf(page)).toBe(12);
    await expectCentred(page);
    await page.getByTestId('pixels.zoom').selectOption('3');
    await expectCentred(page);
    await page.keyboard.press('Minus');
    await expect.poll(() => zoomOf(page)).toBe(2);
    await expectCentred(page);
  });

  test('Space+drag and middle-drag pan at any zoom, from the sprite or beside it', async ({
    app,
    page,
  }) => {
    await openEditor(app, page);
    await page.getByTestId('pixels.zoom').selectOption('4');
    const pane = await box(page, 'pixels.pane');
    const o0 = await box(page, 'pixels.overlay');
    // Space+drag starting on empty pane, the sprite smaller than the pane.
    await panDrag(page, { x: pane.x + 40, y: pane.y + 40 }, 100, 60, 'space');
    const o1 = await box(page, 'pixels.overlay');
    expect([o1.x - o0.x, o1.y - o0.y]).toEqual([100, 60]);
    // Middle-drag starting on the sprite: pans, does not paint.
    await panDrag(page, centreOf(o1), -150, -20, 'middle');
    const o2 = await box(page, 'pixels.overlay');
    expect([o2.x - o1.x, o2.y - o1.y]).toEqual([-150, -20]);
    await expect(page.getByTestId('pixels.undo')).toBeDisabled();
    await expectNoScroll(page);

    // Panning far away keeps part of the sprite (all 32 px of it at 4×) in the pane.
    // (Drags stay inside the window: Firefox drops a release outside it in tests.)
    const tl = { x: pane.x + 10, y: pane.y + 10 };
    const span = { x: pane.width - 20, y: pane.height - 20 };
    for (let i = 0; i < 2; i++)
      await panDrag(page, { x: tl.x + span.x, y: tl.y + span.y }, -span.x, -span.y, 'middle');
    const o3 = await box(page, 'pixels.overlay');
    expect(Math.round(o3.x + o3.width - pane.x)).toBe(32);
    expect(Math.round(o3.y + o3.height - pane.y)).toBe(32);
    for (let i = 0; i < 2; i++) await panDrag(page, tl, span.x, span.y, 'space');
    const o4 = await box(page, 'pixels.overlay');
    expect(Math.round(pane.x + pane.width - o4.x)).toBe(32);
    expect(Math.round(pane.y + pane.height - o4.y)).toBe(32);
    await expectNoScroll(page);

    // Fit returns to the fitted zoom, centred.
    await page.getByTestId('pixels.fit').click();
    expect(await zoomOf(page)).toBe(32);
    await expectCentred(page);
  });

  test('after panning and wheel zoom, tools hit the pixel under the pointer, flipped too', async ({
    app,
    page,
  }) => {
    await openEditor(app, page);
    await page.getByTestId('pixels.zoom').selectOption('8');
    const pane = await box(page, 'pixels.pane');
    await panDrag(page, { x: pane.x + 30, y: pane.y + 30 }, 77, -33, 'middle');
    const o = await box(page, 'pixels.overlay');
    await page.mouse.move(o.x + 3, o.y + 5);
    await page.mouse.wheel(0, -100);
    await expect.poll(() => zoomOf(page)).toBe(12);
    await page.getByTestId('pixels.palette.9').click();
    const b = await box(page, 'pixels.overlay');
    const z = b.width / 8;
    await page.mouse.click(b.x + 2 * z + z / 2, b.y + 3 * z + z / 2);
    await expect(page.getByTestId('pixels.status')).toContainText('x 2 y 3');
    // Flipped, the left screen column is the sprite's right one.
    await page.getByTestId('pixels.flip').check();
    const f = await box(page, 'pixels.overlay');
    expect(f).toEqual(b);
    await page.mouse.click(f.x + z / 2, f.y + 5 * z + z / 2);
    await page.getByTestId('pixels.apply').click();
    const s = (await app.sprite(11, 0))!;
    expect(s.pixels[3 * 8 + 2]).toBe(9);
    expect(s.pixels[5 * 8 + 7]).toBe(9);
  });

  test('a resized window keeps the sprite in view at the same zoom', async ({ app, page }) => {
    await openEditor(app, page);
    await page.getByTestId('pixels.zoom').selectOption('16');
    await expectCentred(page);
    await page.setViewportSize({ width: 1024, height: 700 });
    await expect.poll(async () => (await box(page, 'pixels.pane')).width).toBeLessThan(800);
    expect(await zoomOf(page)).toBe(16);
    await expect
      .poll(async () => centreOf(await box(page, 'pixels.overlay')).x)
      .toBeCloseTo(centreOf(await box(page, 'pixels.pane')).x, 0);
    await expectCentred(page);
    await expectNoScroll(page);
  });

  test('a sprite wider than the pane opens centred and pans to either edge', async ({
    app,
    page,
  }) => {
    await openEditor(app, page);
    await page.getByTestId('pixels.resize').click();
    await page.getByTestId('resize.large').check();
    await app.setField('resize.w', 4000);
    await app.setField('resize.h', 8);
    await page.getByTestId('resize.ok').click();
    await expect(page.getByTestId('pixels.size')).toContainText('4000×8');
    expect(await zoomOf(page)).toBe(1);
    await expectCentred(page);
    await expectNoScroll(page);
    const pane = await box(page, 'pixels.pane');
    // Pan to the right end: the last column comes into the pane.
    for (let i = 0; i < 3; i++)
      await panDrag(
        page,
        { x: pane.x + pane.width - 20, y: pane.y + 20 },
        -(pane.width - 40),
        0,
        'middle',
      );
    const o = await box(page, 'pixels.overlay');
    expect(o.x + o.width).toBeLessThan(pane.x + pane.width);
    await expectNoScroll(page);
  });
});
