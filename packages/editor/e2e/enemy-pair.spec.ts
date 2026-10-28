// The enemy string with the move (spec 15 §6.1): attacker and opponent in one
// scene, timed as openomf does, another opponent, and the variants openomf
// makes of the string. Fixture enemy.af: move 9 sprites 0x11–0x15, idle 0x06,
// attacker sprites from 0x08; opponent.af move 9 from 0x21, idle 0x24.
import type { Page } from '@playwright/test';
import { test, expect, type App } from './helpers';

const P2 = 48;

/** Pixels of the scene canvas with palette index `index`'s colour, and the leftmost one's x. */
async function pixels(app: App, page: Page, index: number): Promise<{ n: number; left: number }> {
  const lut = await app.hooks((h) => h.lut());
  return page.evaluate((want) => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="scene-canvas"]')!;
    const d = new Uint32Array(
      c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.buffer,
    );
    let n = 0;
    let left = Infinity;
    d.forEach((v, i) => {
      if (v !== want) return;
      n++;
      left = Math.min(left, i % c.width);
    });
    return { n, left };
  }, lut[index]!);
}
const count = async (app: App, page: Page, index: number) => (await pixels(app, page, index)).n;

async function openPaired(app: App, page: Page, id: number, paired = true): Promise<void> {
  await app.open('enemy.af', `/animations/${id}/script`);
  await app.paletteSource();
  // The arena background has every colour; counted pixels are the sprites'.
  await page.getByTestId('toggle.bg').click();
  await page.getByTestId('script.target').selectOption('enemy');
  if (paired) await page.getByTestId('enemy.paired').check();
}

test.describe('enemy string with the move', () => {
  test('a ua throw: the opponent stands until the ua tick, then both run on it', async ({
    app,
    page,
  }) => {
    await openPaired(app, page, 30);
    await expect(page.getByTestId('enemy.start')).toContainText('from frame 3 (ua, tick 8)');
    expect(await app.hooks((h) => h.enemy())).toMatchObject({ start: 8, lead: 8, plain: 'ua' });
    expect(await app.hooks((h) => h.playback())).toMatchObject({ tick: 0, preroll: true });
    await expect(page.getByTestId('playback.label')).toHaveText('Lead-in 1/8');
    // Attacker sprite A (0x08) and the opponent's idle sprite (0x06, player 2).
    await expect.poll(() => count(app, page, 0x08)).toBe(12 * 14);
    expect(await count(app, page, 0x06 + P2)).toBe(10 * 12);
    await app.hooks((h) => h.stepTicks(8));
    // Tick 8 of both strings: attacker frame 3 (C, 0x0A), enemy string frame 4 (D, 0x14).
    expect(await app.hooks((h) => h.playback())).toMatchObject({
      tick: 8,
      frameIndex: 3,
      preroll: false,
    });
    await expect.poll(() => count(app, page, 0x0a)).toBe(12 * 14);
    expect(await count(app, page, 0x14 + P2)).toBe(10 * 12);
    expect(await count(app, page, 0x06 + P2)).toBe(0);
    await expect(page.getByTestId('playback.label')).toContainText('Frame 4/5');
    // First goes back to the start of the lead-in.
    await page.getByTestId('playback.first').click();
    expect((await app.hooks((h) => h.playback())).tick).toBe(0);
  });

  test('a hit starts on the first frame with collision points; another can be picked', async ({
    app,
    page,
  }) => {
    await openPaired(app, page, 31);
    await expect(page.getByTestId('enemy.hit-frame')).toHaveValue('1');
    expect(await app.hooks((h) => h.enemy())).toMatchObject({ start: 0, lead: 3 });
    await app.hooks((h) => h.stepTicks(3));
    // The attacker's frame 2 (B, 0x09) as the enemy string starts (A, 0x11).
    await expect.poll(() => count(app, page, 0x09)).toBe(12 * 14);
    expect(await count(app, page, 0x11 + P2)).toBe(10 * 12);
    await page.getByTestId('enemy.hit-frame').selectOption('2');
    expect(await app.hooks((h) => h.enemy())).toMatchObject({ start: 0, lead: 6 });
  });

  test('the distance sets how far apart the fighters stand', async ({ app, page }) => {
    await openPaired(app, page, 31);
    const apart = async () =>
      (await pixels(app, page, 0x06 + P2)).left - (await pixels(app, page, 0x08)).left;
    // Facing each other, the opponent's 10 px idle sprite starts 1 px further than the origin gap.
    await expect.poll(apart).toBe(61);
    await app.setField('enemy.distance', 100);
    await expect.poll(apart).toBe(101);
  });

  test('another opponent plays its own move 9 and idle sprites', async ({ app, page }) => {
    await openPaired(app, page, 31);
    await app.opponent('opponent.af');
    await expect.poll(() => count(app, page, 0x24 + P2)).toBe(16 * 6);
    await app.hooks((h) => h.stepTicks(3));
    await expect.poll(() => count(app, page, 0x21 + P2)).toBe(16 * 6);
    // The attacker is still this file's move.
    expect(await count(app, page, 0x09)).toBe(12 * 14);
  });

  test('e puts the opponent on the attacker in the paired preview only', async ({ app, page }) => {
    await page.clock.install();
    await openPaired(app, page, 31, false);
    await page.getByTestId('script.mode.text').click();
    await page.getByTestId('script.text').fill('eA5');
    await page.clock.runFor(700);
    await page.getByTestId('script.mode.visual').click();
    await expect(page.getByTestId('frame.0.tag.0.no-preview')).toHaveCount(1);
    await page.getByTestId('enemy.paired').check();
    await expect(page.getByTestId('frame.0.tag.0.no-preview')).toHaveCount(0);
    await app.hooks((h) => h.stepTicks(4));
    // On the attacker: the opponent's offset is minus the 60 px gap.
    expect((await app.hooks((h) => h.playback())).x).toBe(-60);
  });
});

test.describe('another opponent', () => {
  test('alone: its move 9 sprites in the picker, the lint and the preview', async ({
    app,
    page,
  }) => {
    await page.clock.install();
    await openPaired(app, page, 31, false);
    await app.opponent('opponent.af');
    await expect(page.getByTestId('enemy.opponent')).toHaveText('opponent.af');
    await expect(page.getByTestId('enemy.damage')).toContainText('3 sprites');
    await expect(page.getByTestId('frame.0.sprite').locator('option')).toHaveCount(3);
    await expect.poll(() => count(app, page, 0x21 + P2)).toBe(16 * 6);
    await page.getByTestId('script.mode.text').click();
    // D is a sprite of this file's move 9 but not of opponent.af's.
    await page.getByTestId('script.text').fill('A1-D2');
    await page.clock.runFor(700);
    await expect(page.getByTestId('script.diagnostics')).toContainText(
      'Frame 2: frame D refers to a sprite that does not exist',
    );
    await page.getByTestId('enemy.opponent.reset').click();
    await expect(page.getByTestId('enemy.opponent')).toHaveText('enemy.af');
    await expect(page.getByTestId('script.diagnostics')).toHaveCount(0);
  });
});

test.describe('enemy string variants', () => {
  test('Airborne and stun or KO show and play what openomf appends', async ({ app, page }) => {
    await openPaired(app, page, 31, false);
    const eff = page.getByTestId('enemy.effective');
    await expect(eff).toHaveText('A2-x-3B3-C2');
    await page.getByTestId('enemy.variant.airborne').click();
    await expect(eff).toHaveText('A2-x-3B3-C2-L2-M5-L2');
    await expect(eff.locator('mark')).toHaveText('-L2-M5-L2');
    expect((await app.hooks((h) => h.playback())).total).toBe(16);
    await page.getByTestId('enemy.variant.stun').check();
    await expect(eff.locator('mark')).toHaveText('-L3-M5000');
    await page.getByTestId('enemy.variant.standing').click();
    // Grounded stun or KO: the last frame goes, the MASTER.DAT fall follows.
    await expect(eff.locator('del')).toHaveText('-C2');
    await expect(eff.locator('mark')).toHaveText('-x-20ox-20L1-ox-20L2-x-20zzs4l25sp13M1-zzM2');
    expect((await app.hooks((h) => h.enemy()))!.text).toBe(
      'A2-x-3B3-x-20ox-20L1-ox-20L2-x-20zzs4l25sp13M1-zzM2',
    );
    // The edited string is still the stored one.
    await expect(page.locator('[data-testid^="script.timeline.segment."]')).toHaveCount(3);
    await expect(page.getByTestId('enemy.variant.launch')).toHaveCount(0);
  });

  test('Launch is offered when a frame of the move has ai', async ({ app, page }) => {
    await openPaired(app, page, 32, false);
    await expect(page.getByTestId('enemy.variant.launch-note')).toContainText('(frame 2)');
    await page.getByTestId('enemy.variant.launch').click();
    // The whole string is dropped for openomf's own.
    await expect(page.getByTestId('enemy.effective').locator('del')).toHaveText('A3-B3');
    await expect(page.getByTestId('enemy.effective').locator('mark')).toHaveText(
      'A1-s01l50B2-C2-L5-M400',
    );
    expect((await app.hooks((h) => h.enemy()))!.text).toBe('A1-s01l50B2-C2-L5-M400');
    await expect(page.getByTestId('enemy.variant.stun')).toBeDisabled();
  });

  test('a throw plays the string as it is; an empty string is no hit animation', async ({
    app,
    page,
  }) => {
    await openPaired(app, page, 30, false);
    await expect(page.getByTestId('enemy.variant.plain')).toContainText('A throw');
    await expect(page.getByTestId('enemy.variant.airborne')).toBeDisabled();
    await expect(page.getByTestId('enemy.effective')).toHaveText('A2-B2-C4-D4-E4');
    await app.hooks((h, p: string) => h.navigate(p), '/animations/33/script');
    await page.getByTestId('script.target').selectOption('enemy');
    await expect(page.getByTestId('enemy.effective.none')).toBeVisible();
  });
});
