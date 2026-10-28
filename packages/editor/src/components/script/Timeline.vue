<script setup lang="ts">
import { computed, ref } from 'vue';
import { spriteIndexOfKey, type Script } from '@omf/formats';
import { playheadX, resizedDuration, segmentWidth } from '../../lib/timeline';

const props = defineProps<{
  script: Script;
  selected: number;
  tick: number;
  spriteCount: number;
}>();
const emit = defineEmits<{
  select: [i: number];
  duration: [i: number, d: number];
  move: [from: number, to: number];
}>();

const widths = computed(() => props.script.frames.map((f) => segmentWidth(f.duration)));
const playhead = computed(() => playheadX(props.script.frames, props.tick));

// Edge drag: change duration. The new duration shows while dragging and is
// emitted on release, so a resize is one edit.
const resizing = ref<{ i: number; startX: number; startD: number; d: number } | null>(null);
function edgeDown(e: PointerEvent, i: number): void {
  e.stopPropagation();
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  resizing.value = {
    i,
    startX: e.clientX,
    startD: props.script.frames[i]!.duration,
    d: props.script.frames[i]!.duration,
  };
}
function edgeMove(e: PointerEvent): void {
  const r = resizing.value;
  if (!r) return;
  r.d = resizedDuration(r.startD, e.clientX - r.startX, e.shiftKey);
}
/** A cancelled pointer (touch scroll, lost capture) drops the resize without applying it. */
function edgeCancel(): void {
  resizing.value = null;
}
function edgeUp(): void {
  const r = resizing.value;
  resizing.value = null;
  if (r && r.d !== r.startD) emit('duration', r.i, r.d);
}

let dragFrom = -1;
function onDragStart(e: DragEvent, i: number): void {
  // A pointer down on the edge resizes; it must not also start a reorder drag.
  if (resizing.value) {
    e.preventDefault();
    return;
  }
  dragFrom = i;
  // Firefox starts an HTML drag only when data is set.
  e.dataTransfer?.setData('text/plain', String(i));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDragEnd(): void {
  dragFrom = -1;
}
function onDrop(i: number): void {
  if (dragFrom >= 0 && dragFrom !== i) emit('move', dragFrom, i);
  dragFrom = -1;
}
</script>

<template>
  <div class="timeline mb-2" data-testid="script.timeline">
    <div
      v-for="(f, i) in script.frames"
      :key="i"
      class="seg"
      :class="{
        selected: i === selected,
        missing: spriteIndexOfKey(f.key) >= spriteCount && f.key !== 'Z',
      }"
      :style="{
        width: `${resizing && resizing.i === i ? segmentWidth(resizing.d) : widths[i]}px`,
      }"
      draggable="true"
      tabindex="0"
      role="button"
      :aria-pressed="i === selected"
      :title="`Frame ${i + 1}: sprite ${f.key}, ${f.duration} ticks`"
      :data-testid="`script.timeline.segment.${i}`"
      @click="emit('select', i)"
      @keydown.enter.space.prevent="emit('select', i)"
      @dragstart="onDragStart($event, i)"
      @dragend="onDragEnd"
      @dragover.prevent
      @drop.prevent="onDrop(i)"
    >
      <div class="seg-key">{{ f.key }}</div>
      <div class="seg-ticks">{{ resizing && resizing.i === i ? resizing.d : f.duration }}</div>
      <span
        class="edge"
        :data-testid="`script.timeline.edge.${i}`"
        @pointerdown="edgeDown($event, i)"
        @pointermove="edgeMove"
        @pointerup="edgeUp"
        @pointercancel="edgeCancel"
        @click.stop
        @dragstart.prevent
      />
    </div>
    <div class="playhead" :style="{ left: `${playhead}px` }" />
  </div>
</template>

<style scoped>
/* Spec 15 §3.1: at least MIN_W px a segment, text at the label size (13 px at the default root). */
.timeline {
  display: flex;
  border: 1px solid var(--bs-border-color);
  border-radius: var(--bs-border-radius);
  overflow-x: auto;
  user-select: none;
  background: var(--bs-body-bg);
  position: relative;
}
.seg {
  min-width: 36px; /* MIN_W */
  border-right: 1px solid var(--bs-border-color);
  padding: 0.125rem 0.375rem;
  font-family: ui-monospace, monospace;
  font-size: var(--omf-text-label);
  line-height: 1.3;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  white-space: nowrap;
}
.seg-key {
  font-weight: 600;
  font-size: 0.875rem;
}
.seg-ticks {
  color: var(--bs-secondary-color);
}
.seg.selected {
  background: var(--bs-primary-bg-subtle);
  box-shadow: inset 0 -3px 0 var(--bs-primary);
}
.seg.missing {
  background: repeating-linear-gradient(45deg, rgb(220 53 69 / 25%) 0 4px, transparent 4px 8px);
}
.seg .edge {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 1;
}
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--bs-danger);
  pointer-events: none;
}
</style>
