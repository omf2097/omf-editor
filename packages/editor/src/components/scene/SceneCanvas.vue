<script setup lang="ts">
// The 320×200 scene preview (spec 11 §Rendering): background, the current
// sprite placed by origin, playback movement and flips, and an overlay with
// grid, bounds, origin and collision points. Pointer events are reported in
// scene pixels for the views that edit on it.
//
// Without a `scale` it is the zoomable preview (spec 12 §9): a fixed box with
// the scene's aspect, the stage placed in it by the shared view transform
// (useSceneView): wheel zoom, Space / middle drag pan, Fit. A `scale` gives a
// plain canvas at that fixed size.
//
// The zoomable preview has two framings (viewport.mode). Scene draws the stage
// as the 320×200 scene. Centred follows the object: the stage is centredStage
// (lib/scene) and everything drawn is shifted by the camera (cameraShift), so
// the object stays put and the background moves; pointer positions are
// shifted back, so the views always get scene pixels. The shift is held while
// a left drag on the overlay lasts, so what is dragged follows the pointer.
// The zoomable preview also goes fullscreen (useSceneFullscreen).
//
// The enemy-string preview (spec 15 §6.1) draws the opponent as the object:
// `facingLeft`, `playerOffset`, `origin` and `decode` override the defaults
// for it, `idle` is what it shows during a paired lead-in, and `partner` (the
// attacker) is drawn behind it. Overlays and pointer events stay the object's.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  TRANSPARENT,
  spriteIndexOfFrame,
  spriteLetter,
  type DecodedSprite,
  type Sprite,
} from '@omf/formats';
import { useDocument } from '../../composables/useDocument';
import { usePalette } from '../../composables/usePalette';
import { usePlayback } from '../../composables/usePlayback';
import { useViewport } from '../../composables/useViewport';
import { useSharedImages } from '../../composables/useSharedImages';
import { useSceneOrigin } from '../../composables/useSceneOrigin';
import { useSceneView } from '../../composables/useSceneView';
import { useSceneFullscreen } from '../../composables/useSceneFullscreen';
import PlaybackBar from './PlaybackBar.vue';
import Icon from '../Icon.vue';
import {
  SCENE_H,
  SCENE_W,
  blit,
  compositeFrame,
  playerShift,
  type DrawSprite,
} from '../../canvas/render';
import { drawSceneOverlay } from '../../canvas/overlay';
import {
  cameraShift,
  centredStage,
  hitPoint,
  spriteRect,
  type CentredStage,
  type Point,
} from '../../lib/scene';
import { shakeOffset } from '../../lib/simulate';
import { clamp } from '../../lib/util';
import type { AnyAnimation } from '../../lib/doc';

const props = withDefaults(
  defineProps<{
    animation: AnyAnimation | null;
    /** Show this sprite instead of the one playback selects. */
    spriteOverride?: number | null;
    /** Substitute pixels for one sprite (pixel editor working copy). */
    working?: { index: number; decoded: DecodedSprite; posX: number; posY: number } | null;
    /** Hit point index to highlight. */
    selectedHit?: number | null;
    /** Show points of every sprite, dimmed (collisions view). */
    allHits?: boolean;
    interactive?: boolean;
    testid?: string;
    /** Display scale overriding the shared viewport zoom (may be fractional). */
    scale?: number | null;
    /** The object faces left; default the flip toggle. */
    facingLeft?: boolean | null;
    /** Palette player offset of the object's sprites; default the palette's. */
    playerOffset?: number | null;
    /** Scene position of the object's origin; default useSceneOrigin's. */
    origin?: Point | null;
    /** Decodes the animation's sprites; default the document's shared images. */
    decode?: ((s: Sprite) => DecodedSprite) | null;
    /** Drawn instead of the object while playback is in a lead-in (scene coordinates). */
    idle?: DrawSprite | null;
    /** A second fighter drawn behind the object (scene coordinates), with its screen shake. */
    partner?: { draw: DrawSprite; shakeX: number; shakeY: number } | null;
  }>(),
  {
    scale: null,
    facingLeft: null,
    playerOffset: null,
    origin: null,
    decode: null,
    idle: null,
    partner: null,
    spriteOverride: null,
    working: null,
    selectedHit: null,
    allHits: false,
    interactive: false,
    testid: 'scene-canvas',
  },
);
const emit = defineEmits<{
  pointer: [
    e: {
      type: 'down' | 'move' | 'up' | 'leave' | 'contextmenu';
      p: Point;
      ev: PointerEvent | MouseEvent;
    },
  ];
}>();

const docs = useDocument();
const palette = usePalette();
const playback = usePlayback();
const viewport = useViewport();
const shared = useSharedImages();
const scene = useSceneOrigin();

const main = ref<HTMLCanvasElement | null>(null);
const overlay = ref<HTMLCanvasElement | null>(null);
const pane = ref<HTMLElement | null>(null);
/** The zoomable preview's root: what goes fullscreen, with the slim playback bar. */
const frameEl = ref<HTMLElement | null>(null);
/** Zoomable preview (no fixed scale); decided once per instance. */
const zoomable = props.scale === null;
const facingLeft = computed(() => props.facingLeft ?? viewport.toggles.flip);

/** The Centred stage; null in Scene mode, at a fixed scale and without drawable sprites. */
const stage = computed<CentredStage | null>(() =>
  zoomable && viewport.mode.value === 'centred' && props.animation
    ? centredStage(props.animation.sprites, facingLeft.value)
    : null,
);
const stageW = computed(() => stage.value?.width ?? SCENE_W);
const stageH = computed(() => stage.value?.height ?? SCENE_H);

const full = zoomable ? useSceneFullscreen(frameEl) : null;
const view = full
  ? useSceneView(
      pane,
      () => ({ width: stageW.value, height: stageH.value, frame: stage.value?.frame ?? null }),
      full.isFullscreen,
    )
  : null;
/** Pane events, bound only on the zoomable preview. */
const paneEvents = view
  ? {
      wheel: view.onWheel,
      pointerdownCapture: view.onPanDown,
      pointermove: view.onPanMove,
      pointerup: view.onPanEnd,
      pointercancel: view.onPanEnd,
      // No autoscroll or paste on the middle button.
      auxclick: (e: MouseEvent) => e.preventDefault(),
    }
  : {};

const kind = computed(() => docs.kind.value ?? 'af');
const z = computed(() => props.scale ?? viewport.zoom.value);

/** Current sprite index shown. */
const spriteIndex = computed(() => {
  if (props.spriteOverride !== null) return props.spriteOverride;
  // A paired lead-in shows no sprite of the animation yet (the idle one, if any).
  if (playback.state.value.preroll) return -1;
  const f = playback.script.value.frames[playback.state.value.frameIndex];
  return f ? spriteIndexOfFrame(f) : 0;
});

/** Object position: origin plus simulated movement. */
const objectPos = computed<Point>(() => {
  const a = props.animation;
  if (!a) return { x: 0, y: 0 };
  const o = props.origin ?? scene.origin(a, facingLeft.value);
  if (props.spriteOverride !== null) return o;
  return { x: o.x + playback.state.value.x, y: o.y + playback.state.value.y };
});

/** The frame's ox/oy tags: an offset for this frame's sprite only (spec 15 §5). */
const frameCorrection = computed<Point>(() => {
  if (props.spriteOverride !== null) return { x: 0, y: 0 };
  const f = playback.script.value.frames[playback.state.value.frameIndex];
  const ox = f?.tags.find((t) => t.key === 'ox')?.value ?? 0;
  const oy = f?.tags.find((t) => t.key === 'oy')?.value ?? 0;
  return { x: ox, y: oy };
});

const backgroundBk = scene.backgroundBk;

/** Camera shift held while a left drag on the overlay lasts. */
const held = ref<Point | null>(null);
/** Scene → stage pixels: stage = scene + shift. Zero but in Centred mode. */
const shift = computed<Point>(() => {
  if (held.value) return held.value;
  return stage.value ? cameraShift(stage.value, objectPos.value) : { x: 0, y: 0 };
});

/** The sprite drawn now (the pixel editor's working copy when given) and its scene rectangle. */
function currentDraw(): {
  draw: DrawSprite | null;
  rect: { x: number; y: number; w: number; h: number } | null;
} {
  const a = props.animation;
  if (!a) return { draw: null, rect: null };
  if (props.idle && props.spriteOverride === null && playback.state.value.preroll) {
    const d = props.idle;
    return { draw: d, rect: { x: d.x, y: d.y, w: d.decoded.width, h: d.decoded.height } };
  }
  const idx = spriteIndex.value;
  const s = a.sprites[idx];
  if (!s) return { draw: null, rect: null };
  let decoded = props.decode ? props.decode(s) : shared.decoded(s);
  let sprite = s;
  if (props.working && props.working.index === idx) {
    decoded = props.working.decoded;
    sprite = { ...s, posX: props.working.posX, posY: props.working.posY };
  }
  const pos = {
    x: objectPos.value.x + frameCorrection.value.x,
    y: objectPos.value.y + frameCorrection.value.y,
  };
  const r = spriteRect(sprite, pos, facingLeft.value, decoded.width, decoded.height);
  const simFlipX = props.spriteOverride === null && playback.state.value.flipX;
  const simFlipY = props.spriteOverride === null && playback.state.value.flipY;
  return {
    draw: {
      decoded,
      x: r.x,
      y: r.y,
      flipX: r.flipX !== simFlipX,
      flipY: simFlipY,
      shift:
        kind.value === 'af'
          ? playerShift(props.playerOffset ?? palette.playerOffset.value)
          : undefined,
    },
    rect: r,
  };
}

/** Widest overlay canvas drawn, in device pixels. */
const OVERLAY_MAX_PX = 4096;

/** Rectangle of the last rendered sprite, for the bounds overlay. */
let last: { rect: ReturnType<typeof currentDraw>['rect'] } = { rect: null };

function render(): void {
  const c = main.value;
  if (!c) return;
  const bk = backgroundBk.value;
  const { draw, rect } = currentDraw();
  last = { rect };
  const st = playback.state.value;
  const d = shift.value;
  const at = (x: DrawSprite): DrawSprite => ({ ...x, x: x.x + d.x, y: x.y + d.y });
  const partner = props.partner;
  const sprites = [...(partner ? [at(partner.draw)] : []), ...(draw ? [at(draw)] : [])];
  // One screen: the larger shake of the two fighters' strings.
  const shakeX = Math.max(st.shakeX, partner?.shakeX ?? 0);
  const shakeY = Math.max(st.shakeY, partner?.shakeY ?? 0);
  const rgba = compositeFrame(
    {
      width: stageW.value,
      height: stageH.value,
      background: viewport.toggles.bg && bk ? bk.background : null,
      backgroundWidth: bk?.backgroundWidth,
      backgroundX: d.x,
      backgroundY: d.y,
      sprites,
      offsetX: shakeOffset(shakeX, st.elapsed),
      offsetY: shakeOffset(shakeY, st.elapsed),
    },
    palette.lut.value,
  );
  blit(c, rgba, stageW.value, stageH.value);
  renderOverlay();
}

function renderOverlay(): void {
  const o = overlay.value;
  if (!o) return;
  const t = viewport.toggles;
  const a = props.animation;
  const idx = spriteIndex.value;
  const showHits = (t.hits || props.interactive) && a;
  const d = shift.value;
  const at = (p: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });
  const r = last.rect;
  drawSceneOverlay(o, {
    // The overlay is drawn at integer zoom; a fractional scale is left to CSS,
    // and so is a zoom beyond what keeps the canvas at a sane size (a Centred
    // fit of a tiny frame).
    z: clamp(Math.round(z.value), 1, Math.max(1, Math.floor(OVERLAY_MAX_PX / stageW.value))),
    width: stageW.value,
    height: stageH.value,
    grid: t.grid,
    gridAt: d,
    bounds: t.bounds && r ? { ...r, ...at(r) } : null,
    origin: t.origin && a ? at(objectPos.value) : null,
    hits: showHits
      ? a.hitCoords.flatMap((c, i) =>
          c.spriteId === idx || props.allHits
            ? [
                {
                  p: at(hitPoint(c, objectPos.value, facingLeft.value)),
                  own: c.spriteId === idx,
                  selected: i === props.selectedHit,
                },
              ]
            : [],
        )
      : [],
  });
}

watch(
  [
    () => props.animation,
    () => props.working,
    () => props.spriteOverride,
    () => props.selectedHit,
    () => props.allHits,
    () => playback.state.value,
    () => palette.lut.value,
    () => palette.playerOffset.value,
    () => props.facingLeft,
    () => props.playerOffset,
    () => props.origin,
    () => props.idle,
    () => props.partner,
    backgroundBk,
    () => ({ ...viewport.toggles }),
    () => viewport.zoom.value,
    () => props.scale,
    stage,
    shift,
  ],
  render,
  { deep: false },
);
onMounted(render);

/** Scene pixel under the event; the overlay's displayed size spans the whole stage at any zoom. */
function logical(ev: MouseEvent): Point {
  const el = overlay.value!;
  const r = el.getBoundingClientRect();
  const d = shift.value;
  return {
    x: Math.floor(((ev.clientX - r.left) / r.width) * stageW.value) - d.x,
    y: Math.floor(((ev.clientY - r.top) / r.height) * stageH.value) - d.y,
  };
}

/** A left press on the overlay holds the camera until the button is released anywhere. */
function release(): void {
  held.value = null;
  window.removeEventListener('pointerup', release);
  window.removeEventListener('pointercancel', release);
}
function onDown(ev: PointerEvent): void {
  if (stage.value && ev.button === 0) {
    held.value = shift.value;
    // Bubble phase: the overlay's own pointerup (in held coordinates) runs first.
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }
  emit('pointer', { type: 'down', p: logical(ev), ev });
}
onBeforeUnmount(release);

/** Palette index shown at scene pixel `p`: the sprite's, else the background's, else null. */
function indexAt(p: Point): number | null {
  const { draw } = currentDraw();
  if (draw) {
    const d = draw.decoded;
    const lx = p.x - draw.x;
    const ly = p.y - draw.y;
    if (lx >= 0 && ly >= 0 && lx < d.width && ly < d.height) {
      const sx = draw.flipX ? d.width - 1 - lx : lx;
      const sy = draw.flipY ? d.height - 1 - ly : ly;
      const v = d.pixels[sy * d.width + sx]!;
      if (v !== TRANSPARENT) return v;
    }
  }
  const bk = backgroundBk.value;
  if (
    bk &&
    viewport.toggles.bg &&
    p.x >= 0 &&
    p.y >= 0 &&
    p.x < bk.backgroundWidth &&
    p.y < bk.backgroundHeight
  ) {
    return bk.background[p.y * bk.backgroundWidth + p.x] ?? null;
  }
  return null;
}

function onMove(ev: PointerEvent): void {
  const p = logical(ev);
  viewport.hover.value = { ...p, index: indexAt(p) };
  emit('pointer', { type: 'move', p, ev });
}
function onLeave(ev: PointerEvent): void {
  viewport.hover.value = null;
  emit('pointer', { type: 'leave', p: logical(ev), ev });
}

// Fullscreen: keys go to the preview, not to the toolbar button that was
// pressed (Space would press it again). The bar shows on mouse movement.
if (full) {
  watch(full.isFullscreen, (on) => {
    if (on) void nextTick(() => frameEl.value?.focus({ preventScroll: true }));
  });
}
function onFrameMove(): void {
  if (full?.isFullscreen.value) full.poke();
}

defineExpose({ render, spriteIndex, objectPos, indexAt });

const label = computed(() => {
  const a = props.animation;
  if (!a) return 'Empty scene';
  if (spriteIndex.value < 0) return 'Animation preview, before the hit';
  return `Animation preview, frame ${playback.state.value.frameIndex + 1}, sprite ${spriteLetter(spriteIndex.value)}`;
});
</script>

<template>
  <div
    ref="frameEl"
    :class="
      full
        ? ['scene-frame', { full: full.isFullscreen.value, idle: !full.barVisible.value }]
        : 'scene-plain'
    "
    :tabindex="full ? -1 : undefined"
    :data-testid="full ? `${testid}.frame` : undefined"
    @pointermove="onFrameMove"
  >
    <div
      ref="pane"
      :class="
        view
          ? ['scene-pane', { grab: view.spaceHeld.value, grabbing: view.panning.value }]
          : 'scene-plain'
      "
      :data-testid="view ? `${testid}.pane` : undefined"
      v-on="paneEvents"
    >
      <div
        class="canvas-stage"
        :class="{
          interactive,
          checkerboard: !viewport.toggles.bg || !backgroundBk,
          'scene-stage': view,
        }"
        :style="{
          width: `${stageW * z}px`,
          height: `${stageH * z}px`,
          transform: view
            ? `translate(${Math.round(view.offset.value.x)}px, ${Math.round(view.offset.value.y)}px)`
            : undefined,
        }"
        :data-testid="view ? `${testid}.stage` : undefined"
      >
        <canvas
          ref="main"
          :width="stageW"
          :height="stageH"
          :style="{ width: `${stageW * z}px`, height: `${stageH * z}px` }"
          role="img"
          :aria-label="label"
          :data-testid="testid"
        />
        <canvas
          ref="overlay"
          class="overlay"
          :data-testid="`${testid}.overlay`"
          @pointermove="onMove"
          @pointerleave="onLeave"
          @pointerdown="onDown"
          @pointerup="emit('pointer', { type: 'up', p: logical($event), ev: $event })"
          @contextmenu.prevent="
            emit('pointer', { type: 'contextmenu', p: logical($event), ev: $event })
          "
        />
      </div>
    </div>
    <div
      v-if="full?.isFullscreen.value"
      class="fs-bar"
      :class="{ hidden: !full.barVisible.value }"
      :data-testid="`${testid}.fsbar`"
      @pointerenter="full.onBar.value = true"
      @pointerleave="full.onBar.value = false"
    >
      <PlaybackBar slim :testid="`${testid}.fsbar.playback`">
        <button
          class="btn btn-sm btn-outline-secondary"
          title="Leave fullscreen (Esc)"
          aria-label="Leave fullscreen"
          :data-testid="`${testid}.fsbar.exit`"
          @click="full.exit()"
        >
          <Icon name="fullscreenExit" />
        </button>
      </PlaybackBar>
    </div>
  </div>
</template>

<style scoped>
/*
 * Fixed box: the scene's 320:200 aspect, at most 960×600 (3×), as wide as its
 * column allows and low enough that the playback controls below stay on screen.
 */
.scene-pane {
  position: relative;
  overflow: hidden;
  width: 100%;
  max-width: min(960px, calc((100vh - 330px) * 1.6));
  aspect-ratio: 320 / 200;
  background: var(--omf-canvas-bg);
  touch-action: none;
}
/* Placed by the view transform (offset + zoom), not by layout. */
.scene-stage {
  position: absolute;
  left: 0;
  top: 0;
}
.scene-plain {
  display: contents;
}
.scene-pane.grab,
.scene-pane.grab .overlay {
  cursor: grab;
}
.scene-pane.grabbing,
.scene-pane.grabbing .overlay {
  cursor: grabbing;
}
.scene-frame {
  position: relative;
  outline: none;
}
/* Fullscreen: the pane fills the screen; the playback bar floats over its foot. */
.scene-frame.full {
  width: 100%;
  height: 100%;
  background: var(--omf-canvas-bg);
}
.scene-frame.full .scene-pane {
  max-width: none;
  height: 100%;
  aspect-ratio: auto;
}
.scene-frame.full.idle .scene-pane,
.scene-frame.full.idle .overlay {
  cursor: none;
}
.fs-bar {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 12px;
  padding: 0 8px 4px;
  border-radius: var(--bs-border-radius);
  background: color-mix(in srgb, var(--bs-body-bg) 85%, transparent);
  transition: opacity 0.2s;
}
.fs-bar.hidden {
  opacity: 0;
  pointer-events: none;
}
</style>
