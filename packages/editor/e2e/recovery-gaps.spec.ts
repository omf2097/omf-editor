// Spec 19 scenarios without a test of their own (T12): snapshot triggers,
// restore to the stored route, corrupt snapshots, Close prompts, and the
// exact contents of a new fighter and scene.

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { decodeSprite, readAF, readBK } from '@omf/formats';
import { test, expect } from './helpers';

interface StoredSnapshot {
  session: string;
  name: string;
  bytes: number[];
  route: string;
}

const snapshots = (page: Page): Promise<StoredSnapshot[]> =>
  page.evaluate(
    () =>
      new Promise<StoredSnapshot[]>((resolve, reject) => {
        const open = indexedDB.open('omf-editor');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('snapshots').objectStore('snapshots').getAll();
          req.onsuccess = () => {
            open.result.close();
            resolve(
              (req.result as (StoredSnapshot & { bytes: Uint8Array })[]).map((s) => ({
                ...s,
                bytes: Array.from(s.bytes),
              })),
            );
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );

test.describe('autosave triggers and restore (spec 19 §3)', () => {
  test('pagehide writes the snapshot; Restore returns to its route with the edit', async ({
    app,
    page,
  }) => {
    await page.clock.install();
    await app.open('fighter.af', '/animations/20');
    await app.setField('ov.points', 77);
    await app.hooks((h, p: string) => h.navigate(p), '/animations/20/collisions');
    // No timer has run: only pagehide can have written it.
    expect(await snapshots(page)).toEqual([]);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect.poll(async () => (await snapshots(page)).length).toBe(1);
    const [snap] = await snapshots(page);
    expect(snap!.route).toBe('/animations/20/collisions');
    expect(snap!.bytes).toEqual(Array.from(await app.bytes()));
    await page.reload();
    await app.goto('/');
    await page.getByTestId('recover.restore').click();
    await expect(page).toHaveURL(/#\/animations\/20\/collisions$/);
    expect(await app.dirty()).toBe(true);
    expect(readAF(await app.bytes()).moves.get(20)!.points).toBe(77);
    // Restoring removes it from the list.
    await expect.poll(async () => (await snapshots(page)).length).toBe(0);
  });

  test('a tab going hidden writes the snapshot', async ({ app, page }) => {
    await page.clock.install();
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 99);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await snapshots(page)).length).toBe(1);
    expect(readAF(Uint8Array.from((await snapshots(page))[0]!.bytes)).health).toBe(99);
  });

  test('a corrupt snapshot is reported and downloaded raw, not lost', async ({ app, page }) => {
    await app.goto('/');
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('omf-editor');
          open.onsuccess = () => {
            const tx = open.result.transaction('snapshots', 'readwrite');
            tx.objectStore('snapshots').put({
              session: 'broken-session',
              name: 'broken.af',
              kind: 'af',
              savedAt: Date.now(),
              bytes: Uint8Array.from([1, 2, 3]),
              route: '/file',
              paletteSource: null,
            });
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await app.ready();
    await expect(page.getByTestId('recover.card')).toContainText('broken.af');
    const path = await app.download(() => page.getByTestId('recover.restore').click());
    expect(Array.from(readFileSync(path))).toEqual([1, 2, 3]);
    await expect(page.getByTestId('toast.error')).toContainText('damaged');
    await expect(page.getByTestId('doc-title')).toHaveCount(0);
    expect((await snapshots(page)).map((s) => s.session)).toEqual(['broken-session']);
  });
});

test.describe('Close (spec 19 §4)', () => {
  test('a clean document closes at once and its state resets', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20');
    await page.getByTestId('file-menu').click();
    await page.getByTestId('menu.close').click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByTestId('confirm')).toHaveCount(0);
    expect(await app.bytes()).toEqual(new Uint8Array(0));
    await expect(page.getByTestId('undo')).toBeDisabled();
    await expect(page.getByTestId('doc-title')).toHaveCount(0);
  });

  test('a dirty one asks: Cancel keeps it, Save saves then closes, Discard drops it', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 123);
    const close = async () => {
      await page.getByTestId('file-menu').click();
      await page.getByTestId('menu.close').click();
    };
    await close();
    await expect(page.getByTestId('confirm')).toContainText('unsaved changes');
    await page.getByTestId('confirm.cancel').click();
    await expect(page.getByTestId('doc-title')).toContainText('fighter.af');
    expect(await app.dirty()).toBe(true);
    // Save: the file is written, then the document closes.
    const { bytes } = await app.saveDownload(async () => {
      await close();
      await page.getByTestId('confirm.save').click();
    });
    expect(readAF(bytes).health).toBe(123);
    await expect(page).toHaveURL(/#\/$/);
    // Discard: nothing is written and no snapshot is left behind.
    await app.open('fighter.af', '/file');
    await app.setField('file.health', 124);
    await app.hooks((h) => h.snapshot());
    expect(await snapshots(page)).toHaveLength(1);
    await close();
    await page.getByTestId('confirm.discard').click();
    await expect(page).toHaveURL(/#\/$/);
    await expect.poll(async () => (await snapshots(page)).length).toBe(0);
    await expect(page.getByTestId('recover.card')).toHaveCount(0);
  });
});

test.describe('new file contents (spec 19 §1)', () => {
  test('New fighter: Jaguar header and sound table, the 16 base animations', async ({
    app,
    page,
  }) => {
    await app.goto('/');
    await page.getByTestId('start.new-fighter').click();
    const f = readAF(await app.bytes());
    expect({
      fighterId: f.fighterId,
      execWindow: f.execWindow,
      endurance: f.endurance,
      upwardsJumpFrameLimit: f.upwardsJumpFrameLimit,
      health: f.health,
      forwardSpeed: f.forwardSpeed,
      reverseSpeed: f.reverseSpeed,
      jumpSpeed: f.jumpSpeed,
      fallSpeed: f.fallSpeed,
      version1: f.version1,
      aiProjectileYThreshold: f.aiProjectileYThreshold,
    }).toEqual({
      fighterId: 0,
      execWindow: 10,
      endurance: 14080,
      upwardsJumpFrameLimit: 2,
      health: 200,
      forwardSpeed: 1280,
      reverseSpeed: 1024,
      jumpSpeed: -3712,
      fallSpeed: 294,
      version1: 50,
      aiProjectileYThreshold: 20,
    });
    expect(f.soundTable).toEqual([
      0, 1, 2, 3, 6, 5, 4, 0, 0, 19, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 63, 4, 40, 41, 0, 70, 71, 72, 69,
      68,
    ]);
    const expected: Record<number, [number, string]> = {};
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 10, 11]) expected[id] = [9, '0'];
    expected[9] = [0, '0'];
    for (const id of [12, 13, 14]) expected[id] = [0, '"!"'];
    for (const id of [48, 49]) expected[id] = [11, 'n'];
    expect([...f.moves.keys()]).toEqual(Object.keys(expected).map(Number));
    for (const [id, m] of f.moves) {
      expect([m.category, m.moveString], `move ${id}`).toEqual(expected[id]);
      expect(m.baseString).toBe('A10');
      expect(m.sprites).toHaveLength(1);
      const s = m.sprites[0]!;
      expect([s.width, s.height, s.missing]).toEqual([1, 1, false]);
      expect(Array.from(decodeSprite(1, 1, s.image).pixels)).toEqual([256]);
      // Never image index 0 (openomf never shares it).
      expect(s.index).toBeGreaterThan(0);
      expect([m.damageAmount, m.points, m.nextAnimationId, m.extraStrings]).toEqual([0, 0, 0, []]);
    }
    expect(new Set([...f.moves.values()].map((m) => m.sprites[0]!.index)).size).toBe(16);
    await expect(page.getByTestId('doc-title')).toContainText('Untitled.AF');
    expect(await app.dirty()).toBe(true);
  });

  test('New scene: 320×200 of index 0, a greyscale ramp at 0x60–0x9F, identity remaps', async ({
    app,
    page,
  }) => {
    await app.goto('/');
    await page.getByTestId('start.new-scene').click();
    const b = readBK(await app.bytes());
    expect([b.backgroundWidth, b.backgroundHeight, b.musicMask, b.animations.size]).toEqual([
      320, 200, 0, 0,
    ]);
    expect(b.background.every((v) => v === 0)).toBe(true);
    expect(b.palettes).toHaveLength(1);
    const c = b.palettes[0]!.colors.colors;
    c.forEach((rgb, i) =>
      expect(rgb, `colour ${i}`).toEqual(
        i >= 0x60 && i <= 0x9f ? [i - 0x60, i - 0x60, i - 0x60] : [0, 0, 0],
      ),
    );
    expect(b.palettes[0]!.remaps).toHaveLength(19);
    for (const r of b.palettes[0]!.remaps)
      expect(Array.from(r)).toEqual(Array.from({ length: 256 }, (_, i) => i));
    await expect(page.getByTestId('doc-title')).toContainText('Untitled.BK');
  });
});
