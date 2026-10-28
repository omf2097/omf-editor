import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { FIXTURES } from './fixtures/build';
import { useFakeAudio } from './fakeAudio';

export { expect };

export const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(FIXTURES, name)));
export const fixturePath = (name: string): string => join(FIXTURES, name);

interface Hooks {
  bytes(): number[] | null;
  open(name: string, bytes: number[]): void;
  navigate(path: string): Promise<void>;
  loadPaletteSource(name: string, bytes: number[]): Promise<boolean>;
  loadAltPals(name: string, bytes: number[]): Promise<boolean>;
  loadSounds(name: string, bytes: number[]): Promise<boolean>;
  loadOpponent(name: string, bytes: number[]): boolean;
  enemy(): {
    text: string;
    plain: 'ua' | 'throw' | null;
    timing: { frame: number; throw: boolean; attackerStart: number; enemyStart: number } | null;
    start: number;
    lead: number;
  } | null;
  soundsPlayed(): { id: number; rate: number; volume: number; panning: number }[];
  soundsPlayedIn(
    group: 'ui' | 'playback',
  ): { id: number; rate: number; volume: number; panning: number }[];
  lut(): number[];
  stepTicks(n: number): void;
  playback(): {
    frameIndex: number;
    tick: number;
    x: number;
    y: number;
    flipX: boolean;
    preroll: boolean;
    ms: number;
    total: number;
    playing: boolean;
  };
  dirty(): boolean;
  snapshot(): Promise<void>;
  useFallbackFileAccess(): void;
  sample(x: number, y: number, testid?: string): number[] | null;
  sprite(
    animId: number,
    index: number,
  ): {
    width: number;
    height: number;
    pixels: number[];
    posX: number;
    posY: number;
    missing: boolean;
    index: number;
    imageLen: number;
  } | null;
  animation(animId: number): {
    baseString: string;
    enemyString: string | null;
    extraStrings: string[];
    hitCoords: { x: number; y: number; spriteId: number; null: number }[];
    sprites: number;
  } | null;
  historyLength(): number;
  setSound(i: number, value: number): void;
  undo(): void;
}

/** Every test runs with requests outside the app's origin failing (spec 17 §3.13). */
export const test = base.extend<{ app: App; realAudio: boolean; silentAudio: void }>({
  /**
   * Every test gets a stand-in AudioContext (e2e/fakeAudio.ts), so nothing is
   * sent to the audio device. A test that needs the real Web Audio API opts in
   * with test.use({ realAudio: true }); the browsers are muted in playwright.config.ts.
   */
  realAudio: [false, { option: true }],
  silentAudio: [
    async ({ page, realAudio }, use) => {
      if (!realAudio) await useFakeAudio(page);
      await use();
    },
    { auto: true },
  ],
  app: async ({ page, baseURL }, use) => {
    const foreign: string[] = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(baseURL!) || url.startsWith('data:') || url.startsWith('blob:'))
        return route.continue();
      foreign.push(url);
      return route.abort();
    });
    const app = new App(page);
    await use(app);
    expect(foreign, 'no requests outside the app origin').toEqual([]);
  },
});

export class App {
  constructor(readonly page: Page) {}

  async goto(hash = '/'): Promise<void> {
    await this.page.goto(`./#${hash}`);
    await this.ready();
  }

  /**
   * Waits for the test hooks (installed once the router's first navigation is
   * done) and selects the fallback file access again: a reload resets it.
   */
  async ready(): Promise<void> {
    await this.page.waitForFunction(() => (window as unknown as { __omf?: unknown }).__omf);
    await this.page.evaluate(() =>
      (
        window as unknown as { __omf: { testHooks: Hooks } }
      ).__omf.testHooks.useFallbackFileAccess(),
    );
  }

  hooks<T>(fn: (h: Hooks, arg: never) => T, arg?: unknown): Promise<T> {
    return this.page.evaluate(
      ([src, a]) => {
        const h = (window as unknown as { __omf: { testHooks: Hooks } }).__omf.testHooks;
        return new Function('h', 'a', `return (${src})(h, a)`)(h, a);
      },
      [fn.toString(), arg] as const,
    ) as Promise<T>;
  }

  /** Opens a fixture through the test hook and goes to `hash`. */
  async open(name: string, hash = '/animations'): Promise<void> {
    if (this.page.url() === 'about:blank') await this.goto('/');
    else await this.ready();
    await this.hooks(
      (h, a: [string, number[]]) => h.open(a[0], a[1]),
      [name, Array.from(fixture(name))],
    );
    await this.hooks((h, path: string) => h.navigate(path), hash);
  }

  async paletteSource(name = 'arena.bk'): Promise<void> {
    await this.hooks(
      (h, a: [string, number[]]) => h.loadPaletteSource(a[0], a[1]),
      [name, Array.from(fixture(name))],
    );
  }

  async soundBank(name = 'sounds.dat'): Promise<void> {
    await this.hooks(
      (h, a: [string, number[]]) => h.loadSounds(a[0], a[1]),
      [name, Array.from(fixture(name))],
    );
  }

  /** Loads a fixture AF as the enemy string's opponent. */
  async opponent(name: string): Promise<void> {
    await this.hooks(
      (h, a: [string, number[]]) => h.loadOpponent(a[0], a[1]),
      [name, Array.from(fixture(name))],
    );
  }

  async soundsPlayed(): Promise<{ id: number; rate: number; volume: number; panning: number }[]> {
    return this.hooks((h) => h.soundsPlayed());
  }

  async soundsPlayedIn(
    group: 'ui' | 'playback',
  ): Promise<{ id: number; rate: number; volume: number; panning: number }[]> {
    return this.hooks((h, g: 'ui' | 'playback') => h.soundsPlayedIn(g), group);
  }

  async bytes(): Promise<Uint8Array> {
    return Uint8Array.from((await this.hooks((h) => h.bytes())) ?? []);
  }

  async dirty(): Promise<boolean> {
    return this.hooks((h) => h.dirty());
  }

  /** Saves through the download fallback and returns the downloaded bytes. */
  async saveDownload(trigger?: () => Promise<void>): Promise<{ name: string; bytes: Uint8Array }> {
    const [dl] = await Promise.all([
      this.page.waitForEvent('download'),
      trigger ? trigger() : this.page.getByTestId('save').click(),
    ]);
    const path = await dl.path();
    return { name: dl.suggestedFilename(), bytes: new Uint8Array(readFileSync(path)) };
  }

  /** Opens the file chooser fallback with fixture `name` (or an absolute path). */
  async chooseFile(name: string, trigger: () => Promise<void>): Promise<void> {
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), trigger()]);
    await chooser.setFiles(name.startsWith('/') ? name : fixturePath(name));
  }

  /** Waits for a download started by `trigger` and returns its temp path. */
  async download(trigger: () => Promise<void>): Promise<string> {
    const [dl] = await Promise.all([this.page.waitForEvent('download'), trigger()]);
    return dl.path();
  }

  /** Commits a text field (IntField commits on Enter/blur). */
  async setField(testid: string, value: string | number): Promise<void> {
    const f = this.page.getByTestId(testid);
    await f.fill(String(value));
    await f.press('Enter');
  }

  sprite(animId: number, index: number) {
    return this.hooks((h, a: [number, number]) => h.sprite(a[0], a[1]), [animId, index]);
  }

  animation(animId: number) {
    return this.hooks((h, a: number) => h.animation(a), animId);
  }

  async sample(x: number, y: number, testid = 'scene-canvas'): Promise<number[] | null> {
    return this.hooks(
      (h, a: [number, number, string]) => h.sample(a[0], a[1], a[2]),
      [x, y, testid],
    );
  }
}
