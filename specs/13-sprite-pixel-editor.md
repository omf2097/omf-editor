# 13 — Sprite pixel editor

A simple indexed-colour image editor for editing sprite pixels in place.
Reached from the Sprites view (spec 12 §4.3) at route
`#/animations/:id/sprites/:n/edit`. PNG import and export are tools inside
the editor.

## 1. Entry and exit

- Opened from the Sprite tab **Edit pixels…**, by double-clicking a cell in
  the SpriteStrip, or with `E` while a sprite is selected.
- Takes over the whole content area below the TopBar; the animation sidebar
  is hidden. The right column of the editor is the **Pixels** panel (§5).
- Works on a `DecodedSprite` working copy. A sprite without pixels (empty
  stream, or a 0 size) opens as a 1×1 transparent image, as openomf loads
  it; the header size of such sprites is often garbage (60537×60537). **Apply** (`Ctrl+Enter`)
  re-encodes with `encodeSprite`, updates `width/height/image/pos_x/pos_y`,
  runs the shared-sprite dialog (spec 12 §10.2 step 4) when needed and commits
  one history entry labelled "edit sprite N/A". **Cancel** (`Esc`, confirm if
  modified) discards. Playback is paused while the editor is open; a small
  live preview (§4) keeps the animation context visible.

## 2. Layout

```
┌ Pixel editor · Move 11 Idle · sprite D (3 of 7) ───────────────── [Apply] [Cancel] ┐
│ ✎ pencil  ◌ eraser  ▭ rect  ╱ line  ⬚ fill  ⬚ select  ⤢ move  ⊙ picker │ size [1▾] │ zoom [8x▾] [Fit] │
│ ☑ grid  ☑ onion prev  ☐ onion next  ☑ arena bg  ☐ flip  │ ↔ flip H  ↕ flip V  ⟲ rotate │ ⤡ resize… │
├──────────────────────────────────────────────────────────────┬──────────────────────┤
│                                                              │ Palette              │
│        fixed pane (no scrollbars), sprite centred,           │ ┌────────────────┐   │
│        wheel zoom 1–32, pan with space+drag / middle drag    │ │ 16×16 swatches │   │
│                 checkerboard = transparent                   │ │ of active LUT  │   │
│                 origin crosshair at (-pos_x, -pos_y)         │ └────────────────┘   │
│                                                              │ ⊘ transparent        │
│                                                              │ FG [■ 42] BG [⊘]     │
│                                                              │ used in sprite: 23   │
│                                                              │ ☐ only show used     │
│                                                              │ ─────────────────    │
│                                                              │ preview (1x)  ▶ loop │
│                                                              │ ┌──────┐             │
│                                                              │ │ anim │             │
│                                                              │ └──────┘             │
├──────────────────────────────────────────────────────────────┴──────────────────────┤
│ 32×72 · x 12 y 40 · idx 42 #5a2e10 · pos_x -16 pos_y -72 · 1 240 B encoded          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Tools

| Tool          | Key | Behaviour                                                                                   |
| ------------- | --- | ------------------------------------------------------------------------------------------- |
| Pencil        | `B` | Paints FG index. Brush size 1–8 px square. `Shift`+click draws a line from the last point. Right button paints BG. |
| Eraser        | `X` | Paints `TRANSPARENT`. Same sizes.                                                          |
| Line          | `L` | Click-drag; Bresenham; `Shift` snaps to 0/45/90°.                                           |
| Rectangle     | `R` | Click-drag outline; `Alt` filled; `Shift` square.                                           |
| Fill          | `G` | Flood fill of contiguous same-index region, 4-connected. `Shift` fills every pixel with that index (global replace). Transparent regions fillable. |
| Select        | `M` | Rectangular marquee. `Ctrl+A` all, `Ctrl+D` deselect. Operations below act on the selection when present. |
| Move          | `V` | Drag selection contents (or whole sprite); arrow keys nudge 1 px, `Shift` 8 px. Pixels leaving the canvas are clipped on Apply, with a warning. |
| Colour picker | `I` | Click sets FG (right-click BG) from the canvas; `Alt`+click with any tool but Rectangle (where `Alt` means filled, from the first press) is a temporary picker. |
| Flip H / V, Rotate 90° | — | Apply to selection or whole sprite.                                              |

Every stroke is one entry in the editor's own undo stack (`Ctrl+Z`/`Ctrl+Y`,
the last 200 strokes while open); a stroke that changes nothing (a fill with
the colour already there) leaves no entry, and a stroke the browser cancels
(`pointercancel`) is undone. Flipping or rotating a selection that then
reaches past the sprite edge clips, with a notice of how many pixels were
lost. The document history receives a single entry on Apply.

## 4. View options

- **Viewport**: the canvas pane has a fixed size (the space left by the
  toolbar, Pixels panel and status bar) and never scrolls. The sprite is
  placed in it by a view transform (offset + zoom): it starts centred, and
  the pointer → pixel mapping follows the transform exactly. The transform,
  wheel zoom and panning below are shared with the scene preview (spec 12
  §9): `useViewTransform` and `useViewPan`, with the editor's zoom steps and
  fit margin in `usePixelZoom`.
- **Zoom** in steps 1, 2, 3, 4, 6, 8, 12, 16, 24, 32: the mouse wheel (with
  or without `Ctrl`; one step per notch, trackpad travel adds up) zooms
  around the cursor; `+`/`-` and the zoom select around the pane centre.
  **Fit** (and opening a sprite, Resize, Import) picks the largest step at
  which the sprite fits the pane with a 16 px margin and centres it; a
  sprite larger than the pane at 1× opens centred at 1×.
- **Pan**: hold `Space` and drag, or drag with the middle button, anywhere in
  the pane (on the sprite or beside it) at any zoom, also when the sprite is
  smaller than the pane. The sprite cannot leave the pane: at least 48
  screen pixels of it (all of it, if smaller) stay in view on each axis.
- **Resizing the window** keeps zoom and the view centre: the content at the
  pane centre stays there (no re-fit). A size change of the sprite without a
  re-fit (Rotate 90°) keeps the sprite centre in place.
- **Grid** at zoom ≥ 4, 1 px lines at 10 % white; `Shift+G` toggles.
- **Onion skin**: previous and next sprite of the same animation (by file
  order, or by script frame order when a script parses) drawn at 30 % under
  the working copy, positioned by their own `pos_x/pos_y` relative to the
  animation origin, so motion can be lined up.
- **Arena background**: the palette-source BK background drawn behind at
  the animation origin (`startX/startY`), 50 % dimmed. Off → checkerboard.
- **Flip**: the canvas is shown mirrored, for checking facing-left
  appearance. Editing stays in unflipped space: a click on the left edge
  paints the sprite's rightmost column.
- **Live preview** panel: the full animation playing at 1× with the working
  copy substituted for the sprite being edited, so a change is seen in
  motion without applying. Updates after each stroke.

## 5. Pixels panel (right column)

- **Palette**: 16×16 `SwatchGrid` of the active LUT (palette + remap from
  `usePalette()`). Hover shows index and hex; click sets FG, right-click BG.
  The transparent swatch sits above the grid. **Only show used** dims
  indices not present in the sprite. Indices used by the sprite are marked
  with a dot. A per-HAR hint shows which index ranges the current remap
  rewrites, so the author knows which colours change per player.
- **Geometry**: `pos_x`, `pos_y` `IntField`s; `width × height` read-only
  with **Resize…** (§6).
- **Import PNG…** replaces the working copy via the matching rules of spec 12
  §10.2 steps 1–4 (no sharing dialog until Apply). **Export PNG** saves an
  indexed PNG of the stored indices (no player 2 shift) with the scene
  palette the import matches against, so it re-imports unchanged;
  transparency uses an index the sprite does not use, marked in `tRNS`
  (spec 20 §1).
- **Info**: encoded size (recomputed on idle) against the 65 535-byte
  format limit (spec 04); turns red and disables Apply when exceeded.
  Shared-with list.

## 6. Resize

Dialog with new width/height, a 3×3 anchor picker, and a live preview of the
result (skipped above about a million pixels). Growing adds transparent pixels; shrinking crops. `pos_x/pos_y` are
adjusted so the anchored content keeps its scene position (e.g. anchoring
bottom-centre and adding 8 rows on top shifts `pos_y` by -8). Limits:
1–320 × 1–200 by default; a checkbox "allow larger" lifts to 16 383 (the
14-bit x/y fields of the RLE stream, spec 04) with a warning that the game
may not render it. `Esc` in the dialog closes only the dialog. Whatever the size, the
encoded stream must still fit the 65 535-byte limit.

## 7. Transparent pixels and index 0

Transparency is a separate state (`TRANSPARENT = 256`) in the decoded
image, but openomf draws sprites with palette index 0 as the transparent
colour (its surfaces use transparent = 0, and its mod loader stores
transparent PNG pixels as 0). So in sprites:

- index 0 renders transparent everywhere (scene canvas, thumbnails, sheets,
  exports);
- painting with swatch 0 (FG or BG) paints `TRANSPARENT`, the same as the
  eraser and the transparent swatch;
- importing a PNG stores index 0 pixels as `TRANSPARENT`, and colour
  matching never picks index 0 (spec 12 §10.2).

The encoder skips `TRANSPARENT`, so edited sprites never contain index 0.
Unedited sprites keep their bytes (no shipped sprite uses index 0). In BK
backgrounds index 0 stays an opaque colour. The status bar reads
"transparent" when hovering such a pixel.

## 8. Shortcuts (editor open)

| Key | Action |
| --- | ------ |
| `B X L R G M V I` | tools |
| `[` / `]` | brush size |
| `+` / `-` | zoom around the pane centre |
| wheel | zoom around the cursor |
| `Space` (hold) + drag, middle drag | pan |
| `Ctrl+Z` / `Ctrl+Y` | undo / redo stroke |
| `Ctrl+A` / `Ctrl+D` | select all / deselect |
| `Ctrl+C` / `Ctrl+V` | copy / paste selection (within the app; also from another sprite) |
| `Delete` | clear selection to transparent |
| `H` / `Shift+V` | flip selection horizontal / vertical |
| `Ctrl+Enter` | Apply |
| `Esc` | close the resize dialog, else deselect, then Cancel |

Clipboard is an in-app `DecodedSprite` fragment; pasting into another sprite
or animation is allowed and offers "paste in place" (same offset) or at the
cursor.
