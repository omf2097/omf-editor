# 12 — UI design

Desktop-first editor organised as **separate views** reached through
navigation, not one dense page. Each view has one job and at most two
columns. Target width ≥ 1280 px; usable at 1024 px. Bootstrap 5.3 CSS,
light and dark via `data-bs-theme`, no Bootstrap JS. All interactive
behaviour is Vue. Editing, loading and saving are present from the first
release; there is no read-only mode.

Detailed sub-specs: pixel editor (13), collision coordinates (14), tag
editor and live preview (15).

## 1. Navigation model

Routes via `vue-router` in hash mode (works on static hosting, views are
addressable and the browser back button works):

```
#/                                   Start: open / drop / recent
#/file                               File view (AF stats or BK scene settings)
#/animations                         Animation list (redirects to last selected)
#/animations/:id                     Animation · Overview
#/animations/:id/script              Animation · Script (tag editor + preview)
#/animations/:id/sprites             Animation · Sprites (strip, fields)
#/animations/:id/sprites/:n/edit     Animation · Pixel editor
#/animations/:id/collisions          Animation · Collisions
#/palettes                           BK: palette & remap editor. AF: palette source
#/background                         BK only: background image
#/problems                           Diagnostics list
#/reference                          In-app reference (spec 21)
```

Primary navigation lives in the TopBar. Animation sub-views share a
secondary tab bar and a persistent animation sidebar (§4). The current
animation id is remembered so switching primary views and back returns to
the same animation.

## 2. Frame

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ OMF Editor │ File Animations Palettes Background Problems ⚠3 Reference │ FIGHTR0.AF ● 💾▾ ↶ ↷ ◐ │  TopBar 48 px
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│                              view content (router-view)                              │
│                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Jaguar · FIGHTR0.AF · 142 388 B · Modified      Palette ARENA0.BK pal 0 remap 0      │  StatusBar 24 px
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**TopBar**, left to right: brand; primary nav (Background only for BK;
Problems shows a count badge, hidden when zero; Reference always enabled); document title with `●`
when dirty; **save split button** (Save `Ctrl+S`; menu: Save as, Export
JSON, Import JSON, Open, Close); undo / redo with the next label as tooltip;
display settings; theme toggle. Nav items are disabled until a document is
open. The current section's nav item is a filled pill with `aria-current="page"`,
also on its sub-routes (`#/animations/20/script` marks Animations).

**Display settings** (kept in this browser like the theme, `useDisplay()`):
text size **Compact / Default / Large** as a three-button group (root font
15 / 16 / 18 px; everything is sized in rem, so the whole UI scales), and a
**Show file field names** toggle (`aria-pressed`, default off) that decides
whether labels show the file field name next to the readable name (§10.1).

**StatusBar**: HAR or scene name, file name, byte size, Modified; palette
source summary (click → `#/palettes`); context slot filled by the current
view (cursor position, selected point, zoom).

## 3. Start view `#/`

Centered card: drop zone "Drop an .AF or .BK here", **Open…** button,
**New fighter** / **New scene** / **New from…** (spec 19), recent files
(file handles persisted in IndexedDB, permission re-requested on use; a
file that was moved or deleted is reported and removed from the list;
read errors on open, import or drop are toasts),
recovery cards for autosaved snapshots (spec 19 §3), and a one-line note
that files never leave the browser. Dropping a
file anywhere in the app opens it (confirm if the current document is
dirty). Opening navigates to `#/animations`.

On opening an **AF** with no palette source, a non-blocking banner appears
at the top of every view: "Sprites are shown in greyscale. Choose an arena
BK for colours → Palettes". Choosing a source dismisses it.

## 4. Animation views `#/animations/:id/*`

Shared frame for Overview, Script, Sprites and Collisions:

```
┌───────────────┬──────────────────────────────────────────────────────────────────────┐
│ Animations    │ 11 · Idle                        Overview │ Script │ Sprites │ Collisions │
│ [filter     ] │──────────────────────────────────────────────────────────────────────│
│  1 Jumping    │                                                                      │
│  2 Getting up │                      sub-view content                                │
│ ▸11 Idle    ⚠ │                                                                      │
│ 12 Scrap      │                                                                      │
│ …             │                                                                      │
│ [+ Add] [🗑]  │                                                                      │
└───────────────┴──────────────────────────────────────────────────────────────────────┘
```

**Sidebar** (260 px, collapsible with `Ctrl+B`): filter by id, name or
`move_string`; rows show id, known name or "Move 23" / "Anim 23", sprite
count, `⚠` when the animation has diagnostics, and for AF a category dot
whose tooltip and accessible name give the category (`Category: High attack (HIGH)`).
`↑`/`↓` move selection. **Add** creates an animation at the lowest free id
(dialog to pick another) with base string `A10` and one 1×1 transparent
sprite under the lowest unused image index (never 0, which openomf does
not register as a shared-image owner); **Delete** confirms and lists
references from other moves (`next_animation_id`, `successor_id`,
`jn`/`bj`/`m` tags), and sprites elsewhere that share images it owns, with
the choice to hand each image to its first remaining sharer. As in openomf,
0 means none, a CLOSE move's `successor_id` is a throw distance (not
listed), and a PROJECTILE move's `throw_duration` is the id it switches to
(listed).

**Header**: id and name (read-only, from the known-name tables; not stored
in the file), category select for AF, and the sub-view tabs. `1`–`4`
switch sub-views.

### 4.1 Overview

Two columns: preview left, fields right.

```
┌ Preview ──────────────────────────────┐ ┌ Move ────────────────────────────────┐
│ zoom 1 [2] 3 4 6 8 Fit ☑bg ☐flip ☑org │ │ Category  [Basic ▾]     Points  [ 0 ]│
│ ┌───────────────────────────────────┐ │ │ start_x [  0 ]  start_y [  0 ]       │
│ │        320×200 scene canvas       │ │ │                                      │
│ │                                   │ │ │ Damage                               │
│ └───────────────────────────────────┘ │ │  damage_amount [ 12 ] block_damage […]│
│ ⏮ ◀ ▶ ▶ ⏭ ⟲ [━━━●━━━━] Frame 3/7 D·10 · Arena 5 ▾│ │  block_stun_and_scrap […] throw_dur […]│
│ A B C [D] E F↪ G    (sprite strip)    │ │ Chaining                             │
└───────────────────────────────────────┘ │  next_animation_id [11 →] Idle       │
                                          │  successor_id      [ 0 →] –          │
                                          │ Input                                │
                                          │  Trigger  ↓ ↘ → + P  (P632) 4/21  ▸  │
                                          │  enemy_string [             ]        │
                                          │  extra_string_selector [NONE ▾]      │
                                          │ AI triggers (0x0302)         ▸       │
                                          │ Constraints (0x0000)         ▸       │
                                          │ Unknown                      ▸       │
                                          └──────────────────────────────────────┘
```

- Preview: scene canvas (§6), playback bar, sprite strip. Clicking a strip
  cell pauses on that sprite; double-click opens the pixel editor.
- The **Input** group edits `move_string` through the trigger editor
  (spec 18) with the raw value alongside; `enemy_string` and
  `extra_string_selector` sit next to it.
- Fields (AF move): groups as shown; **AI triggers** and **Constraints** are
  collapsible `FlagGroup`s with per-bit descriptions; **Unknown** holds
  `unknown_4..11` muted with the note "meaning not identified; preserved".
- Fields (BK animation): Origin; Behaviour (`chain_hit`, `chain_no_hit`,
  `repeat`, `probability`, `hazard_damage`); Strings (`footer_string`);
  Unknown (`null`).
- The base string is shown read-only at the bottom of the fields column with
  an "Edit in Script →" link; strings are edited only in the Script view.
  The AF enemy string keeps its raw field (≤ 510 bytes) with its own "Edit
  in Script →" link, which opens the Script view on it (spec 15 §6.1).

### 4.2 Script

Preview left (same canvas and playback bar, plus "loop this frame"), tag
editor right in Visual or Text mode. Fully specified in spec 15. The
preview is always visible while editing tags; edits play immediately.

### 4.3 Sprites

```
┌ Sprites (7) ───────────────────────────────────────────────┐ ┌ Sprite D ───────────────────┐
│ [ A ] [ B ] [ C ] [ D ] [ E ] [F↪] [ G ]   + Add  Import…  │ │ ┌───────────┐ zoom [4x▾]    │
│  32×72 32×72 32×70 34×72 32×72  →A   0×0                   │ │ │  preview  │ ☑ onion ☐ bg │
│  grid of cards, drag to reorder (confirm: letters change)  │ │ └───────────┘               │
│                                                            │ │ pos_x [-16] pos_y [-72]     │
│                                                            │ │ width 34  height 72         │
│                                                            │ │ index [ 3 ]  missing ☐      │
│                                                            │ │ 1 240 B · indices 40–63 (23)│
│                                                            │ │ shared with: 12/C (owner)   │
│                                                            │ │ [Edit pixels] [Import PNG]  │
│                                                            │ │ [Export PNG]  [Clear] [🗑]  │
│ Mini preview ▶ (animation at 1×)                           │ └─────────────────────────────┘
└────────────────────────────────────────────────────────────┘
```

- Card grid of all sprites with letter, thumbnail and size; shared sprites
  show `↪` and their owner; zero-size sprites `∅`; sprites unused by any
  frame are dimmed with a tooltip.
- Detail panel for the selected sprite; **Edit pixels** navigates to the
  pixel editor route (spec 13), which takes the whole content area.
- Add and Import PNG append a sprite under the lowest unused image index
  (never 0), so nothing shares it; at most 255 sprites. Export PNG writes
  the stored indices with the scene palette (§10.2) so it re-imports
  unchanged. Clear image. Delete sprite confirms and lists the frames of the
  base and extra strings that show it: those frames are removed and later
  letters move down by one in every string (strings that do not parse stay
  as they are); it is refused when a string would lose every frame. If the
  sprite owns an image others share, the dialog names them and offers to
  hand the image to the first sharer. **Sheet…** exports/imports the animation as a
  sprite sheet and **Export…** renders APNG/GIF (spec 20). Reordering is drag and drop with a confirm
  explaining that frame letters now point to different images, offering to
  rewrite the script accordingly.
- Mini preview keeps the animation playing in a corner for context.

### 4.4 Collisions

Canvas left with interactive hit points, table right. Specified in spec 14.

## 5. File view `#/file`

Single centred column of cards, max width 960 px.

**AF**: Identity (HAR select bound to `fighter_id`, `version_1`); Stats
(`health`, `endurance` fixed /256, `exec_window`); Movement (`forward_speed`,
`reverse_speed`, `jump_speed`, `fall_speed` fixed /256, `upwards_jump_frame_limit`);
AI (`ai_projectile_y_threshold`); Sound table (spec 23: one row per
slot with value, sound browser, playback, waveform and usage); Summary (move count, sprite count, image bytes,
file size).

**BK**: Scene (`background_width`, `background_height` read-only with link
to Background view, `unknown_a`); Music (`FlagGroup` over `MusicMask`);
Palettes (count, link); Sound table; Summary.

## 6. Palettes view `#/palettes`

Specified in spec 16. BK: palette list with the live preview under it,
swatch grid with arena region bands and a legend for its marks, colour editor, palette tools (ramp, shades, adjust, copy, ALTPALS
import, swap/move/sort with image rewrite, import/export, compare), remap
tab with generation tools. AF: palette source, HAR colour
choice from ALTPALS for player 1 and 2, preview as P1/P2 under the cards,
grid beside them.

## 7. Background view `#/background` (BK)

Background shown at zoom 1–4 with the selected palette. **Import PNG…** with
the exact-match rules of §10.2 (sizes must match or the user confirms a
resize of `background_width/height`), **Export PNG**. Optional overlay of a
chosen animation at its origin to check placement.

## 8. Problems view `#/problems`

Table of all diagnostics across the document: severity, location
(animation, sprite, frame), message, and a jump link that navigates to the
relevant view with the item selected. Filter by severity. Sources: script
text openomf drops or reads differently, erratas, frames referencing missing sprites, collision
points on missing sprites, range violations after JSON import, shared-image
inconsistencies.

## 9. Scene canvas and playback (shared component)

- Logical 320×200 surface, zoom buttons 1–8 (whole steps), `image-rendering: pixelated`.
- **Viewport** (the preview of the Overview, Script, Sprites and Collisions
  tabs): a fixed box with the scene's 320:200 aspect. The preview column
  takes the spare width beside the form (about 400 px), so the box is as wide
  as that allows, at most 960×600 (3×), and low enough that the playback
  controls under it stay on screen; it is narrower on a narrow window. Its
  size never depends on the zoom, so nothing around it moves. The scene is placed in it by the view
  transform the pixel editor uses (spec 13 §4; `useViewTransform`,
  `useSceneView`):
  - Opening a document, and **Fit** in the toolbar, scales the scene to fill
    the box (a fractional zoom, e.g. about 2.3× at 1440×900) and centres it.
    The zoom buttons, the wheel and `+`/`-` move between the whole steps for
    exact pixels. A fitted view that nobody has zoomed or panned stays fitted
    when the box changes size.
  - The mouse wheel zooms around the cursor; the zoom buttons and `+`/`-`
    around the box centre.
  - Pan: hold `Space` and drag, or drag with the middle button, anywhere in
    the box at any zoom. At least 48 screen pixels of the scene stay in view
    on each axis. A plain left drag keeps its meaning in the view (collision
    points, position tags). A tap of `Space` still plays / pauses, on
    release; a `Space` held for a pan does not.
  - Zoom and the view centre carry over between the tabs (one preview is
    shown at a time); once zoomed or panned, resizing the window keeps them (no
    re-fit). The zoom is
    not saved between sessions, as every document opens fitted.
  - Hover readout, overlays, collision placement and hit tests map the
    pointer through the overlay canvas's on-screen box, so they stay exact at
    any zoom and pan.
- **Framing**, a **Scene | Centred** switch in the toolbar (saved per browser
  with the toggles; Scene by default):
  - **Scene** shows the 320×200 scene as above: the object moves across it
    as the script moves it.
  - **Centred** follows the object. The script movement (`x+ x- y+ y-`,
    slides, `x= y=`: the simulation's x/y) is cancelled out, so the object
    stays in place while each frame's own sprite offset (`pos_x`/`pos_y`,
    `ox`/`oy`) still applies and the animation lines up as in the game. The
    view is framed by the union of all the animation's sprite rectangles
    around the object (`spritesBox`, which skips empty garbage sprites;
    mirrored when facing left) plus 8 pixels per side; that frame fills the
    box and is centred, so neither position nor scale changes between
    frames. Fit returns to it, another animation (or facing) refits, or
    keeps the zoom and recentres when zoomed or panned. A frame smaller than
    the box fits above 8×. The background follows the camera (drawn shifted,
    so the movement still shows against the arena; nothing beyond the
    arena's edges); with bg off it is the checkerboard. The stage is the
    scene, larger when the frame does not fit in it (`centredStage` in
    `lib/scene.ts`); everything is drawn shifted by a whole-pixel camera
    offset (`cameraShift`) and pointer positions are shifted back, so
    overlays, hover readout, collision points and position-tag drags work
    in scene pixels as in Scene. A left drag on the canvas holds the camera
    until release, so what is dragged follows the pointer. An animation
    with no drawable sprite keeps the Scene framing.
- **Fullscreen** (either framing): the toolbar button (fullscreen icon) or
  `Shift+F` puts the preview in fullscreen with the browser Fullscreen API.
  The preview fills the screen and is fitted; a slim playback bar (transport,
  scrubber, frame label, leave button) shows on mouse movement and hides after
  2 s idle, with the cursor, unless the pointer is on it. `Space`, `,` `.`
  `Home` `End`, the arrows and the canvas keys keep working. `Esc`, the bar's
  button or `Shift+F` again leaves it, giving back the layout and the view
  (zoom and centre, or fitted) from before.
- Previews at a fixed `scale` (the pixel editor's live preview, the AF
  palette-source preview) are plain canvases at that size, without zoom or
  pan.
- Layers: background (own BK, or palette-source BK for AF; off →
  checkerboard), sprite at `(startX + posX, startY + posY)` with shared
  images resolved and preview tag effects applied (spec 15 §5), overlay
  canvas with origin crosshair, sprite bounds, collision points, grid.
- Toolbar toggles: bg, flip, origin, bounds, hits, grid. Stored in
  `useViewport()` and shared by every view that shows the canvas. A toggle
  that is on is filled in the accent colour (`aria-pressed="true"`, tooltip
  ends in "on"); off is an outline button.
- Playback bar: first / previous / play-pause / next / last, loop, tick
  scrubber with frame boundaries, frame label with ms, and a timing
  selector: **Arena · speed 0–10** (48 − 4·speed ms/tick, default 5 = 28 ms) or **Static
  (10 ms/tick)**, defaulting to Arena for AF and Static for BK. `Space`,
  `,` `.` `Home` `End`.
- Enemy string (Script view, spec 15 §6.1): the object is the opponent (its
  move 9 sprites, facing the other way, drawn as the other player); with the
  move the attacker is drawn behind it. Overlays, Centred framing and drags
  follow the opponent. The paired preview has a lead-in before the string:
  the scrubber starts there, the label reads "Lead-in n/N" and First /
  `Home` go to its start.
- Hover → StatusBar shows logical position and palette index.
- Drag interactions: sprite offset (Overview and Sprites), collision points
  (Collisions), position tags (Script). Each drag is one history entry.

## 10. Widgets and shared behaviour

### 10.1 Widgets

| Widget            | Props                                              | Behaviour                                                                 |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `IntField`        | `modelValue`, `bits` or `min`/`max`, `signed`, `label`, `hint`, `suffix` | text input, `inputmode=numeric`; decimal or `0x` hex (negative as `-0x1`); red outline while invalid, model updated only when valid; wheel/arrows ±1, `Shift` ±10; commits on blur / Enter; the input is as wide as the longest value of `min`…`max` (a 0–255 field is narrower than an i16 one) unless a `width` is given |
| `FixedField`      | as `IntField` plus `scale` (256)                   | real value with 2–3 decimals, sized to the range like `IntField`, the raw integer muted as an input-group suffix inside the field; stores `Math.round(x*scale)`, so a shown value always maps back to the same raw integer |
| `FlagGroup`       | `modelValue`, `flags: {bit, name, desc}[]`, `columns` | checkbox per bit with description tooltip, raw hex, "none"; unknown set bits listed as `0x1000` so nothing is lost, each with a × to clear it |
| `EnumSelect`      | `modelValue`, `options`                            | `<select>`; a value not in the table shows as "Unknown (n)" and is kept |
| `ByteString`      | `modelValue`, `maxBytes`                            | cp437 byte counter, red when over; non-cp437 characters and NUL refused (openomf stops a string at NUL; loaded data is kept as is) |
| `LinkedId`        | `modelValue`, `resolve(id)`                        | label above one row: `IntField`, "→" to navigate, resolved name, side by side however long the label |
| `SwatchGrid`      | `lut` or `palette`, `selected`, `marks`            | 16×16 colours, hover index + hex, click to select                         |
| `Thumb`           | `sprite`, `lut`, `size`                            | canvas thumbnail, cached per sprite + LUT                                 |
| `Toast`, `ConfirmDialog` |                                             | bottom-right toasts (errors sticky); promise-based confirm                |

Labels show the human name; the file field name (`damage_amount`) is always
in the tooltip of the label or its control, and in a muted monospace suffix
(`FieldCode`) when the display setting "Show file field names"
(`useDisplay().showFieldCodes`, off by default) is on, so the UI stays
traceable to pyomftools and openomf.

### 10.2 PNG import rules

1. Decode (fast-png, any bit depth; grey/RGB `tRNS` colour keys honoured).
   Alpha < 128 → transparent.
2. Colours are matched against the **scene palette**: the palette-source
   BK's (or the BK document's) selected palette before HAR colour selection
   and remap preview, which only change how stored indices look. With no
   palette source this is the greyscale fallback, and the import says so.
3. Indexed PNG: each pixel keeps its own index when the PNG's colour at
   that index equals the palette's (so duplicate colours such as 1/17/33 in
   arena palettes survive); other pixels are matched by exact RGB to the
   lowest index with that colour. For sprites, index 0 reads as transparent
   and no colour matches index 0 (spec 13 §7); backgrounds keep index 0.
4. Unmatched colours → dialog listing up to 20 with swatches and counts:
   Cancel, or opt-in **Nearest colour** (spec 01 open question 3).
5. Shared image (owner with sharers, or a sharer) → "Update all · Only this
   sprite · Cancel". Only this sprite: a sharer becomes an owner (under a
   fresh image index when keeping its index would capture later sharers of
   its old owner); an owner hands its old image to its first sharer, which
   the remaining sharers then follow.
6. Encode; one history entry.

### 10.3 Saving and dirty state

Save writes through the file handle (fallback: download). Writer range
errors (possible only after JSON import) show a sticky toast with the field
path; the document stays dirty. A failed write is aborted (the file on
disk is untouched); when the file behind the handle was moved or deleted,
Save falls back to Save as. `●` in the title, "Modified" in the status
bar, `beforeunload` guard. The status bar's byte size uses the browser's
number format and shows "Size: error" when the document cannot be written
as it is. Export JSON downloads `<name>.json` in the
pyomftools shape.

## 11. Keyboard shortcuts (global)

| Key                 | Action                                  |
| ------------------- | --------------------------------------- |
| `Ctrl+O`            | Open                                    |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / Save as                    |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo                             |
| `Ctrl+B`            | Toggle animation sidebar                |
| `Ctrl+Alt+1`…`6`    | Primary views (File, Animations, Palettes, Background, Problems, Reference) |
| `Ctrl+Alt+N`        | New fighter / scene (dialog)            |
| `1`–`4`             | Animation sub-views                     |
| `↑` / `↓`           | Previous / next animation (sidebar or canvas focused) |
| `Space`, `,` `.` `Home` `End` | Playback (`Space` held + drag pans the preview) |
| `+` / `-`           | Zoom                                    |
| `F` `B` `H` `O` `G` | Toggle flip, background, hits, origin, grid |
| `Shift+F`           | Fullscreen preview (`Esc` leaves it)    |
| `E`                 | Edit pixels of the selected sprite      |
| `Esc`               | Close dialog / exit mode                |

View-specific shortcuts are in specs 13–16 and take precedence over the
global single-key ones while that view is active (in the pixel editor `B`
is the pencil, not the background toggle). While focus is in a text
field (text inputs, textareas, selects) only `Ctrl+S`, `Ctrl+Shift+S`,
`Ctrl+O`, `Ctrl+M`, `Ctrl+Alt+1`…`6` and `Esc` fire; everything else,
including `Ctrl+A`/`C`/`V`/`Z`, keeps its text-editing meaning. A focused
slider, radio button or checkbox keeps its own arrow keys (and `Space`),
and a focused button keeps `Space`/`Enter`. While a modal dialog is open
no shortcut fires; the dialog traps `Tab`, focuses its first control,
closes on `Esc` and returns focus to where it was. Menus and pickers close
on `Esc` and on a click outside. Keys are matched on `KeyboardEvent.code`
(`Digit1`), so they work on non-US layouts.

The playback keys (`Space` play/pause on release, `,` `.` previous/next
frame, `Home` `End` first/last frame) work wherever a playback bar is shown, and the zoom,
overlay and fullscreen keys (`+` `-`, `F` `B` `H` `O` `G`, `Shift+F`) wherever the canvas toolbar
is shown.

Avoided on purpose: `Ctrl+N`/`T`/`W` (browsers do not let pages override
them) and `Alt+1`…`9` (tab switching in Chrome and Firefox on Linux).

## 12. Visual style

- Bootstrap defaults, comfortable density: cards with 16 px padding,
  14 px base, monospace (`ui-monospace`) for ids, field codes, strings, hex.
- Minimum text sizes, in rem so they follow the text-size setting (px at
  the default 16 px root): labels and hints (`small`, `.small`,
  `.form-text`, status bar) a fixed 13 px that does not compound when
  nested; captions, codes, field names, grid and row labels, badges at
  least 12 px. Nothing in the app is smaller.
- File field names (`.field-code`) are muted but at least 7:1 contrast in
  both themes (`#495057` light, `#ced4da` dark).
- Canvas area background `#1e1e1e` in both themes; checkerboard 8 px greys
  when background is off.
- Overlay colours: origin cyan `#4dd0e1`, bounds white 70 %, collision
  points red `#ff5252`, selected yellow `#ffeb3b`, grid white 10 %.
- Category dots: fixed hue per `MoveCategory` in `styles/categories.css`.
- Icons: Bootstrap Icons SVG sprite bundled locally; no icon JS. No fonts
  or assets from the network; system font stack.

## 13. Accessibility

Icon buttons have `aria-label`; tab bars use `role="tablist"`; the canvas
has an `aria-label` describing the current animation and frame; all actions
are keyboard reachable; colour is never the only signal. Timeline segments,
animation sidebar rows, trigger chips and palette swatches are focusable
(`Enter`/`Space` act on them; the swatch grid is one tab stop whose focus
follows the cursor), and every input has an accessible name. Modal dialogs
(confirm, new file, add animation, sound browser) set `aria-modal`, focus
their first control, trap `Tab`, close on `Esc` and give focus back (§11).

## 14. Out of scope

Multi-document tabs, diffing two files, collaborative editing. Revisit after the first release.
