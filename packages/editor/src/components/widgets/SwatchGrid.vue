<script setup lang="ts">
import { computed } from 'vue';
import type { RGB } from '@omf/formats';
import { hex2, rgbHex } from '../../lib/colorHex';

const props = withDefaults(
  defineProps<{
    colors: RGB[];
    selected?: ReadonlySet<number>;
    marks?: ReadonlySet<number>;
    rings?: ReadonlySet<number>;
    dim?: ReadonlySet<number> | null;
    cursor?: number | null;
    testid?: string;
    /** Optional per-index title prefix. */
    describe?: (i: number) => string;
  }>(),
  {
    selected: () => new Set(),
    marks: () => new Set(),
    rings: () => new Set(),
    dim: null,
    cursor: null,
    testid: 'swatches',
    describe: undefined,
  },
);
const emit = defineEmits<{
  pick: [i: number, e: MouseEvent];
  hover: [i: number | null];
  drag: [i: number, e: MouseEvent];
}>();

const cells = computed(() =>
  props.colors.map((c, i) => ({ i, bg: `rgb(${c[0]},${c[1]},${c[2]})`, hex: rgbHex(c) })),
);
</script>

<template>
  <div class="swatch-grid" :data-testid="testid" @mouseleave="emit('hover', null)">
    <div
      v-for="c in cells"
      :key="c.i"
      class="sw"
      :class="{ selected: selected.has(c.i), cursor: cursor === c.i, dim: dim?.has(c.i) }"
      :style="{ background: c.bg }"
      :title="`${describe ? describe(c.i) + ' · ' : ''}${c.i} (0x${hex2(c.i)}) ${c.hex}`"
      :data-testid="`${testid}.${c.i}`"
      @mousedown.prevent="emit('pick', c.i, $event)"
      @mouseenter="
        (e) => {
          emit('hover', c.i);
          if (e.buttons === 1) emit('drag', c.i, e);
        }
      "
      @contextmenu.prevent
    >
      <span v-if="marks.has(c.i)" class="mark" />
      <span v-if="rings.has(c.i)" class="ring" />
    </div>
  </div>
</template>
