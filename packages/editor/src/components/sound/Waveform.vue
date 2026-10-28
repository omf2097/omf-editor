<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { Sound } from '@omf/formats';

const props = withDefaults(
  defineProps<{ sound: Sound | null; width?: number; height?: number }>(),
  {
    width: 160,
    height: 28,
  },
);
const canvas = ref<HTMLCanvasElement | null>(null);

/** Min/max envelope per pixel column of the 8-bit unsigned samples. */
function draw(): void {
  const c = canvas.value;
  const ctx = c?.getContext('2d');
  if (!c || !ctx) return;
  const w = props.width;
  const h = props.height;
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const color = getComputedStyle(c).color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(0, Math.floor(h / 2), w, 1);
  ctx.globalAlpha = 1;
  const d = props.sound?.data;
  if (!d || d.length === 0) return;
  for (let x = 0; x < w; x++) {
    const a = Math.floor((x * d.length) / w);
    const b = Math.max(a + 1, Math.floor(((x + 1) * d.length) / w));
    let lo = 255;
    let hi = 0;
    for (let i = a; i < b && i < d.length; i++) {
      const v = d[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const y0 = ((255 - hi) / 255) * h;
    const y1 = ((255 - lo) / 255) * h;
    ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
  }
}
watch(() => [props.sound, props.width, props.height], draw);
onMounted(draw);
</script>

<template>
  <canvas
    ref="canvas"
    class="waveform text-primary"
    :style="{ width: `${width}px`, height: `${height}px` }"
    aria-hidden="true"
  />
</template>
