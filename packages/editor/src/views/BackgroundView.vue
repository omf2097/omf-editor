<script setup lang="ts">
// BK background image (spec 07): view, PNG export and import. Unlike sprites,
// background index 0 is an opaque colour and no pixel may be transparent.
// Optionally draws sprite A of one animation at its start position on top.
import { computed, onMounted, ref, watch } from 'vue';
import { TRANSPARENT, resolveSharedImages, type BKFile } from '@omf/formats';
import Icon from '../components/Icon.vue';
import { useDocument } from '../composables/useDocument';
import { usePalette } from '../composables/usePalette';
import { useSpriteImport, PNG_TYPES } from '../composables/useSpriteImport';
import { useConfirm } from '../composables/useConfirm';
import { useToasts } from '../composables/useToasts';
import { blit, compositeFrame, decodedOf, type DrawSprite } from '../canvas/render';
import { spriteRect } from '../lib/scene';
import { download, pickFile } from '../lib/files';
import { indexedPngOf, rgbaPngOf } from '../codecs/export';

const docs = useDocument();
const palette = usePalette();
const imp = useSpriteImport();
const { confirm } = useConfirm();
const toasts = useToasts();
const canvas = ref<HTMLCanvasElement | null>(null);
const zoom = ref(2);
const overlayAnim = ref<number | null>(null);

const bk = computed(() => (docs.kind.value === 'bk' ? (docs.doc.value as BKFile) : null));
const decodedBg = computed(() => {
  const b = bk.value;
  return b
    ? {
        width: b.backgroundWidth,
        height: b.backgroundHeight,
        pixels: Uint16Array.from(b.background),
      }
    : null;
});

function render(): void {
  const b = bk.value;
  const c = canvas.value;
  if (!b || !c) return;
  const sprites: DrawSprite[] = [];
  if (overlayAnim.value !== null) {
    const a = b.animations.get(overlayAnim.value);
    const s = a?.sprites[0];
    if (a && s) {
      const d = decodedOf(s, resolveSharedImages(b.animations.values()).get(s));
      const r = spriteRect(s, { x: a.startX, y: a.startY }, false, d.width, d.height);
      sprites.push({ decoded: d, x: r.x, y: r.y });
    }
  }
  const rgba = compositeFrame(
    {
      width: b.backgroundWidth,
      height: b.backgroundHeight,
      background: b.background,
      backgroundWidth: b.backgroundWidth,
      sprites,
    },
    palette.lut.value,
  );
  blit(c, rgba, b.backgroundWidth, b.backgroundHeight);
}
watch([bk, () => palette.lut.value, overlayAnim], render);
onMounted(render);

async function exportPng(): Promise<void> {
  const d = decodedBg.value;
  if (!d) return;
  const bytes = indexedPngOf(d, imp.matchPalette.value) ?? (await rgbaPngOf(d, imp.matchLut.value));
  download(`${docs.fileName.value}-background.png`, bytes, 'image/png');
}

async function importPng(): Promise<void> {
  const b = bk.value;
  if (!b) return;
  const f = await pickFile(PNG_TYPES);
  if (!f) return;
  const d = await imp.decodeAndMatch(f, { sprite: false });
  if (!d) return;
  if (d.pixels.some((p) => p === TRANSPARENT)) {
    toasts.error('The background cannot have transparent pixels');
    return;
  }
  if (d.width !== b.backgroundWidth || d.height !== b.backgroundHeight) {
    const ok = await confirm(
      'Different size',
      `The image is ${d.width}×${d.height} but the background is ${b.backgroundWidth}×${b.backgroundHeight}. Resize the background to match? Every shipped scene is 320×200.`,
      'Resize',
    );
    if (!ok) return;
  }
  docs.mutate<BKFile>('import background', (x) => {
    x.backgroundWidth = d.width;
    x.backgroundHeight = d.height;
    x.background = Uint8Array.from(d.pixels);
  });
}
</script>

<template>
  <div v-if="bk" class="view-pad" data-testid="view.background">
    <div class="d-flex gap-2 align-items-center mb-2 flex-wrap">
      <strong>Background {{ bk.backgroundWidth }}×{{ bk.backgroundHeight }}</strong>
      <div class="btn-group btn-group-sm ms-3">
        <button
          v-for="z in [1, 2, 3, 4]"
          :key="z"
          class="btn"
          :class="zoom === z ? 'btn-secondary' : 'btn-outline-secondary'"
          :data-testid="`bg.zoom.${z}`"
          @click="zoom = z"
        >
          {{ z }}×
        </button>
      </div>
      <label class="small d-flex align-items-center gap-1 ms-2"
        >overlay
        <select
          v-model="overlayAnim"
          class="form-select form-select-sm w-auto"
          data-testid="bg.overlay"
        >
          <option :value="null">none</option>
          <option v-for="id in bk.animations.keys()" :key="id" :value="id">
            animation {{ id }}
          </option>
        </select>
      </label>
      <button
        class="btn btn-sm btn-outline-secondary ms-auto"
        data-testid="bg.import"
        @click="importPng"
      >
        <Icon name="upload" /> Import PNG…
      </button>
      <button class="btn btn-sm btn-outline-secondary" data-testid="bg.export" @click="exportPng">
        <Icon name="download" /> Export PNG
      </button>
    </div>
    <div class="canvas-stage">
      <canvas
        ref="canvas"
        :style="{
          width: `${bk.backgroundWidth * zoom}px`,
          height: `${bk.backgroundHeight * zoom}px`,
        }"
        data-testid="bg.canvas"
      />
    </div>
  </div>
</template>
