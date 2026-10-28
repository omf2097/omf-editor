// Test hooks for Playwright (spec 17 §1). Installed only in dev and test builds.

import { useDocument } from '../composables/useDocument';
import { usePalette } from '../composables/usePalette';
import { usePlayback } from '../composables/usePlayback';
import { useSounds } from '../composables/useSounds';
import { useAutosave } from '../composables/useAutosave';
import { useOpponent } from '../composables/useOpponent';
import { fileAccess } from './files';
import { animationsOf, serializeDocument } from './doc';
import { decodedOf } from '../canvas/render';
import { resolveSharedImages } from '@omf/formats';
import { router } from '../router';

export function installTestHooks(): void {
  const document = useDocument();
  const palette = usePalette();
  const playback = usePlayback();
  const sounds = useSounds();
  const hooks = {
    /** Current document serialised, as a plain number array. */
    bytes: (): number[] | null => {
      const d = document.doc.value;
      return d ? Array.from(serializeDocument(d)) : null;
    },
    open: (name: string, bytes: number[]) => {
      document.openBytes(name, Uint8Array.from(bytes));
    },
    /** Navigates and resolves once the route (and its lazy view) is in place. */
    navigate: async (path: string): Promise<void> => {
      await router.push(path);
    },
    loadPaletteSource: (name: string, bytes: number[]) =>
      palette.loadSourceBytes(name, Uint8Array.from(bytes)),
    loadAltPals: (name: string, bytes: number[]) =>
      palette.loadAltPalsBytes(name, Uint8Array.from(bytes)),
    /** Loads an AF as the enemy string's opponent (spec 15 §6.1). */
    loadOpponent: (name: string, bytes: number[]) =>
      useOpponent().loadBytes(name, Uint8Array.from(bytes)),
    /** The enemy-string preview: the string openomf plays and the paired timing. */
    enemy: () => {
      const e = playback.enemy.value;
      return e
        ? { text: e.effective.text, plain: e.plain, timing: e.timing, start: e.start, lead: e.lead }
        : null;
    },
    loadSounds: (name: string, bytes: number[]) => sounds.loadBytes(name, Uint8Array.from(bytes)),
    /** Sounds started so far: SOUNDS.DAT index, sample rate, volume and panning. */
    soundsPlayed: () => sounds.played.map(({ group: _g, ...p }) => p),
    soundsPlayedIn: (group: 'ui' | 'playback') =>
      sounds.played.filter((p) => p.group === group).map(({ group: _g, ...p }) => p),
    lut: (): number[] => Array.from(palette.lut.value),
    /** Steps like user playback: frame-entry sounds play. */
    stepTicks: (n: number) => playback.stepTicks(n, { audible: true }),
    playback: () => ({
      ...playback.state.value,
      ms: playback.ms.value,
      total: playback.total.value,
      playing: playback.playing.value,
    }),
    dirty: () => document.dirty.value,
    /** Writes the autosave snapshot now instead of waiting for the timer. */
    snapshot: () => useAutosave().snapshotNow(),
    /** Decoded sprite: width, height, pixels (256 = transparent), and its header fields. */
    sprite: (animId: number, index: number) => {
      const d = document.doc.value;
      const a = d ? animationsOf(d).get(animId) : undefined;
      const s = a?.sprites[index];
      if (!d || !s) return null;
      const dec = decodedOf(s, resolveSharedImages(animationsOf(d).values()).get(s));
      return {
        width: dec.width,
        height: dec.height,
        pixels: Array.from(dec.pixels),
        posX: s.posX,
        posY: s.posY,
        missing: s.missing,
        index: s.index,
        imageLen: s.image.length,
      };
    },
    /** Raw animation fields useful in tests. */
    animation: (animId: number) => {
      const d = document.doc.value;
      const a = d ? animationsOf(d).get(animId) : undefined;
      return a
        ? {
            baseString: a.baseString,
            enemyString: 'enemyString' in a ? a.enemyString : null,
            extraStrings: [...a.extraStrings],
            hitCoords: a.hitCoords.map((c) => ({ ...c })),
            sprites: a.sprites.length,
          }
        : null;
    },
    historyLength: () => document.historyLength(),
    /**
     * One undoable edit of sound table slot `i`, as the File view's field
     * makes it ("set sound i"), without the UI round trip.
     */
    setSound: (i: number, value: number) =>
      document.mutate(`set sound ${i}`, (d) => {
        d.soundTable[i] = value;
      }),
    undo: () => document.undo(),
    useFallbackFileAccess: () => {
      fileAccess.useNativePicker = false;
    },
    /** RGBA of a logical scene pixel on the main scene canvas. */
    sample: (x: number, y: number, testid = 'scene-canvas'): number[] | null => {
      const c = window.document.querySelector<HTMLCanvasElement>(`[data-testid="${testid}"]`);
      const ctx = c?.getContext('2d');
      return ctx ? Array.from(ctx.getImageData(x, y, 1, 1).data) : null;
    },
  };
  (window as unknown as { __omf: { testHooks: typeof hooks } }).__omf = { testHooks: hooks };
}
