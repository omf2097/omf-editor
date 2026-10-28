// Checks that assert the result itself where older tests only saw that
// something happened (T4): palette import into another palette, an errata
// fix before Normalise, flip/rotate pixel positions, onion skin on and off,
// and the player 2 colour shift.

import { copyFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { readBK } from '@omf/formats';
import { test, expect, fixture, type App } from './helpers';

const bkOf = async (app: App) => readBK(await app.bytes());

test.describe('palette files', () => {
  test('a palette exported from one palette imports into another, also at an offset', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    const before = await bkOf(app);
    const p0 = before.palettes[0]!.colors.colors;
    expect(before.palettes[1]!.colors.colors).not.toEqual(p0);
    for (const fmt of ['gpl', 'pal', 'act']) {
      await page.getByTestId('palette-list.0').click();
      await page.getByTestId('tool.export').click();
      await page.getByTestId('export.format').selectOption(fmt);
      const path = await app.download(() => page.getByTestId('export.download').click());
      copyFileSync(path, `${path}.${fmt}`);
      // Into palette 1, whole range.
      await page.getByTestId('palette-list.1').click();
      await page.getByTestId('tool.import').click();
      await page.getByTestId('palette-grid.0').click();
      await page.getByTestId('palette-grid.255').click({ modifiers: ['Shift'] });
      await app.chooseFile(`${path}.${fmt}`, () => page.getByTestId('import.pick').click());
      await expect
        .poll(async () => (await bkOf(app)).palettes[1]!.colors.colors, { message: fmt })
        .toEqual(p0);
      expect((await bkOf(app)).palettes[0]!.colors.colors).toEqual(p0);
      await page.getByTestId('undo').click();
      await expect
        .poll(async () => (await bkOf(app)).palettes[1]!.colors.colors)
        .toEqual(before.palettes[1]!.colors.colors);
    }
    // Written from the first selected entry: index 16 gets the file's colour 0.
    await page.getByTestId('palette-list.2').click();
    await page.getByTestId('palette-grid.16').click();
    const gpl = await (async () => {
      await page.getByTestId('palette-list.0').click();
      await page.getByTestId('tool.export').click();
      await page.getByTestId('export.format').selectOption('gpl');
      const p = await app.download(() => page.getByTestId('export.download').click());
      copyFileSync(p, `${p}.gpl`);
      return `${p}.gpl`;
    })();
    await page.getByTestId('palette-list.2').click();
    await page.getByTestId('palette-grid.16').click();
    await page.getByTestId('tool.import').click();
    await app.chooseFile(gpl, () => page.getByTestId('import.pick').click());
    await expect(page.getByTestId('toast.success').filter({ hasText: '240 colours' })).toHaveCount(
      1,
    );
    const p2 = (await bkOf(app)).palettes[2]!.colors.colors;
    expect(p2.slice(0, 16)).toEqual(before.palettes[2]!.colors.colors.slice(0, 16));
    expect(p2.slice(16)).toEqual(p0.slice(0, 240));
  });
});

test.describe('script errata', () => {
  test('the chip fixes only its tag and frame; Normalise does the rest', async ({ app, page }) => {
    const original = 's+5A05-cB1-x+3x-1x=2y=-3d2rfox1oy2m11q2nC1-a2';
    await app.open('edge.af', '/animations/2/script');
    expect((await app.animation(2))!.baseString).toBe(original);
    await expect(page.getByTestId('frame.0.tag.0.fix')).toBeVisible();
    await page.getByTestId('frame.0.tag.0.fix').click();
    await expect(page.getByTestId('frame.0.tag.0.fix')).toHaveCount(0);
    // Frame 0 is rewritten (s5, its duration spelt plainly); the rest keeps
    // its spelling, including the frame-level errata and the dropped text.
    await expect.poll(async () => (await app.animation(2))!.baseString).not.toBe(original);
    const fixed = (await app.animation(2))!.baseString;
    expect(fixed).toMatch(/^s5A/);
    expect(fixed).not.toContain('+5');
    expect(fixed.endsWith('-cB1-x+3x-1x=2y=-3d2rfox1oy2m11q2nC1-a2')).toBe(true);
    await page.getByTestId('script.normalise').click();
    await page.getByTestId('confirm.ok').click();
    await expect
      .poll(async () => (await app.animation(2))!.baseString)
      .toBe('s5A5-cB1-x+3x-1x=2y=-3d2rfox1oy2m11q2nC1');
  });
});

test.describe('pixel editor results', () => {
  async function editSprite(app: App, page: Page, anim: number, sprite: number) {
    await app.paletteSource();
    await app.hooks((h, p: string) => h.navigate(p), `/animations/${anim}/sprites/${sprite}/edit`);
    await page.getByTestId('pixels.zoom').selectOption('8');
    return async (x: number, y: number) => {
      const b = (await page.getByTestId('pixels.overlay').boundingBox())!;
      await page.mouse.click(b.x + x * 8 + 4, b.y + y * 8 + 4);
    };
  }

  test('flip and rotate move pixels where they belong', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    const click = await editSprite(app, page, 11, 0);
    const before = (await app.sprite(11, 0))!;
    expect([before.width, before.height]).toEqual([8, 8]);
    // Make it asymmetric: index 9 at (1, 0).
    await page.getByTestId('pixels.tool.pencil').click();
    await page.getByTestId('pixels.palette.9').click();
    await click(1, 0);
    await page.getByTestId('pixels.flipH').click();
    await page.getByTestId('pixels.rotate').click();
    await page.getByTestId('pixels.apply').click();
    const s = (await app.sprite(11, 0))!;
    // Expected: paint, mirror x, then 90° clockwise ((x, y) → (H−1−y, x)).
    const W = 8;
    const painted = [...before.pixels];
    painted[0 * W + 1] = 9;
    const flipped = painted.map((_, i) => painted[Math.floor(i / W) * W + (W - 1 - (i % W))]!);
    const rotated = new Array<number>(64);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) rotated[x * 8 + (8 - 1 - y)] = flipped[y * W + x]!;
    expect(s.pixels).toEqual(rotated);
    // The painted pixel: (1, 0) → flip (6, 0) → rotate (7, 6).
    expect(s.pixels[6 * 8 + 7]).toBe(9);
  });

  test('onion skin draws the previous sprite faintly only when on', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/11');
    const click = await editSprite(app, page, 11, 1);
    // Clear (0, 0) so the sprite underneath can show through there.
    await page.getByTestId('pixels.tool.eraser').click();
    await click(0, 0);
    await expect(page.getByTestId('pixels.arena-bg')).not.toBeChecked();
    await page.getByTestId('pixels.onion-prev').uncheck();
    await page.getByTestId('pixels.onion-next').uncheck();
    const at = () => app.sample(0, 0, 'pixels.canvas');
    await expect.poll(async () => (await at())?.[3]).toBe(0);
    await page.getByTestId('pixels.onion-prev').check();
    // Sprite A (same position) at 30 % over nothing: partly transparent, not empty.
    await expect.poll(async () => (await at())?.[3]).toBeGreaterThan(40);
    const onion = (await at())!;
    expect(onion[3]).toBeLessThan(120);
    // An opaque pixel of sprite B itself is unaffected.
    expect((await app.sample(1, 0, 'pixels.canvas'))![3]).toBe(255);
    await page.getByTestId('pixels.onion-prev').uncheck();
    await expect.poll(async () => (await at())?.[3]).toBe(0);
  });
});

test.describe('player 2 colours', () => {
  /** Distinct RGBA colours on a canvas, packed like the LUT. */
  const colours = (page: Page, testid: string): Promise<number[]> =>
    page.evaluate((id) => {
      const c = document.querySelector<HTMLCanvasElement>(`[data-testid="${id}"]`)!;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      return [...new Set(new Uint32Array(d.buffer))];
    }, testid);

  test('P2 draws fighter indices 0–47 with the colours 48 higher', async ({ app, page }) => {
    await app.open('fighter.af', '/palettes');
    await app.chooseFile('arena.bk', () => page.getByTestId('af-palette.choose').click());
    await app.hooks(
      (h, a: number[]) => h.loadAltPals('altpals.dat', a),
      Array.from(fixture('altpals.dat')),
    );
    // Give player 2's first band its own colours.
    await page.getByTestId('har.p2.0').selectOption('3');
    const lut = await app.hooks((h) => h.lut());
    for (const i of [1, 2, 3, 4]) expect(lut[i]).not.toBe(lut[i + 48]);
    await app.hooks((h, p: string) => h.navigate(p), '/animations/11');
    // Sprite pixels only: no background.
    const bg = page.getByTestId('toggle.bg');
    await expect(bg).toHaveAttribute('aria-pressed', 'true'); // the default
    await bg.click();
    await expect(bg).toHaveAttribute('aria-pressed', 'false');
    await expect
      .poll(() => colours(page, 'scene-canvas'))
      .toEqual(expect.arrayContaining([1, 2, 3, 4].map((i) => lut[i])));
    let seen = await colours(page, 'scene-canvas');
    for (const i of [1, 2, 3, 4]) expect(seen).not.toContain(lut[i + 48]);
    await page.getByTestId('player.2').click();
    await expect
      .poll(() => colours(page, 'scene-canvas'))
      .toEqual(expect.arrayContaining([49, 50, 51, 52].map((i) => lut[i])));
    seen = await colours(page, 'scene-canvas');
    for (const i of [1, 2, 3, 4]) expect(seen).not.toContain(lut[i]);
    // The LUT itself is unchanged: the shift is applied when drawing.
    expect(await app.hooks((h) => h.lut())).toEqual(lut);
  });
});
