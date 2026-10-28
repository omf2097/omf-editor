<script setup lang="ts">
import { spriteIndexOfFrame, spriteLetter, type DecodedSprite, type Sprite } from '@omf/formats';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Thumb from '../Thumb.vue';
import { useSharedImages } from '../../composables/useSharedImages';
import { usePlayback } from '../../composables/usePlayback';
import type { AnyAnimation } from '../../lib/doc';

const props = withDefaults(
  defineProps<{
    animation: AnyAnimation;
    animId: number;
    current: number | null;
    /**
     * Sprites of another animation than `animId` (the enemy string's opponent
     * move 9): decoded by this, drawn at `offset`, and not opened in the pixel editor.
     */
    decode?: ((s: Sprite) => DecodedSprite) | null;
    offset?: number | null;
  }>(),
  { decode: null, offset: null },
);
const emit = defineEmits<{ select: [i: number] }>();
const shared = useSharedImages();
const pb = usePlayback();
const router = useRouter();

const used = computed(() => new Set(pb.script.value.frames.map(spriteIndexOfFrame)));
</script>

<template>
  <div class="d-flex gap-1 flex-wrap mt-2" data-testid="sprite-strip">
    <button
      v-for="(s, i) in props.animation.sprites"
      :key="i"
      class="sprite-cell btn btn-sm p-1"
      :class="{ active: current === i, unused: !used.has(i) }"
      :title="`${spriteLetter(i)}: ${s.width}×${s.height}${s.missing ? ' (shared)' : ''}${used.has(i) ? '' : ' · not used by any frame'}`"
      :data-testid="`strip.${i}`"
      @click="emit('select', i)"
      @dblclick="!decode && router.push({ name: 'anim-pixels', params: { id: animId, n: i } })"
    >
      <Thumb :decoded="decode ? decode(s) : shared.decoded(s)" :size="40" shift :offset="offset" />
      <div class="mono">{{ spriteLetter(i) }}<span v-if="s.missing">↪</span></div>
    </button>
  </div>
</template>
