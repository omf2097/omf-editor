<script setup lang="ts">
// Palette section of the pixel editor panel (spec 13 §5). Left click picks the
// foreground colour, right click the background colour; index 0 is stored as
// transparent (spec 13 §7).
import { computed, ref } from 'vue';
import { TRANSPARENT, type RGB } from '@omf/formats';
import SwatchGrid from '../widgets/SwatchGrid.vue';
import { paintable, usePixelEditor } from '../../composables/usePixelEditor';
import { rgbHex } from '../../lib/colorHex';
import type { Img } from '../../lib/pixels';

const props = defineProps<{ colors: RGB[]; img: Img }>();
const pe = usePixelEditor();

const onlyUsed = ref(false);
/** Palette indices the image uses. */
const used = computed(() => {
  const s = new Set<number>();
  for (const p of props.img.pixels) if (p !== TRANSPARENT) s.add(p);
  return s;
});
const dimSet = computed(() => {
  if (!onlyUsed.value) return null;
  const d = new Set<number>();
  for (let i = 0; i < 256; i++) if (!used.value.has(i)) d.add(i);
  return d;
});

function pick(i: number, e: MouseEvent): void {
  const v = paintable(i);
  if (e.button === 2) pe.bg.value = v;
  else pe.fg.value = v;
}

const hexOf = (i: number): string => {
  const c = props.colors[i];
  return c ? rgbHex(c) : '';
};
</script>

<template>
  <div class="small fw-semibold mb-1">Palette</div>
  <button
    class="btn btn-sm w-100 mb-1 checkerboard text-white"
    :class="{ 'border-warning border-2': pe.fg.value === TRANSPARENT }"
    data-testid="pixels.transparent"
    @mousedown.prevent="pick(TRANSPARENT, $event)"
    @contextmenu.prevent
  >
    transparent
  </button>
  <SwatchGrid
    :colors="colors"
    :selected="new Set([pe.fg.value])"
    :marks="used"
    :dim="dimSet"
    testid="pixels.palette"
    @pick="pick"
  />
  <div class="d-flex align-items-center gap-2 small mt-1">
    FG
    <span
      class="d-inline-block border"
      :class="{ checkerboard: pe.fg.value === TRANSPARENT }"
      :style="{
        width: '1.2rem',
        height: '1.2rem',
        background: pe.fg.value === TRANSPARENT ? undefined : hexOf(pe.fg.value),
      }"
    />
    <span class="mono" data-testid="pixels.fg">{{
      pe.fg.value === TRANSPARENT ? '⊘' : pe.fg.value
    }}</span>
    BG
    <span
      class="d-inline-block border"
      :class="{ checkerboard: pe.bg.value === TRANSPARENT }"
      :style="{
        width: '1.2rem',
        height: '1.2rem',
        background: pe.bg.value === TRANSPARENT ? undefined : hexOf(pe.bg.value),
      }"
    />
    <span class="mono">{{ pe.bg.value === TRANSPARENT ? '⊘' : pe.bg.value }}</span>
  </div>
  <div class="small text-secondary">used in sprite: {{ used.size }}</div>
  <label class="form-check small"
    ><input v-model="onlyUsed" type="checkbox" class="form-check-input" /> only show used</label
  >
</template>
