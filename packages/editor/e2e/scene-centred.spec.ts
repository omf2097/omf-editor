// Centred framing and fullscreen of the scene preview (spec 12 §9). Centred
// cancels the script movement out (the sprite stays on the same stage pixels
// while the background moves the other way), fits the animation's sprites and
// keeps pointer mapping exact; fullscreen fills the screen and gives the
// previous view back.
import type { Page } from '@playwright/test';
import { test, expect, type App } from './helpers';

type Box = { x: number; y: number; width: number; height: number };

const box = async (page: Page, id: string): Promise<Box> =>
  (await page.getByTestId(id).boundingBox())!;

/** Bounding box of everything not the clear colour on the scene canvas (bg off), in stage pixels. */
function spriteBox(page: Page): Promise<{ left: number; top: number; w: number; h: number }> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="scene-canvas"]')!;
    const d = new Uint32Array(
      c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.buffer,
    );
    let l = Infinity;
    let t = Infinity;
    let r = -1;
    let b = -1;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[y * c.width + x] !== 0) {
          l = Math.min(l, x);
          r = Math.max(r, x);
          t = Math.min(t, y);
          b = Math.max(b, y);
        }
    return { left: l, top: t, w: r - l + 1, h: b - t + 1 };
  });
}

/** One row of the scene canvas, as RGBA words. */
function row(page: Page, y: number): Promise<number[]> {
  return page.evaluate((y) => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="scene-canvas"]')!;
    return Array.from(
      new Uint32Array(c.getContext('2d')!.getImageData(0, y, c.width, 1).data.buffer),
    );
  }, y);
}

async function toTick0(app: App, page: Page): Promise<void> {
  await page.getByTestId('playback.scrub').fill('0');
  await expect.poll(async () => (await app.hooks((h) => h.playback())).tick).toBe(0);
}

async function step(app: App, page: Page): Promise<number> {
  await app.hooks((h) => h.stepTicks(1));
  await page.clock.runFor(50);
  return (await app.hooks((h) => h.playback())).x;
}

/** Zoom shown: overlay pixels per stage pixel. */
async function zoomOf(page: Page): Promise<number> {
  const w = await page.getByTestId('scene-canvas').evaluate((c) => (c as HTMLCanvasElement).width);
  return (await box(page, 'scene-canvas.overlay')).width / w;
}

/** Moves focus off the controls so single-key shortcuts reach the app. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test.describe('Centred preview (spec 12 §9)', () => {
  test('the sprite stays on its pixels while the background moves; Scene is as before', async ({
    app,
    page,
  }) => {
    await page.clock.install();
    // Move 22: A2-x=10B4-x=30C1, three 8×8 sprites at (-4, -8); arena background.
    await app.open('fighter.af', '/animations/22');
    await app.paletteSource();
    await page.getByTestId('mode.centred').click();
    await expect(page.getByTestId('mode.centred')).toHaveAttribute('aria-pressed', 'true');
    await toTick0(app, page);

    // Framed: the 8×8 sprites plus 8 on each side (24×24) fill the box, centred.
    const pane = await box(page, 'scene-canvas.pane');
    expect(await zoomOf(page)).toBeCloseTo(Math.min(pane.width, pane.height) / 24, 1);
    const overlay0 = await box(page, 'scene-canvas.overlay');
    expect(overlay0.x + overlay0.width / 2).toBeCloseTo(pane.x + pane.width / 2, -1);
    expect(overlay0.y + overlay0.height / 2).toBeCloseTo(pane.y + pane.height / 2, -1);

    // Background on: it shifts against the movement, row for row.
    const y = 10;
    const bg0 = await row(page, y);
    let x0 = (await app.hooks((h) => h.playback())).x;
    let moved = 0;
    for (let i = 0; i < 6; i++) {
      const before = await row(page, y);
      const x = await step(app, page);
      const dx = x - x0;
      x0 = x;
      moved += Math.abs(dx);
      const after = await row(page, y);
      // stage = scene + shift, and the shift drops by the movement.
      for (let c = 0; c < 200; c++) expect(after[c]).toBe(before[c + dx]);
      // The stage itself does not move or change size.
      expect(await box(page, 'scene-canvas.overlay')).toEqual(overlay0);
    }
    expect(moved).toBe(30);
    expect(await row(page, y)).not.toEqual(bg0);

    // Background off: the sprite is drawn on the same stage pixels on every tick.
    await page.getByTestId('toggle.bg').click();
    await toTick0(app, page);
    const s0 = await spriteBox(page);
    expect(s0).toEqual({ left: 156, top: 96, w: 8, h: 8 });
    for (let i = 0; i < 6; i++) {
      await step(app, page);
      expect(await spriteBox(page)).toEqual(s0);
    }

    // Scene again: the 320×200 scene fitted, and the sprite moves with the script.
    await page.getByTestId('mode.scene').click();
    await toTick0(app, page);
    await expect.poll(() => zoomOf(page)).toBeCloseTo(pane.width / 320, 2);
    const t0 = await spriteBox(page);
    const x = await step(app, page).then(() => step(app, page));
    expect(await spriteBox(page)).toEqual({ ...t0, left: t0.left + x });
  });

  test('Fit returns to the framed view; zoom and pan still work', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    await page.getByTestId('mode.centred').click();
    const framed = await zoomOf(page);
    const overlay0 = await box(page, 'scene-canvas.overlay');
    await page.getByTestId('zoom.2').click();
    expect(await zoomOf(page)).toBeCloseTo(2, 5);
    const pane = await box(page, 'scene-canvas.pane');
    await page.mouse.move(pane.x + 100, pane.y + 100);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(pane.x + 160, pane.y + 130, { steps: 4 });
    await page.mouse.up({ button: 'middle' });
    await page.getByTestId('zoom.fit').click();
    expect(await zoomOf(page)).toBeCloseTo(framed, 5);
    expect(await box(page, 'scene-canvas.overlay')).toEqual(overlay0);
  });

  test('collision clicks and hover land on the scene pixel', async ({ app, page }) => {
    // Move 21: one 8×8 sprite, origin (160, 104) without an arena.
    await app.open('fighter.af', '/animations/21/collisions');
    await page.getByTestId('mode.centred').click();
    const s = await spriteBox(page);
    // The object is (4, 8) from the sprite's top-left.
    const obj = { x: s.left + 4, y: s.top + 8 };
    const o = await box(page, 'scene-canvas.overlay');
    const z = await zoomOf(page);
    const client = (dx: number, dy: number) => ({
      x: o.x + (obj.x + dx + 0.5) * z,
      y: o.y + (obj.y + dy + 0.5) * z,
    });
    const h = client(-2, -3);
    await page.mouse.move(h.x, h.y);
    await expect(page.getByTestId('status.hover')).toContainText('x 158 y 101');
    await page.getByTestId('collisions.place').click();
    const p = client(-3, -5);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press('Escape');
    expect((await app.animation(21))!.hitCoords[0]).toMatchObject({ x: -3, y: -5 });
    // A drag moves it by the pointer offset.
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    const q = client(1, -6);
    await page.mouse.move(q.x, q.y, { steps: 4 });
    await page.mouse.up();
    expect((await app.animation(21))!.hitCoords[0]).toMatchObject({ x: 1, y: -6 });
  });

  test('a position tag drag follows the pointer (the camera holds still)', async ({
    app,
    page,
  }) => {
    // As script.spec.ts in Scene mode: 20 screen pixels at 2× are 10 scene pixels.
    await app.open('edge.af', '/animations/2/script');
    await page.getByTestId('mode.centred').click();
    await page.getByTestId('script.frame.2').click();
    await page.getByTestId('frame.2.tag.0.drag').click();
    await page.getByTestId('zoom.2').click();
    const b = await box(page, 'scene-canvas.overlay');
    const pane = await box(page, 'scene-canvas.pane');
    const at = { x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 };
    expect(at.x).toBeGreaterThan(b.x);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 20, at.y, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('frame.2.tag.0.value')).toHaveValue('13');
  });

  test('the mode is remembered by the browser', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    await expect(page.getByTestId('mode.scene')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('mode.centred').click();
    // Saved to IndexedDB asynchronously.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise((done) => {
              const r = indexedDB.open('omf-editor');
              r.onsuccess = () => {
                const g = r.result.transaction('settings').objectStore('settings').get('viewport');
                g.onsuccess = () => {
                  done((g.result as { mode?: string } | undefined)?.mode ?? null);
                  r.result.close();
                };
              };
            }),
        ),
      )
      .toBe('centred');
    await page.reload();
    await app.open('fighter.af', '/animations/11');
    await expect(page.getByTestId('mode.centred')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('mode.scene')).toHaveAttribute('aria-pressed', 'false');
  });

  test('an animation without drawable sprites keeps the scene framing', async ({ app, page }) => {
    // corner.af move 1 has no sprites.
    await app.open('corner.af', '/animations/1');
    await page.getByTestId('mode.centred').click();
    const pane = await box(page, 'scene-canvas.pane');
    expect(await zoomOf(page)).toBeCloseTo(pane.width / 320, 2);
    await expect(page.getByTestId('scene-canvas')).toHaveAttribute('width', '320');
  });
});

test.describe('fullscreen preview (spec 12 §9)', () => {
  const fsId = (page: Page) =>
    page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid') ?? null);

  test('button, Shift+F, Esc and the bar button; keys work; the view comes back', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20');
    await page.getByTestId('zoom.4').click();
    const pane0 = await box(page, 'scene-canvas.pane');
    const overlay0 = await box(page, 'scene-canvas.overlay');

    await page.getByTestId('viewport.fullscreen').click();
    await expect.poll(() => fsId(page)).toBe('scene-canvas.frame');
    // The pane fills the screen (the viewport in Chromium, the headless screen in Firefox).
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const r = document
            .querySelector('[data-testid="scene-canvas.pane"]')!
            .getBoundingClientRect();
          return [r.width - window.innerWidth, r.height - window.innerHeight];
        }),
      )
      .toEqual([0, 0]);
    // Fitted to the screen.
    const pane = await box(page, 'scene-canvas.pane');
    await expect
      .poll(() => zoomOf(page))
      .toBeCloseTo(Math.min(pane.width / 320, pane.height / 200), 2);
    // Playback keys reach the app (not the toolbar button that was pressed).
    await page.keyboard.press('Space');
    await expect(page.getByTestId('scene-canvas.fsbar.playback.toggle')).toHaveAttribute(
      'aria-label',
      'Pause',
    );
    await page.keyboard.press('Space');
    const f0 = (await app.hooks((h) => h.playback())).frameIndex;
    await page.keyboard.press('Period');
    expect((await app.hooks((h) => h.playback())).frameIndex).toBe(f0 + 1);
    // The bar shows on mouse movement.
    await page.mouse.move(pane.x + 50, pane.y + 50);
    await page.mouse.move(pane.x + 60, pane.y + 60);
    await expect(page.getByTestId('scene-canvas.fsbar')).not.toHaveClass(/hidden/);

    await page.keyboard.press('Escape');
    await expect.poll(() => fsId(page)).toBe(null);
    await expect(page.getByTestId('scene-canvas.fsbar')).toHaveCount(0);
    // The layout and the 4× view are back.
    await expect.poll(() => box(page, 'scene-canvas.pane')).toEqual(pane0);
    await expect.poll(() => box(page, 'scene-canvas.overlay')).toEqual(overlay0);

    await blur(page);
    await page.keyboard.press('Shift+KeyF');
    await expect.poll(() => fsId(page)).toBe('scene-canvas.frame');
    await page.mouse.move(pane.x + 70, pane.y + 70);
    await page.getByTestId('scene-canvas.fsbar.exit').click();
    await expect.poll(() => fsId(page)).toBe(null);
    await expect.poll(() => box(page, 'scene-canvas.overlay')).toEqual(overlay0);
  });

  test('the bar hides after a short idle', async ({ app, page }) => {
    await page.clock.install();
    await app.open('fighter.af', '/animations/20');
    await page.getByTestId('viewport.fullscreen').click();
    await expect.poll(() => fsId(page)).toBe('scene-canvas.frame');
    const bar = page.getByTestId('scene-canvas.fsbar');
    await expect(bar).not.toHaveClass(/hidden/);
    await page.clock.runFor(2500);
    await expect(bar).toHaveClass(/hidden/);
    const pane = await box(page, 'scene-canvas.pane');
    await page.mouse.move(pane.x + 40, pane.y + 40);
    await page.mouse.move(pane.x + 50, pane.y + 40);
    await expect(bar).not.toHaveClass(/hidden/);
  });
});
