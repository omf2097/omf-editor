// How the game uses palette indices and remap slots (spec 16 §1, from openomf).

export interface PaletteRegion {
  id: 'black' | 'p1' | 'p2' | 'arena' | 'ui';
  start: number;
  end: number;
  label: string;
  desc: string;
}

export const ARENA_LAYOUT: readonly PaletteRegion[] = [
  { id: 'black', start: 0x00, end: 0x00, label: 'Black', desc: 'Forced to black by the game' },
  {
    id: 'p1',
    start: 0x01,
    end: 0x2f,
    label: 'Player 1',
    desc: 'HAR colours of player 1: primary 0x00–0x0F, secondary 0x10–0x1F, tertiary 0x20–0x2F',
  },
  {
    id: 'p2',
    start: 0x30,
    end: 0x5f,
    label: 'Player 2',
    desc: 'HAR colours of player 2, the same bands offset by 48',
  },
  {
    id: 'arena',
    start: 0x60,
    end: 0x9f,
    label: 'Arena',
    desc: 'Arena-specific colours; the Desert swaps them per round',
  },
  {
    id: 'ui',
    start: 0xa0,
    end: 0xff,
    label: 'Shared',
    desc: 'Menus, fonts and effects shared by all scenes',
  },
];

export const PLAYER2_OFFSET = 48;
export const HAR_BANDS = ['Primary', 'Secondary', 'Tertiary'] as const;

export function regionOf(index: number): PaletteRegion {
  return ARENA_LAYOUT.find((r) => index >= r.start && index <= r.end)!;
}

/** Remap slots as openomf uses them (file numbering, 0-based). */
export const REMAP_SLOT_NOTES: Readonly<Record<number, string>> = {
  0: 'Shadow shade (by opacity)',
  1: 'Shadow shade (by opacity)',
  2: 'Shadow shade (by opacity)',
  3: 'Shadow shade (by opacity), also glow',
  4: 'Background dimming behind menus',
  5: 'Dark tint / stasis (bt tag, Shadow HAR)',
};

export const remapSlotNote = (slot: number): string =>
  REMAP_SLOT_NOTES[slot] ?? 'Not used by openomf; preserved';
