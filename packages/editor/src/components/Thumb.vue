<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DecodedSprite } from '@omf/formats';
import { blit, decodedToRgba, playerShift } from '../canvas/render';
import { useDocument } from '../composables/useDocument';
import { usePalette } from '../composables/usePalette';

const props = withDefaults(
  defineProps<{
    decoded: DecodedSprite;
    size?: number;
    shift?: boolean;
    /** Player offset for `shift` instead of the palette's (the enemy string's opponent). */
    offset?: number | null;
  }>(),
  {
    size: 48,
    shift: false,
    offset: null,
  },
);
const docs = useDocument();
const palette = usePalette();
const canvas = ref<HTMLCanvasElement | null>(null);

function draw(): void {
  const c = canvas.value;
  if (!c) return;
  const d = props.decoded;
  // The player 2 shift exists for HAR sprites only.
  const shift = props.shift && docs.kind.value === 'af';
  blit(
    c,
    decodedToRgba(
      d,
      palette.lut.value,
      shift ? playerShift(props.offset ?? palette.playerOffset.value) : undefined,
    ),
    d.width,
    d.height,
  );
}
// After the DOM update: the canvas only exists once the image has a size.
watch(
  [canvas, () => props.decoded, () => props.offset, palette.lut, palette.playerOffset, docs.kind],
  draw,
  {
    flush: 'post',
    immediate: true,
  },
);

/** Integer upscale when it fits, otherwise shrink to the box. */
const fit = computed(() => {
  const { width: w, height: h } = props.decoded;
  const big = Math.max(w, h, 1);
  const k = big <= props.size ? Math.floor(props.size / big) : props.size / big;
  return { width: `${w * k}px`, height: `${h * k}px` };
});
</script>

<template>
  <span
    class="d-inline-flex align-items-center justify-content-center checkerboard"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <canvas v-if="decoded.width > 0" ref="canvas" class="pixelated" :style="fit" />
    <span v-else class="text-secondary small">∅</span>
  </span>
</template>
