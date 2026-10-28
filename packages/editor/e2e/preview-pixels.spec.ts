// The previewed tags of spec 15 §5, checked on the drawn scene pixels after
// stepping ticks (not only on the simulation state). The clock is fake, so
// nothing moves between steps.

import type { Page } from '@playwright/test';
import { test, expect, type App } from './helpers';

interface Drawn {
  /** Bounding box of the sprite's pixels on the 320×200 scene canvas. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Colours of the sprite's top row and left column, left to right / top to bottom. */
  row: number[];
  col: number[];
}

/** The sprite on the scene canvas: everything that is not the clear colour. */
function drawn(page: Page): Promise<Drawn | null> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="scene-canvas"]')!;
    const d = new Uint32Array(
      c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.buffer,
    );
    const clear = d[0]!;
    let l = Infinity;
    let t = Infinity;
    let r = -1;
    let b = -1;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[y * c.width + x] !== clear) {
          l = Math.min(l, x);
          r = Math.max(r, x);
          t = Math.min(t, y);
          b = Math.max(b, y);
        }
    if (r < 0) return null;
    const w = r - l + 1;
    const h = b - t + 1;
    return {
      left: l,
      top: t,
      width: w,
      height: h,
      row: Array.from({ length: w }, (_, i) => d[t * c.width + l + i]!),
      col: Array.from({ length: h }, (_, i) => d[(t + i) * c.width + l]!),
    };
  });
}

/** Sets animation 11's base string and puts playback on tick 0. */
async function script(app: App, page: Page, s: string): Promise<Drawn> {
  await page.getByTestId('script.mode.text').click();
  await page.getByTestId('script.text').fill(s);
  await page.getByTestId('script.text').blur();
  await page.clock.runFor(1000);
  await expect.poll(async () => (await app.animation(11))!.baseString).toBe(s);
  await page.getByTestId('playback.scrub').fill('0');
  await expect.poll(async () => (await app.hooks((h) => h.playback())).tick).toBe(0);
  return (await drawn(page))!;
}

async function step(app: App, page: Page, n: number): Promise<Drawn> {
  await app.hooks((h, k: number) => h.stepTicks(k), n);
  await page.clock.runFor(50);
  return (await drawn(page))!;
}

const reversed = (a: number[]) => [...a].reverse();

test.describe('previewed tags on the scene pixels (spec 15 §5)', () => {
  let base: Drawn;

  test.beforeEach(async ({ app, page }) => {
    await page.clock.install();
    await app.open('fighter.af', '/animations/11/script');
    base = await script(app, page, 'A50');
    // fighter.af's 8×8 sprites have a diagonal pattern: no mirror symmetry.
    expect([base.width, base.height]).toEqual([8, 8]);
    expect(base.row).not.toEqual(reversed(base.row));
  });

  test('x+ / y- move the drawn sprite every tick, tick 0 included', async ({ app, page }) => {
    let d = await script(app, page, 'x+3y-2A50');
    expect([d.left - base.left, d.top - base.top]).toEqual([3, -2]);
    d = await step(app, page, 2);
    expect([d.left - base.left, d.top - base.top]).toEqual([9, -6]);
    // Facing left mirrors x.
    await page.getByTestId('toggle.flip').click();
    await page.getByTestId('playback.scrub').fill('0');
    await page.clock.runFor(50);
    const flippedBase = (await drawn(page))!;
    d = await step(app, page, 1);
    expect(d.left - flippedBase.left).toBe(-3);
  });

  test('x= places the sprite on entry; ox shifts only its own frame', async ({ app, page }) => {
    let d = await script(app, page, 'x=20A50');
    expect(d.left - base.left).toBe(20);
    d = await script(app, page, 'ox5oy3A2-B2');
    expect([d.left - base.left, d.top - base.top]).toEqual([5, 3]);
    d = await step(app, page, 2);
    expect([d.left, d.top]).toEqual([base.left, base.top]);
  });

  test('r and f flip their own frame only', async ({ app, page }) => {
    let d = await script(app, page, 'rA2-fA2-A2');
    expect(d.row).toEqual(reversed(base.row));
    expect(d.col).not.toEqual(reversed(base.col));
    d = await step(app, page, 2);
    expect(d.row).not.toEqual(base.row);
    expect(d.col).toEqual(reversed(base.col));
    d = await step(app, page, 2);
    expect([d.row, d.col]).toEqual([base.row, base.col]);
  });

  test('bl and bb shake the scene by trunc(sin(n)·5·n/15)', async ({ app, page }) => {
    const shake = (n: number) => Math.trunc(Math.sin(n) * 5 * (n / 15));
    let d = await script(app, page, 'bl3A50');
    expect(d.left - base.left).toBe(shake(12));
    d = await step(app, page, 1);
    expect(d.left - base.left).toBe(shake(11));
    d = await step(app, page, 11);
    expect(d.left - base.left).toBe(0);
    d = await script(app, page, 'bb2A50');
    expect([d.left - base.left, d.top - base.top]).toEqual([0, shake(8)]);
  });

  test('d re-enters: the frame it jumps to is the one drawn', async ({ app, page }) => {
    // 6 ticks: A flipped, A, then d0 seeks back to tick 1 before the end.
    await script(app, page, 'rA2-A2-d0A2');
    const frames: number[] = [];
    for (let i = 0; i < 5; i++) {
      const d = await step(app, page, 1);
      const st = await app.hooks((h) => h.playback());
      frames.push(st.frameIndex);
      expect(d.row).toEqual(st.flipX ? reversed(base.row) : base.row);
    }
    // Back on the flipped first frame before the 6 ticks are over.
    expect(frames.slice(0, 3)).toEqual([0, 1, 1]);
    expect(frames.slice(3)).toContain(0);
  });

  test('effects the preview does not draw carry a badge', async ({ app, page }) => {
    await script(app, page, 'm12x150brA50');
    await page.getByTestId('script.mode.visual').click();
    const card = page.getByTestId('script.frame.0');
    await expect(card.getByText('no preview')).toHaveCount(3);
    // and nothing about the sprite changed
    expect(await drawn(page)).toEqual(base);
    await script(app, page, 'x+1rA50');
    await page.getByTestId('script.mode.visual').click();
    await expect(page.getByTestId('script.frame.0').getByText('no preview')).toHaveCount(0);
  });
});
