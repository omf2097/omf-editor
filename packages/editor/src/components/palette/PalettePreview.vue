<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { paletteToRgbaLut, readAF, remapPalette, type Palette } from '@omf/formats';
import { ALTPALS_COMPARE, usePaletteEditor } from '../../composables/usePaletteEditor';
import { usePaletteUsage } from '../../composables/usePaletteUsage';
import { usePalette } from '../../composables/usePalette';
import { useToasts, errorMessage } from '../../composables/useToasts';
import {
  SCENE_H,
  SCENE_W,
  blit,
  compositeFrame,
  decodedOf,
  playerShift,
  type DrawSprite,
} from '../../canvas/render';
import { pickFile } from '../../lib/files';
import { ARENA_FLOOR, AF_ORIGIN_X, spriteRect } from '../../lib/scene';
import { TRANSPARENT, resolveSharedImages } from '@omf/formats';

// Preview of the Palettes view (spec 16 §2.6): the background, the first
// sprite of a chosen animation and of a loaded fighter's idle move, drawn
// with palette A (left of the split) and the compared palette B (right).
// Hover and click report the palette index under the pointer.

const pe = usePaletteEditor();
const palette = usePalette();
const u = usePaletteUsage();
const toasts = useToasts();
const canvas = ref<HTMLCanvasElement | null>(null);
const showBg = ref(true);
const animId = ref<number | null>(null);
const player = ref<0 | 48>(0);
const applyRemap = ref(false);
const split = ref(50);
const hoverIdx = ref<number | null>(null);
const emit = defineEmits<{ hover: [i: number | null]; pick: [i: number] }>();

const bk = computed(() => pe.bk.value);
const anims = computed(() => [...(bk.value?.animations.keys() ?? [])]);

/** `candidate`: the remap tool's proposal, which belongs to the edited palette (A) only. */
function paletteFor(
  p: Palette | null,
  remaps: Uint8Array[] | undefined,
  candidate: Uint8Array | null,
): Palette | null {
  if (!p) return null;
  const r = candidate ?? remaps?.[pe.remapSlot.value];
  return applyRemap.value && r ? remapPalette(p, r) : p;
}
const lutA = computed(() => {
  const p = paletteFor(pe.shown.value, pe.current.value?.remaps, pe.candidateRemap.value);
  return p ? paletteToRgbaLut(p) : null;
});
/** Compare palette B: another palette of this file, or an ALTPALS palette (no remaps). */
const lutB = computed(() => {
  const c = pe.compareWith.value;
  if (c === null) return null;
  if (c >= ALTPALS_COMPARE) {
    const alt = palette.altPals.value?.[c - ALTPALS_COMPARE];
    return alt ? paletteToRgbaLut(alt) : null;
  }
  const m = bk.value?.palettes[c];
  const p = paletteFor(m?.colors ?? null, m?.remaps, null);
  return p ? paletteToRgbaLut(p) : null;
});

/** Sprites of the preview in paint order (indexAt hit-tests them in reverse). AF move 11 is Idle. */
function sprites(): DrawSprite[] {
  const out: DrawSprite[] = [];
  const b = bk.value;
  if (b && animId.value !== null) {
    const a = b.animations.get(animId.value);
    const owners = resolveSharedImages(b.animations.values());
    const s = a?.sprites[0];
    if (a && s) {
      const d = decodedOf(s, owners.get(s));
      const r = spriteRect(s, { x: a.startX, y: a.startY }, false, d.width, d.height);
      out.push({ decoded: d, x: r.x, y: r.y });
    }
  }
  const f = u.previewAf.value?.af;
  const idle = f?.moves.get(11) ?? (f ? [...f.moves.values()][0] : undefined);
  const s = idle?.sprites[0];
  if (s && f) {
    const owners = resolveSharedImages(f.moves.values());
    const d = decodedOf(s, owners.get(s));
    const r = spriteRect(s, { x: AF_ORIGIN_X, y: ARENA_FLOOR }, false, d.width, d.height);
    out.push({ decoded: d, x: r.x, y: r.y, shift: playerShift(player.value) });
  }
  return out;
}

function render(): void {
  const c = canvas.value;
  const b = bk.value;
  if (!c || !b || !lutA.value) return;
  const scene = {
    width: SCENE_W,
    height: SCENE_H,
    background: showBg.value ? b.background : null,
    backgroundWidth: b.backgroundWidth,
    sprites: sprites(),
  };
  const a = compositeFrame(scene, lutA.value);
  if (lutB.value) {
    const bb = compositeFrame(scene, lutB.value);
    const sx = Math.round((split.value / 100) * SCENE_W);
    for (let y = 0; y < SCENE_H; y++) {
      const row = y * SCENE_W * 4;
      a.set(bb.subarray(row + sx * 4, row + SCENE_W * 4), row + sx * 4);
    }
  }
  blit(c, a, SCENE_W, SCENE_H);
}
watch([lutA, lutB, showBg, animId, player, split, () => u.previewAf.value, () => bk.value], render);
onMounted(render);

async function loadFighter(): Promise<void> {
  const f = await pickFile([
    { description: 'OMF fighter', accept: { 'application/octet-stream': ['.af', '.AF'] } },
  ]);
  if (!f) return;
  try {
    u.previewAf.value = { name: f.name, af: readAF(f.bytes) };
  } catch (e) {
    toasts.error(`${f.name}: ${errorMessage(e)}`);
  }
}

function indexAt(ev: MouseEvent): number | null {
  const el = canvas.value!;
  const r = el.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - r.left) / r.width) * SCENE_W);
  const y = Math.floor(((ev.clientY - r.top) / r.height) * SCENE_H);
  const b = bk.value;
  for (const s of [...sprites()].reverse()) {
    const lx = x - s.x;
    const ly = y - s.y;
    if (lx >= 0 && ly >= 0 && lx < s.decoded.width && ly < s.decoded.height) {
      const p = s.decoded.pixels[ly * s.decoded.width + lx]!;
      if (p !== TRANSPARENT) return s.shift ? s.shift(p) : p;
    }
  }
  if (b && showBg.value && x >= 0 && y >= 0 && x < b.backgroundWidth && y < b.backgroundHeight)
    return b.background[y * b.backgroundWidth + x]!;
  return null;
}
function onMove(ev: MouseEvent): void {
  hoverIdx.value = indexAt(ev);
  emit('hover', hoverIdx.value);
}
function onClick(ev: MouseEvent): void {
  const i = indexAt(ev);
  if (i !== null) emit('pick', i);
}
</script>

<template>
  <div class="small" data-testid="palette-preview">
    <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
      <label class="form-check mb-0"
        ><input
          v-model="showBg"
          type="checkbox"
          class="form-check-input"
          data-testid="palette-preview.bg"
        />
        background</label
      >
      <select
        v-model="animId"
        class="form-select form-select-sm w-auto"
        aria-label="Animation"
        data-testid="palette-preview.anim"
      >
        <option :value="null">no animation</option>
        <option v-for="id in anims" :key="id" :value="id">anim {{ id }}</option>
      </select>
      <button
        class="btn btn-sm btn-outline-secondary"
        data-testid="palette-preview.fighter"
        @click="loadFighter"
      >
        {{ u.previewAf.value?.name ?? 'Load fighter…' }}
      </button>
      <div v-if="u.previewAf.value" class="btn-group btn-group-sm">
        <button
          class="btn"
          :class="player === 0 ? 'btn-secondary' : 'btn-outline-secondary'"
          @click="player = 0"
        >
          P1
        </button>
        <button
          class="btn"
          :class="player === 48 ? 'btn-secondary' : 'btn-outline-secondary'"
          @click="player = 48"
        >
          P2
        </button>
      </div>
    </div>
    <div class="position-relative canvas-stage">
      <canvas
        ref="canvas"
        width="320"
        height="200"
        style="width: 400px; height: 250px; cursor: crosshair"
        role="img"
        :aria-label="`Preview of palette ${pe.index.value}${lutB ? ' compared with another palette' : ''}; hover to see the index, click to select it, I picks the index under the pointer`"
        data-testid="palette-preview.canvas"
        @mousemove="onMove"
        @mouseleave="emit('hover', null)"
        @click="onClick"
      />
      <div
        v-if="lutB"
        class="position-absolute top-0 bottom-0 bg-warning"
        style="width: 2px"
        :style="{ left: `${split}%` }"
      />
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center mt-1">
      <label class="form-check mb-0"
        ><input
          v-model="applyRemap"
          type="checkbox"
          class="form-check-input"
          data-testid="palette-preview.remap"
        />
        apply remap {{ pe.remapSlot.value }}</label
      >
      <span v-if="hoverIdx !== null" class="mono">idx {{ hoverIdx }}</span>
      <label v-if="lutB" class="ms-auto"
        >split
        <input
          v-model.number="split"
          type="range"
          min="0"
          max="100"
          data-testid="palette-preview.split"
      /></label>
    </div>
  </div>
</template>
