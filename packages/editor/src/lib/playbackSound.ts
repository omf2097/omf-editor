// Plays `s` tags while an animation plays back, as openomf player.c does.

import { watch } from 'vue';
import { AF_OVERRIDDEN_SOUND_SLOTS, soundForSlot, tagValue, type Frame } from '@omf/formats';
import { useDocument } from '../composables/useDocument';
import { usePlayback } from '../composables/usePlayback';
import { useSounds, type PlayOptions } from '../composables/useSounds';
import { animationsOf } from './doc';
import { animationOrigin } from './scene';

/** Half the 320-pixel scene width: the x position that pans to the centre. */
const CENTRE_X = 160;

/**
 * `l` (volume, half scale), `sb` (panning) and `sf` (pitch) of frame `f`.
 * Without `sb` the game pans by the object's x position in the scene.
 */
function playOptions(f: Frame, x: number): PlayOptions {
  const l = tagValue(f, 'l');
  const sb = tagValue(f, 'sb');
  const sf = tagValue(f, 'sf');
  return {
    volume: typeof l === 'number' ? l * 2 : undefined,
    panning: typeof sb === 'number' ? sb : Math.trunc(((x - CENTRE_X) * 100) / CENTRE_X),
    pitch: typeof sf === 'number' ? sf : undefined,
  };
}

/** Hooks sound playback to usePlayback's frame entries and cuts; call once. */
export function installPlaybackSound(): void {
  const docs = useDocument();
  const playback = usePlayback();
  const sounds = useSounds();

  /** SOUNDS.DAT index the frame's `s` tag plays, or null for none. */
  function soundOf(f: Frame | undefined): number | null {
    const d = docs.doc.value;
    const slot = f ? tagValue(f, 's') : undefined;
    if (!d || typeof slot !== 'number') return null;
    // openomf clears these slots when it loads an AF.
    if (docs.kind.value === 'af' && AF_OVERRIDDEN_SOUND_SLOTS.includes(slot)) return null;
    const id = soundForSlot(d.soundTable, slot);
    return id < 0 ? null : id;
  }

  /** The object's x in the scene: the animation's origin plus the simulated offset. */
  function sceneX(offsetX: number): number {
    const d = docs.doc.value!;
    const id = playback.animId.value;
    const a = id === null ? undefined : animationsOf(d).get(id);
    return (a ? animationOrigin(docs.kind.value ?? 'af', a).x : CENTRE_X) + offsetX;
  }

  // play() runs in the user's click or key press: unlock audio in that same gesture,
  // before the first frame's sound is requested.
  watch(playback.audible, (on) => on && sounds.unlock(), { flush: 'sync' });
  playback.onCut(() => sounds.stop('playback'));
  playback.onFrameEnter((i, st) => {
    if (!sounds.playbackSound.value || !sounds.sounds.value) return;
    const f = playback.script.value.frames[i];
    const id = soundOf(f);
    if (id === null) return;
    sounds.play(id, playOptions(f!, sceneX(st.x)), 'playback');
  });
}
