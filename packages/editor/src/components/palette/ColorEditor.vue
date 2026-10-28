<script setup lang="ts">
import { computed } from 'vue';
import { rgbToHsl, vgaToRgb, type VGA } from '@omf/formats';
import { usePaletteEditor } from '../../composables/usePaletteEditor';
import { clamp, inputValue } from '../../lib/util';
import { hex2, hexVga, rgbHex } from '../../lib/colorHex';

const pe = usePaletteEditor();
const i = computed(() => pe.cursor.value);
const c = computed<VGA>(() => pe.shown.value?.colors[i.value] ?? [0, 0, 0]);
const rgb = computed(() => vgaToRgb(c.value));
const hex = computed(() => rgbHex(rgb.value));
const hsl = computed(() => rgbToHsl(rgb.value));

/** Sets one 6-bit channel (0–63) of the colour at the cursor. */
function set(k: 0 | 1 | 2, v: number): void {
  const next = [...c.value] as VGA;
  next[k] = clamp(Math.round(v), 0, 63);
  write(next);
}
function write(v: VGA): void {
  const idx = i.value;
  pe.setColors(`edit colour ${idx}`, (colors) => {
    colors[idx] = v;
  });
}
function fromHex(s: string): void {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return;
  write(hexVga(`#${m[1]}`));
}
const labels = ['R', 'G', 'B'] as const;
</script>

<template>
  <div class="small" data-testid="color-editor">
    <div class="d-flex align-items-center gap-2 mb-1">
      <span
        class="d-inline-block border"
        :style="{ width: '2rem', height: '2rem', background: hex }"
      />
      <span class="mono">idx {{ i }} (0x{{ hex2(i) }})</span>
      <input
        type="color"
        :value="hex"
        aria-label="Pick a colour"
        data-testid="color-editor.native"
        @change="fromHex(inputValue($event))"
      />
    </div>
    <div v-for="(l, k) in labels" :key="l" class="d-flex align-items-center gap-2">
      <span style="width: 1rem">{{ l }}</span>
      <input
        type="range"
        min="0"
        max="63"
        class="form-range"
        :value="c[k]"
        :aria-label="`${l} (6-bit)`"
        :data-testid="`color-editor.${l}.range`"
        @change="set(k as 0 | 1 | 2, Number(inputValue($event)))"
      />
      <input
        type="number"
        min="0"
        max="63"
        class="form-control form-control-sm mono"
        style="width: 4.5rem"
        :value="c[k]"
        :aria-label="`${l} value (0–63)`"
        :data-testid="`color-editor.${l}`"
        @change="set(k as 0 | 1 | 2, Number(inputValue($event)))"
      />
      <span class="text-secondary mono" style="width: 2.5rem">{{ rgb[k] }}</span>
    </div>
    <div class="d-flex align-items-center gap-2 mt-1">
      hex
      <input
        class="form-control form-control-sm mono"
        style="width: 6rem"
        :value="hex"
        aria-label="Hex colour"
        data-testid="color-editor.hex"
        @change="fromHex(inputValue($event))"
      />
      <span class="text-secondary"
        >H {{ Math.round(hsl[0]) }}° S {{ Math.round(hsl[1] * 100) }}% L
        {{ Math.round(hsl[2] * 100) }}%</span
      >
    </div>
    <div class="text-secondary mt-1">
      Values are 6-bit VGA (0–63) as stored in the file; hex input is quantised.
    </div>
  </div>
</template>
