# 03 — Palette

Module: `packages/omf-formats/src/palette.ts`.

## Model

```ts
type RGB = [r: number, g: number, b: number];   // 8-bit 0..255: display, PNG, palette files
type VGA = [r: number, g: number, b: number];   // 6-bit 0..63: as stored in the file
interface Palette { colors: VGA[] }              // exactly 256, 6-bit
interface PaletteMapping {
  colors: Palette;
  remaps: Uint8Array[];                          // 19 tables × 256 entries
}
```

## Binary

Palette: 256 × (u8 r, u8 g, u8 b), 6-bit VGA values 0..63. A byte above 63
read from a file is kept and written back as is (openomf reads it too,
keeping only the low bits through `COLOR_6TO8`); the BK diagnostics warn
about it. Writer errors name the entry (`palettes[2].colors[7].g`).

The model keeps the **6-bit values as read**. Converting on read is not
an option: pyomftools' formulas (`trunc(v6·255/63)` on read,
`trunc(v8·63/255)` on write) are lossy (6-bit 1 → 4 → 0), so palettes
stored as 8-bit would not round-trip byte-exactly. Conversions:

- display (`vgaTo8`): openomf `COLOR_6TO8`, `(v << 2) | ((v & 0x30) >> 4)`,
  which is how the game shows the colour.
- 8 → 6 (`vgaFrom8`): `round(v8·63/255)`, the exact inverse of both
  `vgaTo8` and the pyomftools formula. Used for PNG/palette-file import,
  the colour picker and JSON import.
- `pyomftoolsTo8`: `trunc(v6·255/63)`, used only by `toJSON` so exported
  JSON matches pyomftools.

PaletteMapping: Palette followed by 19 × 256 u8 remap entries.

## Functions

```ts
readPalette(r): Palette;  writePalette(w, p): void;
readPaletteMapping(r): PaletteMapping;  writePaletteMapping(w, m): void;
remapPalette(base: Palette, remap: Uint8Array): Palette;  // colors[k] = base[remap[k]]
paletteToRgbaLut(p: Palette): Uint32Array;  // 257 entries, index 256 = transparent (alpha 0)
grayscalePalette(): Palette;                // linear 0–255 ramp
bandedGrayscalePalette(): Palette;          // fallback when no palette source is loaded: ramp per 16-colour band
```

The RGBA LUT is in the platform's `ImageData` byte order (little-endian
`ABGR` as u32) so the canvas layer can fill `Uint32Array` views directly.

## ALTPALS.DAT

11 consecutive palettes, no header. Palette 0 holds the 16 selectable HAR
colour options, 16 shades each. `readAltPals(r): Palette[]`,
`writeAltPals(w, p)`.

## Notes

- Index 0 is drawn as a normal colour in backgrounds but the game forces
  palette index 0 to black at scene start. Transparency in sprites is
  encoded by the RLE stream, not by index (spec 04).
- The arena index layout (player bands, arena range, UI range) and the
  remap slots openomf uses are documented in spec 16 §1 and exported as
  `ARENA_LAYOUT` and `REMAP_SLOT_NOTES`.
- Remaps are not "HAR recolouring": player colours are produced by copying
  16-entry bands into the base palette. Remaps are generic lookups used for
  shadows, dimming and tints.
