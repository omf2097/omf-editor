import { readBK, type BKFile } from '@omf/formats';
import { test, expect, fixture, type App } from './helpers';

const bkOf = async (app: App): Promise<BKFile> => readBK(await app.bytes());
const history = (app: App): Promise<number> => app.hooks((h) => h.historyLength());

test.describe('palette tools', () => {
  test('swap with rewrite keeps the picture under every palette and remap (U1)', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    const before = await bkOf(app);
    await page.getByTestId('palette-grid.16').click();
    await page.getByTestId('palette-grid.19').click({ modifiers: ['Shift'] });
    await page.getByTestId('tool.swap').click();
    await page.getByTestId('swap.target').fill('100');
    await page.getByTestId('swap.apply').click();
    const after = await bkOf(app);
    const px = before.background.findIndex((p) => p === 16);
    for (const p of [0, 1, 2]) {
      const b = before.palettes[p]!;
      const a = after.palettes[p]!;
      expect(a.colors.colors[after.background[px]!]).toEqual(b.colors.colors[16]);
      for (const r of [0, 3])
        expect(a.colors.colors[a.remaps[r]![after.background[px]!]!]).toEqual(
          b.colors.colors[b.remaps[r]![16]!],
        );
    }
  });

  test('swap and move refuse a target that is negative, empty, fractional or does not fit (U2)', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palette-grid.16').click();
    await page.getByTestId('palette-grid.19').click({ modifiers: ['Shift'] });
    await page.getByTestId('tool.swap').click();
    const h0 = await history(app);
    for (const v of ['-2', '', '3.5', '253']) {
      await page.getByTestId('swap.target').fill(v);
      await expect(page.getByTestId('swap.target')).toHaveClass(/is-invalid/);
      await page.getByTestId('swap.apply').click();
    }
    await page.getByTestId('swap.mode.move').check();
    await page.getByTestId('swap.target').fill('-1');
    await page.getByTestId('swap.apply').click();
    expect(await history(app)).toBe(h0);
  });

  test('move puts the block at the target start, moving right or left (U3)', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    const before = await bkOf(app);
    await page.getByTestId('palette-grid.16').click();
    await page.getByTestId('palette-grid.19').click({ modifiers: ['Shift'] });
    await page.getByTestId('tool.swap').click();
    await page.getByTestId('swap.mode.move').check();
    await page.getByTestId('swap.target').fill('100');
    await page.getByTestId('swap.apply').click();
    let after = await bkOf(app);
    expect(after.palettes[0]!.colors.colors[100]).toEqual(before.palettes[0]!.colors.colors[16]);
    expect(after.palettes[0]!.colors.colors[103]).toEqual(before.palettes[0]!.colors.colors[19]);
    await expect(page.getByTestId('palettes.selection')).toContainText('0x64–0x67');
    // And back to the left: the block starts at 10.
    await page.getByTestId('swap.target').fill('10');
    await page.getByTestId('swap.apply').click();
    after = await bkOf(app);
    expect(after.palettes[0]!.colors.colors[10]).toEqual(before.palettes[0]!.colors.colors[16]);
  });

  test('palette tool candidate is rebuilt after undo (U4)', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palette-grid.200').click();
    await app.setField('color-editor.R', 5);
    await page.getByTestId('palette-grid.96').click();
    await page.getByTestId('palette-grid.111').click({ modifiers: ['Shift'] });
    await page.getByTestId('tool.ramp').click();
    await page.getByTestId('undo').click();
    expect((await bkOf(app)).palettes[0]!.colors.colors[200]![0]).toBe(8);
    await page.getByTestId('tool.apply').click();
    expect((await bkOf(app)).palettes[0]!.colors.colors[200]![0]).toBe(8);
  });

  test('remap candidate is rebuilt after undo; setting a target ignores the candidate (U4)', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palettes.tab.remaps').click();
    await page.getByTestId('remap.identity-all').click();
    await page.getByTestId('remap.tool.constant').click();
    await page.getByTestId('undo').click();
    const undone = Array.from((await bkOf(app)).palettes[0]!.remaps[0]!);
    await page.getByTestId('remap.apply').click();
    const applied = Array.from((await bkOf(app)).palettes[0]!.remaps[0]!);
    expect(applied.filter((v, i) => v !== undone[i])).toEqual([0]);
    // A click in the base grid edits the stored table, not the open tool's proposal.
    await page.getByTestId('remap.tool.constant').click();
    await page.getByTestId('remap.mapped.5').click();
    await page.getByTestId('remap.base.9').click();
    const t = (await bkOf(app)).palettes[0]!.remaps[0]!;
    expect([t[0], t[1], t[5]]).toEqual([0, 2, 9]);
  });

  test('palette edits after the edited palette is undone away go to an existing one (U5)', async ({
    app,
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palette-list.2').click();
    await page.getByTestId('palette-list.add').click();
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('palettes.tab.palette')).toHaveText('Palette 2');
    const h0 = await history(app);
    await page.getByTestId('palette-grid.200').click();
    await app.setField('color-editor.R', 7);
    expect(await history(app)).toBe(h0 + 1);
    expect((await bkOf(app)).palettes[2]!.colors.colors[200]![0]).toBe(7);
    await page.getByTestId('tool.swap').click();
    await page.getByTestId('swap.target').fill('100');
    await page.getByTestId('swap.apply').click();
    expect(await history(app)).toBe(h0 + 2);
    expect(errors).toEqual([]);
  });

  test('remap tools never wrap numbers or touch unselected entries (U6)', async ({ app, page }) => {
    await app.open('arena.bk', '/palettes');
    await page.getByTestId('palettes.tab.remaps').click();
    const stored = Array.from((await bkOf(app)).palettes[0]!.remaps[0]!);
    await page.getByTestId('remap.tool.constant').click();
    await page.getByTestId('remap.constant').fill('300');
    await expect(page.getByTestId('remap.apply')).toBeDisabled();
    await expect(page.getByTestId('remap.tool-error')).toBeVisible();
    // Range map that does not fit is refused instead of compressed.
    await page.getByTestId('remap.mapped.250').click();
    await page.getByTestId('remap.mapped.252').click({ modifiers: ['Shift'] });
    await page.getByTestId('remap.tool.range').click();
    await page.getByTestId('remap.target').fill('254');
    await expect(page.getByTestId('remap.apply')).toBeDisabled();
    await page.getByTestId('remap.target').fill('253');
    await page.getByTestId('remap.apply').click();
    let t = Array.from((await bkOf(app)).palettes[0]!.remaps[0]!);
    expect(t.slice(250, 253)).toEqual([253, 254, 255]);
    // A non-contiguous selection: the entry in between keeps its target.
    await page.getByTestId('remap.mapped.16').click();
    await page.getByTestId('remap.mapped.18').click({ modifiers: ['Control'] });
    await page.getByTestId('remap.tool.range').click();
    await page.getByTestId('remap.target').fill('100');
    await page.getByTestId('remap.apply').click();
    t = Array.from((await bkOf(app)).palettes[0]!.remaps[0]!);
    expect([t[16], t[17], t[18]]).toEqual([100, stored[17], 102]);
  });

  test('compare shows palette B without A’s remap candidate, and ALTPALS splits too (U11)', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    const sample = (x: number) =>
      app.hooks((h, a: number) => h.sample(a, 10, 'palette-preview.canvas'), x);
    const plainRight = await sample(250);
    await page.getByTestId('tool.compare').click();
    await page.getByTestId('compare.with').selectOption({ label: 'palette 1' });
    await page.getByTestId('palettes.tab.remaps').click();
    await page.getByTestId('palette-preview.remap').check();
    await page.getByTestId('remap.mapped.0').click();
    await page.getByTestId('remap.mapped.255').click({ modifiers: ['Shift'] });
    await page.getByTestId('remap.tool.constant').click();
    // Left (palette 0) shows the candidate: everything index 0, black.
    await expect.poll(() => sample(10)).toEqual([0, 0, 0, 255]);
    // Right (palette 1) uses its stored remap, not the candidate.
    expect((await sample(250))!.slice(0, 3)).not.toEqual([0, 0, 0]);
    await page.getByTestId('remap.tool.constant').click();
    await page.getByTestId('palette-preview.remap').uncheck();
    await app.hooks(
      (h, a: number[]) => h.loadAltPals('altpals.dat', a),
      Array.from(fixture('altpals.dat')),
    );
    await page.getByTestId('palettes.tab.palette').click();
    await page.getByTestId('tool.compare').click();
    await page.getByTestId('compare.with').selectOption({ label: 'ALTPALS 0' });
    await expect.poll(() => sample(250)).not.toEqual(plainRight);
  });

  test('duplicate is refused at 8 palettes, the openomf maximum (A2, U12)', async ({
    app,
    page,
  }) => {
    await app.open('arena.bk', '/palettes');
    for (let i = 0; i < 5; i++) await page.getByTestId('palette-list.add').click();
    await expect(page.locator('[data-testid^="palette-list."][data-testid$="7"]')).toHaveCount(1);
    await expect(page.getByTestId('palette-list.add')).toBeDisabled();
    expect((await bkOf(app)).palettes).toHaveLength(8);
    await expect(page.getByTestId('palettes.tab.palette')).toHaveText('Palette 5');
  });
});
