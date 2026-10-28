<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ARENA_LAYOUT, vgaToRgb, type Palette, type RGB } from '@omf/formats';
import { hex2, rgbHex } from '../../lib/colorHex';

const props = withDefaults(
  defineProps<{
    palette: Palette;
    selected: ReadonlySet<number>;
    cursor?: number | null;
    marks?: ReadonlySet<number>;
    rings?: ReadonlySet<number>;
    showBands?: boolean;
    /** What a dot means here (e.g. "used by the background"); shown in the legend. */
    marksLabel?: string;
    /** What a ring means here; shown in the legend. */
    ringsLabel?: string;
    testid?: string;
  }>(),
  {
    cursor: null,
    marks: () => new Set(),
    rings: () => new Set(),
    showBands: true,
    marksLabel: undefined,
    ringsLabel: undefined,
    testid: 'palette-grid',
  },
);
const emit = defineEmits<{
  pick: [i: number, e: MouseEvent | KeyboardEvent];
  range: [a: number, b: number];
  hover: [i: number | null];
  /** Enter on a swatch: edit that colour. */
  edit: [i: number];
}>();
const grid = ref<HTMLElement | null>(null);
/** The one swatch in the tab order (roving tabindex): the cursor, else the first selected. */
const focusIndex = computed(
  () => props.cursor ?? [...props.selected].sort((a, b) => a - b)[0] ?? 0,
);
// Arrow keys move the cursor (view shortcuts); keyboard focus follows it.
watch(focusIndex, async (i) => {
  const g = grid.value;
  if (!g || !(document.activeElement instanceof Node) || !g.contains(document.activeElement))
    return;
  await nextTick();
  g.querySelector<HTMLElement>(`[data-index="${i}"]`)?.focus();
});
function onKey(i: number, e: KeyboardEvent): void {
  if (e.code === 'Space') {
    e.preventDefault();
    emit('pick', i, e);
  } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    emit('pick', i, e);
    emit('edit', i);
  }
}

const colors = computed<RGB[]>(() => props.palette.colors.map(vgaToRgb));
/** Colour of the band marker beside each row: which part of the arena layout it is (spec 16 §1). */
const REGION_COLORS: Record<string, string> = {
  black: '#000',
  p1: '#e53935',
  p2: '#1e88e5',
  arena: '#43a047',
  ui: '#8e24aa',
};
const rowRegion = (row: number): string =>
  ARENA_LAYOUT.find((r) => row * 16 + 15 >= r.start && row * 16 <= r.end && r.id !== 'black')?.id ??
  'p1';
/** A plain press starts a drag selection; moving over swatches with the button held emits `range`. */
let dragStart: number | null = null;
const hovered = ref<number | null>(null);

function down(i: number, e: MouseEvent): void {
  dragStart = e.shiftKey || e.ctrlKey || e.metaKey ? null : i;
  emit('pick', i, e);
}
function enter(i: number, e: MouseEvent): void {
  hovered.value = i;
  emit('hover', i);
  if (dragStart !== null && e.buttons === 1 && i !== dragStart) emit('range', dragStart, i);
}
</script>

<template>
  <div
    class="d-flex gap-1"
    @mouseup="dragStart = null"
    @mouseleave="((dragStart = null), emit('hover', null))"
  >
    <div v-if="showBands" class="d-flex flex-column band-labels">
      <div
        v-for="row in 16"
        :key="row"
        class="flex-fill d-flex align-items-center mono"
        :style="{ borderLeftColor: REGION_COLORS[rowRegion(row - 1)] }"
      >
        {{ hex2((row - 1) * 16) }}
      </div>
    </div>
    <div
      ref="grid"
      class="swatch-grid flex-grow-1"
      role="listbox"
      aria-multiselectable="true"
      aria-label="Palette colours"
      :data-testid="testid"
    >
      <div
        v-for="(c, i) in colors"
        :key="i"
        class="sw"
        :class="{ selected: selected.has(i), cursor: cursor === i }"
        :style="{ background: `rgb(${c[0]},${c[1]},${c[2]})` }"
        :title="`${i} (0x${hex2(i)}) ${rgbHex(c)} · 6-bit ${palette.colors[i]!.join(' ')}`"
        role="option"
        :aria-selected="selected.has(i)"
        :aria-label="`Index ${i} (0x${hex2(i)}) ${rgbHex(c)}`"
        :tabindex="i === focusIndex ? 0 : -1"
        :data-index="i"
        :data-testid="`${testid}.${i}`"
        @mousedown.prevent="down(i, $event)"
        @keydown="onKey(i, $event)"
        @mouseenter="enter(i, $event)"
      >
        <span v-if="marks.has(i)" class="mark" />
        <span v-if="rings.has(i)" class="ring" />
      </div>
    </div>
  </div>
  <div
    v-if="showBands || marksLabel || ringsLabel"
    class="grid-legend text-secondary mt-1"
    :data-testid="`${testid}.legend`"
  >
    <div
      v-if="showBands"
      class="d-flex flex-wrap column-gap-3"
      :data-testid="`${testid}.legend.bands`"
    >
      <span>Row bars:</span>
      <span v-for="r in ARENA_LAYOUT.filter((x) => x.id !== 'black')" :key="r.id" :title="r.desc">
        <span class="band-key" :style="{ background: REGION_COLORS[r.id] }" />{{ r.label }}
        <span class="mono">{{ hex2(r.start) }}–{{ hex2(r.end) }}</span>
      </span>
    </div>
    <div v-if="marksLabel || ringsLabel" class="d-flex flex-wrap column-gap-3">
      <span v-if="marksLabel" :data-testid="`${testid}.legend.marks`"
        ><span class="key-swatch"><span class="key-mark" /></span>{{ marksLabel }}</span
      >
      <span v-if="ringsLabel" :data-testid="`${testid}.legend.rings`"
        ><span class="key-swatch"><span class="key-ring" /></span>{{ ringsLabel }}</span
      >
    </div>
  </div>
</template>

<style scoped>
/* Row labels with the arena-layout band bar (spec 16 §2.2). */
.band-labels {
  width: 2.6rem;
  gap: 1px;
  font-size: var(--omf-text-min);
}
.band-labels > div {
  border-left: 3px solid;
  padding-left: 2px;
}
.grid-legend {
  font-size: var(--omf-text-label);
}
.band-key {
  display: inline-block;
  width: 0.8rem;
  height: 0.5rem;
  margin-right: 0.25rem;
}
/* Legend samples drawn like the swatch marks in app.css (.swatch-grid .sw .mark / .ring). */
.key-swatch {
  display: inline-block;
  position: relative;
  width: 1.1rem;
  height: 1.1rem;
  margin-right: 0.3rem;
  vertical-align: -0.25rem;
  background: #6c757d;
  border: 1px solid var(--bs-border-color);
}
.key-mark {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 1px #000;
}
.key-ring {
  position: absolute;
  inset: 2px;
  border: 1px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #000;
}
</style>
