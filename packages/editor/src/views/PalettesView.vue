<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AfPaletteSource from '../components/palette/AfPaletteSource.vue';
import PaletteList from '../components/palette/PaletteList.vue';
import PaletteGrid from '../components/palette/PaletteGrid.vue';
import ColorEditor from '../components/palette/ColorEditor.vue';
import PaletteTools from '../components/palette/PaletteTools.vue';
import RemapEditor from '../components/palette/RemapEditor.vue';
import PalettePreview from '../components/palette/PalettePreview.vue';
import { useDocument } from '../composables/useDocument';
import { usePaletteEditor } from '../composables/usePaletteEditor';
import { usePaletteUsage } from '../composables/usePaletteUsage';
import { useShortcuts, type Shortcut } from '../composables/useShortcuts';
import { useToasts } from '../composables/useToasts';
import type { VGA } from '@omf/formats';
import { clamp } from '../lib/util';

// BK: palette and remap editor (spec 16 §2). AF files have no palette of
// their own; AfPaletteSource chooses which one previews them (§3).

const docs = useDocument();
const pe = usePaletteEditor();
const u = usePaletteUsage();
const shortcuts = useShortcuts();
/** Index under the cursor in the preview, highlighted in the grid. */
const previewHover = ref<number | null>(null);

const rings = computed(() => new Set(pe.differing.value));
/** Legend text for the grid's dots: the usage sources ticked in the palette list. */
const marksLabel = computed(() => {
  const src = [
    u.usage.value.background && 'the background',
    u.usage.value.sprites && "this scene's sprites",
    u.usage.value.fighter && u.previewAf.value?.name,
  ].filter(Boolean);
  return src.length
    ? `used by ${src.join(', ')}`
    : 'used index (tick a source under Usage to mark them)';
});
const ringsLabel = computed(() =>
  pe.compareWith.value === null ? undefined : 'differs from the compared palette',
);

/** Enter: edit the colour at the cursor (focus the colour editor). */
async function editColour(): Promise<void> {
  pe.tab.value = 'palette';
  await nextTick();
  document.querySelector<HTMLInputElement>('[data-testid="color-editor.R"]')?.focus();
}
/** I: eyedropper, selects the index under the pointer in the preview. */
function eyedropper(): void {
  if (previewHover.value === null)
    return void useToasts().info('Point at the preview, then press I to pick that colour');
  pe.select(previewHover.value);
}

function moveCursor(d: number, extend: boolean): void {
  const n = clamp(pe.cursor.value + d, 0, 255);
  pe.select(n, { shiftKey: extend });
}

/** Ctrl+V: the clipboard from the first selected entry on (the Paste tool fills the selection instead). */
function pasteAtSelection(): void {
  const clip = pe.clipboard.value;
  const s = pe.selected.value[0];
  if (!clip || s === undefined) return;
  pe.setColors('paste colours', (colors) =>
    clip.forEach((v, k) => s + k < 256 && (colors[s + k] = [...v] as VGA)),
  );
}

/** Spec 16 §6. */
function paletteShortcuts(): Omit<Shortcut, 'scope'>[] {
  return [
    ...(
      [
        ['ArrowLeft', -1, '←'],
        ['ArrowRight', 1, '→'],
        ['ArrowUp', -16, '↑'],
        ['ArrowDown', 16, '↓'],
      ] as const
    ).flatMap(([k, d, l]) => [
      {
        keys: k,
        label: l,
        description: 'Move the palette cursor',
        run: () => moveCursor(d, false),
      },
      {
        keys: `Shift+${k}`,
        label: `Shift+${l}`,
        description: 'Extend the palette selection',
        run: () => moveCursor(d, true),
      },
    ]),
    {
      keys: 'Ctrl+KeyA',
      label: 'Ctrl+A',
      description: 'Select all palette entries',
      run: pe.selectAll,
    },
    {
      keys: 'Ctrl+KeyC',
      label: 'Ctrl+C',
      description: 'Copy palette entries',
      run: () => void pe.copySelection(),
    },
    {
      keys: 'Ctrl+KeyV',
      label: 'Ctrl+V',
      description: 'Paste palette entries at the selection',
      run: pasteAtSelection,
    },
    {
      keys: 'Enter',
      label: 'Enter',
      description: 'Edit the colour at the cursor',
      run: () => void editColour(),
    },
    {
      keys: 'KeyI',
      label: 'I',
      description: 'Eyedropper: select the index under the pointer in the preview',
      run: eyedropper,
    },
    {
      keys: 'KeyT',
      label: 'T',
      description: 'Switch Palette / Remaps',
      run: () => (pe.tab.value = pe.tab.value === 'palette' ? 'remaps' : 'palette'),
    },
    {
      keys: 'BracketLeft',
      label: '[',
      description: 'Previous remap slot',
      run: () => (pe.remapSlot.value = Math.max(0, pe.remapSlot.value - 1)),
    },
    {
      keys: 'BracketRight',
      label: ']',
      description: 'Next remap slot',
      run: () => (pe.remapSlot.value = Math.min(pe.REMAP_COUNT - 1, pe.remapSlot.value + 1)),
    },
    {
      keys: 'Escape',
      label: 'Esc',
      description: 'Cancel the tool preview',
      run: () => ((pe.candidate.value = null), (pe.candidateRemap.value = null)),
    },
  ];
}

let off: (() => void)[] = [];
onMounted(() => {
  if (docs.kind.value === 'bk')
    pe.setEditIndex(Math.min(pe.editIndex.value, (pe.bk.value?.palettes.length ?? 1) - 1));
  off = [shortcuts.activate('palettes'), shortcuts.register('palettes', paletteShortcuts())];
});
onBeforeUnmount(() => {
  off.forEach((f) => f());
  pe.candidate.value = null;
  pe.candidateRemap.value = null;
});
</script>

<template>
  <AfPaletteSource v-if="docs.kind.value === 'af'" />
  <div
    v-else-if="pe.current.value"
    class="view-pad d-flex gap-3 flex-wrap align-items-start"
    data-testid="view.palettes"
  >
    <!-- Palette list and preview share the left column, so the preview stays
         beside the grid however tall the tools below the grid get (spec 16 §2). -->
    <div class="side-col d-flex flex-column gap-3" data-testid="palettes.side">
      <PaletteList />
      <PalettePreview @pick="(i) => pe.select(i)" @hover="(i) => (previewHover = i)" />
    </div>
    <div style="flex: 1 1 400px; max-width: 480px; min-width: 0">
      <ul class="nav nav-tabs mb-2" role="tablist">
        <li class="nav-item" role="presentation">
          <button
            class="nav-link"
            :class="{ active: pe.tab.value === 'palette' }"
            role="tab"
            data-testid="palettes.tab.palette"
            @click="pe.tab.value = 'palette'"
          >
            Palette {{ pe.index.value }}
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button
            class="nav-link"
            :class="{ active: pe.tab.value === 'remaps' }"
            role="tab"
            data-testid="palettes.tab.remaps"
            @click="pe.tab.value = 'remaps'"
          >
            Remaps
          </button>
        </li>
      </ul>
      <template v-if="pe.tab.value === 'palette'">
        <PaletteGrid
          :palette="pe.shown.value!"
          :selected="pe.selection.value"
          :cursor="previewHover ?? pe.cursor.value"
          :marks="u.used.value"
          :rings="rings"
          :marks-label="marksLabel"
          :rings-label="ringsLabel"
          @pick="(i, e) => pe.select(i, e)"
          @range="pe.selectRange"
          @edit="editColour"
        />
        <div class="d-flex align-items-center gap-3 small my-2">
          <span data-testid="palettes.selection"
            >Selection
            {{
              pe.selected.value.length
                ? `0x${pe.selected.value[0]!.toString(16).toUpperCase()}–0x${pe.selected.value[pe.selected.value.length - 1]!.toString(16).toUpperCase()} (${pe.selected.value.length})`
                : 'none'
            }}</span
          >
          <label class="form-check mb-0"
            ><input
              v-model="pe.lockBands.value"
              type="checkbox"
              class="form-check-input"
              data-testid="palettes.lock-bands"
            />
            lock to bands</label
          >
          <span
            v-if="pe.current.value.colors.colors[0]!.some((v) => v !== 0)"
            class="text-secondary"
            >index 0 is not black (the game forces it black)</span
          >
        </div>
        <ColorEditor class="mb-2" />
        <PaletteTools />
      </template>
      <RemapEditor v-else />
    </div>
  </div>
  <div v-else class="view-pad text-secondary">This scene has no palettes.</div>
</template>

<style scoped>
.side-col {
  width: 400px;
  max-width: 100%;
}
</style>
