<script setup lang="ts">
import Icon from '../Icon.vue';
import {
  ZOOMS,
  useViewport,
  type ViewMode,
  type ViewportToggles,
} from '../../composables/useViewport';
import { useDocument } from '../../composables/useDocument';
import { usePalette } from '../../composables/usePalette';
import { useViewportShortcuts } from '../../composables/useSceneShortcuts';

const vp = useViewport();
useViewportShortcuts();
const docs = useDocument();
const palette = usePalette();
const items: {
  key: keyof ViewportToggles;
  label: string;
  icon: 'image' | 'flip' | 'origin' | 'rect' | 'hits' | 'grid';
  hint: string;
}[] = [
  { key: 'bg', label: 'bg', icon: 'image', hint: 'Background (B)' },
  { key: 'flip', label: 'flip', icon: 'flip', hint: 'Face left (F)' },
  { key: 'origin', label: 'origin', icon: 'origin', hint: 'Origin (O)' },
  { key: 'bounds', label: 'bounds', icon: 'rect', hint: 'Sprite bounds' },
  { key: 'hits', label: 'hits', icon: 'hits', hint: 'Collision points (H)' },
  { key: 'grid', label: 'grid', icon: 'grid', hint: 'Grid (G)' },
];
const modes: { mode: ViewMode; label: string; hint: string }[] = [
  { mode: 'scene', label: 'Scene', hint: 'Show the 320×200 scene as the game does' },
  {
    mode: 'centred',
    label: 'Centred',
    hint: 'Follow the animation: script movement is cancelled out and its sprites fill the preview',
  },
];
</script>

<template>
  <div class="d-flex align-items-center gap-2 flex-wrap mb-1" data-testid="viewport-toolbar">
    <div class="btn-group btn-group-sm" role="group" aria-label="Zoom">
      <button
        v-for="z in ZOOMS"
        :key="z"
        class="btn"
        :class="vp.zoom.value === z ? 'btn-secondary' : 'btn-outline-secondary'"
        :data-testid="`zoom.${z}`"
        @click="vp.zoom.value = z"
      >
        {{ z }}×
      </button>
      <button
        class="btn btn-outline-secondary"
        title="Fit the scene in the preview and centre it"
        data-testid="zoom.fit"
        @click="vp.fit()"
      >
        Fit
      </button>
    </div>
    <div class="btn-group btn-group-sm" role="group" aria-label="Framing">
      <button
        v-for="m in modes"
        :key="m.mode"
        class="btn"
        :class="vp.mode.value === m.mode ? 'btn-secondary' : 'btn-outline-secondary'"
        :title="m.hint"
        :aria-pressed="vp.mode.value === m.mode"
        :data-testid="`mode.${m.mode}`"
        @click="vp.mode.value = m.mode"
      >
        {{ m.label }}
      </button>
    </div>
    <div class="btn-group btn-group-sm" role="group" aria-label="Overlays">
      <button
        v-for="it in items"
        :key="it.key"
        class="btn"
        :class="vp.toggles[it.key] ? 'btn-primary' : 'btn-outline-secondary'"
        :title="`${it.hint}: ${vp.toggles[it.key] ? 'on' : 'off'}`"
        :aria-label="it.hint"
        :aria-pressed="vp.toggles[it.key]"
        :data-testid="`toggle.${it.key}`"
        @click="vp.toggle(it.key)"
      >
        <Icon :name="it.icon" /><span class="visually-hidden">{{ it.label }}</span>
      </button>
    </div>
    <div
      v-if="docs.kind.value === 'af'"
      class="btn-group btn-group-sm"
      role="group"
      aria-label="Player colours"
    >
      <button
        class="btn"
        :class="palette.playerOffset.value === 0 ? 'btn-secondary' : 'btn-outline-secondary'"
        data-testid="player.1"
        @click="palette.playerOffset.value = 0"
      >
        P1
      </button>
      <button
        class="btn"
        :class="palette.playerOffset.value === 48 ? 'btn-secondary' : 'btn-outline-secondary'"
        data-testid="player.2"
        @click="palette.playerOffset.value = 48"
      >
        P2
      </button>
    </div>
    <button
      class="btn btn-sm btn-outline-secondary"
      title="Fullscreen (Shift+F); Esc leaves it"
      aria-label="Fullscreen"
      data-testid="viewport.fullscreen"
      @click="vp.toggleFullscreen()"
    >
      <Icon name="fullscreen" />
    </button>
  </div>
</template>
