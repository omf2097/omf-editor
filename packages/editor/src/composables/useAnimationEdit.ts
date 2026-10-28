import type { AFFile, AFMove, BKAnimation, BKFile } from '@omf/formats';
import { useDocument } from './useDocument';
import { animationsOf, type AnyAnimation, type Doc } from '../lib/doc';

/**
 * Field setters for one animation (`getId()`, read at call time). Each call is
 * one history entry labelled "<label> <id>"; "set …" entries of the same
 * label coalesce when they follow quickly (useHistory): a run of arrow-key
 * nudges is one undo step.
 */
export function useAnimationEdit(getId: () => number | null) {
  const docs = useDocument();

  function mutateAt<D extends Doc>(label: string, fn: (d: D, id: number) => void): void {
    const id = getId();
    if (id === null) return;
    docs.mutate<D>(`${label} ${id}`, (d) => fn(d, id));
  }

  /** A field every animation has (AF move and BK animation alike). */
  function set<K extends keyof AnyAnimation>(
    key: K,
    value: AnyAnimation[K],
    label = `set ${String(key)}`,
  ): void {
    mutateAt(label, (d, id) => {
      const a = animationsOf(d).get(id);
      if (a) a[key] = value;
    });
  }

  function setMove<K extends keyof AFMove>(key: K, value: AFMove[K]): void {
    mutateAt<AFFile>(`set ${String(key)}`, (d, id) => {
      const m = d.moves.get(id);
      if (m) m[key] = value;
    });
  }

  function setBk<K extends keyof BKAnimation>(key: K, value: BKAnimation[K]): void {
    mutateAt<BKFile>(`set ${String(key)}`, (d, id) => {
      const a = d.animations.get(id);
      if (a) a[key] = value;
    });
  }

  /** Arbitrary edit of the animation copy. */
  function edit(label: string, fn: (a: AnyAnimation) => void): void {
    mutateAt(label, (d, id) => {
      const a = animationsOf(d).get(id);
      if (a) fn(a);
    });
  }

  return { set, setMove, setBk, edit };
}
