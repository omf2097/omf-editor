<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../Icon.vue';
import { usePlayback } from '../../composables/usePlayback';
import { usePlaybackShortcuts } from '../../composables/useSceneShortcuts';
import { tickPosAtFrame } from '@omf/formats';

// `slim` is the fullscreen preview's bar (spec 12 §9): transport, scrubber and
// frame label only. The page's own bar stays mounted under the fullscreen
// preview and keeps the playback keys, so the slim one registers none.
const props = withDefaults(defineProps<{ showHold?: boolean; slim?: boolean; testid?: string }>(), {
  showHold: false,
  slim: false,
  testid: 'playback',
});
const pb = usePlayback();
if (!props.slim) usePlaybackShortcuts();

const frames = computed(() => pb.script.value.frames);

/** "Frame 2/3 · B4 · 112 ms" for frame `i`. */
function labelOf(i: number): string {
  const n = frames.value.length;
  const f = frames.value[i];
  const head = `Frame ${n ? i + 1 : 0}/${n}`;
  return f ? `${head} · ${f.key}${f.duration} · ${f.duration * pb.ms.value} ms` : head;
}
/**
 * The label is at least as wide as the longest one of the animation (a
 * monospaced font; 2 ch spare for the separators, which the font may lack),
 * so playing does not change the bar's width: that would ripple into the
 * layout and resize the preview on every frame.
 */
const labelCh = computed(() =>
  Math.max(
    leadLabel(lead.value).length,
    2 + Math.max(0, ...frames.value.map((_, i) => labelOf(i).length)),
  ),
);
/** Ticks the paired enemy-string preview runs the attacker before the opponent starts. */
const lead = computed(() => pb.enemy.value?.lead ?? 0);
/** "Lead-in 3/12": tick `n` of the lead-in. */
const leadLabel = (n: number): string => `Lead-in ${n}/${lead.value}`;
const label = computed(() =>
  pb.state.value.preroll
    ? leadLabel(pb.state.value.tick - pb.minTick.value + 1)
    : labelOf(pb.state.value.frameIndex),
);
const boundaries = computed(() => frames.value.map((_, i) => tickPosAtFrame(pb.script.value, i)));

/** Where tick `t` sits on the scrubber, which starts at minTick (a paired lead-in). */
function scrubPercent(t: number): number {
  const span = pb.total.value - 1 - pb.minTick.value;
  return span > 0 ? ((t - pb.minTick.value) / span) * 100 : 0;
}
function onScrub(e: Event): void {
  pb.pause();
  pb.seekTick(Number((e.target as HTMLInputElement).value));
}
function toggleHold(): void {
  // Nothing to hold during a lead-in (no frame of the string yet).
  if (pb.holdFrame.value === null && pb.state.value.frameIndex < 0) return;
  pb.holdFrame.value = pb.holdFrame.value === null ? pb.state.value.frameIndex : null;
}
</script>

<template>
  <div class="d-flex align-items-center gap-1 flex-wrap mt-1" :data-testid="testid">
    <div class="btn-group btn-group-sm">
      <button
        class="btn btn-outline-secondary"
        aria-label="First frame"
        :data-testid="`${testid}.first`"
        @click="pb.seekStart()"
      >
        <Icon name="first" />
      </button>
      <button
        class="btn btn-outline-secondary"
        aria-label="Previous frame"
        :data-testid="`${testid}.prev`"
        @click="pb.stepFrame(-1)"
      >
        <Icon name="prev" />
      </button>
      <button
        class="btn btn-outline-primary"
        :aria-label="pb.playing.value ? 'Pause' : 'Play'"
        :data-testid="`${testid}.toggle`"
        @click="pb.toggle()"
      >
        <Icon :name="pb.playing.value ? 'pause' : 'play'" />
      </button>
      <button
        class="btn btn-outline-secondary"
        aria-label="Next frame"
        :data-testid="`${testid}.next`"
        @click="pb.stepFrame(1)"
      >
        <Icon name="next" />
      </button>
      <button
        class="btn btn-outline-secondary"
        aria-label="Last frame"
        :data-testid="`${testid}.last`"
        @click="pb.seekFrame(frames.length - 1)"
      >
        <Icon name="last" />
      </button>
      <button
        v-if="!slim"
        class="btn"
        :class="pb.loop.value ? 'btn-secondary' : 'btn-outline-secondary'"
        aria-label="Loop"
        :aria-pressed="pb.loop.value"
        :data-testid="`${testid}.loop`"
        @click="pb.loop.value = !pb.loop.value"
      >
        <Icon name="loop" />
      </button>
      <button
        v-if="showHold && !slim"
        class="btn"
        :class="pb.holdFrame.value !== null ? 'btn-warning' : 'btn-outline-secondary'"
        title="Loop this frame"
        :aria-pressed="pb.holdFrame.value !== null"
        :data-testid="`${testid}.hold`"
        @click="toggleHold"
      >
        <Icon name="hold" />
      </button>
    </div>
    <div class="position-relative flex-grow-1" style="min-width: 8rem">
      <input
        type="range"
        class="form-range"
        :min="pb.minTick.value"
        :max="Math.max(pb.minTick.value, pb.total.value - 1)"
        :value="pb.state.value.tick"
        aria-label="Tick"
        :data-testid="`${testid}.scrub`"
        @input="onScrub"
      />
      <span
        v-for="(b, i) in boundaries"
        :key="i"
        class="position-absolute bg-secondary"
        style="top: 2px; width: 1px; height: 6px; opacity: 0.6"
        :style="{ left: `${scrubPercent(b)}%` }"
      />
    </div>
    <span
      class="mono small text-nowrap"
      :style="{ minWidth: `${labelCh}ch` }"
      :data-testid="`${testid}.label`"
    >
      {{ label }}
    </span>
    <slot />
    <select
      v-if="!slim"
      v-model="pb.timing.value"
      class="form-select form-select-sm"
      style="width: auto"
      aria-label="Timing"
      :data-testid="`${testid}.timing`"
    >
      <option value="arena">Arena</option>
      <option value="static">Static (10 ms)</option>
    </select>
    <label
      v-if="!slim && pb.timing.value === 'arena'"
      class="d-flex align-items-center gap-1 small"
      title="Game speed 0–10; 5 = 48 ms per tick"
    >
      speed
      <input
        v-model.number="pb.speed.value"
        type="range"
        min="0"
        max="10"
        class="form-range"
        style="width: 5rem"
        :data-testid="`${testid}.speed`"
      />
      <span class="mono">{{ pb.speed.value }}</span>
    </label>
  </div>
</template>
