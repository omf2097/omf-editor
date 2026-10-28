# 20 — Sprite sheets and animation export

External pixel tools are better than the built-in editor for serious work.
This spec makes the round trip to them lossless, and adds shareable
animation exports. Lives in the Sprites view (spec 12 §4.3) under
**Sheet…** and **Export…**.

## 1. Sprite sheet export

Produces two files for one animation (or, with "all animations", for the
whole file with one sheet per animation in a zip):

- `<file>-<id>.png`: **indexed PNG** with the scene palette (256 entries;
  the palette PNG imports match against, before HAR colours and remap
  preview, spec 12 §10.2),
  laid out in a grid. A PNG palette has at most 256 entries and all of them
  are real colours, so `TRANSPARENT` (256) cannot get its own entry.
  Transparent pixels are written with a **key index** that none of the
  exported sprites use (index 0 when free, otherwise the lowest unused
  index), marked fully transparent in `tRNS`, and recorded in the JSON as
  `transparent_index`. If the sprites use all 256 indices, the export falls
  back to RGBA with a notice. Since sprites never draw index 0 (spec 13 §7),
  0 is always free in practice and this fallback is a safeguard only. The same rule applies to single-sprite PNG
  export (spec 13) and to GIF (§3).
  Cells are uniform: cell size = max sprite width × max sprite height
  (padded to a multiple of 8), one sprite per cell, left-to-right,
  top-to-bottom in file order. Optional 1 px spacing. Optional "RGBA" mode
  for tools that lose palettes; the import matches colours exactly as in
  spec 12 §10.2.
- `<file>-<id>.sheet.json`: layout and metadata so the import needs no
  guessing:

```json
{
  "version": 1, "source": "FIGHTR0.AF", "animation": 11,
  "cell": { "w": 40, "h": 72, "spacing": 1 }, "columns": 8,
  "palette": "ARENA0.BK#0", "transparent_index": 0,
  "sprites": [
    { "letter": "A", "index": 0, "pos_x": -16, "pos_y": -72, "w": 32, "h": 72, "cell": 0, "origin_in_cell": { "x": 16, "y": 72 }, "missing": false }
  ]
}
```

  `origin_in_cell` is where the animation origin falls inside the cell so a
  pixel artist sees the anchor; the sprite is placed at
  `origin_in_cell + (pos_x, pos_y)`.

**Deferred:** Aseprite JSON (array layout) as an alternative metadata
format. Not implemented yet.

## 2. Sprite sheet import

Pick the PNG (the JSON is found by name or picked explicitly):

1. Validate the sheet size against `cell`, `columns`, sprite count.
2. For each cell, crop, trim fully transparent borders, and recompute
   `pos_x/pos_y` from `origin_in_cell` so a sprite that was moved inside its
   cell gets the right offset; untouched sprites produce identical bytes.
3. Colour-match as in spec 12 §10.2 (exact; unmatched colours listed).
   The JSON's `transparent_index` is transparent even when the PNG lost its
   `tRNS` entry. A JSON whose `source` or `animation` names another file or
   animation asks before going on.
4. Diff dialog: which sprites changed (count of pixels that differ with
   both images placed at their offsets, and before/after thumbnails), with
   checkboxes to include each; any changed row, offset-only ones included,
   can be unticked and ticked again. Shared sprites follow the sharing
   dialog. With "Update all", the first included sprite of a shared image
   sets it; a later included sprite of the same image with other pixels
   gets its own image instead of overwriting the first.
5. Apply as one history entry. Sprite count cannot change through a sheet;
   adding sprites is done in the Sprites view.

Without a JSON (a hand-made sheet), a dialog asks for cell size, columns,
and the anchor rule (bottom-centre default).

## 3. Animation export

**Export animation** renders the current animation through the preview
simulation (spec 15 §5) at the chosen timing and zoom into:

- **APNG** (lossless, preserves exact colours), default; or
- **GIF** (the palette is indexed already; transparency uses the same key
  index rule as §1, and with the background on no transparency is needed);
  or
- **PNG strip** of frames.

One output frame is emitted per tick; consecutive identical ticks are
merged into one frame with the summed delay, so a still frame of 10 ticks
becomes one APNG frame of 480 ms while per-tick motion (`x+`) produces a
frame per tick.

Options: background on/off (checkerboard or arena), zoom 1–4, plays (the
total number of times the animation plays, 0 = forever; APNG `num_plays`,
GIF loop count = plays − 1, and one play writes no loop extension),
start/end tick. Rendering and encoding run in a Web Worker
(`src/workers/export.worker.ts`) with a progress bar; above 5 000 ticks the
dialog asks first. APNG delays are milliseconds, or coarser units when a
frame is longer than 65 535 ms (NORTH_AM.BK holds a 200 s frame). GIF frame
delay is in 10 ms units and browsers show delays under 20 ms as 100 ms, so
GIF frames last at least 20 ms (faster ticks are combined, showing the
first) and rounding error is carried (exact over the loop; 28 ms arena
ticks are approximated this way).

**Deferred:** a frame counter overlay. Not implemented yet.

## 4. Library and tests

`@omf/formats` stays dependency-free and works on indexed bitmaps, not
PNG bytes: `buildSheet(anim, opts): { image: IndexedImage; meta: SheetMeta }`
and `parseSheet(image: IndexedImage, meta): SheetSprite[]`, where
`IndexedImage = { width, height, pixels: Uint16Array }`. `parseSheet` checks
the sidecar first (positive integer cell size and columns, spacing ≥ 0,
every `cell` inside the layout, integer offsets) and throws
`OmfFormatError` rather than reading outside the image. PNG, APNG and GIF
encoding/decoding live in the editor (`src/codecs/`, spec 22): PNG decoding
with `fast-png`, indexed PNG and APNG writing with a small in-house writer
on `fflate`, GIF with `gifenc`, zip with `fflate`.

E2E: export sheet → import unchanged → bytes identical; move one sprite in
the PNG by 3 px → `pos_x` changes by 3 and pixels equal; exported APNG
decodes to the expected number of merged frames (above) and first-frame
pixels.
