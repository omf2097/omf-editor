// The SOUNDS.DAT bank and Web Audio playback (spec 23). Samples are unsigned
// 8-bit mono. Sounds belong to a group: UI previews and playback `s` tags are
// stopped separately, so pausing an animation does not cut a preview.

import { ref, shallowRef } from 'vue';
import { pitchedSampleRate, readSounds, soundSampleRate, type Sound } from '@omf/formats';
import { getCachedFile, getSetting, setCachedFile, setSetting } from '../lib/db';
import { pickFile } from '../lib/files';
import { clamp } from '../lib/util';
import { errorMessage, useToasts } from './useToasts';

/** Per-play options, as the `l`, `sf` and `sb` tags give them (openomf player.c). */
export interface PlayOptions {
  /** 0..127, default 127 (`l` × 2). */
  volume?: number;
  /** −100..100 (`sb`). */
  panning?: number;
  /** `sf` pitch; see pitchedSampleRate. */
  pitch?: number;
}

/** `ui`: preview buttons. `playback`: `s` tags during animation playback. Stopped separately. */
export type SoundGroup = 'ui' | 'playback';

export interface PlayedSound {
  id: number;
  rate: number;
  volume: number;
  panning: number;
  group: SoundGroup;
}

const toasts = useToasts();
const sounds = shallowRef<Sound[] | null>(null);
const sourceName = ref<string | null>(null);
/** Play `s` tags while animations play back. */
const playbackSound = ref(true);
let playbackSoundTouched = false;
/** SOUNDS.DAT index of the sound a preview button is playing, for button state. */
const playingId = ref<number | null>(null);
/** Every sound started, newest last (test hook; capped). */
const played: PlayedSound[] = [];

let ctx: AudioContext | null = null;
/** Pending resume started from a user gesture; sounds wait for it. */
let resuming: Promise<void> | null = null;
const active: Record<SoundGroup, Set<AudioBufferSourceNode>> = {
  ui: new Set(),
  playback: new Set(),
};
/** Bumped by stop(group) so sounds still waiting for a resume are dropped. */
const epoch: Record<SoundGroup, number> = { ui: 0, playback: 0 };
const buffers = new WeakMap<Sound, AudioBuffer>();

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

/** True during (or just after) a click or key press: the only time audio may be unlocked. */
const inGesture = (): boolean =>
  (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ??
  true;

/**
 * Lets audio start. Call from a user gesture (a click or key press): browsers
 * keep an AudioContext suspended until then.
 */
function unlock(): void {
  if (!inGesture()) return;
  const ac = context();
  if (!ac || ac.state !== 'suspended' || resuming) return;
  resuming = ac
    .resume()
    .catch(() => undefined)
    .finally(() => {
      resuming = null;
    });
}

async function loadBytes(name: string, bytes: Uint8Array, persist = true): Promise<boolean> {
  try {
    sounds.value = readSounds(bytes);
    sourceName.value = name;
    if (persist) await setCachedFile('sounds', name, bytes);
    return true;
  } catch (e) {
    toasts.error(`${name} is not a SOUNDS.DAT: ${errorMessage(e)}`);
    return false;
  }
}

async function load(): Promise<boolean> {
  const p = await pickFile([
    { description: 'SOUNDS.DAT', accept: { 'application/octet-stream': ['.dat', '.DAT'] } },
  ]);
  return p ? loadBytes(p.name, p.bytes) : false;
}

function forgetCache(): Promise<void> {
  return setCachedFile('sounds', '', new Uint8Array(0));
}

function clear(): Promise<void> {
  stop();
  sounds.value = null;
  sourceName.value = null;
  return forgetCache();
}

let restored = false;
async function restore(): Promise<void> {
  if (restored) return;
  restored = true;
  const saved = await getSetting('playbackSound', true);
  // A toggle made while the setting was loading wins.
  if (!playbackSoundTouched) playbackSound.value = saved;
  const f = await getCachedFile('sounds');
  if (f && f.bytes.length > 0 && !sounds.value) {
    // An unreadable cached copy is dropped so the error is not shown on every start.
    if (!(await loadBytes(f.name, f.bytes, false))) await forgetCache();
  }
}

function setPlaybackSound(v: boolean): void {
  playbackSoundTouched = true;
  playbackSound.value = v;
  if (!v) stop('playback');
  void setSetting('playbackSound', v);
}

/** Sound at SOUNDS.DAT index `id`, or null when missing or empty. */
function get(id: number): Sound | null {
  const s = sounds.value?.[id];
  return s && s.data.length > 0 ? s : null;
}

/** Rate the AudioBuffer is created at: one every browser accepts. */
const bufferRate = (rate: number): number => clamp(rate, 8000, 96000);

function bufferOf(ac: AudioContext, s: Sound): AudioBuffer {
  let buf = buffers.get(s);
  if (!buf) {
    buf = ac.createBuffer(1, s.data.length, bufferRate(soundSampleRate(s.freqKey)));
    const ch = buf.getChannelData(0);
    for (let i = 0; i < s.data.length; i++) ch[i] = (s.data[i]! - 128) / 128;
    buffers.set(s, buf);
  }
  return buf;
}

function start(ac: AudioContext, id: number, s: Sound, p: PlayedSound): void {
  const buf = bufferOf(ac, s);
  const src = ac.createBufferSource();
  src.buffer = buf;
  // The buffer holds the sound at its own (clamped) rate; pitch and clamping go through playbackRate.
  src.playbackRate.value = p.rate / buf.sampleRate;
  const gain = ac.createGain();
  gain.gain.value = p.volume / 127;
  const pan = ac.createStereoPanner();
  pan.pan.value = p.panning / 100;
  src.connect(gain).connect(pan).connect(ac.destination);
  const set = active[p.group];
  set.add(src);
  if (p.group === 'ui') playingId.value = id;
  src.onended = () => {
    set.delete(src);
    if (p.group === 'ui' && set.size === 0) playingId.value = null;
  };
  src.start();
}

/**
 * Plays SOUNDS.DAT entry `id`. Returns false when there is nothing to play or
 * audio is still locked (no user gesture yet): such sounds are dropped, not
 * queued, so they cannot all start at once on the first click.
 */
function play(id: number, o: PlayOptions = {}, group: SoundGroup = 'ui'): boolean {
  const s = get(id);
  if (!s) return false;
  if (group === 'ui') unlock();
  const ac = context();
  if (ac && ac.state !== 'running' && !resuming) return false;
  const p: PlayedSound = {
    id,
    rate: pitchedSampleRate(soundSampleRate(s.freqKey), o.pitch ?? 0),
    volume: clamp(o.volume ?? 127, 0, 127),
    panning: clamp(o.panning ?? 0, -100, 100),
    group,
  };
  played.push(p);
  if (played.length > 100) played.shift();
  if (!ac) return true;
  if (ac.state === 'running') start(ac, id, s, p);
  else {
    const at = epoch[group];
    void resuming!.then(() => {
      if (epoch[group] === at && ac.state === 'running') start(ac, id, s, p);
    });
  }
  return true;
}

/** Stops one group, or everything. */
function stop(group?: SoundGroup): void {
  for (const g of group ? [group] : (['ui', 'playback'] as const)) {
    epoch[g]++;
    for (const s of active[g]) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    active[g].clear();
    if (g === 'ui') playingId.value = null;
  }
}

export function useSounds() {
  return {
    sounds,
    sourceName,
    playbackSound,
    playingId,
    played,
    load,
    loadBytes,
    clear,
    restore,
    setPlaybackSound,
    get,
    play,
    stop,
    unlock,
  };
}
