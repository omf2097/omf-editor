<script setup lang="ts">
// Sprite sheet export and import (spec 20 §1–2). A sheet is one PNG with a
// cell per sprite plus a .sheet.json sidecar giving each sprite's offset in its
// cell; import re-reads the cells and replaces the sprites that changed.
import { computed, reactive, ref, shallowRef } from 'vue';
import { zipSync } from 'fflate';
import {
  TRANSPARENT,
  buildSheet,
  parseSheet,
  resolveSharedImages,
  samePlacedImage,
  type Animation,
  type DecodedSprite,
  type ParsedSheetSprite,
  type SheetMeta,
  spriteLetter,
} from '@omf/formats';
import Thumb from './Thumb.vue';
import { useDocument } from '../composables/useDocument';
import { usePalette } from '../composables/usePalette';
import { useSelection } from '../composables/useSelection';
import { useSpriteImport } from '../composables/useSpriteImport';
import { useToasts, errorMessage } from '../composables/useToasts';
import { useConfirm } from '../composables/useConfirm';
import { useModal } from '../composables/useModal';
import { animationsOf } from '../lib/doc';
import { decodedOf } from '../canvas/render';
import { decodePng, encodeIndexedPng } from '../codecs/png';
import { paletteRgb, rgbaPngOf } from '../codecs/export';
import { download, pickFile } from '../lib/files';
import { isShared, replaceImages, type ShareMode } from '../lib/spriteEdit';
import { blank, placedDiff } from '../lib/pixels';
import { PNG_TYPES } from '../composables/useSpriteImport';

const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
useModal({ open: () => true, panel, close: () => emit('close') });
const docs = useDocument();
const palette = usePalette();
const sel = useSelection();
const imp = useSpriteImport();
const toasts = useToasts();
const { confirm } = useConfirm();
const tab = ref<'export' | 'import'>('export');
const o = reactive({ spacing: 1, columns: 8, rgba: false, all: false });

/** Sheet image and sidecar of animation `id`, shared images resolved. */
function sheetOf(id: number, a: Animation) {
  const owners = resolveSharedImages(animationsOf(docs.doc.value!).values());
  return buildSheet(
    a.sprites.map((s) => ({
      posX: s.posX,
      posY: s.posY,
      index: s.index,
      missing: s.missing,
      decoded: decodedOf(s, owners.get(s)),
    })),
    {
      source: docs.fileName.value,
      animation: id,
      palette: palette.isFallback.value
        ? 'greyscale'
        : `${docs.kind.value === 'bk' ? docs.fileName.value : (palette.sourceName.value ?? '')}#${palette.paletteIndex.value}`,
      spacing: o.spacing,
      columns: o.columns,
    },
  );
}

/** Indexed PNG with the sheet's key index, or RGBA when asked or when no index is free. */
async function pngOf(s: ReturnType<typeof sheetOf>): Promise<{ png: Uint8Array; meta: SheetMeta }> {
  const { image, meta } = s;
  if (o.rgba || meta.transparent_index === null) {
    if (!o.rgba) toasts.info('The sprites use all 256 indices; this sheet is written as RGBA');
    return {
      png: await rgbaPngOf(
        { width: image.width, height: image.height, pixels: image.pixels },
        imp.matchLut.value,
      ),
      meta: { ...meta, transparent_index: null },
    };
  }
  const key = meta.transparent_index;
  const indices = Uint8Array.from(image.pixels, (p) => (p === TRANSPARENT ? key : p));
  return {
    png: encodeIndexedPng({
      width: image.width,
      height: image.height,
      indices,
      // The palette imports match against, so an untouched sheet re-imports unchanged.
      palette: paletteRgb(imp.matchPalette.value),
      transparentIndex: key,
    }),
    meta,
  };
}

async function doExport(): Promise<void> {
  const d = docs.doc.value;
  if (!d || sel.animId.value === null) return;
  const base = docs.fileName.value;
  if (o.all) {
    const files: Record<string, Uint8Array> = {};
    for (const [id, a] of animationsOf(d)) {
      const { png, meta } = await pngOf(sheetOf(id, a));
      files[`${base}-${id}.png`] = png;
      files[`${base}-${id}.sheet.json`] = new TextEncoder().encode(JSON.stringify(meta, null, 2));
    }
    download(`${base}-sheets.zip`, zipSync(files), 'application/zip');
  } else {
    const { png, meta } = await pngOf(sheetOf(sel.animId.value, sel.animation.value!));
    download(`${base}-${sel.animId.value}.png`, png, 'image/png');
    download(
      `${base}-${sel.animId.value}.sheet.json`,
      JSON.stringify(meta, null, 2),
      'application/json',
    );
  }
  emit('close');
}

// ----------------------------------------------------------- import
interface Change {
  index: number;
  parsed: ParsedSheetSprite;
  before: DecodedSprite;
  /** Pixels or offset differ from the sprite. */
  changed: boolean;
  include: boolean;
  diff: number;
}
const sheetPng = shallowRef<{ name: string; bytes: Uint8Array } | null>(null);
const meta = shallowRef<SheetMeta | null>(null);
const manual = reactive({ w: 64, h: 96, columns: 8, spacing: 1 });
const changes = ref<Change[] | null>(null);

async function choosePng(): Promise<void> {
  const f = await pickFile(PNG_TYPES);
  if (f) sheetPng.value = f;
}
async function chooseJson(): Promise<void> {
  const f = await pickFile([
    { description: 'Sheet JSON', accept: { 'application/json': ['.json'] } },
  ]);
  if (!f) return;
  try {
    meta.value = JSON.parse(new TextDecoder().decode(f.bytes)) as SheetMeta;
  } catch (e) {
    toasts.error(`${f.name}: ${errorMessage(e)}`);
  }
}

/** A layout for a hand-made sheet: anchor at the bottom centre of each cell. */
function manualMeta(a: Animation): SheetMeta {
  return {
    version: 1,
    source: docs.fileName.value,
    animation: sel.animId.value!,
    cell: { w: manual.w, h: manual.h, spacing: manual.spacing },
    columns: manual.columns,
    palette: '',
    transparent_index: null,
    sprites: a.sprites.map((s, i) => ({
      letter: spriteLetter(i),
      index: s.index,
      pos_x: s.posX,
      pos_y: s.posY,
      w: s.width,
      h: s.height,
      cell: i,
      origin_in_cell: { x: Math.floor(manual.w / 2), y: manual.h },
      missing: s.missing,
    })),
  };
}

/** Asks before importing a sheet exported from another file or animation. */
async function sidecarMatches(m: SheetMeta): Promise<boolean> {
  const here = `${docs.fileName.value} animation ${sel.animId.value}`;
  const there = `${m.source} animation ${m.animation}`;
  const sameFile = !m.source || m.source.toLowerCase() === docs.fileName.value.toLowerCase();
  if (sameFile && m.animation === sel.animId.value) return true;
  return confirm(
    'Sheet from elsewhere',
    `The sheet was exported from ${there}; import it into ${here}?`,
    'Import',
  );
}

/** Compares parsed cells with the animation's sprites; changed ones start included. */
function changesAgainst(a: Animation, parsed: ParsedSheetSprite[]): Change[] {
  const owners = resolveSharedImages(animationsOf(docs.doc.value!).values());
  return parsed.map((p, index) => {
    const s = a.sprites[index]!;
    const cur = { posX: s.posX, posY: s.posY, decoded: decodedOf(s, owners.get(s)) };
    const changed = !samePlacedImage(p, cur);
    return {
      index,
      parsed: p,
      before: cur.decoded,
      changed,
      include: changed,
      diff: changed ? placedDiff(p, cur) : 0,
    };
  });
}

/** Reads the chosen sheet PNG with the sidecar (or the manual layout) into `changes`. */
async function analyse(): Promise<void> {
  const a = sel.animation.value;
  const f = sheetPng.value;
  if (!a || !f) return;
  try {
    const layout = meta.value ?? manualMeta(a);
    if (layout.sprites.length !== a.sprites.length) {
      toasts.error(
        `The sheet has ${layout.sprites.length} sprites, the animation ${a.sprites.length}; sprite count cannot change through a sheet`,
      );
      return;
    }
    if (meta.value && !(await sidecarMatches(meta.value))) return;
    const decoded = await imp.match(decodePng(f.bytes), 'the sheet', {
      sprite: true,
      keyIndex: layout.transparent_index,
    });
    if (!decoded) return;
    changes.value = changesAgainst(a, parseSheet(decoded, layout));
  } catch (e) {
    toasts.error(`Could not read the sheet: ${errorMessage(e)}`);
  }
}

const included = computed(() => changes.value?.filter((c) => c.include) ?? []);

async function applyImport(): Promise<void> {
  const d = docs.doc.value;
  const id = sel.animId.value;
  if (!d || id === null || !included.value.length) return;
  let mode: ShareMode = 'all';
  const shared = included.value.find((c) => isShared(d, { animId: id, index: c.index }));
  if (shared) {
    const m = await imp.shareMode({ animId: id, index: shared.index });
    if (!m) return;
    mode = m;
  }
  try {
    docs.mutate('import sprite sheet', (x) =>
      replaceImages(
        x,
        id,
        included.value.map((c) => ({
          index: c.index,
          // An empty cell becomes a 1×1 transparent image.
          decoded: c.parsed.decoded.width ? c.parsed.decoded : blank(1, 1),
          posX: c.parsed.posX,
          posY: c.parsed.posY,
        })),
        mode,
      ),
    );
  } catch (e) {
    toasts.error(`Could not import the sheet: ${errorMessage(e)}`);
    return;
  }
  toasts.success(`Updated ${included.value.length} sprite(s)`);
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop-omf" @click.self="emit('close')">
      <div
        ref="panel"
        class="modal-panel p-3 small"
        style="width: min(760px, calc(100vw - 2rem))"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label="Sprite sheet"
        data-testid="sheet-dialog"
      >
        <ul class="nav nav-tabs mb-2">
          <li class="nav-item" role="presentation">
            <button
              class="nav-link"
              :class="{ active: tab === 'export' }"
              data-testid="sheet.tab.export"
              @click="tab = 'export'"
            >
              Export sheet
            </button>
          </li>
          <li class="nav-item" role="presentation">
            <button
              class="nav-link"
              :class="{ active: tab === 'import' }"
              data-testid="sheet.tab.import"
              @click="tab = 'import'"
            >
              Import sheet
            </button>
          </li>
        </ul>
        <template v-if="tab === 'export'">
          <p class="text-secondary">
            An indexed PNG with the scene palette (before HAR colours and remaps) plus a
            <code>.sheet.json</code> describing the layout, for editing in external tools. Cells
            share one origin, so moving a sprite inside its cell changes its offset.
          </p>
          <label class="me-3"
            >spacing
            <input
              v-model.number="o.spacing"
              type="number"
              min="0"
              max="8"
              class="form-control form-control-sm d-inline-block"
              style="width: 4rem"
          /></label>
          <label class="me-3"
            >columns
            <input
              v-model.number="o.columns"
              type="number"
              min="1"
              max="64"
              class="form-control form-control-sm d-inline-block"
              style="width: 4rem"
          /></label>
          <label class="form-check-inline"
            ><input v-model="o.rgba" type="checkbox" class="form-check-input" /> RGBA (for tools
            that lose palettes)</label
          >
          <label class="form-check-inline"
            ><input
              v-model="o.all"
              type="checkbox"
              class="form-check-input"
              data-testid="sheet.all"
            />
            all animations (zip)</label
          >
          <div class="text-end mt-3">
            <button class="btn btn-sm btn-outline-secondary me-2" @click="emit('close')">
              Cancel
            </button>
            <button class="btn btn-sm btn-primary" data-testid="sheet.export" @click="doExport">
              Export
            </button>
          </div>
        </template>
        <template v-else>
          <div class="d-flex gap-2 align-items-center flex-wrap">
            <button
              class="btn btn-sm btn-outline-primary"
              data-testid="sheet.pick-png"
              @click="choosePng"
            >
              {{ sheetPng?.name ?? 'Choose sheet PNG…' }}
            </button>
            <button
              class="btn btn-sm btn-outline-secondary"
              data-testid="sheet.pick-json"
              @click="chooseJson"
            >
              {{ meta ? 'Layout loaded' : 'Choose .sheet.json…' }}
            </button>
            <button
              class="btn btn-sm btn-primary"
              :disabled="!sheetPng"
              data-testid="sheet.analyse"
              @click="analyse"
            >
              Compare
            </button>
          </div>
          <div v-if="!meta" class="mt-2 text-secondary">
            Without a JSON the sheet is read with this layout, anchored at the bottom centre of each
            cell: cell
            <input
              v-model.number="manual.w"
              type="number"
              min="1"
              class="form-control form-control-sm d-inline-block"
              style="width: 4.5rem"
              data-testid="sheet.manual.w"
            />
            ×
            <input
              v-model.number="manual.h"
              type="number"
              min="1"
              class="form-control form-control-sm d-inline-block"
              style="width: 4.5rem"
              data-testid="sheet.manual.h"
            />, columns
            <input
              v-model.number="manual.columns"
              type="number"
              min="1"
              class="form-control form-control-sm d-inline-block"
              style="width: 4rem"
            />, spacing
            <input
              v-model.number="manual.spacing"
              type="number"
              min="0"
              class="form-control form-control-sm d-inline-block"
              style="width: 4rem"
            />
          </div>
          <table v-if="changes" class="table table-sm mt-2" data-testid="sheet.changes">
            <thead>
              <tr>
                <th />
                <th>Sprite</th>
                <th>Before</th>
                <th>After</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in changes" :key="c.index" :data-testid="`sheet.change.${c.index}`">
                <td>
                  <input
                    v-model="c.include"
                    type="checkbox"
                    class="form-check-input"
                    :disabled="!c.changed"
                    :aria-label="`Include sprite ${spriteLetter(c.index)}`"
                  />
                </td>
                <td class="mono">{{ spriteLetter(c.index) }}</td>
                <td><Thumb :decoded="c.before" :size="40" /></td>
                <td><Thumb :decoded="c.parsed.decoded" :size="40" /></td>
                <td>
                  {{
                    c.changed
                      ? `${c.diff} px differ, offset ${c.parsed.posX}, ${c.parsed.posY}`
                      : 'unchanged'
                  }}
                </td>
              </tr>
            </tbody>
          </table>
          <div class="text-end mt-3">
            <button class="btn btn-sm btn-outline-secondary me-2" @click="emit('close')">
              Cancel
            </button>
            <button
              class="btn btn-sm btn-primary"
              :disabled="!included.length"
              data-testid="sheet.apply"
              @click="applyImport"
            >
              Apply {{ included.length }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
