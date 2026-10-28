import { readAF, writeAF } from '@omf/formats';
import { test, expect, fixture } from './helpers';

const ALL = ['tiny.af', 'tiny.bk', 'fighter.af', 'edge.af', 'arena.bk', 'menu.bk', 'big.bk'];

test.describe('save and round trip', () => {
  for (const name of ALL) {
    test(`${name}: open then save writes identical bytes`, async ({ app }) => {
      await app.open(name, '/file');
      const { name: saved, bytes } = await app.saveDownload();
      expect(saved).toBe(name);
      expect(bytes).toEqual(fixture(name));
    });
  }

  test('edits of every field type persist through save and reopen', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 321);
    await app.setField('file.forward_speed', '5.5');
    await page.goto('./#/animations/20');
    await app.setField('ov.damage_amount', 99);
    await page.getByTestId('ov.ai_flags').getByRole('button').first().click();
    await page.getByTestId('ov.ai_flags.VS_AIR_STATE_1').check();
    await page.getByTestId('ov.extra_string_selector').selectOption('2');
    await app.setField('ov.enemy_string', 'B2');
    await page.getByTestId('trigger.raw').fill('K2');
    await page.getByTestId('tab.anim-collisions').click();
    await app.setField('collisions.row.0.x', 7);
    await page.getByTestId('tab.anim-sprites').click();
    await app.setField('sprite.pos_x', -9);
    const { bytes } = await app.saveDownload();
    await app.hooks((h, a: number[]) => h.open('re.af', a), Array.from(bytes));
    await page.goto('./#/file');
    await expect(page.getByTestId('file.health')).toHaveValue('321');
    await expect(page.getByTestId('file.forward_speed.raw')).toHaveText('1408');
    await page.goto('./#/animations/20');
    await expect(page.getByTestId('ov.damage_amount')).toHaveValue('99');
    await expect(page.getByTestId('ov.ai_flags.hex')).toContainText('0x0303');
    await expect(page.getByTestId('ov.extra_string_selector')).toHaveValue('2');
    await expect(page.getByTestId('ov.enemy_string')).toHaveValue('B2');
    await expect(page.getByTestId('trigger.raw')).toHaveValue('K2');
    await page.getByTestId('tab.anim-collisions').click();
    await expect(page.getByTestId('collisions.row.0.x')).toHaveValue('7');
    await page.getByTestId('tab.anim-sprites').click();
    await page.getByTestId('sprites.cell.0').click();
    await expect(page.getByTestId('sprite.pos_x')).toHaveValue('-9');
    // In the file: exactly these fields changed, nothing else.
    const got = readAF(bytes);
    const m = got.moves.get(20)!;
    expect([got.health, got.forwardSpeed]).toEqual([321, 1408]);
    expect([m.damageAmount, m.aiFlags, m.extraStringSelector, m.enemyString, m.moveString]).toEqual(
      [99, 0x0303, 2, 'B2', 'K2'],
    );
    expect([m.hitCoords[0]!.x, m.sprites[0]!.posX]).toEqual([7, -9]);
    const want = readAF(fixture('fighter.af'));
    const w = want.moves.get(20)!;
    want.health = got.health;
    want.forwardSpeed = got.forwardSpeed;
    for (const k of ['damageAmount', 'aiFlags', 'extraStringSelector', 'enemyString'] as const)
      (w as unknown as Record<string, unknown>)[k] = m[k];
    w.moveString = m.moveString;
    w.moveStringRaw = m.moveStringRaw;
    w.hitCoords[0]!.x = 7;
    w.sprites[0]!.posX = -9;
    expect(writeAF(want)).toEqual(bytes);
  });

  test('save as uses a new name; the dirty marker clears on save', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 150);
    await expect(page.getByTestId('status.modified')).toBeVisible();
    expect(await app.dirty()).toBe(true);
    const { name } = await app.saveDownload(async () => {
      await page.getByTestId('file-menu').click();
      await page.getByTestId('menu.saveas').click();
    });
    expect(name).toBe('fighter.af');
    expect(await app.dirty()).toBe(false);
    await expect(page.getByTestId('status.modified')).toHaveCount(0);
  });

  test('beforeunload guard while dirty', async ({ app, page }) => {
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 151);
    const dialog = new Promise<string>((resolve) =>
      page.once('dialog', (d) => (resolve(d.type()), void d.dismiss())),
    );
    await page.close({ runBeforeUnload: true });
    expect(await dialog).toBe('beforeunload');
  });

  test('export JSON equals the library JSON; import JSON gives the same bytes', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/file');
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.getByTestId('file-menu').click();
        await page.getByTestId('menu.export-json').click();
      })(),
    ]);
    const { readFileSync } = await import('node:fs');
    const json = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    expect(json).toEqual(JSON.parse(new TextDecoder().decode(fixture('fighter.json'))));
    await app.chooseFile('fighter.json', async () => {
      await page.getByTestId('file-menu').click();
      await page.getByTestId('menu.import-json').click();
    });
    await expect(page.getByTestId('doc-title')).toContainText('fighter.AF');
    // JSON has no move string padding; fighter.af has none either.
    expect(await app.bytes()).toEqual(fixture('fighter.af'));
  });

  test('JSON with an out-of-range value shows the path and keeps the document', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/file');
    await app.chooseFile('bad.json', async () => {
      await page.getByTestId('file-menu').click();
      await page.getByTestId('menu.import-json').click();
    });
    await expect(page.getByTestId('toast.error')).toContainText('moves.11.sprites[0].pos_x');
    await expect(page.getByTestId('doc-title')).toHaveText('fighter.af');
  });

  test('over-limit base string refuses to save and stays dirty', async ({ app, page }) => {
    await app.open('edge.af', '/animations/3/script');
    await page.getByTestId('script.mode.text').click();
    const t = page.getByTestId('script.text');
    await t.fill('A1-'.repeat(340) + 'A111'); // 1024 bytes
    // No wait: saving must commit the pending edit itself.
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast.error')).toContainText('longer than 1023 bytes');
    expect(await app.dirty()).toBe(true);
  });
});
