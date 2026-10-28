import { computed, effectScope, ref, shallowRef, watch } from 'vue';
import { TRANSPARENT, type AFFile, type Animation } from '@omf/formats';
import { useDocument } from './useDocument';
import { animationsOf } from '../lib/doc';
import { decodedOf } from '../canvas/render';

/** A fighter loaded into the Palettes view of a BK, for preview and usage (spec 16 §2.1, 2.6). */
export const previewAf = shallowRef<{ name: string; af: AFFile } | null>(null);
export const usage = ref({ background: true, sprites: true, fighter: false });
let watching = false;

function spriteIndices(anims: Iterable<Animation>): Set<number> {
  const s = new Set<number>();
  for (const a of anims) {
    for (const sp of a.sprites) {
      if (sp.missing) continue;
      for (const p of decodedOf(sp).pixels) if (p !== TRANSPARENT) s.add(p);
    }
  }
  return s;
}

export function usePaletteUsage() {
  const docs = useDocument();
  // The preview fighter belongs to the scene it was loaded for.
  if (!watching) {
    watching = true;
    effectScope(true).run(() =>
      watch(docs.generation, () => {
        previewAf.value = null;
        usage.value.fighter = false;
      }),
    );
  }
  const background = computed(() => {
    const d = docs.doc.value;
    return d && docs.kind.value === 'bk'
      ? new Set((d as { background: Uint8Array }).background)
      : new Set<number>();
  });
  const sprites = computed(() =>
    docs.doc.value ? spriteIndices(animationsOf(docs.doc.value).values()) : new Set<number>(),
  );
  const fighter = computed(() =>
    previewAf.value ? spriteIndices(previewAf.value.af.moves.values()) : new Set<number>(),
  );
  /** Indices used by the sources ticked in `usage`; the swatch grid marks them. */
  const used = computed(() => {
    const out = new Set<number>();
    if (usage.value.background) background.value.forEach((i) => out.add(i));
    if (usage.value.sprites) sprites.value.forEach((i) => out.add(i));
    if (usage.value.fighter) fighter.value.forEach((i) => out.add(i));
    return out;
  });
  return { background, sprites, fighter, used, usage, previewAf };
}
