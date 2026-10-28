// Scene preview viewport (spec 12 §9): a fixed box with the scene's aspect
// whatever the zoom, the scene filling the box and centred on open, wheel zoom around
// the pointer, zoom buttons and keys around the box centre, free panning with
// Space / middle drag and Fit; pointer mapping stays exact.
import type { Page } from '@playwright/test';
import { test, expect, type App } from './helpers';

type Box = { x: number; y: number; width: number; height: number };

const box = async (page: Page, id: string): Promise<Box> =>
  (await page.getByTestId(id).boundingBox())!;
const centreOf = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
/** Displayed zoom: the overlay spans the 320-pixel scene (rounded: Firefox boxes are not exact). */
const zoomOf = async (page: Page) =>
  Math.round(((await box(page, 'scene-canvas.overlay')).width / 320) * 100) / 100;
/** Whether the scene fills the box (what opening and Fit give), to within rounding. */
const isFitted = async (page: Page) =>
  Math.abs((await zoomOf(page)) - (await box(page, 'scene-canvas.pane')).width / 320) < 0.02;

/** Scene coordinate (fractional pixels) under client point (x, y), from the overlay's box. */
async function scenePoint(page: Page, x: number, y: number) {
  const b = await box(page, 'scene-canvas.overlay');
  const z = b.width / 320;
  return { x: (x - b.x) / z, y: (y - b.y) / z };
}

/** Client point at the centre of scene pixel (x, y). */
async function clientOf(page: Page, x: number, y: number) {
  const b = await box(page, 'scene-canvas.overlay');
  const z = b.width / 320;
  return { x: b.x + (x + 0.5) * z, y: b.y + (y + 0.5) * z };
}

/** Box without scrolled content, and the page without overflow. */
async function expectNoScroll(page: Page): Promise<void> {
  const s = await page.getByTestId('scene-canvas.pane').evaluate((el) => ({
    left: el.scrollLeft,
    top: el.scrollTop,
    overflow: getComputedStyle(el).overflow,
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(s.overflow).toBe('hidden');
  expect([s.left, s.top, s.page]).toEqual([0, 0, 0]);
}

async function expectCentred(page: Page): Promise<void> {
  const p = centreOf(await box(page, 'scene-canvas.pane'));
  const o = centreOf(await box(page, 'scene-canvas.overlay'));
  // Offsets are rounded to screen pixels and a fitted zoom is fractional: allow
  // 1.5 screen pixels or half a scene pixel, whichever is larger.
  const tol = Math.max(1.5, (await zoomOf(page)) / 2);
  expect(Math.abs(p.x - o.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(p.y - o.y)).toBeLessThanOrEqual(tol);
}

async function open(app: App, page: Page, path = '/animations/11'): Promise<void> {
  await app.open('fighter.af', path);
  await expect(page.getByTestId('scene-canvas.overlay')).toBeVisible();
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

/** Moves focus off the controls so single-key shortcuts reach the app. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test.describe('scene preview viewport (spec 12 §9)', () => {
  test('the box keeps its size at every zoom; the scene opens fitted and centred', async ({
    app,
    page,
  }) => {
    await open(app, page);
    const pane = await box(page, 'scene-canvas.pane');
    // Larger than the old 640×400, at most 960×600, the scene's aspect.
    expect(pane.width).toBeGreaterThan(640);
    expect(pane.width).toBeLessThanOrEqual(960);
    expect(pane.width / pane.height).toBeCloseTo(1.6, 2);
    // Fitted: the scene fills the box (a fractional zoom), centred.
    expect(await isFitted(page)).toBe(true);
    await expectCentred(page);
    const bar = await box(page, 'playback.toggle');
    for (const z of [1, 3, 4, 6, 8, 2]) {
      await page.getByTestId(`zoom.${z}`).click();
      expect(await zoomOf(page)).toBe(z);
      // Buttons zoom around the box centre: still centred.
      await expectCentred(page);
      expect(await box(page, 'scene-canvas.pane')).toEqual(pane);
      // Nothing below the preview moves.
      expect(await box(page, 'playback.toggle')).toEqual(bar);
      await expectNoScroll(page);
    }
  });

  test('the box shrinks with a narrow column and keeps the aspect', async ({ app, page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await open(app, page);
    const pane = await box(page, 'scene-canvas.pane');
    expect(pane.width).toBeLessThanOrEqual(960);
    expect(pane.width / pane.height).toBeCloseTo(1.6, 2);
    // A window narrower than the box (below the supported size): the column shrinks.
    await page.setViewportSize({ width: 640, height: 700 });
    await expect
      .poll(async () => (await box(page, 'scene-canvas.pane')).width)
      .toBeLessThan(pane.width);
    const small = await box(page, 'scene-canvas.pane');
    expect(small.width / small.height).toBeCloseTo(1.6, 2);
  });

  test('the wheel zooms around the pointer; buttons and keys around the box centre', async ({
    app,
    page,
  }) => {
    await open(app, page);
    // Start from a whole step, so zooming in and out again returns to it.
    await page.getByTestId('zoom.2').click();
    const o = await box(page, 'scene-canvas.overlay');
    const at = { x: o.x + 100, y: o.y + 300 };
    const before = await scenePoint(page, at.x, at.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -100);
    await expect.poll(() => zoomOf(page)).toBe(3);
    await expect(page.getByTestId('zoom.3')).toHaveClass(/btn-secondary/);
    const after = await scenePoint(page, at.x, at.y);
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.5);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
    // The wheel over the preview does not scroll the page.
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => zoomOf(page)).toBe(2);
    const back = await box(page, 'scene-canvas.overlay');
    expect(Math.abs(back.x - o.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.y - o.y)).toBeLessThanOrEqual(1);

    // Off-centre now: + and - keep the scene point at the box centre in place.
    await page.mouse.move(o.x + 50, o.y + 50);
    await page.mouse.wheel(0, -100);
    await expect.poll(() => zoomOf(page)).toBe(3);
    const pc = centreOf(await box(page, 'scene-canvas.pane'));
    const mid = await scenePoint(page, pc.x, pc.y);
    await page.mouse.move(0, 0);
    await blur(page);
    await page.keyboard.press('Equal');
    await expect.poll(() => zoomOf(page)).toBe(4);
    const mid2 = await scenePoint(page, pc.x, pc.y);
    expect(Math.abs(mid2.x - mid.x)).toBeLessThan(0.5);
    expect(Math.abs(mid2.y - mid.y)).toBeLessThan(0.5);
    await page.getByTestId('zoom.6').click();
    const mid3 = await scenePoint(page, pc.x, pc.y);
    expect(Math.abs(mid3.x - mid.x)).toBeLessThan(0.5);
    expect(Math.abs(mid3.y - mid.y)).toBeLessThan(0.5);
  });

  test('Space+drag and middle-drag pan, clamped; Fit; a Space tap still plays', async ({
    app,
    page,
  }) => {
    // The Collisions view pauses playback when it opens.
    await open(app, page, '/animations/11/collisions');
    await expect(page.getByTestId('playback.toggle')).toHaveAttribute('aria-label', 'Play');
    await page.getByTestId('zoom.4').click();
    await blur(page);
    const pane = await box(page, 'scene-canvas.pane');
    const o0 = await box(page, 'scene-canvas.overlay');
    await panDrag(page, { x: pane.x + 40, y: pane.y + 40 }, 100, 60, 'space');
    const o1 = await box(page, 'scene-canvas.overlay');
    expect([o1.x - o0.x, o1.y - o0.y]).toEqual([100, 60]);
    // The Space held for the pan did not toggle playback.
    await expect(page.getByTestId('playback.toggle')).toHaveAttribute('aria-label', 'Play');
    await panDrag(page, centreOf(pane), -150, -20, 'middle');
    const o2 = await box(page, 'scene-canvas.overlay');
    expect([o2.x - o1.x, o2.y - o1.y]).toEqual([-150, -20]);
    await expectNoScroll(page);

    // Panning far away keeps 48 px of the scene in the box.
    const tl = { x: pane.x + 10, y: pane.y + 10 };
    const span = { x: pane.width - 20, y: pane.height - 20 };
    for (let i = 0; i < 5; i++)
      await panDrag(page, { x: tl.x + span.x, y: tl.y + span.y }, -span.x, -span.y, 'middle');
    const o3 = await box(page, 'scene-canvas.overlay');
    expect(Math.round(o3.x + o3.width - pane.x)).toBe(48);
    expect(Math.round(o3.y + o3.height - pane.y)).toBe(48);
    for (let i = 0; i < 5; i++) await panDrag(page, tl, span.x, span.y, 'space');
    const o4 = await box(page, 'scene-canvas.overlay');
    expect(Math.round(pane.x + pane.width - o4.x)).toBe(48);
    expect(Math.round(pane.y + pane.height - o4.y)).toBe(48);
    await expectNoScroll(page);

    // Fit returns to the fitted zoom, centred.
    await page.getByTestId('zoom.fit').click();
    expect(await isFitted(page)).toBe(true);
    await expectCentred(page);

    // A tap of Space plays and pauses.
    await blur(page);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('playback.toggle')).toHaveAttribute('aria-label', 'Pause');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('playback.toggle')).toHaveAttribute('aria-label', 'Play');
  });

  test('switching tabs keeps zoom and centre; another document opens fitted', async ({
    app,
    page,
  }) => {
    await open(app, page);
    await page.getByTestId('zoom.4').click();
    const pane = await box(page, 'scene-canvas.pane');
    await panDrag(page, { x: pane.x + 300, y: pane.y + 200 }, 70, -40, 'middle');
    const pc = centreOf(pane);
    const mid = await scenePoint(page, pc.x, pc.y);
    await app.hooks((h, p: string) => h.navigate(p), '/animations/11/collisions');
    await expect(page.getByTestId('view.collisions')).toBeVisible();
    expect(await zoomOf(page)).toBe(4);
    const pc2 = centreOf(await box(page, 'scene-canvas.pane'));
    const mid2 = await scenePoint(page, pc2.x, pc2.y);
    expect(Math.abs(mid2.x - mid.x)).toBeLessThan(1);
    expect(Math.abs(mid2.y - mid.y)).toBeLessThan(1);
    await app.open('fighter.af', '/animations/11');
    await expect.poll(() => isFitted(page)).toBe(true);
    await expectCentred(page);
  });

  test('a resized window keeps zoom and centre', async ({ app, page }) => {
    await open(app, page);
    await page.getByTestId('zoom.4').click();
    const wide = await box(page, 'scene-canvas.pane');
    const pc = centreOf(wide);
    const mid = await scenePoint(page, pc.x, pc.y);
    await page.setViewportSize({ width: 700, height: 700 });
    await expect
      .poll(async () => (await box(page, 'scene-canvas.pane')).width)
      .toBeLessThan(wide.width);
    expect(await zoomOf(page)).toBe(4);
    const pc2 = centreOf(await box(page, 'scene-canvas.pane'));
    const mid2 = await scenePoint(page, pc2.x, pc2.y);
    expect(Math.abs(mid2.x - mid.x)).toBeLessThan(1);
    expect(Math.abs(mid2.y - mid.y)).toBeLessThan(1);
  });

  test('after zoom and pan, collision clicks and drags land on the scene pixel, hover too', async ({
    app,
    page,
  }) => {
    // Move 21: one 8×8 sprite centred, origin (160, 104).
    await open(app, page, '/animations/21/collisions');
    await page.getByTestId('zoom.6').click();
    const pane = await box(page, 'scene-canvas.pane');
    await panDrag(page, { x: pane.x + 200, y: pane.y + 200 }, 130, -90, 'middle');
    const pc = centreOf(pane);
    await page.mouse.move(pc.x, pc.y);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => zoomOf(page)).toBe(4);
    // Hover readout names the pixel under the pointer.
    const h = await clientOf(page, 158, 101);
    await page.mouse.move(h.x, h.y);
    await expect(page.getByTestId('status.hover')).toContainText('x 158 y 101');
    // Place mode: the click lands on (150, 84), i.e. (-10, -20) from the origin.
    await page.getByTestId('collisions.place').click();
    const p = await clientOf(page, 150, 84);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press('Escape');
    expect((await app.animation(21))!.hitCoords[0]).toMatchObject({ x: -10, y: -20 });
    // A plain left drag still moves the point (no pan).
    const before = await box(page, 'scene-canvas.overlay');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    const q = await clientOf(page, 155, 80);
    await page.mouse.move(q.x, q.y, { steps: 4 });
    await page.mouse.up();
    expect((await app.animation(21))!.hitCoords[0]).toMatchObject({ x: -5, y: -24 });
    expect(await box(page, 'scene-canvas.overlay')).toEqual(before);
  });

  test('fixed-scale previews keep their size and get no zoom or pan', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await page.goto('./#/animations/11/sprites/0/edit');
    await expect(page.getByTestId('pixels.preview')).toBeVisible();
    await expect(page.getByTestId('pixels.preview.pane')).toHaveCount(0);
    await expect(page.getByTestId('pixels.preview')).toHaveCSS('width', '280px');
  });
});
