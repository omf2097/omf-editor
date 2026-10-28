# 14 — Collision coordinate editing

Collision ("hit") coordinates are points attached to a **sprite** of an
animation. The game tests each point of the attacker's current sprite
against the opaque pixels of the defender's sprite (openomf
`game/protos/intersect.c`). Edited in the Collisions view (spec 12 §4.4).

## 1. Semantics (from openomf)

- Stored per animation as `{ x, y, spriteId, null }` (spec 05); the file field is
  named `frame_id`.
- `spriteId` (`frame_id` in the file) is the **sprite index** within the animation (A = 0), compared
  against `cur_sprite_id`. It is not a script frame index. The UI therefore
  shows and edits it as a sprite letter.
- `x`, `y` are **signed 10-bit** (-512…511), decoded as
  `((v & 0x3ff) ^ 0x200) - 0x200` and written back as `v & 0x3ff`. Offsets
  are relative to the object's position, so in the editor they are relative
  to the animation origin `(startX, startY)`. When the object faces left the
  game uses `size.x − x + sprite.pos.x` instead of `x − sprite.pos.x`
  (`intersect.c`), i.e. the point mirrors around the sprite's box; the
  overlay reproduces this when **flip** is on.
- `null` is preserved and shown muted; always 0 in shipped data.

The model in `@omf/formats` stores the signed values, as pyomftools JSON
does (spec 09).

## 2. Collision table (right column)

```
Collision points · sprite [D ▾]  ☐ show all sprites        [+ Add] [Copy from… ▾] [Clear sprite]
┌────┬────────┬──────┬──────┬──────┬───┐
│ #  │ sprite │  x   │  y   │ null │   │
├────┼────────┼──────┼──────┼──────┼───┤
│ 0  │ [D ▾]  │ [ 12]│ [-40]│   0  │ 🗑 │
│ 1 ▸│ [D ▾]  │ [ 14]│ [-38]│   0  │ 🗑 │   ▸ = selected, highlighted on canvas
│ 2  │ [E ▾]  │ [ 20]│ [-36]│   0  │ 🗑 │   dimmed when "show all" and not current sprite
└────┴────────┴──────┴──────┴──────┴───┘
Place mode: click on the canvas to add points to sprite D   [Done]
```

- Default filter: points of the sprite currently shown on the canvas. Row
  selection highlights the point (yellow) and, if needed, switches the canvas
  to that sprite.
- `x`, `y` are `IntField`s with range -512…511; `sprite` is an
  `EnumSelect` of the animation's sprites (letters, with thumbnails in the
  dropdown). Editing a cell commits one history entry.
- **Add** appends a point for the current sprite at the centre of its drawn
  image (an empty sprite counts as 1×1 at its offset, whatever its header
  size) and selects it. **Copy from…** copies all points of another sprite (or of the
  same letter in another animation) to the current sprite, offset-preserving.
  **Clear sprite** removes the current sprite's points after confirm.
- Rows whose sprite index exceeds the sprite count are flagged red.
- Reordering rows is not needed; file order is preserved as points are
  added or removed.

## 3. Canvas editing

In the Collisions view the overlay is always interactive; in other views
the points are display-only:

- **Drag** a point to move it. Snaps to logical pixels; `Shift` constrains to
  an axis. Arrow keys nudge the selected point (1 px, `Shift` 8 px).
- **Place mode** (`Shift+H` or the "Place" button): each click adds a point
  for the current sprite at the clicked pixel. `Esc` or Done exits.
- **Delete** / `Backspace` removes the selected point.
- **Right-click** a point: delete, duplicate, move to sprite….
- When **flip** is on, points are mirrored with the sprite and dragging
  still edits the stored (unflipped) value.
- Points of other sprites are shown dimmed when "show all sprites" is on and
  are not draggable until their sprite is current.

Playback keeps running while editing; the overlay follows the current
sprite, so a point added while paused on D stays attached to D.

## 4. Visuals

- Point: 3×3 square scaled with zoom, red `#ff5252`; selected yellow
  `#ffeb3b` with a 1 px dark outline; others of the same sprite red; other
  sprites 40 % alpha.
- Hover shows a tooltip `#1 · D · (14, -38)`.
- The status bar shows the point under the cursor when hovering.

## 5. Diagnostics

`useProblems()` reports: point attached to a non-existent sprite; point
outside the sprite's bounding box (info, not necessarily wrong); sprite used
by an attacking frame (`q` tag present) without any point (info).
