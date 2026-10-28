<script setup lang="ts">
import { ref, watch } from 'vue';
import { spriteIndexOfFrame } from '@omf/formats';
import SceneCanvas from './SceneCanvas.vue';
import PlaybackBar from './PlaybackBar.vue';
import ViewportToolbar from './ViewportToolbar.vue';
import SpriteStrip from './SpriteStrip.vue';
import { usePlayback } from '../../composables/usePlayback';
import type { AnyAnimation } from '../../lib/doc';
import type { Point } from '../../lib/scene';
import type { EnemySceneProps } from '../../composables/useEnemyScene';

const props = withDefaults(
  defineProps<{
    animation: AnyAnimation | null;
    animId: number;
    strip?: boolean;
    showHold?: boolean;
    interactive?: boolean;
    selectedHit?: number | null;
    allHits?: boolean;
    /** The enemy string is playing: draw its opponent (useEnemyScene). */
    enemy?: EnemySceneProps | null;
  }>(),
  {
    strip: true,
    showHold: false,
    interactive: false,
    selectedHit: null,
    allHits: false,
    enemy: null,
  },
);
const emit = defineEmits<{
  pointer: [e: { type: string; p: Point; ev: PointerEvent | MouseEvent }];
}>();

const pb = usePlayback();
const canvas = ref<InstanceType<typeof SceneCanvas> | null>(null);
const pinned = ref<number | null>(null);
// A pinned sprite belongs to one animation; another one starts unpinned.
watch(
  () => props.animId,
  () => (pinned.value = null),
);

function selectSprite(i: number): void {
  pb.pause();
  // Seek to the first frame using this sprite, else pin it.
  const idx = pb.script.value.frames.findIndex((f) => spriteIndexOfFrame(f) === i);
  if (idx >= 0) {
    pinned.value = null;
    pb.seekFrame(idx);
  } else {
    pinned.value = i;
  }
}

defineExpose({ canvas, pinned });
</script>

<template>
  <div class="scene-preview" data-testid="scene-preview">
    <ViewportToolbar />
    <SceneCanvas
      ref="canvas"
      :animation="enemy ? enemy.animation : props.animation"
      :facing-left="enemy?.facingLeft ?? null"
      :player-offset="enemy?.playerOffset ?? null"
      :decode="enemy?.decode ?? null"
      :origin="enemy?.origin ?? null"
      :idle="enemy?.idle ?? null"
      :partner="enemy?.partner ?? null"
      :sprite-override="pinned"
      :interactive="interactive"
      :selected-hit="selectedHit"
      :all-hits="allHits"
      @pointer="emit('pointer', $event)"
    />
    <PlaybackBar :show-hold="showHold" @click="pinned = null" />
    <SpriteStrip
      v-if="strip && props.animation"
      :animation="enemy ? enemy.animation : props.animation"
      :anim-id="animId"
      :decode="enemy?.decode ?? null"
      :offset="enemy?.playerOffset ?? null"
      :current="pinned ?? canvas?.spriteIndex ?? null"
      @select="selectSprite"
    />
  </div>
</template>
