// Animation playback shared by every preview (spec 15 §5). One Simulator runs
// the bound animation's script (the working copy while it is being typed),
// stepped from requestAnimationFrame at the tick length of the chosen timing.

import { computed, ref, shallowRef, watch } from 'vue';
import {
  msPerTick,
  tickPosAtFrame,
  totalTicks,
  tryDecodeScript,
  type Script,
  type TimingKind,
} from '@omf/formats';
import { animationsOf } from '../lib/doc';
import { Simulator, type SimState } from '../lib/simulate';
import { useDocument } from './useDocument';
import { useViewport } from './useViewport';
import { useWorkingScript, type ScriptTarget } from './useWorkingScript';
import { useOpponent, type EnemyPlan } from './useOpponent';
import { lastAnimationId } from './useSelection';
import { getSetting, setSetting } from '../lib/db';
import { clamp } from '../lib/util';

const { kind, doc, generation } = useDocument();
const { toggles } = useViewport();
const { textFor } = useWorkingScript();
const opponent = useOpponent();

const playing = ref(false);
const loop = ref(true);
const timing = ref<TimingKind>('arena');
const speed = ref(5);
/** Frame index to repeat ("loop this frame"), or null. */
const holdFrame = ref<number | null>(null);
/** Which string plays: the base string, an extra string index or the enemy string. */
const source = ref<ScriptTarget>('base');
/** The animation playback is bound to (see bind()); null when no view shows one. */
const animId = ref<number | null>(null);

/**
 * The enemy string plays on the opponent: openomf's variant of it, alone or
 * after the attacker's lead-in (useOpponent). Null for the other strings.
 */
const enemy = computed<EnemyPlan | null>(() =>
  source.value === 'enemy' ? opponent.planFor(animId.value) : null,
);
/** The played object faces left: the opponent faces the attacker, so it is mirrored. */
const facingLeft = computed(() => (source.value === 'enemy' ? !toggles.flip : toggles.flip));

/** First scrubber tick: negative while the paired preview has a lead-in before a hit. */
const minTick = computed(() => (enemy.value ? enemy.value.start - enemy.value.lead : 0));

const scriptText = computed(() => {
  if (animId.value === null || !doc.value) return '';
  if (source.value === 'enemy') return enemy.value?.effective.text ?? '';
  return textFor(animId.value, source.value);
});
const script = computed<Script>(() => tryDecodeScript(scriptText.value).script ?? { frames: [] });
const total = computed(() => totalTicks(script.value));
const ms = computed(() => msPerTick(timing.value, speed.value));

const sim = shallowRef<Simulator>(
  new Simulator({ frames: [] }, { direction: 1, loop: true, hold: null }),
);
const state = shallowRef<SimState>(sim.value.state);
const elapsed = ref(0);

/** New simulator for the current script and options; `keep` stays on the current script tick. */
function rebuild(keep = true): void {
  const at = keep ? sim.value.state.tick : null;
  const e = enemy.value;
  const s = new Simulator(script.value, {
    direction: facingLeft.value ? -1 : 1,
    loop: loop.value,
    hold: holdFrame.value,
    start: e?.start ?? 0,
    lead: e?.lead ?? 0,
    enemyAt: e?.enemyAt ?? null,
  });
  if (at !== null && at !== s.state.tick) s.seekTo(at);
  sim.value = s;
  publish();
}

/** Copies the simulator's (mutable) state into the reactive refs. */
function publish(): void {
  state.value = { ...sim.value.state };
  elapsed.value = sim.value.state.elapsed;
}

/** Extra strings of the bound animation. */
const extraCount = computed(() => {
  const a =
    animId.value === null || !doc.value ? undefined : animationsOf(doc.value).get(animId.value);
  return a?.extraStrings.length ?? 0;
});

// A new document starts with playback stopped on the base string.
watch(
  generation,
  () => {
    pause();
    holdFrame.value = null;
    source.value = 'base';
  },
  { flush: 'sync' },
);
// The extra string being played no longer exists (undo of "add extra string"),
// or the enemy string has no move to belong to: play the base string, so edits
// never go to a missing string.
watch(
  () =>
    (typeof source.value === 'number' && source.value >= extraCount.value) ||
    (source.value === 'enemy' && kind.value !== 'af'),
  (gone) => {
    if (gone) source.value = 'base';
  },
  { flush: 'sync' },
);
// A new enemy plan (pairing, its timing, distance, attacker edits) changes the
// opponent's simulation too: enemyAt is new with every plan.
watch([script, loop, holdFrame, facingLeft, () => enemy.value?.enemyAt], () => rebuild(true));
// Pairing on or off, or another hit frame: start over, at the beginning of the lead-in.
watch([() => enemy.value?.start, () => enemy.value?.lead], () => rebuild(false));
// Synchronous, so a seek right after switching animation or string is not undone.
watch([animId, source, generation], () => rebuild(false), { flush: 'sync' });
// Playback of a script that became empty stops.
watch(total, (t) => {
  if (t === 0 && playing.value) pause();
});
watch(kind, (k) => {
  if (k) timing.value = k === 'af' ? 'arena' : 'static';
});

/**
 * True while playback the user started is running: frame-entry effects with
 * side effects outside the canvas (sounds) only happen then. Autoplay,
 * pausing, seeking and switching animations clear it.
 */
const audible = ref(false);

type EnterListener = (frameIndex: number, state: SimState) => void;
const enterListeners = new Set<EnterListener>();
/** Called for every frame entered while audible ticks advance (not on seeks). */
function onFrameEnter(f: EnterListener): () => void {
  enterListeners.add(f);
  return () => enterListeners.delete(f);
}
const cutListeners = new Set<() => void>();
/** Called when playback jumps or stops (pause, seek, another animation): cut running sounds. */
function onCut(f: () => void): () => void {
  cutListeners.add(f);
  return () => cutListeners.delete(f);
}
function cut(): void {
  for (const f of cutListeners) f();
}
function emitEnter(st: SimState): void {
  if (audible.value) for (const f of enterListeners) f(st.frameIndex, st);
}
function advance(): void {
  const prev = sim.value.state.frameIndex;
  sim.value.step();
  const st = sim.value.state;
  // A held frame wrapping to its own start is not a new entry for sounds.
  const holdWrap = holdFrame.value !== null && st.frameIndex === prev && prev === holdFrame.value;
  if (st.entered && !st.finished && !holdWrap) emitEnter(st);
}

let raf = 0;
/** requestAnimationFrame time of the previous loop iteration. */
let last = 0;
/** Milliseconds not yet turned into ticks; capped per frame so a background tab does not race. */
let acc = 0;

function frameLoop(now: number): void {
  if (!playing.value) return;
  if (total.value === 0) return pause();
  acc += Math.min(250, now - last);
  last = now;
  let stepped = false;
  while (acc >= ms.value) {
    acc -= ms.value;
    advance();
    stepped = true;
    if (sim.value.state.finished) {
      playing.value = false;
      break;
    }
  }
  if (stepped) publish();
  if (playing.value) raf = requestAnimationFrame(frameLoop);
}

/**
 * Starts playback. `silent` is for playback the user did not ask for (a view
 * opening): no sounds. Otherwise call it from a user gesture.
 */
function play(opts: { silent?: boolean } = {}): void {
  if (playing.value || total.value === 0) return;
  if (sim.value.state.finished) rebuild(false);
  audible.value = !opts.silent;
  // Starting on a frame's first tick (the start, or a frame picked in the UI) enters it.
  const st = sim.value.state;
  if (st.frameIndex >= 0 && st.tick === tickPosAtFrame(script.value, st.frameIndex)) emitEnter(st);
  playing.value = true;
  last = performance.now();
  acc = 0;
  raf = requestAnimationFrame(frameLoop);
}

function pause(): void {
  playing.value = false;
  audible.value = false;
  cancelAnimationFrame(raf);
  cut();
}

/** Advances exactly `n` ticks (test hook). `audible` makes it act like user playback. */
function stepTicks(n = 1, opts: { audible?: boolean } = {}): void {
  if (opts.audible !== undefined) audible.value = opts.audible;
  for (let i = 0; i < n; i++) advance();
  publish();
}

/**
 * Puts playback on script tick `t` (a scrubber position), directly: hold and
 * `d` loops do not stop it from being reached.
 */
function seekTick(t: number): void {
  cut();
  sim.value.seekTo(t);
  publish();
}

/** Jumps to the first tick of frame i (pauses playback). */
function seekFrame(i: number): void {
  pause();
  const frames = script.value.frames;
  if (frames.length === 0) return;
  seekTick(tickPosAtFrame(script.value, clamp(i, 0, frames.length - 1)));
}

/** The start: the first frame, or the start of the paired preview's lead-in (pauses). */
function seekStart(): void {
  pause();
  seekTick(minTick.value);
}

function stepFrame(delta: 1 | -1): void {
  const n = script.value.frames.length;
  if (n === 0) return;
  seekFrame((state.value.frameIndex + delta + n) % n);
}

let restored = false;
async function restore(): Promise<void> {
  if (restored) return;
  restored = true;
  speed.value = await getSetting('arenaSpeed', 5);
  watch(speed, (v) => void setSetting('arenaSpeed', v));
}

export function usePlayback() {
  return {
    playing,
    audible,
    loop,
    timing,
    speed,
    holdFrame,
    source,
    animId,
    script,
    scriptText,
    enemy,
    facingLeft,
    minTick,
    total,
    ms,
    state,
    elapsed,
    frameIndex: computed(() => state.value.frameIndex),
    play,
    pause,
    toggle: () => (playing.value ? pause() : play()),
    stepTicks,
    seekTick,
    seekFrame,
    seekStart,
    stepFrame,
    reset: () => rebuild(false),
    restore,
    onFrameEnter,
    onCut,
    /** Binds playback to the animation shown by the current view. */
    bind(id: number | null) {
      if (animId.value !== id) {
        pause();
        animId.value = id;
        holdFrame.value = null;
        source.value = 'base';
      }
      if (id !== null) lastAnimationId.value = id;
    },
  };
}
