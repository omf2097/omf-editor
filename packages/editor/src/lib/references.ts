// Finds references to an animation id from other animations (delete confirmation, spec 12 §4).

import { animationsOf, isAF, type Doc } from './doc';
import { forEachScriptTag } from './scriptTags';

const ID_TAGS = new Set(['jn', 'bj', 'm', 'bm', 'mm', 'md']);

/** openomf move categories (game/objects/har.h). */
const CAT_CLOSE = 2;
const CAT_PROJECTILE = 8;

/**
 * Animation-id fields of other animations that point at `id`, as openomf
 * reads them: 0 means none; a CLOSE move's successor_id is a throw distance,
 * not an id; a projectile's throw_duration is the animation it switches to
 * when its owner is hit (har.c, projectile.c).
 */
export function referencesTo(d: Doc, id: number): string[] {
  const out: string[] = [];
  if (id === 0) return scriptReferences(d, id, out);
  for (const other of animationsOf(d).keys()) {
    if (other === id) continue;
    if (isAF(d)) {
      const m = d.moves.get(other)!;
      if (m.nextAnimationId === id) out.push(`${other}: next_animation_id`);
      if (m.category !== CAT_CLOSE && m.successorId === id) out.push(`${other}: successor_id`);
      if (m.category === CAT_PROJECTILE && m.throwDuration === id)
        out.push(`${other}: throw_duration`);
    } else {
      const b = d.animations.get(other)!;
      if (b.chainHit === id) out.push(`${other}: chain_hit`);
      if (b.chainNoHit === id) out.push(`${other}: chain_no_hit`);
    }
  }
  return scriptReferences(d, id, out);
}

function scriptReferences(d: Doc, id: number, out: string[]): string[] {
  forEachScriptTag(d, ({ animId, string, frame, tag }) => {
    if (animId === id || !ID_TAGS.has(tag.key) || tag.value !== id) return;
    out.push(
      `${animId}: ${string === 'base' ? 'base' : `extra ${string}`} frame ${frame + 1} tag ${tag.key}${tag.value}`,
    );
  });
  return out;
}
