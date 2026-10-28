// Zoom, framing mode and overlay toggles of the scene previews, shared by every
// view. The toggles and the mode are saved in IndexedDB once restore() has
// run; the zoom is not, as every document opens with the scene fitted
// (useSceneView, spec 12 §9).
import { reactive, ref, watch } from 'vue';
import { getSetting, setSetting } from '../lib/db';

export interface ViewportToggles {
  bg: boolean;
  flip: boolean;
  origin: boolean;
  bounds: boolean;
  hits: boolean;
  grid: boolean;
}

/**
 * How the zoomable preview frames the animation (spec 12 §9): `scene` shows
 * the 320×200 scene as the game does; `centred` follows the object and fits
 * its sprites.
 */
export type ViewMode = 'scene' | 'centred';
const VIEW_MODES: ViewMode[] = ['scene', 'centred'];

const zoom = ref(2);
const mode = ref<ViewMode>('scene');
/** Bumped by the fullscreen button and key; the zoomable preview shown toggles fullscreen. */
const fullscreenRequest = ref(0);
/** Bumped by the Fit button; the scene preview shown fits on each change. */
const fitRequest = ref(0);
const toggles = reactive<ViewportToggles>({
  bg: true,
  flip: false,
  origin: true,
  bounds: false,
  hits: true,
  grid: false,
});
/** Logical scene position under the cursor, with the palette index there. */
const hover = ref<{ x: number; y: number; index: number | null } | null>(null);

let restored = false;
async function restore(): Promise<void> {
  if (restored) return;
  restored = true;
  // Older versions saved the zoom here too; it is ignored.
  const saved = await getSetting<Partial<
    ViewportToggles & { zoom: number; mode: ViewMode }
  > | null>('viewport', null);
  if (saved) {
    for (const k of Object.keys(toggles) as (keyof ViewportToggles)[])
      if (typeof saved[k] === 'boolean') toggles[k] = saved[k];
    if (saved.mode && VIEW_MODES.includes(saved.mode)) mode.value = saved.mode;
  }
  watch([toggles, mode], () => void setSetting('viewport', { ...toggles, mode: mode.value }), {
    deep: true,
  });
}

export const ZOOMS = [1, 2, 3, 4, 6, 8];

function zoomIn(): void {
  zoom.value = ZOOMS.find((z) => z > zoom.value) ?? zoom.value;
}
function zoomOut(): void {
  zoom.value = [...ZOOMS].reverse().find((z) => z < zoom.value) ?? zoom.value;
}
function fit(): void {
  fitRequest.value++;
}
function toggleFullscreen(): void {
  fullscreenRequest.value++;
}
function toggle(k: keyof ViewportToggles): void {
  toggles[k] = !toggles[k];
}

export function useViewport() {
  return {
    zoom,
    mode,
    fitRequest,
    fullscreenRequest,
    toggles,
    hover,
    restore,
    zoomIn,
    zoomOut,
    fit,
    toggle,
    toggleFullscreen,
  };
}
