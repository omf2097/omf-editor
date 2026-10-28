import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDocument } from './useDocument';
import { animationsOf, type AnyAnimation } from '../lib/doc';

const hitCoordIndex = ref<number | null>(null);
/** Last animation shown, so #/animations returns to it. */
export const lastAnimationId = ref<number | null>(null);

// The selected collision point belongs to one document.
watch(useDocument().generation, () => {
  hitCoordIndex.value = null;
});

/** A route param or query value that is a plain non-negative integer, else null. */
function index(v: unknown): number | null {
  return typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null;
}

/**
 * The selection lives in the route (spec 11 "Routing"): the animation is
 * `:id`, the sprite is `:n` in the pixel editor and `?sprite=` elsewhere.
 * Only the collision point is plain state.
 */
export function useSelection() {
  const route = useRoute();
  const router = useRouter();
  const { doc } = useDocument();

  const animId = computed<number | null>(() => index(route.params.id));
  const spriteIndex = computed<number | null>(
    () => index(route.params.n) ?? index(route.query.sprite),
  );
  const animation = computed<AnyAnimation | null>(() => {
    if (!doc.value || animId.value === null) return null;
    return animationsOf(doc.value).get(animId.value) ?? null;
  });

  watch(animId, (id) => {
    if (id !== null) lastAnimationId.value = id;
    hitCoordIndex.value = null;
  });

  function subView(): string {
    const name = String(route.name ?? '');
    return name.startsWith('anim-') ? name : 'anim-overview';
  }

  return {
    animId,
    spriteIndex,
    animation,
    hitCoordIndex,
    selectAnimation(id: number) {
      void router.push({
        name: subView() === 'anim-pixels' ? 'anim-sprites' : subView(),
        params: { id },
      });
    },
    selectSprite(i: number | null) {
      void router.replace({
        query: { ...route.query, sprite: i === null ? undefined : String(i) },
      });
    },
    selectHitCoord(i: number | null) {
      hitCoordIndex.value = i;
    },
  };
}
