# Developer guide

A map of the codebase for someone who knows Vue 3, TypeScript and Bootstrap
but not One Must Fall 2097 or this project. The specs in [`specs/`](../specs/README.md)
are the detailed design; this page tells you where things are and which parts
need care. Build and test commands are in the [README](../README.md).

## The domain in five minutes

- **AF** files hold one fighter (HAR): up to 70 _moves_. **BK** files hold a
  scene: a 320×200 background, palettes, remap tables and up to 50
  _animations_. Moves and animations share one shape: a list of **sprites**
  (RLE-encoded, palette-indexed images with an offset), **collision points**
  and **animation strings**.
- An **animation string** such as `A3-bl3B4-C2` is the script that plays an
  animation: frames (`A3` = sprite A for 3 ticks) carrying tags (`bl3` =
  screen shake). Spec 08 has the grammar, spec 15 the tag list.
- Colours are **6-bit VGA** (0–63 per channel). AF files have no palette; the
  editor borrows one from an arena BK (spec 16).
- A sprite can be **missing**: it then shares the image of the most recent
  earlier sprite with the same image index (spec 04). Editing, importing or
  deleting sprites must keep those owners intact.
- **openomf is the reference** for game behaviour, including how it copes with
  the bugs in the shipped data (malformed strings, garbage sprite headers).
  Unedited data must always save byte-exact. pyomftools is a second opinion,
  not an authority.

## Repository layout

| Path                   | What                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/omf-formats` | `@omf/formats`: pure TS, no runtime dependencies. Binary I/O, AF/BK/ALTPALS/SOUNDS.DAT, sprite codec, animation strings, triggers, diagnostics, JSON, colours, sheets. |
| `packages/editor`      | `@omf/editor`: the Vue app.                                                                                                                                            |
| `specs/`               | Design specs, kept up to date with the code.                                                                                                                           |
| `tools/`               | Python scripts that regenerate committed tables from openomf/pyomftools sources, and the pyomftools parity JSON.                                                       |

## `@omf/formats`

Everything a file needs is in here, so the editor never touches bytes.

- **Reading and writing**: `readAF`/`writeAF` (`af.ts`), `readBK`/`writeBK`
  (`bk.ts`), on `BinaryReader`/`BinaryWriter` (`binary.ts`). Sprites and the
  shared animation block are in `animation.ts` and `sprite.ts`; the RLE encoder
  mirrors openomf's `sd_sprite_vga_encode` statement for statement so the two
  can be compared.
- **Shared images**: `resolveSharedImages` gives sharer → owner as the game
  resolves it (index 0 never owns). `resolveSharedImagesInFile` is the
  file-format view used when writing, which keeps saves byte-exact.
- **Animation strings** (`script.ts`): a port of openomf's `script.c`.
  `decodeScript` never fails; text openomf would drop is kept on the frame
  (`Frame.dropped`, `Script.trailing`) and each frame remembers its exact
  spelling (`Frame.raw`), so `encodeScript(decodeScript(s)) === s`. Only
  frames that were edited are re-encoded. Tags are written in an order that
  cannot merge into another tag (`frameEncodes` says when no such order exists).
- **Limits and diagnostics** (`diagnostics.ts`, `LIMITS` in `animation.ts`):
  checks are graded `error`/`warning`/`info`; `blocksSave` marks what openomf
  would reject or crash on, and the editor refuses to save those.
- **Triggers** (`trigger.ts`): move strings (input sequences), conflict
  analysis and an input buffer that follows openomf's `har.c`.

## The editor

### State: singleton composables

There are no stores. Each `useX()` in `src/composables` returns refs and
functions backed by **module-level state**, so every caller shares it. The
table in spec 11 lists them all; the ones everything else builds on:

- **`useDocument`**: the open document (`doc`, a `shallowRef`), its file
  handle, `dirty`, `generation` (bumped when another document opens) and the
  save queue. **Every edit goes through `mutate(label, fn)`**, which clones the
  document (`cloneDoc` in `lib/doc.ts` copies objects but shares the large typed
  arrays, which are never written in place), applies `fn` and records undo.
  `dirty` is an identity check against the last saved value, so undoing back to
  it is clean again.
- **`useHistory`**: snapshot undo. Labels starting with `set ` or `edit `
  coalesce when repeated within 500 ms (typing in a field, dragging a point);
  anything else is its own step. A save seals the history.
- **`useWorkingScript`**: animation text being typed is held here and committed
  after 400 ms of quiet. Anything that reads or writes the whole document
  first calls `flushPending()`/`commitPending()` (save, undo, export,
  unsaved-changes prompts) so a pending edit is never lost or applied out of
  order.
- **`useSelection`**: what is selected comes from the route
  (`/animations/:id/...`), not from state; reload and back/forward just work.
- **`usePalette`**: builds the 257-entry RGBA lookup table (`lut`) that all
  rendering uses, from the palette source, HAR colours and remap preview.

When another document opens, composables that hold per-document state reset
on `generation` changes. Keep that in mind when adding state.

### Rendering

Images stay palette-indexed until the last moment. `canvas/render.ts`
composites indices (`compositeFrame`) and maps them through the LUT into an
`ImageData`; index 256 (`TRANSPARENT`) is see-through. In **sprites**, index 0
is also transparent, as in the game; in the **background** it is a colour.
Overlays (grid, origin, bounds, hit points) are drawn on a second canvas
(`canvas/overlay.ts`). Coordinates are explained at the top of `lib/scene.ts`:
scene pixels (320×200), the animation origin (on the arena floor for AF files
when an arena is shown, centred otherwise) and sprite offsets. The preview's
Centred framing draws on a stage shifted by a camera offset (`centredStage`,
`cameraShift`); `SceneCanvas` shifts pointer positions back, so views only
ever see scene pixels.

### Preview playback

`lib/simulate.ts` is a port of openomf's `player.c`: per-tick movement, frame
entry effects (flip, shake, slides), hold and `d` loops. `usePlayback` drives
it from `requestAnimationFrame` at the game's tick length (`msPerTick`, 28 ms
at the default arena speed). Sounds (`s` tags) only play during playback the
user started, never on autoplay (`lib/playbackSound.ts`, `useSounds`).

### Files and storage

`lib/files.ts` uses the File System Access API in Chromium (save in place,
recent files) and falls back to `<input type="file">` and downloads elsewhere.
`lib/db.ts` wraps IndexedDB (`idb`): recent file handles, autosave snapshots
(`useAutosave`, one per tab, guarded by Web Locks), settings and cached
palette/sound files. Animation export runs in a worker (`workers/`).

### Views and components

`router.ts` maps one view per area (`views/`); `AnimationLayout` hosts the
per-animation tabs (Overview, Script, Sprites, Collisions, pixel editor).
Components are grouped by area under `components/`; plain logic lives in
`lib/` as pure functions with unit tests, so components stay thin. Keyboard
shortcuts are registered per scope through `useShortcuts`; dialogs use
`useModal`, which traps focus and suspends shortcuts while open.

## Testing

- Unit tests (Vitest) sit next to the code (`*.test.ts`) and in
  `packages/omf-formats/test`. Tests that need the original game files skip
  without them; a synthetic corpus of the shipped-data bugs covers those cases
  in CI (spec 10).
- End-to-end tests (Playwright, `packages/editor/e2e`) run against a build
  with test hooks (`window.__omf.testHooks`, only when `VITE_TEST_HOOKS=1`).
  Every test gets a fake `AudioContext`, and the browsers are muted. Spec 17
  describes the conventions.

## Before you change things

- Read the spec section for the area first; update it in the same commit.
- Edits go through `mutate`/`replace` with a meaningful label; pick `set …` or
  `edit …` only for value edits that should coalesce.
- Never write into a sprite image, background or remap typed array in place;
  build a new one.
- When openomf and the shipped data disagree, openomf wins, but unedited data
  still saves unchanged. If openomf itself looks wrong, raise it instead of
  copying it.
