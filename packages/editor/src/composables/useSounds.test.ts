import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeSounds } from '@omf/formats';

// Settings and cached files come back only when the test releases them.
const pending: { setting?: () => void; file?: () => void } = {};
const store = {
  playbackSound: true as unknown,
  file: undefined as { name: string; bytes: Uint8Array } | undefined,
};
const cachedWrites: { key: string; name: string; length: number }[] = [];
vi.mock('../lib/db', () => ({
  getSetting: (key: string, fallback: unknown) =>
    new Promise((res) => {
      pending.setting = () => res(key === 'playbackSound' ? store.playbackSound : fallback);
    }),
  setSetting: vi.fn(async () => undefined),
  getCachedFile: () =>
    new Promise((res) => {
      pending.file = () => res(store.file);
    }),
  setCachedFile: vi.fn(async (key: string, name: string, bytes: Uint8Array) => {
    cachedWrites.push({ key, name, length: bytes.length });
  }),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('useSounds restore', () => {
  beforeEach(() => {
    vi.resetModules();
    cachedWrites.length = 0;
  });

  it('a toggle made while settings load is kept', async () => {
    store.playbackSound = true;
    store.file = undefined;
    const { useSounds } = await import('./useSounds');
    const s = useSounds();
    const done = s.restore();
    s.setPlaybackSound(false);
    pending.setting!();
    await flush();
    pending.file!();
    await done;
    expect(s.playbackSound.value).toBe(false);
  });

  it('the saved setting applies when nothing was toggled', async () => {
    store.playbackSound = false;
    store.file = undefined;
    const { useSounds } = await import('./useSounds');
    const s = useSounds();
    const done = s.restore();
    pending.setting!();
    await flush();
    pending.file!();
    await done;
    expect(s.playbackSound.value).toBe(false);
  });

  it('restores a cached bank, and drops an unreadable one', async () => {
    store.file = {
      name: 'SOUNDS.DAT',
      bytes: writeSounds([{ freqKey: 131, data: new Uint8Array(4) }]),
    };
    let { useSounds } = await import('./useSounds');
    let s = useSounds();
    let done = s.restore();
    pending.setting!();
    await flush();
    pending.file!();
    await done;
    expect(s.sounds.value).toHaveLength(1);
    expect(s.sourceName.value).toBe('SOUNDS.DAT');
    expect(cachedWrites).toEqual([]);

    vi.resetModules();
    store.file = { name: 'SOUNDS.DAT', bytes: new Uint8Array([9, 9, 9, 9]) };
    ({ useSounds } = await import('./useSounds'));
    s = useSounds();
    done = s.restore();
    pending.setting!();
    await flush();
    pending.file!();
    await done;
    expect(s.sounds.value).toBeNull();
    expect(cachedWrites).toEqual([{ key: 'sounds', name: '', length: 0 }]);
  });

  it('without Web Audio, play still reports what it would play', async () => {
    store.file = undefined;
    const { useSounds } = await import('./useSounds');
    const s = useSounds();
    await s.loadBytes(
      'x',
      writeSounds([
        { freqKey: 131, data: new Uint8Array(4) },
        { freqKey: 0, data: new Uint8Array(0) },
      ]),
      false,
    );
    // out-of-range options clamp like openomf: pitch −20, volume 127, pan −100
    expect(s.play(0, { volume: 300, panning: -200, pitch: -50 })).toBe(true);
    expect(s.played.at(-1)).toEqual({ id: 0, rate: 4800, volume: 127, panning: -100, group: 'ui' });
    expect(s.play(1)).toBe(false); // empty entry
    expect(s.play(7)).toBe(false); // past the end
  });
});
