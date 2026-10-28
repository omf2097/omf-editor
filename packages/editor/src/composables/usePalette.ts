// The palette every canvas draws with (spec 16 §1). AF files have no palette:
// a fighter is shown with a palette of a "source" BK (an arena), its player
// bands optionally recoloured from ALTPALS.DAT. A BK uses its own palettes.
// Without either, sprites are drawn in banded grey so the bands stay visible.

import { computed, ref, shallowRef, watch } from 'vue';
import {
  PLAYER2_OFFSET,
  bandedGrayscalePalette,
  paletteToRgbaLut,
  readAltPals,
  readBK,
  remapPalette,
  type BKFile,
  type Palette,
  type PaletteMapping,
  type VGA,
} from '@omf/formats';
import { useDocument } from './useDocument';
import { getCachedFile, getSetting, setCachedFile, setSetting } from '../lib/db';
import { pickFile } from '../lib/files';
import { errorMessage, useToasts } from './useToasts';

/** Per player: chosen ALTPALS option (0..15) for primary, secondary, tertiary, or null to keep the BK's colours. */
export type HarColors = [number | null, number | null, number | null];

const { doc, kind } = useDocument();
const toasts = useToasts();

const sourceBk = shallowRef<BKFile | null>(null);
const sourceName = ref<string | null>(null);
const paletteIndex = ref(0);
const remapIndex = ref<number | null>(null);
const altPals = shallowRef<Palette[] | null>(null);
const harColors = ref<{ p1: HarColors; p2: HarColors }>({
  p1: [null, null, null],
  p2: [null, null, null],
});
/** 0 draws AF sprites as player 1, 48 as player 2. */
const playerOffset = ref<0 | 48>(0);
const forceGrayscale = ref(false);

/** The BK whose palettes are used: the document itself for BK files, the chosen source for AF. */
const paletteBk = computed<BKFile | null>(() => {
  const d = doc.value;
  if (d && kind.value === 'bk') return d as BKFile;
  return sourceBk.value;
});

const isFallback = computed(
  () => forceGrayscale.value || !paletteBk.value || paletteBk.value.palettes.length === 0,
);

/** Copies ALTPALS option `option` (16 shades) into band `band` of `player` (pilot colour selection). */
export function applyHarColor(
  pal: Palette,
  alt: Palette,
  player: 0 | 1,
  band: number,
  option: number,
): void {
  for (let i = 0; i < 16; i++) {
    const dst = band * 16 + i + player * PLAYER2_OFFSET;
    if (dst === 0) continue; // index 0 stays black
    pal.colors[dst] = [...alt.colors[option * 16 + i]!] as VGA;
  }
}

/** The chosen palette of `bk`; the index is clamped, since `bk` can change under it. */
const selectedMapping = (bk: BKFile): PaletteMapping | undefined =>
  bk.palettes[Math.min(paletteIndex.value, bk.palettes.length - 1)];

/** The palette after HAR colour selection, before any remap. */
const basePalette = computed<Palette>(() => {
  const bk = paletteBk.value;
  if (isFallback.value || !bk) return bandedGrayscalePalette();
  const src = selectedMapping(bk)!.colors;
  const pal: Palette = { colors: src.colors.map((c) => [...c] as VGA) };
  const alt = altPals.value?.[0];
  if (alt) {
    (['p1', 'p2'] as const).forEach((p, player) => {
      harColors.value[p].forEach((opt, band) => {
        if (opt !== null) applyHarColor(pal, alt, player as 0 | 1, band, opt);
      });
    });
  }
  return pal;
});

const activePalette = computed<Palette>(() => {
  const bk = paletteBk.value;
  const r = remapIndex.value;
  if (r === null || !bk || isFallback.value) return basePalette.value;
  const table = selectedMapping(bk)?.remaps[r];
  return table ? remapPalette(basePalette.value, table) : basePalette.value;
});

const lut = computed(() => paletteToRgbaLut(activePalette.value));

// A remap preview belongs to the document it was picked for.
watch(useDocument().generation, () => {
  remapIndex.value = null;
});

watch(paletteBk, (bk) => {
  if (bk && paletteIndex.value >= bk.palettes.length) paletteIndex.value = 0;
});

async function loadSourceBytes(name: string, bytes: Uint8Array, persist = true): Promise<boolean> {
  try {
    sourceBk.value = readBK(bytes);
    sourceName.value = name;
    paletteIndex.value = 0;
    forceGrayscale.value = false;
    if (persist) await setCachedFile('paletteSource', name, bytes);
    return true;
  } catch (e) {
    toasts.error(`${name} is not a usable BK: ${errorMessage(e)}`);
    return false;
  }
}

async function loadSource(): Promise<boolean> {
  const p = await pickFile([
    { description: 'OMF scene', accept: { 'application/octet-stream': ['.bk', '.BK'] } },
  ]);
  return p ? loadSourceBytes(p.name, p.bytes) : false;
}

async function loadAltPalsBytes(name: string, bytes: Uint8Array, persist = true): Promise<boolean> {
  try {
    altPals.value = readAltPals(bytes);
    if (persist) await setCachedFile('altpals', name, bytes);
    return true;
  } catch (e) {
    toasts.error(`${name} is not an ALTPALS.DAT: ${errorMessage(e)}`);
    return false;
  }
}

async function loadAltPals(): Promise<boolean> {
  const p = await pickFile([
    { description: 'ALTPALS.DAT', accept: { 'application/octet-stream': ['.dat', '.DAT'] } },
  ]);
  return p ? loadAltPalsBytes(p.name, p.bytes) : false;
}

let restored = false;
/** Restores the remembered palette source and ALTPALS from IndexedDB. */
async function restore(): Promise<void> {
  if (restored) return;
  restored = true;
  const src = await getCachedFile('paletteSource');
  if (src && !sourceBk.value) await loadSourceBytes(src.name, src.bytes, false);
  const alt = await getCachedFile('altpals');
  if (alt && !altPals.value) await loadAltPalsBytes(alt.name, alt.bytes, false);
  const hc = await getSetting<{ p1: HarColors; p2: HarColors } | null>('harColors', null);
  if (hc) harColors.value = hc;
}

function setHarColor(player: 'p1' | 'p2', band: number, option: number | null): void {
  const next = {
    p1: [...harColors.value.p1] as HarColors,
    p2: [...harColors.value.p2] as HarColors,
  };
  next[player][band] = option;
  harColors.value = next;
  void setSetting('harColors', JSON.parse(JSON.stringify(next)));
}

export function usePalette() {
  return {
    sourceBk,
    sourceName,
    paletteBk,
    paletteIndex,
    remapIndex,
    altPals,
    harColors,
    playerOffset,
    forceGrayscale,
    isFallback,
    basePalette,
    activePalette,
    lut,
    loadSource,
    loadSourceBytes,
    loadAltPals,
    loadAltPalsBytes,
    restore,
    setHarColor,
  };
}
