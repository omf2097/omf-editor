<script setup lang="ts">
// Pixel editor toolbar (spec 13 §2–4): tools, brush and zoom, transforms,
// undo/redo, Apply/Cancel, and the view options row. Edits editor state directly.
import Icon from '../Icon.vue';
import { PIXEL_TOOLS, usePixelEditor } from '../../composables/usePixelEditor';
import { PIXEL_ZOOMS } from '../../composables/usePixelZoom';
import * as px from '../../lib/pixels';

defineProps<{ title: string }>();
const emit = defineEmits<{
  transform: [fn: (d: px.Img) => px.Img];
  resize: [];
  apply: [];
  cancel: [];
  fit: [];
}>();
const pe = usePixelEditor();
</script>

<template>
  <div class="d-flex align-items-center gap-2 px-3 py-2 border-bottom flex-wrap">
    <strong>Pixel editor</strong>
    <span class="text-secondary">· {{ title }}</span>
    <div class="btn-group btn-group-sm ms-3" role="group" aria-label="Tools">
      <button
        v-for="t in PIXEL_TOOLS"
        :key="t.id"
        class="btn"
        :class="pe.tool.value === t.id ? 'btn-secondary' : 'btn-outline-secondary'"
        :title="`${t.label} (${t.key})`"
        :aria-label="t.label"
        :aria-pressed="pe.tool.value === t.id"
        :data-testid="`pixels.tool.${t.id}`"
        @click="pe.tool.value = t.id"
      >
        <Icon :name="t.icon" />
      </button>
    </div>
    <label class="small d-flex align-items-center gap-1"
      >size
      <select
        v-model.number="pe.brush.value"
        class="form-select form-select-sm"
        style="width: auto"
        data-testid="pixels.brush"
      >
        <option v-for="n in 8" :key="n" :value="n">{{ n }}</option>
      </select>
    </label>
    <label class="small d-flex align-items-center gap-1"
      >zoom
      <select
        v-model.number="pe.zoom.value"
        class="form-select form-select-sm"
        style="width: auto"
        data-testid="pixels.zoom"
      >
        <option v-for="z in PIXEL_ZOOMS" :key="z" :value="z">{{ z }}×</option>
      </select>
    </label>
    <button
      class="btn btn-sm btn-outline-secondary"
      title="Fit the sprite to the pane and centre it"
      data-testid="pixels.fit"
      @click="emit('fit')"
    >
      Fit
    </button>
    <div class="btn-group btn-group-sm">
      <button
        class="btn btn-outline-secondary"
        title="Flip horizontally (H)"
        data-testid="pixels.flipH"
        @click="emit('transform', px.flipH)"
      >
        <Icon name="flipH" />
      </button>
      <button
        class="btn btn-outline-secondary"
        title="Flip vertically (Shift+V)"
        data-testid="pixels.flipV"
        @click="emit('transform', px.flipV)"
      >
        <Icon name="flipV" />
      </button>
      <button
        class="btn btn-outline-secondary"
        title="Rotate 90°"
        data-testid="pixels.rotate"
        @click="emit('transform', px.rotate90)"
      >
        <Icon name="rotate" />
      </button>
      <button
        class="btn btn-outline-secondary"
        title="Resize…"
        data-testid="pixels.resize"
        @click="emit('resize')"
      >
        <Icon name="resize" />
      </button>
    </div>
    <div class="ms-auto d-flex gap-2">
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="!pe.undoStack.value.length"
        aria-label="Undo stroke"
        data-testid="pixels.undo"
        @click="pe.undo"
      >
        <Icon name="undo" />
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="!pe.redoStack.value.length"
        aria-label="Redo stroke"
        data-testid="pixels.redo"
        @click="pe.redo"
      >
        <Icon name="redo" />
      </button>
      <button
        class="btn btn-sm btn-primary"
        :disabled="pe.tooLarge.value"
        title="Apply (Ctrl+Enter)"
        data-testid="pixels.apply"
        @click="emit('apply')"
      >
        Apply
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        title="Cancel (Esc)"
        data-testid="pixels.cancel"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
  <div class="d-flex flex-wrap gap-3 px-3 py-1 small border-bottom">
    <label class="form-check mb-0"
      ><input
        v-model="pe.grid.value"
        type="checkbox"
        class="form-check-input"
        data-testid="pixels.grid"
      />
      grid</label
    >
    <label class="form-check mb-0"
      ><input
        v-model="pe.onionPrev.value"
        type="checkbox"
        class="form-check-input"
        data-testid="pixels.onion-prev"
      />
      onion previous</label
    >
    <label class="form-check mb-0"
      ><input
        v-model="pe.onionNext.value"
        type="checkbox"
        class="form-check-input"
        data-testid="pixels.onion-next"
      />
      onion next</label
    >
    <label class="form-check mb-0"
      ><input
        v-model="pe.arenaBg.value"
        type="checkbox"
        class="form-check-input"
        data-testid="pixels.arena-bg"
      />
      arena background</label
    >
    <label class="form-check mb-0"
      ><input
        v-model="pe.flipPreview.value"
        type="checkbox"
        class="form-check-input"
        data-testid="pixels.flip"
      />
      flip (facing left)</label
    >
  </div>
</template>
