import { onBeforeUnmount, onMounted } from 'vue';
import { useShortcuts, type Shortcut } from './useShortcuts';
import { usePlayback } from './usePlayback';
import { useViewport, type ViewportToggles } from './useViewport';
import { holdSpace } from './useViewTransform';

// Canvas keys of spec 12 §9/§11, active while the control they act on is
// shown. Registered in the 'scene' scope; the view's own scope (activated
// after its children mount) wins on a clash, e.g. B in the pixel editor.

function useScope(list: () => Omit<Shortcut, 'scope'>[]): void {
  const shortcuts = useShortcuts();
  let off: (() => void)[] = [];
  onMounted(() => {
    off = [shortcuts.activate('scene'), shortcuts.register('scene', list())];
  });
  onBeforeUnmount(() => off.forEach((f) => f()));
}

/** Space play/pause, `,` `.` previous/next frame, Home/End first/last (PlaybackBar). */
export function usePlaybackShortcuts(): void {
  const pb = usePlayback();
  useScope(() => [
    {
      keys: 'Space',
      label: 'Space',
      description: 'Play / pause (on release); hold and drag on the preview to pan',
      // A tap toggles on release, so a hold used to pan the preview does not.
      run: () => holdSpace(() => pb.toggle()),
    },
    { keys: 'Comma', label: ',', description: 'Previous frame', run: () => pb.stepFrame(-1) },
    { keys: 'Period', label: '.', description: 'Next frame', run: () => pb.stepFrame(1) },
    { keys: 'Home', label: 'Home', description: 'First frame', run: () => pb.seekStart() },
    {
      keys: 'End',
      label: 'End',
      description: 'Last frame',
      run: () => pb.seekFrame(Math.max(0, pb.script.value.frames.length - 1)),
    },
  ]);
}

/** `+` `-` zoom, F B H O G overlay toggles and Shift+F fullscreen (ViewportToolbar). */
export function useViewportShortcuts(): void {
  const vp = useViewport();
  const toggles: [string, keyof ViewportToggles, string][] = [
    ['KeyF', 'flip', 'Toggle face left (flip)'],
    ['KeyB', 'bg', 'Toggle the background'],
    ['KeyH', 'hits', 'Toggle collision points'],
    ['KeyO', 'origin', 'Toggle the origin'],
    ['KeyG', 'grid', 'Toggle the grid'],
  ];
  useScope(() => [
    ...['Equal', 'Shift+Equal', 'NumpadAdd'].map((k) => ({
      keys: k,
      label: '+',
      description: 'Zoom in',
      run: vp.zoomIn,
    })),
    ...['Minus', 'NumpadSubtract'].map((k) => ({
      keys: k,
      label: '-',
      description: 'Zoom out',
      run: vp.zoomOut,
    })),
    {
      keys: 'Shift+KeyF',
      label: 'Shift+F',
      description: 'Fullscreen preview (Esc leaves it)',
      run: vp.toggleFullscreen,
    },
    ...toggles.map(([k, t, d]) => ({
      keys: k,
      label: k.slice(3),
      description: d,
      run: () => vp.toggle(t),
    })),
  ]);
}
