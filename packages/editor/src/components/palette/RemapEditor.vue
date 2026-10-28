<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { identityRemap, remapPalette, remapSlotNote } from '@omf/formats';
import PaletteGrid from './PaletteGrid.vue';
import IntField from '../widgets/IntField.vue';
import { usePaletteEditor } from '../../composables/usePaletteEditor';
import { hex2 } from '../../lib/colorHex';
import { indexRange } from '../../lib/paletteOps';
import {
  REMAP_TOOLS,
  SEARCH_TOOLS,
  computeRemap,
  defaultRemapParams,
  remapToolLabel,
  type RemapTool,
} from '../../lib/remapTools';

// Remaps tab (spec 16 §2.5): one remap table of the edited palette. The right
// grid selects entries, the left grid (the base palette) sets their target.

const pe = usePaletteEditor();
const sourceSel = ref<Set<number>>(new Set([0]));
let anchor = 0;
const tool = ref<RemapTool | null>(null);
const t = reactive(defaultRemapParams());

const slot = computed(() => pe.remapSlot.value);
/** The stored table of the slot. */
const stored = computed(() => pe.current.value?.remaps[slot.value] ?? identityRemap());
/** What the grids show: the tool's candidate while one is open. */
const table = computed(() => pe.candidateRemap.value ?? stored.value);
const base = computed(() => pe.current.value!.colors);
const mapped = computed(() => remapPalette(base.value, table.value));
const selected = computed(() => [...sourceSel.value].sort((a, b) => a - b));
const first = computed(() => selected.value[0] ?? 0);
const targets = computed(() => new Set(selected.value.map((i) => table.value[i]!)));
/** Entries other than 0 that map to 0, which the game draws black. */
const toZero = computed(
  () => new Set([...Array(256).keys()].filter((i) => i !== 0 && table.value[i] === 0)),
);

function pickSource(i: number, e: MouseEvent | KeyboardEvent): void {
  const next = new Set(e.ctrlKey || e.metaKey ? sourceSel.value : []);
  if (e.shiftKey) {
    indexRange(anchor, i).forEach((k) => next.add(k));
  } else {
    next.add(i);
    anchor = i;
  }
  sourceSel.value = next;
}
function rangeSource(a: number, b: number): void {
  sourceSel.value = indexRange(a, b);
}

/** Clicking the base grid sets the target of every selected entry (of the stored table). */
function setTarget(i: number): void {
  const out = Uint8Array.from(stored.value);
  for (const k of selected.value) out[k] = i;
  pe.setRemap(`edit remap ${slot.value}`, slot.value, out);
}

/** Why the tool cannot produce a table, shown next to Apply. */
const toolError = ref('');

function compute(tool: RemapTool): Uint8Array | null {
  const r = computeRemap(tool, t, {
    base: base.value,
    stored: stored.value,
    selected: selected.value,
    copySource: pe.bk.value?.palettes[t.copyPalette]?.remaps[t.copySlot],
  });
  toolError.value = r.error;
  return r.table;
}
// `stored` too: after undo or redo the candidate is rebuilt from the table as it now is.
watch([t, tool, sourceSel, stored, base], () => {
  pe.candidateRemap.value = tool.value ? compute(tool.value) : null;
});
watch(slot, () => {
  pe.candidateRemap.value = null;
  tool.value = null;
});

function apply(): void {
  const c = pe.candidateRemap.value;
  if (!c) return;
  pe.candidateRemap.value = null;
  pe.setRemap(`remap ${tool.value}`, slot.value, c);
  tool.value = null;
}
function resetIdentity(): void {
  pe.setRemap('identity remap', slot.value, identityRemap());
}
</script>

<template>
  <div v-if="pe.current.value" data-testid="remap-editor">
    <div class="d-flex align-items-center gap-2 mb-2 flex-wrap small">
      Remap
      <select
        v-model.number="pe.remapSlot.value"
        class="form-select form-select-sm w-auto"
        data-testid="remap.slot"
      >
        <option v-for="k in pe.REMAP_COUNT" :key="k" :value="k - 1">
          {{ k - 1 }} · {{ remapSlotNote(k - 1) }}
        </option>
      </select>
      <span class="text-secondary">(the cards site numbers these 1–19)</span>
      <button
        class="btn btn-sm btn-outline-secondary ms-auto"
        data-testid="remap.identity-all"
        @click="resetIdentity"
      >
        Identity
      </button>
    </div>
    <div class="row g-2">
      <div class="col-6">
        <div class="small fw-semibold">Base palette · click to set target</div>
        <PaletteGrid
          :palette="base"
          :selected="targets"
          :show-bands="false"
          testid="remap.base"
          @pick="(i) => setTarget(i)"
        />
      </div>
      <div class="col-6">
        <div class="small fw-semibold">Mapped result · select entries</div>
        <PaletteGrid
          :palette="mapped"
          :selected="sourceSel"
          :rings="toZero"
          :rings-label="toZero.size ? 'maps to 0, drawn black' : undefined"
          :show-bands="false"
          testid="remap.mapped"
          @pick="pickSource"
          @range="rangeSource"
        />
      </div>
    </div>
    <div class="d-flex align-items-end gap-2 small mt-2 flex-wrap">
      <span class="mono mb-2"
        >entry 0x{{ hex2(first)
        }}{{ selected.length > 1 ? ` (+${selected.length - 1})` : '' }} →</span
      >
      <IntField
        :model-value="table[first]!"
        :min="0"
        :max="255"
        :aria-label="`Target of entry ${first}`"
        testid="remap.entry"
        @update:model-value="setTarget"
      />
      <span v-if="toZero.size" class="text-warning mb-2" data-testid="remap.zero-warning"
        >{{ toZero.size }} entries map to 0, which renders black</span
      >
    </div>
    <div class="d-flex flex-wrap gap-1 mt-2">
      <button
        v-for="x in REMAP_TOOLS"
        :key="x"
        class="btn btn-sm"
        :class="tool === x ? 'btn-secondary' : 'btn-outline-secondary'"
        :data-testid="`remap.tool.${x}`"
        @click="tool = tool === x ? null : x"
      >
        {{ remapToolLabel(x) }}
      </button>
    </div>
    <div v-if="tool" class="border rounded p-2 small mt-2">
      <template v-if="tool === 'darken' || tool === 'lighten' || tool === 'tint'">
        <label class="me-2"
          >{{ tool === 'tint' ? 'blend' : 'amount' }} {{ t.pct }}%
          <input v-model.number="t.pct" type="range" min="0" max="100" data-testid="remap.pct"
        /></label>
        <label v-if="tool === 'tint'" class="me-2"
          >toward <input v-model="t.tint" type="color"
        /></label>
      </template>
      <label v-if="tool === 'range'"
        >target start
        <input
          v-model.number="t.target"
          type="number"
          min="0"
          max="255"
          class="form-control form-control-sm d-inline-block"
          style="width: 5rem"
          data-testid="remap.target"
      /></label>
      <label v-if="tool === 'shift'"
        >shift by
        <input
          v-model.number="t.shift"
          type="number"
          min="-255"
          max="255"
          class="form-control form-control-sm d-inline-block"
          style="width: 5rem"
      /></label>
      <label v-if="tool === 'constant'"
        >index
        <input
          v-model.number="t.constant"
          type="number"
          min="0"
          max="255"
          class="form-control form-control-sm d-inline-block"
          style="width: 5rem"
          data-testid="remap.constant"
      /></label>
      <template v-if="tool === 'copy'">
        <label class="me-2"
          >palette
          <select
            v-model.number="t.copyPalette"
            class="form-select form-select-sm d-inline-block w-auto"
          >
            <option v-for="(_, k) in pe.bk.value?.palettes ?? []" :key="k" :value="k">
              {{ k }}
            </option>
          </select>
        </label>
        <label
          >slot
          <select
            v-model.number="t.copySlot"
            class="form-select form-select-sm d-inline-block w-auto"
          >
            <option v-for="k in pe.REMAP_COUNT" :key="k" :value="k - 1">{{ k - 1 }}</option>
          </select>
        </label>
      </template>
      <div v-if="SEARCH_TOOLS.includes(tool)" class="mt-1">
        search range
        <input
          v-model.number="t.searchStart"
          type="number"
          min="0"
          max="255"
          class="form-control form-control-sm d-inline-block"
          style="width: 4.5rem"
        />
        –
        <input
          v-model.number="t.searchEnd"
          type="number"
          min="0"
          max="255"
          class="form-control form-control-sm d-inline-block"
          style="width: 4.5rem"
        />
        <select
          v-if="tool !== 'shift'"
          v-model="t.metric"
          class="form-select form-select-sm d-inline-block w-auto ms-2"
        >
          <option value="weighted">weighted RGB</option>
          <option value="cie76">CIE76</option>
        </select>
      </div>
      <div class="mt-2">
        <button
          class="btn btn-sm btn-primary me-2"
          :disabled="!pe.candidateRemap.value"
          data-testid="remap.apply"
          @click="apply"
        >
          Apply
        </button>
        <button class="btn btn-sm btn-outline-secondary" @click="tool = null">Cancel</button>
        <span v-if="toolError" class="text-danger ms-2" data-testid="remap.tool-error">{{
          toolError
        }}</span>
      </div>
    </div>
  </div>
</template>
