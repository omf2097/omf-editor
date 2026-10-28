<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../Icon.vue';
import { useSounds, type PlayOptions } from '../../composables/useSounds';

const props = withDefaults(
  defineProps<{ id: number; options?: PlayOptions; testid?: string; label?: string }>(),
  { options: () => ({}), testid: undefined, label: undefined },
);
const sounds = useSounds();
const available = computed(() => sounds.get(props.id) !== null);
const playing = computed(() => sounds.playingId.value === props.id);

function click(): void {
  const wasPlaying = playing.value;
  sounds.stop('ui');
  if (!wasPlaying) sounds.play(props.id, props.options, 'ui');
}
</script>

<template>
  <button
    type="button"
    class="btn btn-sm btn-outline-secondary py-0 px-1"
    :disabled="!available"
    :aria-label="playing ? 'Stop sound' : (label ?? `Play sound ${id + 1}`)"
    :title="playing ? 'Stop' : 'Play'"
    :data-testid="testid"
    @click="click"
  >
    <Icon :name="playing ? 'stop' : 'play'" />
  </button>
</template>
