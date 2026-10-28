import { computed } from 'vue';
import type { BKFile } from '@omf/formats';
import { isAF, type AnyAnimation } from '../lib/doc';
import { animationOrigin, type Point } from '../lib/scene';
import { useDocument } from './useDocument';
import { usePalette } from './usePalette';
import { useViewport } from './useViewport';

/**
 * Animation origin as the scene previews place it. AF animations stand on the
 * arena floor while an arena background is drawn, and are centred otherwise.
 */
export function useSceneOrigin() {
  const docs = useDocument();
  const palette = usePalette();
  const viewport = useViewport();

  const backgroundBk = computed<BKFile | null>(() => {
    const d = docs.doc.value;
    if (!d) return null;
    return isAF(d) ? palette.sourceBk.value : d;
  });
  const showsBackground = computed(() => viewport.toggles.bg && backgroundBk.value !== null);

  /** `facingLeft` defaults to the flip toggle (the opponent of an enemy string faces the other way). */
  function origin(a: AnyAnimation, facingLeft = viewport.toggles.flip): Point {
    return animationOrigin(docs.kind.value ?? 'af', a, {
      centred: !showsBackground.value,
      facingLeft,
    });
  }

  return { backgroundBk, showsBackground, origin };
}
