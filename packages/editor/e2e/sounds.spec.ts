import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, fixture } from './helpers';
import { audioLog, endAllSounds } from './fakeAudio';

/** Length of the SOUNDS.DAT copy cached in IndexedDB (−1 when none). */
function cachedBankLength(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((res) => {
        const r = indexedDB.open('omf-editor', 1);
        r.onsuccess = () => {
          const q = r.result.transaction('files').objectStore('files').get('sounds');
          q.onsuccess = () => {
            const v = q.result as { bytes: Uint8Array } | undefined;
            res(v ? v.bytes.length : -1);
            r.result.close();
          };
        };
      }),
  );
}

/** Clicks a preview on the File view: a user gesture that unlocks audio for later steps. */
async function unlockAudio(page: import('@playwright/test').Page, back: string): Promise<void> {
  await page.goto('./#/file');
  await page.getByTestId('sound-table.play.1').click();
  await page.getByTestId('sound-table.play.1').click();
  await page.goto(`./#${back}`);
}

// Fixture bank: sound 1 = 400 samples at 8000 Hz, 2 = 1000 at 22222 Hz,
// 4 = 100 at 3906 Hz; 3 and 5–10 are empty. sound.af's table is slot i → i.

// Every test here runs with the fake AudioContext from the app fixture.
test.describe('sound table and SOUNDS.DAT', () => {
  test('without a bank: usage, notes and a load prompt', async ({ app, page }) => {
    await app.open('sound.af', '/file');
    await expect(page.getByTestId('sound-table.bank')).toContainText('Load SOUNDS.DAT');
    await expect(page.getByTestId('sound-table.choose.1')).toHaveCount(0);
    await expect(page.getByTestId('sound-table.use.1.11')).toBeVisible();
    await expect(page.getByTestId('sound-table.use.1.12')).toBeVisible();
    // s9 appears only in an extra string of move 12
    await expect(page.getByTestId('sound-table.use.9.12')).toBeVisible();
    await expect(page.getByTestId('sound-table.note.27')).toContainText('openomf clears');
    await expect(page.getByTestId('sound-table.note.25')).toContainText('openomf clears');
    await expect(page.getByTestId('sound-table')).toContainText('s40 (1×)');
    await expect(page.getByLabel('Sound for slot 5')).toHaveValue('5');
    await page.getByTestId('sound-table.only-used').check();
    // slot 0 holds 0 but s0 is used, so every slot is shown; free slot 7 and recheck
    await expect(page.locator('[data-testid^="sound-table.row."]')).toHaveCount(30);
    await page.getByTestId('sound-table.only-used').uncheck();
    await app.setField('file.sound.7', 0);
    await page.getByTestId('sound-table.only-used').check();
    await expect(page.getByTestId('sound-table.row.7')).toHaveCount(0);
    await expect(page.getByTestId('sound-table.note.0')).toContainText('used but silent');
  });

  test('only-used keeps a row while its value is edited to 0', async ({ app, page }) => {
    await app.open('sound.af', '/file');
    await page.getByTestId('sound-table.only-used').check();
    const f = page.getByTestId('file.sound.5');
    await f.fill('1');
    await f.press('Enter');
    await f.press('ArrowDown');
    await expect(f).toHaveValue('0');
    await expect(f).toBeFocused();
    await f.press('ArrowUp');
    await expect(f).toHaveValue('1');
    // re-applying the filter drops it once it is 0 again
    await f.press('ArrowDown');
    await page.getByTestId('sound-table.only-used').uncheck();
    await page.getByTestId('sound-table.only-used').check();
    await expect(page.getByTestId('sound-table.row.5')).toHaveCount(0);
    // opening another file re-evaluates the filter
    await app.open('sound.af', '/file');
    await expect(page.getByTestId('sound-table.row.5')).toHaveCount(1);
  });

  test('used-by links open the right string and frame', async ({ app, page }) => {
    await app.open('sound.af', '/file');
    await page.getByTestId('sound-table.use.9.12').click();
    await expect(page).toHaveURL(/#\/animations\/12\/script\?string=1&frame=0$/);
    await expect(page.getByTestId('script.target')).toHaveValue('1');
    // back from an extra string, a base-string link resets the string
    await page.goto('./#/file');
    await page.getByTestId('sound-table.use.1.12').click();
    await expect(page).toHaveURL(/string=base&frame=0$/);
    await expect(page.getByTestId('script.target')).toHaveValue('base');
    await page.goto('./#/file');
    await page.getByTestId('sound-table.use.11.12').click();
    await expect(page).toHaveURL(/string=base&frame=3$/);
    await expect(page.getByTestId('script.frame.3')).toHaveClass(/selected|active|border-primary/);
  });

  test('loading the bank shows waveforms and flags empty or missing sounds', async ({
    app,
    page,
  }) => {
    await app.open('sound.af', '/file');
    await app.chooseFile('sounds.dat', () => page.getByTestId('sound-table.load').click());
    await expect(page.getByTestId('sound-table.bank-name')).toHaveText('sounds.dat: 3 sounds');
    await expect(page.getByTestId('sound-table.info.1')).toHaveText('50 ms · 8000 Hz');
    await expect(page.getByTestId('sound-table.info.2')).toHaveText('45 ms · 22222 Hz');
    await expect(page.getByTestId('sound-table.info.4')).toHaveText('26 ms · 3906 Hz');
    await expect(page.getByTestId('sound-table.note.3')).toContainText('empty entry');
    await expect(page.getByTestId('sound-table.note.11')).toContainText('not in SOUNDS.DAT');
    await expect(page.getByTestId('sound-table.play.3')).toBeDisabled();
    // remembered across reloads
    await expect.poll(() => cachedBankLength(page)).toBeGreaterThan(0);
    await page.reload();
    await app.open('sound.af', '/file');
    await expect(page.getByTestId('sound-table.bank-name')).toHaveText('sounds.dat: 3 sounds');
    await page.getByTestId('sound-table.forget').click();
    await expect(page.getByTestId('sound-table.bank')).toContainText('Load SOUNDS.DAT');
    await expect.poll(() => cachedBankLength(page)).toBe(0);
    await page.reload();
    await app.open('sound.af', '/file');
    await expect(page.getByTestId('sound-table.bank')).toContainText('Load SOUNDS.DAT');
  });

  test('preview buttons: Web Audio parameters, toggle, one at a time, cached buffers', async ({
    app,
    page,
  }) => {
    await app.open('sound.af', '/file');
    await app.soundBank();
    const play1 = page.getByTestId('sound-table.play.1');
    await play1.click();
    await expect(play1).toHaveAccessibleName('Stop sound');
    let log = await audioLog(page);
    expect(log.events).toEqual([
      expect.objectContaining({ ev: 'start', len: 400, bufferRate: 8000, playbackRate: 1 }),
    ]);
    expect(log.events[0]).toMatchObject({ gain: 1, pan: 0 });
    // clicking again stops it
    await play1.click();
    await expect(play1).toHaveAccessibleName('Play slot 1');
    log = await audioLog(page);
    expect(log.events.map((e) => e.ev)).toEqual(['start', 'stop']);
    // a sound below 8000 Hz plays from an 8000 Hz buffer at a slower rate
    await page.getByTestId('sound-table.play.4').click();
    log = await audioLog(page);
    expect(log.events.at(-1)).toMatchObject({
      len: 100,
      bufferRate: 8000,
      playbackRate: 3906 / 8000,
    });
    // starting another preview stops the first
    await page.getByTestId('sound-table.play.2').click();
    log = await audioLog(page);
    expect(log.events.slice(-2).map((e) => [e.ev, e.len])).toEqual([
      ['stop', 100],
      ['start', 1000],
    ]);
    // a sound that ends by itself resets the button
    await endAllSounds(page);
    await expect(page.getByTestId('sound-table.play.2')).toHaveAccessibleName('Play slot 2');
    // buffers are built once per sound and context
    await play1.click();
    await play1.click();
    await play1.click();
    log = await audioLog(page);
    expect(log.buffers).toBe(3);
    expect(log.contexts).toBe(1);
  });

  test('sounds requested before any user gesture are dropped, not queued', async ({
    app,
    page,
  }) => {
    await app.open('sound.af', '/animations/11/sprites');
    await app.soundBank();
    // The Sprites tab autoplays: silently.
    // eslint-disable-next-line playwright/no-wait-for-timeout -- negative check: nothing may play while the Sprites tab autoplays
    await page.waitForTimeout(400);
    expect(await app.soundsPlayedIn('playback')).toEqual([]);
    // A script sound with no gesture behind it is dropped...
    await app.hooks((h) => h.stepTicks(3));
    expect(await app.soundsPlayedIn('playback')).toEqual([]);
    // ...so the next click does not release a backlog.
    await page.getByTestId('nav.file').click();
    // eslint-disable-next-line playwright/no-wait-for-timeout -- negative check: a queued sound would start within this time
    await page.waitForTimeout(200);
    expect((await audioLog(page)).events).toEqual([]);
  });

  test('user playback plays s tags; pause, seek, other animations and leaving stop them', async ({
    app,
    page,
  }) => {
    await app.open('sound.af', '/animations/11');
    await app.soundBank();
    await page.getByTestId('playback.toggle').click();
    // frame A: s1 at tick 0, panned by x = 160 → 0
    await expect
      .poll(async () => (await audioLog(page)).events.filter((e) => e.ev === 'start')[0])
      .toMatchObject({ len: 400, gain: 1, pan: 0 });
    // B: s2l20sb-50sf10 after 3 ticks
    await expect
      .poll(async () => (await audioLog(page)).events.find((e) => e.len === 1000))
      .toMatchObject({ ev: 'start', gain: 40 / 127, pan: -0.5, playbackRate: 28888 / 22222 });
    await page.getByTestId('playback.toggle').click();
    let log = await audioLog(page);
    const started = log.events.filter((e) => e.ev === 'start').map((e) => e.node);
    const stopped = log.events.filter((e) => e.ev === 'stop').map((e) => e.node);
    expect(stopped.sort()).toEqual(started.sort());
    // paused: no more sounds
    const n = log.events.length;
    // eslint-disable-next-line playwright/no-wait-for-timeout -- negative check: paused playback must stay silent for a while
    await page.waitForTimeout(300);
    expect((await audioLog(page)).events).toHaveLength(n);

    // seeking while playing cuts what is playing but keeps playing with sound
    await page.getByTestId('playback.toggle').click();
    await expect.poll(async () => (await audioLog(page)).events.length).toBeGreaterThan(n);
    await page.getByTestId('playback.scrub').fill('7');
    log = await audioLog(page);
    expect(log.events.at(-1)?.ev).toBe('stop');

    // leaving the animation views stops playback and its sounds
    await page.getByTestId('nav.file').click();
    const m = (await audioLog(page)).events.length;
    // eslint-disable-next-line playwright/no-wait-for-timeout -- negative check: playback left running would start sounds within this time
    await page.waitForTimeout(400);
    log = await audioLog(page);
    expect(log.events.slice(m).filter((e) => e.ev === 'start')).toEqual([]);
    expect(await app.hooks((h) => h.playback().playing)).toBe(false);
    await page.goto('./#/animations/11');
    await expect(page.getByTestId('playback.toggle')).toHaveAccessibleName(/play/i);
  });

  test('a preview button is not stopped by playback, and the off switch cuts playback', async ({
    app,
    page,
  }) => {
    await app.open('sound.af', '/animations/11/script');
    await app.soundBank();
    await page.getByTestId('playback.toggle').click();
    await page.getByTestId('frame.1.tag.0.value.play').click(); // ui: sound 2
    await page.getByTestId('playback.toggle').click(); // pause
    const log = await audioLog(page);
    // Frame B plays the same sound (s2l20sb-50sf10) when playback reaches it,
    // which on a loaded machine can be after the click: the preview is the
    // start at full volume, centred.
    const uiStarts = log.events.filter(
      (e) => e.len === 1000 && e.ev === 'start' && e.gain === 1 && e.pan === 0,
    );
    expect(uiStarts).toHaveLength(1);
    const ui = uiStarts[0]!;
    expect(log.events.some((e) => e.node === ui.node && e.ev === 'stop')).toBe(false);
    // turning preview sounds off while playing stops them at once
    await page.goto('./#/file');
    await page.getByTestId('sound-table.playback-sound').uncheck();
    await page.goto('./#/animations/11');
    const before = (await audioLog(page)).events.filter((e) => e.ev === 'start').length;
    await page.getByTestId('playback.toggle').click();
    // eslint-disable-next-line playwright/no-wait-for-timeout -- negative check: with the switch off, nothing may start while playing
    await page.waitForTimeout(400);
    expect((await audioLog(page)).events.filter((e) => e.ev === 'start')).toHaveLength(before);
    // the setting survives a reload
    await page.reload();
    await app.open('sound.af', '/file');
    await expect(page.getByTestId('sound-table.playback-sound')).not.toBeChecked();
  });

  test('playback options follow openomf; cleared and out-of-table slots are skipped', async ({
    app,
  }) => {
    await app.open('sound.af', '/animations/11');
    await app.soundBank();
    await unlockAudio(app.page, '/animations/11');
    await app.hooks((h) => h.stepTicks(3)); // enter B: s2l20sb-50sf10
    expect(await app.soundsPlayedIn('playback')).toEqual([
      { id: 1, rate: 22222 + 6666, volume: 40, panning: -50 },
    ]);
    await app.hooks((h) => h.stepTicks(6)); // C: slot 27 is cleared; D: s40 is past the table
    await app.hooks((h) => h.stepTicks(3)); // loop back to A: s1, panned by x = 160
    expect((await app.soundsPlayedIn('playback')).slice(1)).toEqual([
      { id: 0, rate: 8000, volume: 127, panning: 0 },
    ]);
  });

  test('a held frame plays its sound once, not on every wrap', async ({ app, page }) => {
    await app.open('sound.af', '/animations/11/script');
    await app.soundBank();
    await page.getByTestId('script.frame.1').click();
    await page.getByTestId('playback.hold').click();
    // Play on the picked frame enters it: s2 plays once although B (3 ticks) wraps many times.
    await page.getByTestId('playback.toggle').click();
    await expect.poll(async () => (await app.hooks((h) => h.playback())).ms).toBeGreaterThan(0);
    // eslint-disable-next-line playwright/no-wait-for-timeout -- negative check: frame B wraps many times in this time; its sound must still play once
    await page.waitForTimeout(700);
    await page.getByTestId('playback.toggle').click();
    expect(await app.hooks((h) => h.playback().frameIndex)).toBe(1);
    expect((await app.soundsPlayedIn('playback')).map((p) => p.id)).toEqual([1]);
  });

  test('pressing play mid-frame does not replay that frame', async ({ app, page }) => {
    // Paused fake clock: no tick passes between Play and Pause on a slow machine.
    await page.clock.install();
    await app.open('sound.af', '/animations/11/script');
    await app.soundBank();
    await page.clock.pauseAt(Date.now() + 60_000);
    await page.getByTestId('playback.scrub').fill('4'); // inside B (ticks 3–5)
    await page.getByTestId('playback.toggle').click();
    await page.getByTestId('playback.toggle').click();
    expect(await app.soundsPlayedIn('playback')).toEqual([]);
    // from B's first tick it does
    await page.getByTestId('playback.scrub').fill('3');
    await page.getByTestId('playback.toggle').click();
    await page.getByTestId('playback.toggle').click();
    expect((await app.soundsPlayedIn('playback')).map((p) => p.id)).toEqual([1]);
  });

  test('browser: silent slots, empty entries, filter, WAV export, one undo step', async ({
    app,
    page,
  }) => {
    await app.open('sound.af', '/file');
    await app.soundBank();
    await app.setField('file.sound.7', 0);
    await page.getByTestId('sound-table.choose.5').click();
    const dlg = page.getByTestId('sound-browser');
    await expect(page.getByTestId('sound-browser.row.0')).toContainText('0, 7');
    // none, the three sounds, and the slot's current (empty) entry 5
    await expect(dlg.locator('[data-testid^="sound-browser.row."]')).toHaveCount(5);
    await expect(page.getByTestId('sound-browser.use.5')).toBeFocused();
    await page.getByTestId('sound-browser.show-empty').check();
    await expect(dlg.locator('[data-testid^="sound-browser.row."]')).toHaveCount(11);
    await page.getByTestId('sound-browser.filter').fill('2');
    await expect(dlg.locator('[data-testid^="sound-browser.row."]')).toHaveCount(2);
    await page.getByTestId('sound-browser.filter').fill('x');
    await expect(dlg.locator('[data-testid^="sound-browser.row."]')).toHaveCount(1);
    await page.getByTestId('sound-browser.filter').fill('');
    await expect(page.getByTestId('sound-browser.wav.3')).toHaveCount(0);
    const wav = new Uint8Array(
      readFileSync(await app.download(() => page.getByTestId('sound-browser.wav.1').click())),
    );
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
    expect(wav).toHaveLength(44 + 400);
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(8000);
    await page.getByTestId('sound-browser.play.2').click();
    expect((await app.soundsPlayedIn('ui')).at(-1)?.id).toBe(1);
    const before = await app.hooks((h) => h.historyLength());
    await page.getByTestId('sound-browser.use.2').click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByTestId('file.sound.5')).toHaveValue('2');
    expect(await app.hooks((h) => h.historyLength())).toBe(before + 1);
    expect((await app.bytes()).at(-30 + 5)).toBe(2);
    // two picks in a row are two undo steps
    await page.getByTestId('sound-table.choose.5').click();
    await page.getByTestId('sound-browser.use.0').click();
    await expect(page.getByTestId('file.sound.5')).toHaveValue('0');
    expect(await app.hooks((h) => h.historyLength())).toBe(before + 2);
    // Escape and the backdrop close without changes
    await page.getByTestId('sound-table.choose.6').click();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await page.getByTestId('sound-table.choose.6').click();
    await page.mouse.click(5, 5);
    await expect(dlg).toHaveCount(0);
    expect(await app.hooks((h) => h.historyLength())).toBe(before + 2);
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('file.sound.5')).toHaveValue('2');
  });

  test('s tag picker: one control, names every case, plays only real sounds', async ({
    app,
    page,
  }) => {
    // move 12 base: s1A2-s0A2-s25A2-s11A2
    await app.open('sound.af', '/animations/12/script');
    const sel = (f: number) => page.getByTestId(`frame.${f}.tag.0.value`);
    // no bank: a single select, no number field beside it, no play button
    for (const f of [0, 1, 2, 3]) {
      await expect(sel(f)).toHaveCount(1);
      expect(await sel(f).evaluate((e) => e.tagName)).toBe('SELECT');
      await expect(page.getByTestId(`frame.${f}.tag.0.value.play`)).toHaveCount(0);
    }
    await expect(sel(0).locator('option:checked')).toHaveText('slot 1 → sound 1');
    await app.soundBank();
    await expect(sel(0).locator('option:checked')).toHaveText('slot 1 → sound 1 (50 ms)');
    await expect(sel(1).locator('option:checked')).toHaveText('slot 0 → silent');
    await expect(sel(2).locator('option:checked')).toHaveText('slot 25 → cleared by openomf');
    await expect(sel(3).locator('option:checked')).toHaveText(
      'slot 11 → sound 11 (not in SOUNDS.DAT)',
    );
    await expect(sel(0).locator('option[value="3"]')).toHaveText('slot 3 → sound 3 (empty)');
    for (const f of [1, 2, 3]) {
      await expect(sel(f)).toHaveCount(1);
      await expect(page.getByTestId(`frame.${f}.tag.0.value.play`)).toHaveCount(0);
    }
    await page.getByTestId('frame.0.tag.0.value.play').click();
    expect((await app.soundsPlayedIn('ui')).at(-1)?.id).toBe(0);
  });

  test('dropping SOUNDS.DAT loads the bank; a bad one keeps the current bank', async ({
    app,
    page,
  }) => {
    await app.open('sound.af', '/file');
    const drop = async (name: string, bytes: number[]): Promise<void> => {
      const dt = await page.evaluateHandle(
        ([n, b]) => {
          const t = new DataTransfer();
          t.items.add(new File([new Uint8Array(b as number[])], n as string));
          return t;
        },
        [name, bytes] as const,
      );
      await page.locator('.app-shell').dispatchEvent('dragenter', { dataTransfer: dt });
      await page.locator('.app-shell').dispatchEvent('drop', { dataTransfer: dt });
    };
    await drop('SOUNDS.DAT', Array.from(fixture('sounds.dat')));
    await expect(page.getByTestId('sound-table.bank-name')).toHaveText('SOUNDS.DAT: 3 sounds');
    await expect(page.getByTestId('doc-title')).toHaveText('sound.af');
    await drop('sounds.dat', [1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(page.getByTestId('toast.error')).toContainText('not a SOUNDS.DAT');
    await expect(page.getByTestId('sound-table.bank-name')).toHaveText('SOUNDS.DAT: 3 sounds');
    await expect(page.getByTestId('doc-title')).toHaveText('sound.af');
  });

  test('an unreadable cached bank is reported once and dropped', async ({ app, page }) => {
    await app.goto('/');
    await page.evaluate(
      () =>
        new Promise<void>((res, rej) => {
          const r = indexedDB.open('omf-editor', 1);
          r.onsuccess = () => {
            const tx = r.result.transaction('files', 'readwrite');
            tx.objectStore('files').put(
              { name: 'SOUNDS.DAT', bytes: new Uint8Array([9, 9, 9, 9]) },
              'sounds',
            );
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
          };
          r.onerror = () => rej(r.error);
        }),
    );
    await page.reload();
    await expect(page.getByTestId('toast.error')).toContainText('not a SOUNDS.DAT');
    await page.reload();
    await app.open('sound.af', '/file');
    await expect(page.getByTestId('sound-table.bank')).toContainText('Load SOUNDS.DAT');
    await expect(page.getByTestId('toast.error')).toHaveCount(0);
  });

  test('sound table and browser have no serious axe violations', async ({ app, page }) => {
    await app.open('sound.af', '/file');
    await app.soundBank();
    await expect(page.getByTestId('sound-table.info.1')).toBeVisible();
    const scan = async (): Promise<string[]> => {
      const r = await new AxeBuilder({ page }).disableRules(['color-contrast', 'region']).analyze();
      return r.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes[0]?.target}`);
    };
    expect(await scan()).toEqual([]);
    await page.getByTestId('sound-table.choose.1').click();
    await expect(page.getByTestId('sound-browser')).toBeVisible();
    expect(await scan()).toEqual([]);
  });
});

test.describe('real Web Audio', () => {
  // The only test that uses the browser's audio output; the browsers are muted.
  test.use({ realAudio: true });

  test('plays a preview without errors', async ({ app, page, browserName }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await app.open('sound.af', '/file');
    await app.soundBank();
    await page.getByTestId('sound-table.play.4').click();
    await page.getByTestId('sound-table.play.1').click();
    expect(
      (await app.soundsPlayedIn('ui')).map((p) => p.id),
      browserName,
    ).toEqual([3, 0]);
    expect(errors).toEqual([]);
  });
});
