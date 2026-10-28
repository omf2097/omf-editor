import { computed } from 'vue';
import { resolveSharedImages, type Sprite } from '@omf/formats';
import { useDocument } from './useDocument';
import { animationsOf } from '../lib/doc';
import { decodedOf } from '../canvas/render';

const { doc } = useDocument();
const owners = computed(() =>
  doc.value ? resolveSharedImages(animationsOf(doc.value).values()) : new Map<Sprite, Sprite>(),
);

export function useSharedImages() {
  return {
    owners,
    ownerOf: (s: Sprite): Sprite | undefined => owners.value.get(s),
    decoded: (s: Sprite) => decodedOf(s, owners.value.get(s)),
  };
}
