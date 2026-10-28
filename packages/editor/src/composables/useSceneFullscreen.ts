import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { useViewport } from './useViewport';

/** Idle time after which the fullscreen playback bar hides, in ms. */
export const BAR_IDLE_MS = 2000;

/**
 * Fullscreen of the zoomable scene preview (spec 12 §9): the toolbar button
 * and `Shift+F` (useViewport.toggleFullscreen) put `target` in fullscreen
 * with the browser Fullscreen API; Esc, or the bar's button, leaves it. The
 * slim playback bar shows while the mouse moves and hides after a short idle,
 * unless the pointer is on it.
 */
export function useSceneFullscreen(target: Ref<HTMLElement | null>) {
  const vp = useViewport();
  /** `target` is the fullscreen element (set on the browser's fullscreenchange). */
  const isFullscreen = ref(false);
  const barVisible = ref(true);
  /** The pointer is over the bar: it stays. */
  const onBar = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function poke(): void {
    barVisible.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!onBar.value) barVisible.value = false;
    }, BAR_IDLE_MS);
  }

  useEventListener(document, 'fullscreenchange', () => {
    isFullscreen.value = !!target.value && document.fullscreenElement === target.value;
  });
  function exit(): void {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }
  function toggle(): void {
    if (isFullscreen.value) return exit();
    // Requested from a click or key handler (the watch is sync), so the
    // browser sees the user activation it requires.
    void target.value?.requestFullscreen().catch(() => {});
  }
  watch(() => vp.fullscreenRequest.value, toggle, { flush: 'sync' });
  watch(isFullscreen, (on) => (on ? poke() : clearTimeout(timer)));
  watch(onBar, (on) => {
    if (!on) return poke();
    clearTimeout(timer);
    barVisible.value = true;
  });

  // Browsers leave fullscreen on Esc themselves; a page that still sees the
  // key (some headless setups) leaves it too.
  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (e.code === 'Escape' && isFullscreen.value) exit();
  });
  onBeforeUnmount(() => clearTimeout(timer));

  return { isFullscreen, barVisible, onBar, poke, exit };
}
