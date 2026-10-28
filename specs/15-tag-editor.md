# 15 — Visual tag editor and live preview

A structured editor for animation strings so authors do not need to know the
tag codes. It is the Script view (spec 12 §4.2): preview canvas on the left, editor on
the right in Visual or Text mode. Both modes edit the same `Script` model
and stay in sync.

## 1. Principles

- The **playback canvas is the preview**. Every edit updates a *working
  script* that `usePlayback()` plays immediately; the document is committed
  (one history entry) on a 400 ms idle debounce or when focus leaves the
  editor. There is no separate "apply" step.
- Unknown and undocumented tags are never hidden or dropped. They appear
  under **Advanced** with their raw code so round-trip fidelity is kept.
- The same metadata drives the tooltips in text mode, the picker in visual
  mode and the diagnostics.

## 2. Tag metadata

Two files: `tags.json` in `@omf/formats`, `tag-meta.json` in the editor (`packages/editor/src/tag-meta.json`, seeded from Appendix A):

- `tags.json` — generated (`tools/export_tags.py`) by merging pyomftools
  `valid_tags.py` (authoritative for which tags exist and take arguments)
  with the descriptions in openomf `src/formats/tag_list.c`, preferring the
  longer description. Regenerated when either source changes.
- `tag-meta.json` — hand-maintained presentation layer, validated by a test
  that every key exists in `tags.json`:

```json
{
  "x+": { "label": "Move right by", "category": "position", "arg": { "kind": "pixels", "min": 0, "max": 511 }, "preview": true },
  "x=": { "label": "Slide X to (by next frame)", "category": "position", "arg": { "kind": "pixels", "min": -512, "max": 511 }, "preview": true },
  "s":  { "label": "Play sound", "category": "sound", "arg": { "kind": "soundIndex" } },
  "m":  { "label": "Spawn animation", "category": "spawn", "arg": { "kind": "animId" } },
  "q":  { "label": "Hit enabled for frames", "category": "combat", "arg": { "kind": "count", "min": 1 } },
  "jn": { "label": "Allow chaining to animation", "category": "chain", "arg": { "kind": "animId" } }
}
```

Argument kinds and their widgets:

| kind          | widget                                                   |
| ------------- | -------------------------------------------------------- |
| `ticks`       | `IntField` with "ticks" suffix and ms equivalent at the current timing |
| `pixels`      | `IntField` with "px"; drag on canvas supported for `x+ x- x= y+ y- y= ox oy` |
| `percent`     | `IntField` with "%"                                      |
| `degrees`     | `IntField` 0–359 with a small dial                        |
| `animId`      | `LinkedId` resolving to the animation name, with jump    |
| `soundIndex`  | select over the file's 30 sound-table slots              |
| `musicTrack`  | select over `MusicMask` tracks                           |
| `paletteIndex`| `IntField` with a swatch of the current LUT              |
| `count`, `raw`| plain `IntField`                                         |

Categories and their order in the picker:

| category    | contents (examples)                                                   |
| ----------- | --------------------------------------------------------------------- |
| position    | `x+ x- x= y+ y- y= ox oy g h e at v cy ac ar aw ab ax bu ms`           |
| appearance  | `r f x y br bt ub u w bz bs bf` and palette effects `bp* p* pt*`      |
| combat      | `q n k ai i bn cp ue ua ur af aa un zz zj zp`                          |
| chain       | `jf jf2 jh jj jl jm jp jz jn bj d cl bm mm mo mu`                      |
| spawn       | `m mx my mrx mry ma mg mi md mp`                                       |
| sound       | `s l sb se sf sl t smo smf`                                            |
| screen      | `bb bl be b1 b2`                                                       |
| advanced    | everything else, including tags with no description                   |

Labels are short imperative phrases; the raw code and the long description
show in the tooltip and in the picker's detail column.

## 3. Visual mode layout

```
Script  ( Visual | Text )                              ✓ 7 frames · 65 ticks · 3.1 s
┌ timeline ─────────────────────────────────────────────────────────────────┐
│ A        │ B        │ C   │ D ▮      │ E        │ F        │ G            │  width ∝ duration
│ 10       │ 10       │ 5   │ 10       │ 10       │ 10       │ 10           │  ▮ = playhead
└───────────────────────────────────────────────────────────────────────────┘
 ⏮ ◀ ▶ ▶ ⏭  ⟲   ☐ loop this frame   speed [1x▾]

┌────────────────────────────────────────────────────────────────────┐
│ 3 [thumb] [D · 34×72 ▾] [10 |ticks] 280 ms      [+ Effect] ↑ ↓ ⧉ 🗑 ⋮ │
│     Move right by        [ 5 ] px        x+5           ⤡  🗑         │
│     Horizontal shake     [ 3 ]           bl3              🗑         │
│     Hit enabled for      [ 2 ] frames    q2               🗑         │
│     Advanced: uf                         uf               🗑         │
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
│ 4 [thumb] [E · 32×72 ▾] [10 |ticks] 280 ms      [+ Effect] ↑ ↓ ⧉ 🗑 ⋮ │
└────────────────────────────────────────────────────────────────────┘
[+ Add frame]        [Normalise text]        Extra strings (2) ▸
```

### 3.1 Timeline

- Segments proportional to duration (minimum 36 px, sprite letter and
  duration in text of at least 13 px equivalent). Clicking a segment
  selects the frame card and seeks playback; dragging the playhead scrubs.
- Drag a segment's right edge to change duration (1 tick steps; `Shift`
  for 5).
- Drag a segment to reorder frames; the moved frame becomes the selected
  one. Segments are keyboard focusable (`Enter`/`Space` selects).
- Frames whose sprite does not exist are hatched red.
- A **hold** toggle ("loop this frame") makes playback repeat only the
  selected frame, which is the main way to tune a single frame's tags while
  watching it.

### 3.2 Frame card

A card is one row: frame number, sprite thumbnail and dropdown, duration
with its millisecond hint, frame erratas, "+ Effect" and the frame actions
(move up/down, duplicate, delete, menu). A frame without effects is that one
row; its effects are compact rows below it in the same card. The row wraps
only when the column is too narrow (or the text size large).

- **Sprite**: dropdown with letter and thumbnail for each sprite in the
  animation; the card row shows the chosen thumbnail. Selecting a sprite
  also selects it in the SpriteStrip. Frame keys are `A`–`Z` (openomf
  `is_frame_id`), so only the first 26 sprites are offered; a note says so
  when the animation has more.
- **Duration**: `IntField` in ticks with a millisecond hint computed from
  the playback bar's current timing (28 ms/tick at arena speed 5).
- **Effects**: one row per tag. Label from `tag-meta.json`, argument
  widget by kind, the raw code muted on the right, delete button. Rows for
  tags with position kinds have a **drag on canvas** handle (⤡): while
  held, moving the mouse over the scene canvas sets the value from the
  cursor delta, with the frame held in playback. The value stays inside
  the tag's range, and the drag ends when the animation, string, selected
  frame or that frame's list of tags changes (also by undo).
- Rows in the Advanced category show the raw code, a plain `IntField` when
  the tag takes an argument, and the description if any.
- Erratas are shown as a small amber chip (`+5` written with plus,
  `05` leading zero) with a one-click fix; the text is otherwise preserved.
  Only frames that are edited are rewritten; the others keep their exact
  spelling, and text openomf drops stays where it was (spec 08).
- Adding an effect never merges it with a neighbouring tag (the encoder
  orders tags so they read back); a tag whose name would merge with the
  frame's tags in every order is not added, and a toast says why (as it
  does for a tag the frame already has).
- Card menu (⋮): duplicate, insert before/after, move up/down, delete,
  "copy effects to all frames", "paste effects".

### 3.3 Add effect picker

Popover with a search box and the categories as sections. Each entry shows
label, raw code and a one-line description; hover shows the long
description. Enter adds the tag with its default argument (`min` or 0) and
focuses the argument field. Tags already on the frame are shown ticked and
re-adding is a no-op. Tags that pyomftools marks invalid (`c p o z`) are not
offered.

### 3.4 Frame operations

- **Add frame** appends a frame copying the previous frame's sprite and
  duration; the sprite picker opens immediately.
- Insert, duplicate, reorder, delete as above. Deleting a frame does not
  renumber hit coordinates because they attach to sprites, not frames.
  Delete (key, trash button) always asks first. Each operation is its own
  labelled undo step, and the selection follows the frame acted on (moved,
  inserted or duplicated); deleting an earlier frame keeps the selected
  one selected.
- The add-effect picker and the card menu close on `Esc` and on a click
  outside; only one picker is open at a time.
- **Normalise text** rewrites every frame canonically and removes the text
  openomf drops (confirm).

## 4. Text mode

Monospace textarea with token highlighting through a mirrored `<pre>`
overlay (frame keys, durations, tags), parsed live (150 ms debounce), and
a frame list below it. Every string parses the way openomf parses it
(spec 08); text openomf drops is listed as a warning with its position and
never blocks committing or saving. Text with a NUL character is not applied
(openomf ends the string there).
Also: the frame list rows gain the same effect labels as the
visual cards, and `Ctrl+Space` in the textarea opens the tag picker and
inserts the raw code at the caret.

## 5. Preview semantics

Playback (spec 11) follows openomf `player.c`: each game tick advances the
reader (or seeks for `d`) and then applies the frame now active; the first
tick applies tick 0 without advancing. Playback honours tags progressively. For the editor to be useful
the following are simulated from the first release; everything else is shown as a badge
on the frame card ("not previewed") rather than silently ignored:

| Previewed                                            | Effect in the viewer                        |
| ---------------------------------------------------- | ------------------------------------------- |
| frame key, duration                                  | sprite and timing; negative durations count as written and a tick no frame covers ends the animation (openomf `script_get_frame_at`) |
| `x+ x- y+ y-`                                        | translate the object by N px **every tick** the frame is active, its first tick (and tick 0 of the animation) included; x is mirrored by facing. With `v` on the same frame they set velocity instead (previewed identically for authoring) |
| `x= y=`                                              | on entry, place the object at `origin + N` and, when the next frame carrying the same tag (by tick) has a different value, slide there over the ticks until it starts. `x=` sets only the horizontal slide speed and `y=` only the vertical one; both reset the shared slide timer; when already at the target the running slide continues |
| `ox oy`                                              | per-frame sprite draw correction            |
| `r f`                                                | flip horizontally / vertically for that frame only (openomf clears the flip on every frame entry) |
| `d`                                                  | re-entry: `N ≥ 0` → seek to tick N+1 (loop); `N < 0` → seek to totalTicks+N; `d` without value is `d0` and loops forever |
| `bl bb`                                              | screen shake for 4·N ticks, counting down one per tick, offset `trunc(sin(n) · 5 · n / 15)` (openomf `game_state.c`) |
| `s`                                                  | plays the slot's sound when `SOUNDS.DAT` is loaded, with `l`, `sb`, `sf` (spec 23) |

Position offsets are previewed relative to the animation origin and
mirrored when **flip** is on, matching the game's facing logic. The
simulation is the same in the preview's **Centred** framing (spec 12 §9);
only the camera follows the object there, so the movement shows as the
background moving the other way.

The enemy string plays on the opponent (§6.1), alone or after the
attacker's lead-in; `e` is previewed there.

Not previewed yet, so badged "no preview" (`PREVIEWED_TAGS` in
`lib/simulate.ts` is the list the badge follows): `x y` scaled draw
(percent), `br bt` additive / dark tints, `m mx my` spawned animations
(from the same file for BK, the palette-source BK for AF), and the `n` / `q`
collision overlay marks (dimmed on `n` frames, highlighted inside a `q`
window). `e2e/preview-pixels.spec.ts` checks every previewed row on the
drawn pixels after stepping ticks.

## 6. Extra strings

Collapsible section listing `extraStrings` (AF: with the
`extra_string_selector` meaning shown; BK: footer string separately). At
most 10 (openomf `SD_EXTRASTR_COUNT_MAX`): adding is disabled at 10. Each
has the same Visual / Text editor in a compact form and a "preview this
string" radio that routes it to playback instead of the base string.

The string selector also offers **Enemy string** for AF moves (§6.1). The
summary shows the string's byte count against its openomf limit (always for
the enemy string, for the others once over it); over the limit a red note
says the file cannot be saved, which the save refuses (spec 05/06).
`?string=base|K|enemy[&frame=N]` opens the view on a string (and frame).

### 6.1 Enemy string

An AF move's enemy string (openomf `footer_string`) is an animation string
the **opponent** plays. On a hit openomf switches the opponent to its own
move 9 (`ANIM_DAMAGE`) and replaces that animation's script with it
(`har.c` `har_take_damage`, ~966–1030); on a frame with `ua` the attacker
does the same and seeks the opponent's reader to its own tick (`player.c`
~688–697). So the frame letters index the **opponent's move 9 sprites**,
and the string's tags move the opponent.

- **Editing**: the same visual editor, text mode, lint, working copy
  (`ScriptTarget` `'enemy'` in `useWorkingScript`, label `edit enemy string
  N`) and undo as the other strings; only edited frames are rewritten.
  Thumbnails, the frame sprite picker, the sprite strip and the "sprite does
  not exist" lint use the opponent's move 9, drawn as the other player (HAR
  band indices shifted by 48 from the P1/P2 toolbar choice). The strip's
  double click does not open the pixel editor (the sprites may be another
  file's). The Overview keeps the raw field (≤ 510 bytes) with an "Edit in
  Script →" link to `?string=enemy`; the Problems view's enemy-string items
  open it too.
- **Opponent**: this document (a mirror match) by default; a panel above
  the frames names it and the number of move 9 sprites (`useOpponent`).
  **Load fighter…** picks another AF, kept for the session across
  documents; "use this file" goes back. Without a move 9 the panel says so
  and every frame's sprite is missing.
- **Preview**: the scene plays the opponent's move 9 running the string,
  facing the attacker (mirrored against the flip toggle; `x+` moves it away
  from the attacker), with the usual controls, Scene / Centred framing and
  overlays (its collision points). Dragging a position tag on the canvas
  follows the pointer on screen (`x+ x- x=` are mirrored for an object
  facing left).
- **Variants** (`lib/enemyString.ts`): a Standing / Airborne (/ Launch)
  switch and a "stuns or KOs" box show, read-only under "openomf plays", the
  string openomf builds (kept text plain, dropped text struck through, added
  text highlighted) and preview it. The timeline and frame cards stay on the
  stored string.

  | state                          | openomf plays                                                |
  | ------------------------------ | ------------------------------------------------------------ |
  | standing                       | the string                                                   |
  | standing, stuns or KOs         | the string up to its last `-`, then `-x-20ox-20L1-ox-20L2-x-20zzs4l25sp13M1-zzM2` (nothing is kept when there is no `-` after position 0) |
  | airborne                       | the string + `-L2-M5-L2`                                     |
  | airborne, stuns or KOs         | the string + `-L3-M5000`                                     |
  | launch (the hitting frame has `ai`, not a projectile move) | `A1-s01l50B2-C2-L5-M400` instead (checked before airborne) |
  | empty string                   | nothing: no hit animation (Chronos' stasis)                  |

  Launch is offered only when a frame of the base string has `ai` and the
  move is not a projectile; a note names those frames. A move with `ua` or a
  non-zero `throw_duration` always plays the string as it is (har.c adds
  nothing while a throw lasts), so the switch is disabled with a note. The
  velocities openomf sets with these (knockback, the `k` hack) are not
  previewed.
- **With the move** (`lib/enemyPair.ts`): attacker (this move's base
  string, as player 1) and opponent in one scene, on the arena floor 60 px
  apart origin to origin around the scene centre (adjustable 0–300; without
  the arena both are shifted together so their sprites are centred). The
  attacker plays from its first tick; the opponent stands (the first sprite
  of its move 11) until it is hit, then plays the string in step:
  - a `ua` move starts the opponent on the `ua` frame's tick with its
    reader on that same tick, so the ticks before it never play (player.c);
  - otherwise the string starts from its tick 0 on a chosen attacker frame,
    by default the first frame whose sprite has collision points.

  Playback stays on the enemy string's timeline (timeline, frame cards,
  hold, `d`) with a **lead-in** before it: the scrubber starts at the
  attacker's first tick (a negative tick for a hit), the label reads
  "Lead-in n/N", and First / `Home` go to its start. The attacker's state is
  its base string played straight through (`Simulator.statesByTick`) at the
  tick that goes with the opponent's (`attackerTickAt`); after its string
  ends it holds its last frame. `e` (move to the other fighter, player.c
  ~216) puts the opponent on the attacker on every tick of the frame before
  its `x±`/`y±` apply, so throws land where the game puts them; it is
  previewed only here (elsewhere it keeps its "no preview" badge). The two
  strings' screen shakes are combined; overlays and drags are the
  opponent's.

## 7. Shortcuts (Script tab focused)

| Key | Action |
| --- | ------ |
| `Ctrl+Space` | add effect picker (visual: on selected frame; text: at caret; not while typing in a field) |
| `Ctrl+Shift+Enter` | add frame after selected |
| `Ctrl+D` | duplicate frame |
| `Alt+↑ / ↓` | move frame |
| `Delete` | delete selected frame (confirm) |
| `Space`, `,` `.` | playback, as elsewhere |
| `L` | toggle "loop this frame" |
| `Ctrl+M` | toggle Visual / Text |

## Appendix A — Initial `tag-meta.json` classification

Every tag in `tags.json` (152 from pyomftools plus `u` from openomf) with
its category, label and argument kind. "—" means no argument. Labels for
tags with no known meaning are the raw code; they sit in **advanced**.
This table is the seed for the file and is expected to be refined as tags
are understood.

### position

| tag | label | arg |
| --- | ----- | --- |
| `x+` | Move right each tick by | pixels 0–511 |
| `x-` | Move left each tick by | pixels 0–511 |
| `x=` | Slide X to (by next `x=` frame) | pixels −512–511 |
| `y+` | Move down each tick by | pixels 0–511 |
| `y-` | Move up each tick by | pixels 0–511 |
| `y=` | Slide Y to (by next `y=` frame) | pixels −512–511 |
| `ox` | Sprite X correction | pixels |
| `oy` | Sprite Y correction | pixels |
| `v` | Apply x±/y± as velocity | — |
| `g` | Snap to ground, zero velocity | — |
| `h` | Zero velocity every tick | — |
| `e` | Move to enemy position | — |
| `at` | Position behind enemy | — |
| `ac` | Face arena centre | — |
| `ar` | Reverse facing | — |
| `ad` | Turn toward held direction | — |
| `aw` | May pass through walls | — |
| `ab` | Allow passing through walls | — |
| `ax` | Fall through the floor | — |
| `bu` | Move to arena centre (destruct) | — |
| `cf` | Walk to far corner (with `bm`) | — |
| `am` | Stop walking marker | — |
| `ms` | Special Y placement (y = −4·(y−188)) | — |
| `cy` | Vertical player control, speed | count |
| `bh` | Ignore bounds checking | — |

### appearance

| tag | label | arg |
| --- | ----- | --- |
| `r` | Flip horizontally | — |
| `f` | Flip vertically | — |
| `x` | Scale width % | percent ≥ 0 (`x-5` is the `x-` tag) |
| `y` | Scale height % | percent ≥ 0 |
| `u` | Bring sprite to front | — |
| `w` | Push sprite to back | — |
| `br` | Draw additively | — |
| `bt` | Dark tint (Shadow) | — |
| `bz` | Colour tint effect | — |
| `ub` | Motion blur | — |
| `bs` | Blend start | raw |
| `bf` | Blend finish | raw |
| `bpd` | Palette: reference index | paletteIndex |
| `bps` | Palette: start index | paletteIndex |
| `bpn` | Palette: entry count | count |
| `bpf` | Palette: fighter palette selection | — |
| `bpp` | Palette: initial and final level | raw |
| `bpb` | Palette: initial level | raw |
| `bpo` | Palette: disable effects | — |
| `pa` | HAR palette effect: enable | — |
| `pb` | HAR palette effect: value (<512) | raw |
| `pc` | HAR palette effect: value (<512) | raw |
| `pd` | HAR palette effect: reference colour | paletteIndex |
| `pe` | HAR palette effect: apply to other HAR | — |
| `ph` | HAR palette effect: only in damage anim | — |
| `pp` | HAR palette effect: intensity / duration | ticks |
| `ps` | Update colour palette | — |
| `ptd` | Effect fade-in | ticks 0–127 |
| `ptp` | Effect hold | ticks 0–127 |
| `ptr` | Effect fade-out | ticks 0–127 |
| `ba` | Credits fade: remapping | raw |
| `bc` | Credits fade: colour count | count |
| `bd` | Credits fade: switch | — |
| `bg` | Credits fade: unknown | — |
| `bi` | Credits fade: start index | paletteIndex |

### combat

| tag | label | arg |
| --- | ----- | --- |
| `q` | Hit enabled for N frames | count ≥ 1 |
| `n` | No collision this frame | — |
| `k` | Knockback on hit | raw |
| `ai` | Hit launches opponent | — |
| `i` | Interrupted on block | — |
| `bn` | Unblockable | — |
| `cp` | Hit pause on successful hit | — |
| `ue` | Damage enemy if grounded | — |
| `ua` | Force enemy into damage animation | — |
| `ur` | Keep blocking opponent blocking | — |
| `af` | Freeze opponent | — |
| `aa` | Reset air-attack state | — |
| `un` | Disable corner push | — |
| `uz` | Shadow grab: vanish on damage | — |
| `zz` | Invulnerable to all | — |
| `zj` | Invulnerable to jumping attacks | — |
| `zp` | Invulnerable to projectiles | — |
| `t` | Mute sound if other HAR blocks | — |

### chain

| tag | label | arg |
| --- | ----- | --- |
| `jh` | Allow chain to high moves | — |
| `jm` | Allow chain to mid moves | — |
| `jl` | Allow chain to low moves | — |
| `jj` | Allow chain to airborne moves | — |
| `jp` | Allow chain to projectile moves | — |
| `jf` | Allow chain to scrap | — |
| `jf2` | Allow chain to destruction | — |
| `jz` | Allow chain to anything | — |
| `jn` | Allow chain to animation | animId |
| `bj` | Jump to animation | animId |
| `d` | Re-enter at tick | ticks (negative = from end) |
| `cl` | Next animation on landing | — |
| `bm` | Play animation meanwhile | animId |
| `mm` | Select animation for `mo`/`mu` | animId |
| `mo` | Set flag on `mm` animation | — |
| `mu` | Disable `mm` animation for N ticks | ticks |
| `jg` | Getup-related (unknown) | — |

### spawn

| tag | label | arg |
| --- | ----- | --- |
| `m` | Spawn animation | animId |
| `mx` | Spawn X | pixels |
| `my` | Spawn Y | pixels |
| `mrx` | Spawn X random range | pixels |
| `mry` | Spawn Y random range | pixels |
| `ma` | Spawn angle | degrees |
| `mg` | Spawn gravity | raw |
| `mi` | Spawn instance count | count |
| `md` | Destroy animation | animId |
| `mp` | Spawn feature bitmask | raw (hex shown) |

### sound

| tag | label | arg |
| --- | ----- | --- |
| `s` | Play sound slot | soundIndex 0–29 |
| `l` | Loudness | raw |
| `sf` | Frequency | raw |
| `sb` | Panning start | raw |
| `se` | Panning end 1 | raw |
| `sl` | Panning end 2 | raw |
| `smo` | Play music track | musicTrack |
| `smf` | Stop music track | musicTrack |

### screen

| tag | label | arg |
| --- | ----- | --- |
| `bb` | Vertical screen shake | raw |
| `bl` | Horizontal screen shake | raw |
| `be` | Block end of round | — |
| `b1` | Advance to Fire / Ice fight | — |
| `b2` | Break Fire Pit grate | — |

### advanced (no reliable description)

`ae ag al ao as b bk bo bw bx by cg cw cx mc mn sa sc sd sp sw uc ud uf
ug uh uj ul us vsx vsy zg zh zl zm` — shown with raw code, plain `IntField`
when `tags.json` says they take an argument (`bk bo cx mn sc sp sw`), and
the description from `tags.json` if any. `as` (fire orb wander) and `ao`
(Nova death) have descriptions but are scene-specific and stay here.
