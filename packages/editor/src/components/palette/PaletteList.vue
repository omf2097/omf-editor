<script setup lang="ts">
import { computed } from 'vue';
import { vgaToRgb, type BKFile } from '@omf/formats';
import Icon from '../Icon.vue';
import { useDocument } from '../../composables/useDocument';
import { usePaletteEditor } from '../../composables/usePaletteEditor';
import { usePaletteUsage } from '../../composables/usePaletteUsage';
import { useConfirm } from '../../composables/useConfirm';
import { clonePaletteMapping } from '@omf/formats';

const docs = useDocument();
const pe = usePaletteEditor();
const u = usePaletteUsage();
const { confirm } = useConfirm();

/** A thumbnail gradient per palette, sampled at a few indices spread over the layout. */
const strips = computed(() =>
  (pe.bk.value?.palettes ?? []).map((p) => {
    const stops = [
      0x01, 0x10, 0x20, 0x31, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xa0, 0xc0, 0xe0, 0xff,
    ];
    return `linear-gradient(90deg, ${stops.map((i, k) => `rgb(${vgaToRgb(p.colors.colors[i]!).join(',')}) ${(k / (stops.length - 1)) * 100}%`).join(', ')})`;
  }),
);

/** openomf MAX_BK_PALETTES: a scene with more palettes overflows its table on load. */
const MAX_PALETTES = 8;
const canAdd = computed(() => (pe.bk.value?.palettes.length ?? 0) < MAX_PALETTES);
function add(): void {
  if (!canAdd.value) return;
  const i = pe.index.value;
  docs.mutate<BKFile>('duplicate palette', (d) => {
    d.palettes.splice(i + 1, 0, clonePaletteMapping(d.palettes[i]!));
  });
  pe.setEditIndex(i + 1);
}

async function remove(): Promise<void> {
  const i = pe.index.value;
  if (i === 0) return;
  if (!(await confirm('Delete palette?', `Delete palette ${i} and its remap tables?`, 'Delete')))
    return;
  docs.mutate<BKFile>('delete palette', (d) => {
    d.palettes.splice(i, 1);
  });
  pe.setEditIndex(i - 1);
}

async function move(delta: number): Promise<void> {
  const i = pe.index.value;
  const j = i + delta;
  const n = pe.bk.value?.palettes.length ?? 0;
  if (j < 0 || j >= n) return;
  if (
    (i === 0 || j === 0) &&
    !(await confirm(
      'Reorder palettes',
      'The game uses palette 0 as the scene base palette. Move it anyway?',
      'Move',
    ))
  )
    return;
  docs.mutate<BKFile>('reorder palettes', (d) => {
    const [p] = d.palettes.splice(i, 1);
    d.palettes.splice(j, 0, p!);
  });
  pe.setEditIndex(j);
}

const unused = computed(() => {
  const out: number[] = [];
  for (let i = 1; i < 256; i++) if (!u.used.value.has(i)) out.push(i);
  return out;
});
function selectUnused(): void {
  pe.selection.value = new Set(unused.value);
}
</script>

<template>
  <div class="d-flex flex-column gap-2" data-testid="palette-list">
    <div class="small fw-semibold">Palettes</div>
    <div class="palette-cards">
      <button
        v-for="(s, i) in strips"
        :key="i"
        class="btn btn-sm text-start border p-1"
        :class="i === pe.index.value ? 'border-primary border-2' : ''"
        :data-testid="`palette-list.${i}`"
        @click="pe.setEditIndex(i)"
      >
        <div class="d-flex justify-content-between small">
          <span>{{ i }}</span
          ><span class="text-secondary">{{ i === 0 ? 'base' : `round ${i + 1}` }}</span>
        </div>
        <div :style="{ height: '10px', background: s }" />
      </button>
    </div>
    <div class="d-flex gap-1">
      <button
        class="btn btn-sm btn-outline-secondary"
        :title="canAdd ? 'Duplicate' : `openomf reads at most ${MAX_PALETTES} palettes`"
        aria-label="Duplicate palette"
        :disabled="!canAdd"
        data-testid="palette-list.add"
        @click="add"
      >
        <Icon name="plus" />
      </button>
      <button
        class="btn btn-sm btn-outline-danger"
        title="Delete"
        aria-label="Delete palette"
        :disabled="pe.index.value === 0"
        data-testid="palette-list.delete"
        @click="remove"
      >
        <Icon name="trash" />
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        title="Move up"
        aria-label="Move palette up"
        data-testid="palette-list.up"
        @click="move(-1)"
      >
        <Icon name="up" />
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        title="Move down"
        aria-label="Move palette down"
        data-testid="palette-list.down"
        @click="move(1)"
      >
        <Icon name="down" />
      </button>
    </div>
    <hr class="my-1" />
    <div class="small fw-semibold">Usage</div>
    <div class="d-flex flex-wrap column-gap-3 row-gap-1">
      <label class="form-check small mb-0"
        ><input
          v-model="u.usage.value.background"
          type="checkbox"
          class="form-check-input"
          data-testid="usage.background"
        />
        background</label
      >
      <label class="form-check small mb-0"
        ><input
          v-model="u.usage.value.sprites"
          type="checkbox"
          class="form-check-input"
          data-testid="usage.sprites"
        />
        sprites</label
      >
      <label class="form-check small mb-0">
        <input
          v-model="u.usage.value.fighter"
          type="checkbox"
          class="form-check-input"
          :disabled="!u.previewAf.value"
          data-testid="usage.fighter"
        />
        {{ u.previewAf.value?.name ?? 'fighter (load in preview)' }}
      </label>
    </div>
    <div class="d-flex align-items-center gap-2">
      <div class="small text-secondary" data-testid="usage.count">
        {{ u.used.value.size }} used · {{ unused.length }} unused
      </div>
      <button
        class="btn btn-sm btn-outline-secondary"
        data-testid="usage.select-unused"
        @click="selectUnused"
      >
        Select unused
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Two palettes per row: the column also holds the preview (PalettesView). */
.palette-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
</style>
