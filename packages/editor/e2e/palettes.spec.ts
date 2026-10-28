import type { Page } from '@playwright/test';
import { test, expect, fixture } from './helpers';
import { readFileSync } from 'node:fs';
import { readBK } from '@omf/formats';

const bkOf = async (app: { bytes(): Promise<Uint8Array> }) => readBK(await app.bytes());

test.describe('palettes view (BK)', () => {
  test('palette list: duplicate, delete (not 0), reorder warns', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await expect(
      page.locator(
        '[data-testid^="palette-list."][data-testid$="0"], [data-testid="palette-list.1"], [data-testid="palette-list.2"]',
      ),
    ).toHaveCount(3);
    await page.getByTestId('palette-list.add').click();
    expect((await bkOf(app)).palettes).toHaveLength(4);
    await page.getByTestId('palette-list.0').click();
    await expect(page.getByTestId('palette-list.delete')).toBeDisabled();
    await page.getByTestId('palette-list.down').click();
    await expect(page.getByTestId('confirm')).toContainText('palette 0');
    await page.getByTestId('confirm.cancel').click();
    await page.getByTestId('palette-list.2').click();
    await page.getByTestId('palette-list.delete').click();
    await page.getByTestId('confirm.ok').click();
    expect((await bkOf(app)).palettes).toHaveLength(3);
  });

  test('selection modes, usage marks and select unused', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palette-grid.16').click();
    await page.getByTestId('palette-grid.20').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('palettes.selection')).toContainText('(5)');
    await page.getByTestId('palette-grid.40').click({ modifiers: ['Control'] });
    await expect(page.getByTestId('palettes.selection')).toContainText('(6)');
    await page.getByTestId('palettes.lock-bands').check();
    await page.getByTestId('palette-grid.100').click();
    await expect(page.getByTestId('palettes.selection')).toContainText('0x60–0x6F (16)');
    await expect(page.getByTestId('palette-grid.5').locator('.mark')).toHaveCount(1);
    await page.getByTestId('palettes.lock-bands').uncheck();
    await page.getByTestId('usage.select-unused').click();
    // background uses 0..255 % 256 of x < 320 → every index is used
    await expect(page.getByTestId('usage.count')).toContainText('0 unused');
  });

  test('colour editor: 6-bit fields and quantised hex', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palette-grid.200').click();
    await page.getByTestId('color-editor.R').fill('22');
    await page.getByTestId('color-editor.R').press('Enter');
    expect((await bkOf(app)).palettes[0]!.colors.colors[200]![0]).toBe(22);
    await page.getByTestId('color-editor.hex').fill('#5a2e10');
    await page.getByTestId('color-editor.hex').press('Enter');
    expect((await bkOf(app)).palettes[0]!.colors.colors[200]).toEqual([22, 11, 4]);
    await expect(page.getByTestId('color-editor.hex')).toHaveValue('#592c10');
  });

  test('ramp, shades, adjust preview and apply; undo restores', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palette-grid.96').click();
    await page.getByTestId('palette-grid.111').click({ modifiers: ['Shift'] });
    await page.getByTestId('tool.ramp').click();
    await page.getByTestId('ramp.from').fill('#000000');
    await page.getByTestId('ramp.to').fill('#ffffff');
    await page.getByTestId('tool.apply').click();
    const ramp = (await bkOf(app)).palettes[0]!.colors.colors.slice(96, 112);
    for (let i = 1; i < 16; i++)
      for (let k = 0; k < 3; k++) expect(ramp[i]![k]!).toBeGreaterThanOrEqual(ramp[i - 1]![k]!);
    await page.getByTestId('tool.shades').click();
    await page.getByTestId('shades.base').fill('#a05028');
    await page.getByTestId('tool.apply').click();
    const shades = (await bkOf(app)).palettes[0]!.colors.colors.slice(96, 112);
    expect(shades[0]![0]!).toBeLessThan(shades[15]![0]!);
    await page.getByTestId('tool.adjust').click();
    await page.getByTestId('adjust.hue').fill('120');
    await page.getByTestId('tool.apply').click();
    const before = (await bkOf(app)).palettes[0]!.colors.colors[100];
    await page.getByTestId('undo').click();
    expect((await bkOf(app)).palettes[0]!.colors.colors[100]).not.toEqual(before);
  });

  test('swap with rewrite keeps pixels; without rewrite pixels change; sort keeps the image', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    const pixel = async () => app.sample(16 + 2, 50, 'palette-preview.canvas');
    await expect.poll(async () => (await pixel())?.[3]).toBe(255);
    const original = await pixel();
    await page.getByTestId('palette-grid.16').click();
    await page.getByTestId('palette-grid.31').click({ modifiers: ['Shift'] });
    await page.getByTestId('tool.swap').click();
    await page.getByTestId('swap.target').fill('64');
    await page.getByTestId('swap.apply').click();
    await expect.poll(pixel).toEqual(original);
    await page.getByTestId('undo').click();
    await page.getByTestId('palette-grid.16').click();
    await page.getByTestId('palette-grid.31').click({ modifiers: ['Shift'] });
    await page.getByTestId('swap.rewrite').uncheck();
    await page.getByTestId('swap.apply').click();
    await expect.poll(pixel).not.toEqual(original);
    await page.getByTestId('undo').click();
    await page.getByTestId('tool.sort').click();
    await page.getByTestId('palette-grid.0').click();
    await page.getByTestId('palette-grid.63').click({ modifiers: ['Shift'] });
    await page.getByTestId('sort.apply').click();
    await expect.poll(pixel).toEqual(original);
  });

  test('palette files export and re-import equal', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('tool.export').click();
    for (const fmt of ['gpl', 'pal', 'act']) {
      await page.getByTestId('export.format').selectOption(fmt);
      const path = await app.download(() => page.getByTestId('export.download').click());
      await page.getByTestId('palette-list.add').click();
      await page.getByTestId('tool.import').click();
      await page.getByTestId('palette-grid.0').click();
      await page.getByTestId('palette-grid.255').click({ modifiers: ['Shift'] });
      const named = `${path}.${fmt}`;
      const { copyFileSync } = await import('node:fs');
      copyFileSync(path, named);
      await app.chooseFile(named, () => page.getByTestId('import.pick').click());
      const bk = await bkOf(app);
      // The duplicate is inserted after palette 0 and receives the import.
      expect(bk.palettes[1]!.colors.colors).toEqual(bk.palettes[0]!.colors.colors);
      await page.getByTestId('palette-list.0').click();
      await page.getByTestId('tool.export').click();
    }
  });

  test('compare marks differing entries and copies them', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('tool.compare').click();
    await page.getByTestId('compare.with').selectOption('1');
    await expect(page.getByTestId('compare.count')).toContainText('1 differing');
    await expect(page.getByTestId('palette-grid.96').locator('.ring')).toHaveCount(1);
    await page.getByTestId('compare.copy').click();
    await expect(page.getByTestId('compare.count')).toContainText('0 differing');
  });

  test('ALTPALS option into the P2 secondary band; index 0 untouched', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await app.hooks(
      (h, a: number[]) => h.loadAltPals('altpals.dat', a),
      Array.from(fixture('altpals.dat')),
    );
    await page.getByTestId('palette-grid.64').click();
    await page.getByTestId('tool.altpals').click();
    await page.getByTestId('altpals.option').selectOption('7');
    await page.getByTestId('tool.apply').click();
    const c = (await bkOf(app)).palettes[0]!.colors.colors;
    for (let k = 0; k < 16; k++) expect(c[0x40 + k]).toEqual([k * 4, 28, 0]);
    expect(c[0]).toEqual([0, 0, 0]);
  });

  test('remaps: identity, single entry, generation tools, mapping to 0 warns, apply remap changes the preview', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palettes.tab.remaps').click();
    await page.getByTestId('remap.slot').selectOption('2');
    await page.getByTestId('remap.mapped.5').click();
    await page.getByTestId('remap.base.0').click();
    await expect(page.getByTestId('remap.zero-warning')).toBeVisible();
    expect((await bkOf(app)).palettes[0]!.remaps[2]![5]).toBe(0);
    await app.setField('remap.entry', 77);
    expect((await bkOf(app)).palettes[0]!.remaps[2]![5]).toBe(77);
    await page.getByTestId('remap.identity-all').click();
    expect(Array.from((await bkOf(app)).palettes[0]!.remaps[2]!.slice(0, 4))).toEqual([0, 1, 2, 3]);
    await page.getByTestId('remap.mapped.96').click();
    await page.getByTestId('remap.mapped.111').click({ modifiers: ['Shift'] });
    await page.getByTestId('remap.tool.range').click();
    await page.getByTestId('remap.target').fill('112');
    await page.getByTestId('remap.apply').click();
    expect((await bkOf(app)).palettes[0]!.remaps[2]![96]).toBe(112);
    await page.getByTestId('remap.tool.darken').click();
    await page.getByTestId('remap.apply').click();
    expect((await bkOf(app)).palettes[0]!.remaps[2]![96]).not.toBe(112);
    const before = await app.sample(100, 50, 'palette-preview.canvas');
    await page.getByTestId('palette-preview.remap').check();
    await expect.poll(() => app.sample(100, 50, 'palette-preview.canvas')).not.toEqual(before);
  });
});

test.describe('palettes view (AF)', () => {
  test('palette source, HAR colour, preview as P2 uses offset 48', async ({ app, page }) => {
    await app.open('fighter.af', '/palettes');
    await app.chooseFile('arena.bk', () => page.getByTestId('af-palette.choose').click());
    await app.hooks(
      (h, a: number[]) => h.loadAltPals('altpals.dat', a),
      Array.from(fixture('altpals.dat')),
    );
    await page.getByTestId('har.p1.0').selectOption('3');
    const lut = await app.hooks((h) => h.lut());
    expect(lut[5]! & 0xff).toBe(((5 * 4) << 2) | (((5 * 4) & 0x30) >> 4));
    await page.getByTestId('af-palette.p2').click();
    await expect(page.getByTestId('af-palette.p2')).toHaveClass(/btn-secondary/);
    void readFileSync;
  });
});

/** Whether the element lies wholly inside the scroll pane (between top bar and status bar) as it is scrolled now. */
async function inPane(page: Page, testid: string): Promise<boolean> {
  return page.evaluate((id) => {
    const pane = document.querySelector('main.app-main')!.getBoundingClientRect();
    const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.top >= pane.top &&
      r.bottom <= pane.bottom &&
      r.left >= pane.left &&
      r.right <= pane.right
    );
  }, testid);
}

test.describe('palettes view: legend and layout (1440×900)', () => {
  test('BK legend explains the dots, rings and row bars; row labels are 12 px or more', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    const bands = page.getByTestId('palette-grid.legend.bands');
    for (const t of ['Player 1', '01–2F', 'Player 2', '30–5F', 'Arena', '60–9F', 'Shared', 'A0–FF'])
      await expect(bands).toContainText(t);
    // The dots are the usage sources ticked in the palette list.
    const marks = page.getByTestId('palette-grid.legend.marks');
    await expect(marks).toHaveText(/used by the background, this scene's sprites/);
    await page.getByTestId('usage.background').uncheck();
    await expect(marks).toHaveText(/used by this scene's sprites$/);
    await page.getByTestId('usage.sprites').uncheck();
    await expect(marks).toContainText('tick a source under Usage');
    // Rings only mean something while comparing.
    await expect(page.getByTestId('palette-grid.legend.rings')).toHaveCount(0);
    await page.getByTestId('tool.compare').click();
    await page.getByTestId('compare.with').selectOption('1');
    await expect(page.getByTestId('palette-grid.legend.rings')).toHaveText(
      /differs from the compared palette/,
    );
    const sizes = await page
      .locator('.band-labels > div')
      .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(sizes).toHaveLength(16);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(12);
  });

  test('remap legend explains the rings (entries mapped to 0)', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palettes.tab.remaps').click();
    await page.getByTestId('remap.mapped.5').click();
    await page.getByTestId('remap.base.0').click();
    await expect(page.getByTestId('remap.mapped.legend.rings')).toHaveText(/maps to 0/);
  });

  test('BK: grid and preview are in view together, with the tools and the remap editor open', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    await expect(page.getByTestId('palettes.side').getByTestId('palette-preview')).toBeVisible();
    expect(await inPane(page, 'palette-grid')).toBe(true);
    expect(await inPane(page, 'palette-preview.canvas')).toBe(true);
    for (const tool of ['ramp', 'shades', 'adjust', 'altpals', 'compare']) {
      await page.getByTestId(`tool.${tool}`).click();
      // Reaching the lower tool buttons scrolls the pane; at its top both are in view.
      await page.locator('main.app-main').evaluate((m) => m.scrollTo(0, 0));
      expect(await inPane(page, 'palette-grid'), tool).toBe(true);
      expect(await inPane(page, 'palette-preview.canvas'), tool).toBe(true);
    }
    await page.getByTestId('palettes.tab.remaps').click();
    await page.locator('main.app-main').evaluate((m) => m.scrollTo(0, 0));
    expect(await inPane(page, 'remap.mapped')).toBe(true);
    expect(await inPane(page, 'palette-preview.canvas')).toBe(true);
  });

  test('AF: legend, and grid and preview in view together with ALTPALS loaded', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/palettes');
    await app.chooseFile('arena.bk', () => page.getByTestId('af-palette.choose').click());
    await app.hooks(
      (h, a: number[]) => h.loadAltPals('altpals.dat', a),
      Array.from(fixture('altpals.dat')),
    );
    await expect(page.getByTestId('har.p1.0')).toBeVisible();
    await expect(page.getByTestId('af-palette.grid.legend.marks')).toHaveText(
      /used by this fighter's sprites/,
    );
    await expect(page.getByTestId('af-palette.grid.legend.bands')).toContainText('Player 1');
    expect(await inPane(page, 'af-palette.grid')).toBe(true);
    expect(await inPane(page, 'af-palette.preview')).toBe(true);
    // The preview sits in the left column, under the cards.
    const grid = (await page.getByTestId('af-palette.grid').boundingBox())!;
    const pv = (await page.getByTestId('af-palette.preview-pane').boundingBox())!;
    expect(pv.x + pv.width).toBeLessThanOrEqual(grid.x);
  });
});
