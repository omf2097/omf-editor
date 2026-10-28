<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import IntField from '../widgets/IntField.vue';
import Icon from '../Icon.vue';
import { ARG_MAX, ARG_MIN, type TagMeta } from '../../lib/tagMeta';
import { useDocument } from '../../composables/useDocument';
import { usePlayback } from '../../composables/usePlayback';
import { usePalette } from '../../composables/usePalette';
import { animationLabel, animationsOf } from '../../lib/doc';
import { AF_OVERRIDDEN_SOUND_SLOTS, soundDurationMs, vgaToRgb } from '@omf/formats';
import SoundPlayButton from '../sound/SoundPlayButton.vue';
import { useSounds } from '../../composables/useSounds';
import { inputValue } from '../../lib/util';

const props = defineProps<{
  value: number;
  arg: NonNullable<TagMeta['arg']>;
  testid: string;
  /** Accessible name of the value field (the effect's label). */
  label?: string;
}>();
const emit = defineEmits<{ change: [v: number] }>();
const router = useRouter();
const docs = useDocument();
const pb = usePlayback();
const palette = usePalette();
const bank = useSounds();

const min = computed(() => props.arg.min ?? ARG_MIN);
const max = computed(() => props.arg.max ?? ARG_MAX);
const suffix = computed(
  () =>
    ({ ticks: 'ticks', pixels: 'px', percent: '%', degrees: '°' })[props.arg.kind as string] ?? '',
);
const animName = computed(() => {
  const d = docs.doc.value;
  if (!d || props.arg.kind !== 'animId') return null;
  return animationsOf(d).has(props.value)
    ? animationLabel(docs.kind.value ?? 'af', props.value)
    : null;
});
const swatch = computed(() => {
  if (props.arg.kind !== 'paletteIndex') return null;
  const c = palette.activePalette.value.colors[props.value];
  return c ? `rgb(${vgaToRgb(c).join(',')})` : null;
});
const sounds = computed(() => docs.doc.value?.soundTable ?? []);
/** Slots openomf clears when it loads this file (AF only). */
const cleared = (slot: number): boolean =>
  docs.kind.value === 'af' && AF_OVERRIDDEN_SOUND_SLOTS.includes(slot);
function slotText(i: number, v: number): string {
  if (cleared(i)) return `slot ${i} → cleared by openomf`;
  if (v === 0) return `slot ${i} → silent`;
  const all = bank.sounds.value;
  if (!all) return `slot ${i} → sound ${v}`;
  if (v > all.length) return `slot ${i} → sound ${v} (not in SOUNDS.DAT)`;
  const s = bank.get(v - 1);
  return s
    ? `slot ${i} → sound ${v} (${Math.round(soundDurationMs(s))} ms)`
    : `slot ${i} → sound ${v} (empty)`;
}
/** SOUNDS.DAT index the selected slot plays, or null. */
const playableSound = computed(() => {
  const v = sounds.value[props.value] ?? 0;
  if (cleared(props.value) || v === 0 || !bank.get(v - 1)) return null;
  return v - 1;
});
</script>

<template>
  <span class="d-inline-flex align-items-center gap-1">
    <template v-if="arg.kind === 'soundIndex'">
      <select
        class="form-select form-select-sm"
        style="width: auto"
        :value="value"
        :aria-label="label ?? 'Sound slot'"
        :data-testid="testid"
        @change="emit('change', Number(inputValue($event)))"
      >
        <option v-if="value < 0 || value >= sounds.length" :value="value">slot {{ value }}</option>
        <option v-for="(snd, i) in sounds" :key="i" :value="i">{{ slotText(i, snd) }}</option>
      </select>
      <SoundPlayButton
        v-if="playableSound !== null"
        :id="playableSound"
        :label="`Play slot ${value}`"
        :testid="`${testid}.play`"
      />
    </template>
    <IntField
      v-else
      :model-value="value"
      :min="min"
      :max="max"
      :suffix="suffix"
      :hex="arg.hex"
      width="7rem"
      :aria-label="label ?? 'Value'"
      :testid="testid"
      @update:model-value="emit('change', $event)"
    />
    <span v-if="arg.kind === 'ticks'" class="small text-secondary"
      >{{ value * pb.ms.value }} ms</span
    >
    <template v-if="arg.kind === 'animId'">
      <span class="small" :class="animName ? 'text-secondary' : 'text-warning'">{{
        animName ?? 'missing'
      }}</span>
      <button
        v-if="animName"
        class="btn btn-sm btn-link p-0"
        :aria-label="`Go to ${animName}`"
        @click="router.push({ name: 'anim-script', params: { id: value } })"
      >
        <Icon name="goto" />
      </button>
    </template>
    <span
      v-if="swatch"
      class="d-inline-block border"
      :style="{ width: '1rem', height: '1rem', background: swatch }"
    />
    <span v-if="arg.note" class="small text-secondary">{{ arg.note }}</span>
  </span>
</template>
