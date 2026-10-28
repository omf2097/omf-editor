import { computed, effectScope, ref, shallowRef, watch } from 'vue';
import { REMAP_COUNT, type BKFile, type Palette, type VGA } from '@omf/formats';
import { useDocument } from './useDocument';
import { usePalette } from './usePalette';
import { indexRange } from '../lib/paletteOps';

/**
 * `compareWith` values from this one on name ALTPALS palette `value - 1000`;
 * smaller values are palettes of the open BK.
 */
export const ALTPALS_COMPARE = 1000;

/** Which palette of the BK is being edited, selection, tool previews (spec 16). */
const editIndex = ref(0);
const selection = ref<Set<number>>(new Set());
/** Where the last plain or Ctrl click was; Shift+click selects from here. */
const anchor = ref<number | null>(null);
const cursor = ref<number>(0);
/** Selecting an entry selects its whole 16-entry band (HAR colours come in bands). */
const lockBands = ref(false);
const tab = ref<'palette' | 'remaps'>('palette');
const remapSlot = ref(0);
/** A tool's proposed palette, shown everywhere until applied or cancelled. */
const candidate = shallowRef<Palette | null>(null);
/** The remap tool's proposed table for `remapSlot`, likewise. */
const candidateRemap = shallowRef<Uint8Array | null>(null);
const compareWith = ref<number | null>(null);
const clipboard = shallowRef<VGA[] | null>(null);
let watching = false;

const bandOf = (i: number): [number, number] => {
  const s = i - (i % 16);
  return [s, s + 15];
};

export function usePaletteEditor() {
  const docs = useDocument();
  const palette = usePalette();

  const bk = computed<BKFile | null>(() =>
    docs.kind.value === 'bk' ? (docs.doc.value as BKFile) : null,
  );
  /** The palette being edited, clamped to the palettes there are (undo can remove one). */
  const index = computed(() =>
    Math.max(0, Math.min(editIndex.value, (bk.value?.palettes.length ?? 1) - 1)),
  );
  const current = computed(() => bk.value?.palettes[index.value] ?? null);

  // Keep editIndex valid when the palette count shrinks (undo of an add, JSON import).
  if (!watching) {
    watching = true;
    effectScope(true).run(() =>
      watch(
        () => bk.value?.palettes.length ?? 0,
        (n) => {
          if (n > 0 && editIndex.value > n - 1) setEditIndex(n - 1);
        },
      ),
    );
  }
  /** Colours shown: the tool candidate when present. */
  const shown = computed<Palette | null>(() => candidate.value ?? current.value?.colors ?? null);
  const selected = computed(() => [...selection.value].sort((a, b) => a - b));

  /** The palette chosen to compare with (see ALTPALS_COMPARE). */
  const comparePalette = computed<Palette | null>(() => {
    const c = compareWith.value;
    if (c === null) return null;
    if (c >= ALTPALS_COMPARE) return palette.altPals.value?.[c - ALTPALS_COMPARE] ?? null;
    return bk.value?.palettes[c]?.colors ?? null;
  });
  /** Entries where the edited palette differs from the compared one. */
  const differing = computed<number[]>(() => {
    const a = current.value?.colors;
    const b = comparePalette.value;
    if (!a || !b) return [];
    return a.colors.flatMap((c, i) => (c.join() === b.colors[i]!.join() ? [] : [i]));
  });

  function setEditIndex(i: number): void {
    editIndex.value = i;
    palette.paletteIndex.value = i;
    candidate.value = null;
    candidateRemap.value = null;
  }

  /** Click semantics of the swatch grid: Shift extends from the anchor, Ctrl toggles. */
  function select(
    i: number,
    e?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  ): void {
    cursor.value = i;
    const next = new Set(e?.ctrlKey || e?.metaKey ? selection.value : []);
    if (e?.shiftKey && anchor.value !== null) {
      indexRange(anchor.value, i).forEach((k) => next.add(k));
    } else if ((e?.ctrlKey || e?.metaKey) && selection.value.has(i)) {
      next.delete(i);
    } else {
      next.add(i);
      anchor.value = i;
    }
    if (lockBands.value) {
      for (const k of [...next]) {
        const [s, t] = bandOf(k);
        for (let j = s; j <= t; j++) next.add(j);
      }
    }
    selection.value = next;
  }

  function selectRange(a: number, b: number): void {
    selection.value = indexRange(a, b);
  }

  /** Edits the colours of the palette being edited (one history entry). */
  function setColors(label: string, fn: (colors: VGA[]) => void): void {
    const i = index.value;
    docs.mutate<BKFile>(label, (d) => {
      const p = d.palettes[i];
      if (!p) return;
      const colors = p.colors.colors.map((c) => [...c] as VGA);
      fn(colors);
      d.palettes[i] = { ...p, colors: { colors } };
    });
  }

  function setRemap(label: string, slot: number, table: Uint8Array): void {
    const i = index.value;
    docs.mutate<BKFile>(label, (d) => {
      const p = d.palettes[i];
      if (!p) return;
      const remaps = [...p.remaps];
      remaps[slot] = Uint8Array.from(table);
      d.palettes[i] = { ...p, remaps };
    });
  }

  function applyCandidate(label: string): void {
    const c = candidate.value;
    if (!c) return;
    candidate.value = null;
    setColors(label, (colors) => {
      c.colors.forEach((v, k) => (colors[k] = [...v] as VGA));
    });
  }

  /** Copies the selected colours to the palette clipboard; returns how many. */
  function copySelection(): number {
    const c = current.value?.colors;
    if (!c) return 0;
    clipboard.value = selected.value.map((i) => [...c.colors[i]!] as VGA);
    return clipboard.value.length;
  }

  return {
    bk,
    editIndex,
    index,
    current,
    shown,
    selection,
    selected,
    cursor,
    anchor,
    lockBands,
    tab,
    remapSlot,
    candidate,
    candidateRemap,
    compareWith,
    comparePalette,
    differing,
    clipboard,
    REMAP_COUNT,
    setEditIndex,
    select,
    selectRange,
    selectAll: () => selectRange(0, 255),
    setColors,
    setRemap,
    applyCandidate,
    copySelection,
  };
}
