<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  parsePaletteFile,
  rgbToVga,
  sortMapping,
  swapMapping,
  vgaToRgb,
  writePaletteFile,
  type BKFile,
  type Palette,
  type VGA,
} from '@omf/formats';
import { ALTPALS_COMPARE, usePaletteEditor } from '../../composables/usePaletteEditor';
import { useDocument } from '../../composables/useDocument';
import { usePalette } from '../../composables/usePalette';
import { useToasts, errorMessage } from '../../composables/useToasts';
import { download, pickFile } from '../../lib/files';
import { decodePng } from '../../codecs/png';
import { cloneDoc } from '../../lib/doc';
import { blockStart, moveMapping, permuteBk } from '../../lib/paletteOps';
import {
  PALETTE_TOOLS,
  contiguousRange,
  defaultToolParams,
  paramsFromSelection,
  pasteTargets,
  toolCandidate,
  type PaletteTool,
} from '../../lib/paletteTools';

// Tools either preview (a candidate palette shown everywhere until Apply or
// Cancel) or act at once (paste, swap, sort, import). Spec 16 §2.4.

const docs = useDocument();
const palette = usePalette();
const pe = usePaletteEditor();
const toasts = useToasts();
const tool = ref<PaletteTool | null>(null);

const sel = computed(() => pe.selected.value);
const base = computed<Palette | null>(() => pe.current.value?.colors ?? null);
const p = reactive(defaultToolParams());

function open(t: PaletteTool): void {
  tool.value = tool.value === t ? null : t;
  pe.candidate.value = null;
  if (base.value) Object.assign(p, paramsFromSelection(base.value, sel.value));
  preview();
}

/** Rebuilds the candidate palette of the open tool. */
function preview(): void {
  const b = base.value;
  if (!b || !tool.value) return;
  pe.candidate.value = toolCandidate(tool.value, b, sel.value, p, palette.altPals.value);
}
watch(p, preview, { deep: true });
watch(sel, preview);
// Undo, redo or another edit changes the palette under an open tool: rebuild
// the candidate from it, so Apply never brings back undone colours.
watch(base, preview);

function apply(): void {
  if (!tool.value) return;
  pe.applyCandidate(`palette ${tool.value}`);
}
function cancel(): void {
  pe.candidate.value = null;
  tool.value = null;
}

// ------------------------------------------- copy / paste
function copy(): void {
  if (!base.value) return;
  toasts.info(`Copied ${pe.copySelection()} colour(s)`);
}
function paste(): void {
  const clip = pe.clipboard.value;
  const s = sel.value;
  if (!clip || !s.length) return;
  const vals = p.pasteReversed ? [...clip].reverse() : clip;
  const targets = pasteTargets(s, vals.length);
  pe.setColors('paste colours', (colors) =>
    targets.forEach((t, k) => (colors[t] = [...vals[k]!] as VGA)),
  );
}

// ------------------------------------------- swap / move / sort (with image rewrite)
function rangeOfSelection(): { start: number; end: number } | null {
  if (!sel.value.length) return null;
  const r = contiguousRange(sel.value);
  if (!r) toasts.error('Select one contiguous range');
  return r;
}

/** Applies a permutation (see paletteOps.permuteBk); the selection follows its entries. */
function applyMapping(label: string, mapping: Uint8Array): void {
  const d = docs.doc.value as BKFile | null;
  if (!d) return;
  docs.replace(label, permuteBk(cloneDoc(d), pe.index.value, mapping, p.rewrite));
  pe.selection.value = new Set(sel.value.map((k) => mapping[k]!));
}

function doSwap(): void {
  const a = rangeOfSelection();
  if (!a) return;
  const n = a.end - a.start + 1;
  const start = blockStart(p.swapTarget, n);
  if (start === null)
    return void toasts.error(`The target must be a whole number from 0 to ${256 - n}`);
  if (p.swapMode === 'swap') {
    const b = { start, end: start + n - 1 };
    if (b.start <= a.end && b.end >= a.start)
      return void toasts.error('The target range must not overlap the selection');
    applyMapping('swap colours', swapMapping(a, b));
  } else {
    applyMapping('move colours', moveMapping(a, start));
  }
}

function doSort(): void {
  const a = rangeOfSelection();
  const b = base.value;
  if (!a || !b) return;
  applyMapping('sort colours', sortMapping(b, a, p.sortBy));
}

// ------------------------------------------- import / export
async function doImport(): Promise<void> {
  const f = await pickFile([
    {
      description: 'Palette',
      accept: { 'application/octet-stream': ['.gpl', '.pal', '.act'], 'image/png': ['.png'] },
    },
  ]);
  if (!f) return;
  try {
    let rgb;
    if (/\.png$/i.test(f.name)) {
      const png = decodePng(f.bytes);
      if (!png.indexed) throw new Error('the PNG has no palette');
      rgb = png.indexed.palette;
    } else {
      rgb = parsePaletteFile(f.name, f.bytes);
    }
    // Written from the first selected entry; a full selection means the whole palette.
    const start = sel.value.length && sel.value.length < 256 ? sel.value[0]! : 0;
    pe.setColors(`import ${f.name}`, (colors) => {
      rgb.slice(0, 256 - start).forEach((c, k) => (colors[start + k] = rgbToVga(c)));
    });
    toasts.success(`Imported ${Math.min(rgb.length, 256 - start)} colours from ${f.name}`);
  } catch (e) {
    toasts.error(`Could not import ${f.name}: ${errorMessage(e)}`);
  }
}
function doExport(): void {
  const b = base.value;
  if (!b) return;
  const bytes = writePaletteFile(p.exportFormat, b.colors.map(vgaToRgb));
  download(`${docs.fileName.value}-palette${pe.index.value}.${p.exportFormat}`, bytes);
}

// ------------------------------------------- compare
const differing = pe.differing;
function copyDiffering(fromCompare: boolean): void {
  const b = pe.comparePalette.value;
  if (!b) return;
  const only = sel.value.length ? new Set(sel.value) : null;
  const idx = differing.value.filter((i) => !only || only.has(i));
  if (fromCompare)
    pe.setColors('copy differing colours', (colors) =>
      idx.forEach((i) => (colors[i] = [...b.colors[i]!] as VGA)),
    );
  else toasts.info('Select the other palette in the list to copy in that direction');
}
defineExpose({ differing });
</script>

<template>
  <div data-testid="palette-tools">
    <div class="d-flex flex-wrap gap-1 mb-2">
      <button
        v-for="t in PALETTE_TOOLS"
        :key="t.id"
        class="btn btn-sm"
        :class="tool === t.id ? 'btn-secondary' : 'btn-outline-secondary'"
        :data-testid="`tool.${t.id}`"
        @click="open(t.id)"
      >
        {{ t.label }}
      </button>
    </div>
    <div v-if="tool" class="border rounded p-2 small">
      <template v-if="tool === 'ramp'">
        <p class="mb-1 text-secondary">
          Interpolates across the {{ sel.length }} selected entries.
        </p>
        <label class="me-2"
          >from <input v-model="p.rampFrom" type="color" data-testid="ramp.from"
        /></label>
        <label class="me-2"
          >to <input v-model="p.rampTo" type="color" data-testid="ramp.to"
        /></label>
        <select
          v-model="p.rampSpace"
          class="form-select form-select-sm d-inline-block w-auto me-2"
          data-testid="ramp.space"
        >
          <option value="rgb">RGB</option>
          <option value="hsl-short">HSL (short hue)</option>
          <option value="hsl-long">HSL (long hue)</option>
        </select>
        <label class="form-check-inline"
          ><input v-model="p.rampEase" type="checkbox" class="form-check-input" /> ease</label
        >
        <div v-if="sel.length < 2" class="text-warning">Select at least two entries.</div>
      </template>
      <template v-else-if="tool === 'shades'">
        <p class="mb-1 text-secondary">
          Builds a 16-shade HAR band, dark → base → highlights, like ALTPALS.
        </p>
        <label class="me-2"
          >base <input v-model="p.shadeBase" type="color" data-testid="shades.base"
        /></label>
        <label class="me-2"
          >black <input v-model.number="p.shadeBlack" type="range" min="0" max="1" step="0.02"
        /></label>
        <label class="me-2"
          >white <input v-model.number="p.shadeWhite" type="range" min="0" max="1" step="0.02"
        /></label>
        <label class="me-2"
          >peak
          <input
            v-model.number="p.shadePeak"
            type="number"
            min="1"
            max="15"
            class="form-control form-control-sm d-inline-block"
            style="width: 4rem"
        /></label>
        <label
          >gamma <input v-model.number="p.shadeGamma" type="range" min="0.3" max="3" step="0.05"
        /></label>
        <div v-if="sel.length !== 16" class="text-warning">
          Select exactly 16 entries (turn on “lock to bands” and click a band).
        </div>
      </template>
      <template v-else-if="tool === 'adjust'">
        <label class="d-block"
          >hue {{ p.hue }}°
          <input
            v-model.number="p.hue"
            type="range"
            min="-180"
            max="180"
            class="form-range"
            data-testid="adjust.hue"
        /></label>
        <label class="d-block"
          >saturation {{ p.saturation }}
          <input
            v-model.number="p.saturation"
            type="range"
            min="-1"
            max="1"
            step="0.05"
            class="form-range"
        /></label>
        <label class="d-block"
          >lightness {{ p.lightness }}
          <input
            v-model.number="p.lightness"
            type="range"
            min="-1"
            max="1"
            step="0.02"
            class="form-range"
        /></label>
        <label class="d-block"
          >contrast {{ p.contrast }}
          <input
            v-model.number="p.contrast"
            type="range"
            min="-1"
            max="1"
            step="0.05"
            class="form-range"
        /></label>
        <label class="d-block"
          >gamma {{ p.gamma }}
          <input
            v-model.number="p.gamma"
            type="range"
            min="0.3"
            max="3"
            step="0.05"
            class="form-range"
        /></label>
        <label class="d-block"
          >temperature {{ p.temperature }}
          <input
            v-model.number="p.temperature"
            type="range"
            min="-1"
            max="1"
            step="0.05"
            class="form-range"
        /></label>
      </template>
      <template v-else-if="tool === 'fill'">
        <label>colour <input v-model="p.fill" type="color" data-testid="fill.color" /></label>
      </template>
      <template v-else-if="tool === 'copy'">
        <button class="btn btn-sm btn-outline-secondary me-2" data-testid="copy.copy" @click="copy">
          Copy {{ sel.length }}
        </button>
        <button
          class="btn btn-sm btn-outline-secondary me-2"
          :disabled="!pe.clipboard.value"
          data-testid="copy.paste"
          @click="paste"
        >
          Paste {{ pe.clipboard.value?.length ?? '' }}
        </button>
        <label class="form-check-inline"
          ><input v-model="p.pasteReversed" type="checkbox" class="form-check-input" />
          reversed</label
        >
      </template>
      <template v-else-if="tool === 'altpals'">
        <template v-if="palette.altPals.value">
          <label class="me-2"
            >ALTPALS palette
            <select
              v-model.number="p.altPalette"
              class="form-select form-select-sm d-inline-block w-auto"
            >
              <option v-for="k in palette.altPals.value.length" :key="k" :value="k - 1">
                {{ k - 1 }}
              </option>
            </select>
          </label>
          <label
            >option
            <select
              v-model.number="p.altOption"
              class="form-select form-select-sm d-inline-block w-auto"
              data-testid="altpals.option"
            >
              <option v-for="k in 16" :key="k" :value="k - 1">{{ k - 1 }}</option>
            </select>
          </label>
          <p class="mb-0 text-secondary">
            Copies 16 shades into the band of the first selected entry (index 0 stays).
          </p>
        </template>
        <button
          v-else
          class="btn btn-sm btn-outline-primary"
          data-testid="altpals.load"
          @click="palette.loadAltPals()"
        >
          Load ALTPALS.DAT…
        </button>
      </template>
      <template v-else-if="tool === 'swap'">
        <label class="me-2"
          ><input v-model="p.swapMode" type="radio" value="swap" data-testid="swap.mode.swap" />
          swap with the range starting at</label
        >
        <label class="me-2"
          ><input v-model="p.swapMode" type="radio" value="move" data-testid="swap.mode.move" />
          move so it starts at</label
        >
        <input
          v-model.number="p.swapTarget"
          type="number"
          min="0"
          :max="256 - sel.length"
          step="1"
          class="form-control form-control-sm d-inline-block"
          :class="{ 'is-invalid': blockStart(p.swapTarget, sel.length) === null }"
          style="width: 5rem"
          aria-label="Target index"
          data-testid="swap.target"
        />
        <label class="form-check d-block mt-1"
          ><input
            v-model="p.rewrite"
            type="checkbox"
            class="form-check-input"
            data-testid="swap.rewrite"
          />
          rewrite images (and the other palettes and remap tables) so pictures stay the same</label
        >
        <button class="btn btn-sm btn-primary mt-1" data-testid="swap.apply" @click="doSwap">
          Apply
        </button>
      </template>
      <template v-else-if="tool === 'sort'">
        <label class="me-2"
          ><input v-model="p.sortBy" type="radio" value="luminance" /> luminance</label
        >
        <label class="me-2"><input v-model="p.sortBy" type="radio" value="hue" /> hue</label>
        <label class="form-check d-block mt-1"
          ><input v-model="p.rewrite" type="checkbox" class="form-check-input" /> rewrite
          images</label
        >
        <button class="btn btn-sm btn-primary mt-1" data-testid="sort.apply" @click="doSort">
          Sort selection
        </button>
      </template>
      <template v-else-if="tool === 'import'">
        <p class="mb-1 text-secondary">
          GIMP .gpl, JASC .pal, Adobe .act or an indexed PNG; written from the first selected entry
          (or 0).
        </p>
        <button class="btn btn-sm btn-primary" data-testid="import.pick" @click="doImport">
          Choose file…
        </button>
      </template>
      <template v-else-if="tool === 'export'">
        <select
          v-model="p.exportFormat"
          class="form-select form-select-sm d-inline-block w-auto me-2"
          data-testid="export.format"
        >
          <option value="gpl">GIMP .gpl</option>
          <option value="pal">JASC .pal</option>
          <option value="act">Adobe .act</option>
        </select>
        <button class="btn btn-sm btn-primary" data-testid="export.download" @click="doExport">
          Download
        </button>
      </template>
      <template v-else-if="tool === 'compare'">
        <label
          >compare with
          <select
            v-model="pe.compareWith.value"
            class="form-select form-select-sm d-inline-block w-auto"
            data-testid="compare.with"
          >
            <option :value="null">—</option>
            <option v-for="(_, k) in pe.bk.value?.palettes ?? []" :key="k" :value="k">
              palette {{ k }}
            </option>
            <template v-if="palette.altPals.value">
              <option
                v-for="(_, k) in palette.altPals.value"
                :key="`a${k}`"
                :value="ALTPALS_COMPARE + k"
              >
                ALTPALS {{ k }}
              </option>
            </template>
          </select>
        </label>
        <span class="ms-2" data-testid="compare.count">{{ differing.length }} differing</span>
        <button
          class="btn btn-sm btn-outline-secondary ms-2"
          :disabled="!differing.length"
          data-testid="compare.copy"
          @click="copyDiffering(true)"
        >
          Copy differing into this palette{{ sel.length ? ' (selection)' : '' }}
        </button>
      </template>

      <div v-if="pe.candidate.value" class="mt-2 d-flex gap-2">
        <button class="btn btn-sm btn-primary" data-testid="tool.apply" @click="apply">
          Apply
        </button>
        <button class="btn btn-sm btn-outline-secondary" data-testid="tool.cancel" @click="cancel">
          Cancel
        </button>
        <span class="text-secondary align-self-center">Previewing</span>
      </div>
    </div>
  </div>
</template>
