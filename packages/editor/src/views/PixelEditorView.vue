<script setup lang="ts">
// Sprite pixel editor (spec 13). Edits a working copy of one sprite held by
// usePixelEditor; Apply writes it back through useSpriteImport.applyImage
// (shared-image handling, one document undo step). Canvas drawing, pointer
// tools and zoom live in usePixelRender, usePixelPointer and usePixelZoom.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { MAX_IMAGE_BYTES, TRANSPARENT, spriteLetter, vgaToRgb, type RGB } from '@omf/formats';
import IntField from '../components/widgets/IntField.vue';
import Icon from '../components/Icon.vue';
import SceneCanvas from '../components/scene/SceneCanvas.vue';
import PixelToolbar from '../components/pixel/PixelToolbar.vue';
import PixelPalette from '../components/pixel/PixelPalette.vue';
import ResizeDialog from '../components/pixel/ResizeDialog.vue';
import { useDocument } from '../composables/useDocument';
import { useSelection } from '../composables/useSelection';
import { useSharedImages } from '../composables/useSharedImages';
import { usePalette } from '../composables/usePalette';
import { usePlayback } from '../composables/usePlayback';
import { useConfirm } from '../composables/useConfirm';
import { useShortcuts } from '../composables/useShortcuts';
import { useToasts } from '../composables/useToasts';
import { PIXEL_TOOLS, usePixelEditor, type PixelTool } from '../composables/usePixelEditor';
import { usePixelPointer } from '../composables/usePixelPointer';
import { usePixelRender } from '../composables/usePixelRender';
import { usePixelZoom } from '../composables/usePixelZoom';
import { useSpriteImport, PNG_TYPES } from '../composables/useSpriteImport';
import { animationLabel } from '../lib/doc';
import { rgbHex } from '../lib/colorHex';
import * as px from '../lib/pixels';
import { pickFile, download } from '../lib/files';
import { clamp } from '../lib/util';
import { indexedPngOf, rgbaPngOf } from '../codecs/export';

const router = useRouter();
const docs = useDocument();
const sel = useSelection();
const shared = useSharedImages();
const palette = usePalette();
const pb = usePlayback();
const { confirm } = useConfirm();
const shortcuts = useShortcuts();
const toasts = useToasts();
const pe = usePixelEditor();
const imp = useSpriteImport();

const index = computed(() => sel.spriteIndex.value ?? 0);
const anim = computed(() => sel.animation.value);
const sprite = computed(() => anim.value?.sprites[index.value] ?? null);
const letter = computed(() => spriteLetter(index.value));
const resizeOpen = ref(false);
/** Set by Apply so leaving the route does not ask to discard. */
let applied = false;

/** The working image; `version` bumps on every commit, undo and load. */
const img = computed(() => {
  void pe.version.value;
  return pe.working.value;
});
const colors = computed<RGB[]>(() => palette.activePalette.value.colors.map(vgaToRgb));

const main = ref<HTMLCanvasElement | null>(null);
const overlay = ref<HTMLCanvasElement | null>(null);
const pane = ref<HTMLElement | null>(null);
const zoom = usePixelZoom(pane, () => img.value);
const pointer = usePixelPointer(overlay, zoom, () => img.value);
const hoverPx = pointer.hoverPx;
const { render } = usePixelRender({
  main,
  overlay,
  animation: () => anim.value,
  index: () => index.value,
  img: () => img.value,
  preview: () => pointer.preview.value,
  hoverPx: () => hoverPx.value,
});

function loadSprite(): void {
  const s = sprite.value;
  if (!s) return;
  const d = shared.decoded(s);
  // An image without pixels opens as 1×1, as openomf loads it; the header
  // size of such a sprite is often garbage (60537×60537).
  pe.load(d.width > 0 ? d : px.blank(1, 1), s.posX, s.posY);
  if (main.value) zoom.fitZoom();
}
watch([() => sel.animId.value, index], loadSprite, { immediate: true });
onMounted(() => {
  zoom.fitZoom();
  render();
});

// --------------------------------------------------------------- edits
const clippedToast = (n: number, what = 'pixel(s) clipped'): void => {
  if (n) toasts.info(`${n} ${what}`);
};
/** Flip / rotate the selection or the image, telling how many pixels fell off. */
function transform(fn: (d: px.Img) => px.Img): void {
  clippedToast(pe.transform(fn), 'pixel(s) outside the sprite were clipped');
}
const nudge = (dx: number, dy: number): void => clippedToast(pe.nudge(dx, dy));
const pasteClip = (atCursor: boolean): void =>
  clippedToast(pe.paste(atCursor ? (hoverPx.value ?? undefined) : undefined));

function doResize(r: { img: px.Img; dx: number; dy: number }): void {
  pe.begin();
  pe.posX.value += r.dx;
  pe.posY.value += r.dy;
  pe.selection.value = null;
  pe.commit(r.img);
  resizeOpen.value = false;
  zoom.fitZoom();
}

async function importPng(): Promise<void> {
  const f = await pickFile(PNG_TYPES);
  if (!f) return;
  const d = await imp.decodeAndMatch(f);
  if (!d) return;
  pe.begin();
  pe.selection.value = null;
  pe.commit(d);
  zoom.fitZoom();
}
async function exportPng(): Promise<void> {
  const d = img.value;
  // Stored indices with the palette imports match against, so the file re-imports unchanged.
  const bytes = indexedPngOf(d, imp.matchPalette.value) ?? (await rgbaPngOf(d, imp.matchLut.value));
  download(`${docs.fileName.value}-${sel.animId.value}-${letter.value}.png`, bytes, 'image/png');
}

// --------------------------------------------------------------- apply / cancel
function backToSprites(): void {
  void router.push({
    name: 'anim-sprites',
    params: { id: sel.animId.value },
    query: { sprite: String(index.value) },
  });
}
async function apply(): Promise<void> {
  if (pe.tooLarge.value) return;
  const ok = await imp.applyImage(
    { animId: sel.animId.value!, index: index.value },
    img.value,
    `edit sprite ${sel.animId.value}/${letter.value}`,
    { x: pe.posX.value, y: pe.posY.value },
  );
  if (!ok) return;
  applied = true;
  backToSprites();
}
const cancel = backToSprites;
onBeforeRouteLeave(async () => {
  if (applied || !pe.modified.value) return true;
  return confirm(
    'Discard pixel edits?',
    'The changes to this sprite have not been applied.',
    'Discard',
  );
});

/** The working sprite as the scene preview draws it in place of the stored one. */
const working = computed(() => ({
  index: index.value,
  decoded: img.value,
  posX: pe.posX.value,
  posY: pe.posY.value,
}));

// --------------------------------------------------------------- shortcuts (spec 13 §8)
let off: (() => void)[] = [];
onMounted(() => {
  pb.pause();
  const tool = (id: PixelTool) => () => (pe.tool.value = id);
  /** Arrow keys nudge only with the move tool. */
  const nudgeKey = (dx: number, dy: number) => () => pe.tool.value === 'move' && nudge(dx, dy);
  off = [
    shortcuts.activate('pixels'),
    shortcuts.register('pixels', [
      ...PIXEL_TOOLS.map((t) => ({
        keys: `Key${t.key}`,
        label: t.key,
        description: `Pixel editor: ${t.label}`,
        run: tool(t.id),
      })),
      {
        keys: 'BracketLeft',
        label: '[',
        description: 'Smaller brush',
        run: () => (pe.brush.value = clamp(pe.brush.value - 1, 1, 8)),
      },
      {
        keys: 'BracketRight',
        label: ']',
        description: 'Larger brush',
        run: () => (pe.brush.value = clamp(pe.brush.value + 1, 1, 8)),
      },
      {
        keys: 'Equal',
        label: '+',
        description: 'Zoom in',
        run: () => zoom.setZoom(zoom.zoomStep(1)),
      },
      {
        keys: 'Minus',
        label: '-',
        description: 'Zoom out',
        run: () => zoom.setZoom(zoom.zoomStep(-1)),
      },
      { keys: 'Ctrl+KeyZ', label: 'Ctrl+Z', description: 'Undo stroke', run: pe.undo },
      { keys: 'Ctrl+KeyY', label: 'Ctrl+Y', description: 'Redo stroke', run: pe.redo },
      { keys: 'Ctrl+Shift+KeyZ', label: 'Ctrl+Shift+Z', description: 'Redo stroke', run: pe.redo },
      { keys: 'Ctrl+KeyA', label: 'Ctrl+A', description: 'Select all', run: pe.selectAll },
      {
        keys: 'Ctrl+KeyD',
        label: 'Ctrl+D',
        description: 'Deselect',
        run: () => (pe.selection.value = null),
      },
      { keys: 'Ctrl+KeyC', label: 'Ctrl+C', description: 'Copy selection', run: pe.copy },
      {
        keys: 'Ctrl+KeyV',
        label: 'Ctrl+V',
        description: 'Paste in place',
        run: () => pasteClip(false),
      },
      {
        keys: 'Ctrl+Shift+KeyV',
        label: 'Ctrl+Shift+V',
        description: 'Paste at the cursor',
        run: () => pasteClip(true),
      },
      {
        keys: 'Delete',
        label: 'Delete',
        description: 'Clear selection to transparent',
        run: pe.clearSelection,
      },
      {
        keys: 'KeyH',
        label: 'H',
        description: 'Flip horizontally',
        run: () => transform(px.flipH),
      },
      {
        keys: 'Shift+KeyV',
        label: 'Shift+V',
        description: 'Flip vertically',
        run: () => transform(px.flipV),
      },
      {
        keys: 'Shift+KeyG',
        label: 'Shift+G',
        description: 'Toggle grid',
        run: () => (pe.grid.value = !pe.grid.value),
      },
      {
        keys: 'Ctrl+Enter',
        label: 'Ctrl+Enter',
        description: 'Apply pixel edits',
        run: () => void apply(),
        inInputs: true,
      },
      {
        keys: 'Escape',
        label: 'Esc',
        description: 'Deselect, then cancel',
        run: () => {
          if (pe.selection.value) pe.selection.value = null;
          else cancel();
        },
      },
      {
        keys: 'Space',
        label: 'Space',
        description: 'Hold and drag to pan',
        run: pointer.holdSpace,
      },
      {
        keys: 'ArrowLeft',
        label: '←',
        description: 'Nudge left',
        run: nudgeKey(-1, 0),
      },
      {
        keys: 'ArrowRight',
        label: '→',
        description: 'Nudge right',
        run: nudgeKey(1, 0),
      },
      {
        keys: 'ArrowUp',
        label: '↑',
        description: 'Nudge up',
        run: nudgeKey(0, -1),
      },
      {
        keys: 'ArrowDown',
        label: '↓',
        description: 'Nudge down',
        run: nudgeKey(0, 1),
      },
      {
        keys: 'Shift+ArrowLeft',
        label: 'Shift+←',
        description: 'Nudge left 8',
        run: nudgeKey(-8, 0),
      },
      {
        keys: 'Shift+ArrowRight',
        label: 'Shift+→',
        description: 'Nudge right 8',
        run: nudgeKey(8, 0),
      },
      {
        keys: 'Shift+ArrowUp',
        label: 'Shift+↑',
        description: 'Nudge up 8',
        run: nudgeKey(0, -8),
      },
      {
        keys: 'Shift+ArrowDown',
        label: 'Shift+↓',
        description: 'Nudge down 8',
        run: nudgeKey(0, 8),
      },
    ]),
  ];
});
onBeforeUnmount(() => off.forEach((f) => f()));

const hoverIndex = computed(() =>
  hoverPx.value ? px.get(img.value, hoverPx.value.x, hoverPx.value.y) : undefined,
);
const hexOf = (i: number): string => {
  const c = colors.value[i];
  return c ? rgbHex(c) : '';
};
</script>

<template>
  <div v-if="anim && sprite" class="d-flex flex-column h-100" data-testid="view.pixels">
    <PixelToolbar
      :title="`${animationLabel(docs.kind.value ?? 'af', sel.animId.value!)} · sprite ${letter} (${index + 1} of ${anim.sprites.length})`"
      @transform="transform"
      @resize="resizeOpen = true"
      @apply="apply"
      @cancel="cancel"
      @fit="zoom.fitZoom"
    />

    <div class="d-flex flex-grow-1" style="min-height: 0">
      <div
        ref="pane"
        class="pixel-pane flex-grow-1 position-relative overflow-hidden"
        :class="{ grab: pointer.spaceHeld.value, grabbing: pointer.panning.value }"
        data-testid="pixels.pane"
        @wheel="zoom.onWheel"
        @pointerdown.capture="pointer.onPanDown"
        @pointermove="pointer.onPanMove"
        @pointerup="pointer.onPanEnd"
        @pointercancel="pointer.onPanEnd"
        @auxclick.prevent
      >
        <div
          class="canvas-stage checkerboard pixel-stage"
          :style="{
            width: `${img.width * pe.zoom.value}px`,
            height: `${img.height * pe.zoom.value}px`,
            transform:
              `translate(${Math.round(zoom.offset.value.x)}px, ${Math.round(zoom.offset.value.y)}px)` +
              (pe.flipPreview.value ? ' scaleX(-1)' : ''),
          }"
          data-testid="pixels.stage"
        >
          <canvas
            ref="main"
            :style="{
              width: `${img.width * pe.zoom.value}px`,
              height: `${img.height * pe.zoom.value}px`,
            }"
            data-testid="pixels.canvas"
          />
          <canvas
            ref="overlay"
            class="overlay"
            data-testid="pixels.overlay"
            @pointerdown="pointer.onDown"
            @pointermove="pointer.onMove"
            @pointerup="pointer.onUp"
            @pointercancel="pointer.onCancel"
            @pointerleave="pointer.onLeave"
            @auxclick.prevent
            @contextmenu.prevent
          />
        </div>
      </div>

      <aside
        class="border-start p-2 overflow-auto"
        style="width: 300px; flex: none"
        data-testid="pixels.panel"
      >
        <PixelPalette :colors="colors" :img="img" />
        <hr class="my-2" />
        <div class="small fw-semibold">Geometry</div>
        <IntField
          v-model="pe.posX.value"
          :min="-32768"
          :max="32767"
          label="X offset"
          code="pos_x"
          testid="pixels.pos_x"
        />
        <IntField
          v-model="pe.posY.value"
          :min="-32768"
          :max="32767"
          label="Y offset"
          code="pos_y"
          testid="pixels.pos_y"
        />
        <div class="small" data-testid="pixels.size">
          {{ img.width }}×{{ img.height }}
          <button class="btn btn-link btn-sm p-0 ms-1" @click="resizeOpen = true">Resize…</button>
        </div>
        <div class="d-flex gap-1 mt-1">
          <button
            class="btn btn-sm btn-outline-secondary"
            data-testid="pixels.import"
            @click="importPng"
          >
            <Icon name="upload" /> Import PNG…
          </button>
          <button
            class="btn btn-sm btn-outline-secondary"
            data-testid="pixels.export"
            @click="exportPng"
          >
            <Icon name="download" /> Export PNG
          </button>
        </div>
        <div
          class="small mt-2"
          :class="pe.tooLarge.value ? 'text-danger fw-semibold' : 'text-secondary'"
          data-testid="pixels.encoded"
        >
          {{ pe.encodedSize.value.toLocaleString() }} / {{ MAX_IMAGE_BYTES.toLocaleString() }} B
          encoded
          <template v-if="pe.tooLarge.value"> — too large to save</template>
        </div>
        <hr class="my-2" />
        <div class="small fw-semibold">Preview</div>
        <div style="transform-origin: top left" class="mt-1">
          <SceneCanvas
            :animation="anim"
            :working="working"
            :scale="0.875"
            testid="pixels.preview"
          />
        </div>
      </aside>
    </div>

    <div
      class="border-top px-3 small mono text-secondary"
      style="height: 1.6rem; line-height: 1.6rem"
      data-testid="pixels.status"
    >
      {{ img.width }}×{{ img.height }}
      <template v-if="hoverPx">
        · x {{ hoverPx.x }} y {{ hoverPx.y }} ·
        {{
          hoverIndex === TRANSPARENT
            ? 'transparent'
            : hoverIndex === undefined
              ? ''
              : `idx ${hoverIndex} ${hexOf(hoverIndex)}`
        }}</template
      >
      · pos_x {{ pe.posX.value }} pos_y {{ pe.posY.value }}
    </div>

    <ResizeDialog v-if="resizeOpen" :img="img" @close="resizeOpen = false" @resize="doResize" />
  </div>
</template>

<style scoped>
.pixel-pane {
  background: var(--omf-canvas-bg);
  min-width: 0;
  touch-action: none;
  cursor: crosshair;
}
/* Placed by the view transform (offset + zoom), not by layout or scrolling. */
.pixel-stage {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: center;
}
.pixel-pane.grab,
.pixel-pane.grab .overlay {
  cursor: grab;
}
.pixel-pane.grabbing,
.pixel-pane.grabbing .overlay {
  cursor: grabbing;
}
</style>
