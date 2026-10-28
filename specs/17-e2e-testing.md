# 17 — End-to-end tests (Playwright)

Every user-facing feature has Playwright coverage, including corner cases.
A view is not done until its scenarios here pass. Unit tests (spec 10) cover
the format library and composables; this suite covers the editor as the
user experiences it, in a real browser, down to the bytes written.

## 1. Setup

- `packages/editor/e2e/`, Playwright Test with TypeScript.
- Browsers: latest Chromium (File System Access API path) and latest
  Firefox (download fallback path). Nothing else is supported or run.
- Runs against `vite preview` of the production build in CI and against the
  dev server locally (`pnpm --filter @omf/editor e2e --ui` for debugging).
- Viewport 1440×900 default; one smoke project at 1024×700 for the
  collapsed layouts.
- Tests are deterministic: playback uses a fake clock
  (`page.clock.install()`) and the app exposes `window.__omf.testHooks`
  in non-production builds only (step ticks, read the current document as
  bytes, read the current LUT, navigate). Hooks are stripped from production bundles.
- The hooks are installed only after the router's initial navigation
  (`router.isReady()`), so a test that sees `__omf` can rely on the router
  listening. `App.open()` waits for the hooks, selects the fallback file
  access again (a reload resets it), opens through the hook and navigates
  with the `navigate` hook, which resolves once the route is in place: no
  fixed sleeps.

## 2. Fixtures

No shipped game data in the repository. Fixtures are built by
`e2e/fixtures/build.ts` using `@omf/formats` before the suite runs, so they
exercise exactly the corner cases we care about:

| Fixture            | Contents                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `tiny.af`          | `test.af` from a local openomf test run, copied as is (spec 10 §Fixtures)                     |
| `tiny.bk`          | `test.bk` from a local openomf test run, copied as is                                         |
| `fighter.af`       | 3 moves: idle `A10-B10`, a move with every field non-zero, hit coords on sprites A and B, a shared (`missing`) sprite, a 21-byte `move_string`, an `enemy_string`, 2 extra strings |
| `edge.af`          | move ids 0 and 69, 255 sprites in one move, a 0×0 sprite, hit coords at x −512 / 511, y −512 / 511, unknown bits set in `ai_flags` and `pos_constraint`, strings with every errata (`+5`, `05`, `c`) and text openomf drops (`a2`), tags `x+ x- x= y= d r f ox oy m q n`, a 1023-byte base string (the openomf maximum), 10 extra strings |
| `arena.bk`         | 320×200 background using indices across all regions, 3 palettes, non-identity remaps 0–5, animations 6–11 and 20–27 with names, `music_mask` ARENA0, a footer string |
| `menu.bk`          | 1 palette, 1 animation, non-320×200 background (e.g. 64×32)                                   |
| `big.bk`           | 50 animations, a sprite whose encoded stream is close to 65 535 bytes                         |
| `altpals.dat`      | 11 synthetic palettes with recognisable 16-shade bands                                        |
| `fighter.json`     | `fighter.af` decompiled through the library's `toJSON` (and, when the Python env exists, cross-checked against pyomftools) |
| PNGs               | exact-palette indexed PNG (`exact.png`), PNG with 3 unmatched colours (`unmatched.png`), RGBA PNG with alpha 0/100/200/255 (`alpha.png`), 300×300 opaque PNG too large for a sprite (`oversized.png`) |
| `corner.af`        | an animation with no sprites, a frame on sprite Z with only A–C, a 21-byte move string without NUL |
| `enemy.af`         | enemy strings (spec 15 §6.1): move 9 with five sprites in 0x11–0x15, move 11 in 0x06, a `ua` throw (30), a hit with collision points on B (31), a launch with `ai` (32), an empty enemy string (33) |
| `opponent.af`      | another opponent: move 9 with three 16×6 sprites in 0x21–0x23, move 11 in 0x24 |
| `bad-background.json` | `arena.bk` as JSON with a background array of the wrong length |
| `corpus.af`, `corpus.bk` | the shipped-bug corpus (spec 10)                                                          |

When `OMF_DATA_DIR` is set, a separate **game-data project** runs the
load-and-save round trip (§3.2) over every shipped AF and BK.

## 3. Scenarios

Each bullet is one test unless noted. Names follow `view.feature.case`.

### 3.1 Start, open, routing

- Open via file chooser (Chromium picker and Firefox `<input>` fallback);
  app navigates to `#/animations/<first id>`.
- Drag and drop a file onto the window; dropping while dirty asks to
  confirm and cancelling keeps the document.
- Open a file with the wrong extension (BK renamed to `.AF`): detected by
  content, toast explains.
- Open a corrupt file (truncated at several offsets, generated): error
  toast with offset, previous document untouched.
- Recent files list shows the last eight, newest first, one entry per file;
  clicking reopens after a reload; a deleted file is dropped with a message
  (Chromium).
- Chromium File System Access (`file-access.spec.ts`, chromium project
  only): the pickers are stubbed in an init script to return real OPFS
  handles, so reads, writes, `isSameEntry` and handles stored in IndexedDB
  are the browser's own; permission answers are scripted. Open through the
  picker, save in place (bytes on disk, no download), refused permission and
  a file gone since opening fall back to Save As, a dropped file keeps its
  handle, a new file saves through the save picker.
- Deep link `#/animations/11/script` on a fresh page without a document
  redirects to `#/` and, after opening, returns to that route. A bare
  `#/animations` returns to the first animation (not the empty list), and
  New, Import JSON or Restore use the pending route up, so a later Open
  does not go there.
- Unknown route → start view. Browser back/forward moves between views.
- AF without palette source shows the greyscale banner; choosing a source
  removes it; reload keeps the source (IndexedDB).

### 3.2 Save and round trip

- Open each fixture, save immediately, compare bytes: identical.
- Open, make one edit in every field type (int, fixed, flag, enum, string,
  hit coord, sprite offset), save, reopen: values persist and the file is
  loadable by the library and (game-data project) byte-exact except the
  edited fields.
- Save as: new name; title updates; original untouched.
- Firefox fallback: save triggers a download with the right name and bytes.
- Dirty indicator appears on first edit, clears on save, `beforeunload`
  dialog appears when closing dirty (Chromium `page.on('dialog')`).
- Export JSON matches `fighter.json`; Import JSON produces the same bytes as
  the source AF; importing JSON with an out-of-range value shows the field
  path and keeps the document unchanged.

### 3.3 File view

- Every AF header field editable, clamped to its width (`health` 65535 ok,
  65536 rejected and outlined red), fixed-point fields accept `5.5` and
  store 1408, `−14.5` round trips.
- Sound table: 30 cells, hex entry `0x1f`, arrow and wheel increments;
  the rest of the sound editor is covered by spec 23 §6.
- BK: music mask checkboxes change the hex readout; unknown set bit
  (synthetic fixture) is listed and preserved after save.
- HAR select shows "Jaguar" for id 0 and "Unknown (42)" for id 42.

### 3.4 Animation list and overview

- Filter by id, by name, by `move_string`; `↑/↓` navigation; `⚠` shown for
  the errata animation.
- Add animation: lowest free id chosen, custom id dialog rejects a used id
  and ids ≥ 70 (AF) / ≥ 50 (BK); new animation renders a 1×1 sprite and
  `A10`.
- Delete animation referenced by another move: dialog lists referrers;
  confirm removes; undo restores with the same id.
- Overview fields: `next_animation_id` link navigates; flag groups toggle
  bits and show hex; Unknown group edits persist.
- Canvas: zoom buttons and keys; overlay toggles change the overlay canvas
  (pixel sampling via `toDataURL`); background toggle shows the
  palette-source background for AF.
- Playback: play, pause, step, scrub, loop off stops at last tick; frame
  label shows ms at arena speed 5 (10 ticks → 280 ms) and at static timing
  (100 ms); speed slider changes ms.
- Sprite strip: click pauses on that sprite; shared sprite shows `↪` and
  owner tooltip; unused sprite dimmed.

### 3.5 Script view

- Visual mode reflects `A10-bl3B10`: two cards, second has one effect
  labelled "Horizontal screen shake" with value 3 and raw code `bl3`.
- Add effect through picker (search "spawn", pick "Spawn animation", type
  id): text mode shows `m<id>`; timeline updates; preview plays within the
  debounce (fake clock advance).
- Change duration by dragging a timeline segment edge; by typing; by
  `Shift`-drag (5 ticks).
- Reorder frames by drag; insert/duplicate/delete via card menu; undo each.
- Hold frame: playback stays on the frame while editing its tags.
- Position tag drag on canvas changes `x+` value live.
- Text mode: typing text openomf drops (`A4-#`) lists an "openomf drops"
  warning, does not block switching views or saving; the saved bytes contain
  the string verbatim.
- Erratas: `+5` shows chip; "fix" rewrites to `5`; Normalise rewrites all
  frames, removes dropped text, and the preview output equals the parser's
  canonical form.
- Simulation: `r` flips only its own frame; `x=` slides; `d` re-enters.
- Tags in Advanced (`uf`, `bk5`) render with raw code and remain after
  round trip.
- Extra strings: add, edit, preview-this-string radio drives playback.
- `x=` slide, `d` loop and `r` flip are visibly previewed (sample pixels at
  known ticks via test hooks).

### 3.6 Sprites view and pixel editor

- Grid shows all sprites with sizes; 0×0 sprite shows `∅`; 255-sprite move
  renders without layout breakage.
- Export PNG of a sprite then Import it back: identical indices, byte size
  unchanged or smaller, pixels identical.
- Import PNG with unmatched colours: dialog lists 3 colours with counts;
  Cancel leaves the sprite; Nearest colour (when enabled) imports.
- Import into a shared sprite: "Update all" changes both users, "Only this"
  de-shares (`missing` becomes false, owner unchanged).
- Pixel editor: each tool produces the expected pixels on a 8×8 sprite
  (pencil, eraser, line, rectangle outline and filled, fill contiguous and
  global, select-move with clipping warning, flip, rotate); undo per stroke;
  Apply creates exactly one history entry; Cancel after edits asks to
  confirm.
- Resize with each anchor adjusts `pos_x/pos_y` so the scene position of
  the content is unchanged (sample canvas before and after).
- Encoded size indicator turns red and Apply disables when painting pushes
  `big.bk`'s near-limit sprite over 65 535 bytes.
- Onion skin and live preview panels render (non-blank pixel checks).
- Reorder sprites: confirm dialog offers to rewrite the script; both paths
  verified in text mode.
- Delete a sprite referenced by frames: dialog lists the frames.

### 3.7 Collisions view

- Table lists points filtered by current sprite; "show all" dims others.
- Add point at centre; drag on canvas updates row values; nudge keys;
  `Shift` axis lock; place mode adds on click and exits with `Esc`.
- Boundary values −512 and 511 accepted, −513 and 512 rejected.
- Points attached to a missing sprite flagged; copy from another sprite;
  clear sprite with confirm.
- Flip on: the point mirrors around the sprite box; the stored value is
  unchanged after a no-op drag.
- Round trip: values survive save and reload bit-exact including `null`.

### 3.8 Palettes view

- BK: palette list add/duplicate/delete (palette 0 not deletable),
  reorder warning.
- Grid selection modes (click, shift, ctrl, marquee, band lock); usage marks
  for background and sprites; "select unused".
- Colour editor: 6-bit sliders, hex entry quantised with the pyomftools
  conversions (`#5a2e10` → 22 11 4 → shown back as `#592c10`), native colour
  input.
- Ramp between two indices produces monotonic components; HSL long path
  differs from short path.
- Shades generates a 16-entry band dark→light.
- Adjust hue/saturation preview then apply; undo restores.
- Swap ranges with "Rewrite images": canvas pixels identical before/after;
  without rewrite: pixels change.
- Sort by luminance with rewrite: image identical, palette sorted.
- Import `.gpl` / `.pal` / `.act` / indexed PNG; export each and re-import
  equals.
- Compare with palette 1: ring marks; copy differing entries.
- ALTPALS: load fixture, pick option 7 into P2 secondary band: indices
  0x40–0x4F equal fixture shades, index 0 untouched.
- Remaps: identity reset, set single entry by click and by typing, each
  generation tool on a range with search-range option; mapping to 0 shows
  warning; copy from slot/palette; preview "apply remap" changes canvas;
  compare split view with draggable divider.
- AF: palette source picker, HAR colour choice P1/P2, preview as P2 draws
  with offset 48 (sample pixel equals base[48 + i]).
- Legend: row bars with ranges, the dot's text follows the usage toggles,
  the ring appears while comparing and on the remap grid for entries mapped
  to 0; row labels ≥ 12 px.
- Layout: at 1440×900 grid and preview lie wholly in the pane together (BK
  with each tool and the remap tab open, AF with ALTPALS loaded); at
  1024×700 (`small`) they sit side by side without horizontal overflow.

### 3.9 Background view

- Export PNG, import same: identical; import wrong size asks to resize and
  updates `background_width/height`; import with unmatched colours blocked
  as in sprites; overlay an animation at origin.

### 3.10 Problems view

- Lists errata, missing-sprite frame, point on missing sprite, over-limit
  diagnostics from `edge.af`; severity filter; jump link lands on the item
  selected.

### 3.10a Trigger editor (spec 18)

- Build `236P` by pad clicks, by keyboard, by raw typing; chips show
  oldest→newest while raw shows `P632`; reorder chips; repeated direction
  refused; byte counter; conflict warning appears for a lower-id prefix
  move and clears when that move's id is raised; special values `!`, `"!"`,
  `0`, `n`, `LINK17` round trip untouched; Try-it box selects the expected
  move with a fake clock, and selects nothing when the button comes more
  than 9 ticks after the last direction.

### 3.10b File lifecycle (spec 19)

- New fighter opens an unsaved AF with the 16 base animations and saves to
  a loadable file; New scene likewise; New from… leaves the source file
  unmodified; Duplicate.
- Autosave: edit, advance fake clock 5 s, reload the page → Recover card
  present → Restore yields the edited document; Save removes the snapshot;
  Discard removes it; five snapshots cap; corrupt snapshot offered as
  download.

### 3.10c Sheets and export (spec 20)

- Export sheet + JSON, import unchanged → bytes identical; shift a sprite
  in the PNG → `pos_x` changes accordingly; sheet without JSON → manual
  dialog; unmatched colours blocked; APNG export frame count and GIF export
  decode in-browser to the expected first-frame pixels; a sheet whose
  sprites use all 256 indices falls back to RGBA with a notice.

### 3.10d Reference view (spec 21)

- Every tag in `tags.json` appears once; search filters; usage counts link
  to frames; trigger table lists all moves of the open AF with conflicts;
  shortcuts section matches the registry (generated, so compare counts).

### 3.11 Undo / redo and history

- Undo across view changes; coalescing of rapid edits to the same field
  into one entry; 200-entry cap; redo cleared by a new edit; undo of
  palette tool restores pixels and palette; undo after pixel-editor Apply
  restores the previous image in one step.

### 3.12 Keyboard and accessibility

- Every shortcut in specs 12–16 triggers its action; shortcuts suppressed
  while typing in inputs; `Esc` closes dialogs.
- `@axe-core/playwright` scan of each view has no serious violations.
- Tab order reaches every control in each view (smoke).

### 3.13 Layout

- 1024×700 project: right/secondary columns collapse per spec; nothing
  overflows horizontally (`document.documentElement.scrollWidth ===
  clientWidth`).
- Dark and light themes render every view (screenshot smoke, not pixel
  asserted).
- **No network**: a request interceptor fails any request not to the app's
  own origin; every scenario runs under it, and one test loads the app with
  the strict CSP from spec 11 and asserts no console CSP violations.

## 4. Corner-case checklist

Collected here so nothing is forgotten when a feature lands:

- Animation with zero sprites; frame referencing sprite Z (index 25) when
  only A–C exist.
- Base string of exactly 1023 bytes saves; 1024 is an error that blocks
  saving because openomf will not load it (extra strings 511/512, enemy and
  footer strings 510/511); the UI shows the error on Save and keeps the
  document dirty.
- More than 8 BK palettes block saving.
- Move string of 21 bytes with no NUL; 22 bytes refused by the widget.
- Non-cp437 character in any string field refused with explanation (the
  script text keeps what was typed, and an error says why it cannot be saved).
- Hit coordinate with `null` ≠ 0 preserved.
- Sprite with `missing = true` whose owner is deleted, or that shares index
  0: an error that blocks saving (openomf crashes on it), render as empty.
- Sharer whose owner image is re-encoded to a different length: the
  sharer's written `imageLen` follows the owner.
- Sprite stream without a final op 3, and one overflowing its size
  (`truncated`): both load, display, and save byte-exact.
- Two palettes with identical colours; remap pointing every index to itself
  vs. to 0.
- Opening a second file while playback is running stops playback and
  resets offsets.
- Window resized during pixel editing keeps the working copy.
- Undo immediately after opening does nothing; redo stack empty.
- JSON import of a BK with a background array of the wrong length → error
  with path.

## 5. Conventions

- One spec file per area under `e2e/`; shared helpers in `e2e/helpers.ts`
  (the `App` class: open fixtures through the test hooks, navigate, save
  through the download fallback, choose files, sample canvas pixels) and
  `e2e/fakeAudio.ts`. Selectors via `data-testid` attributes named
  `<view>.<element>` (`script.timeline.segment`).
- Byte comparisons use the library in the test process: read the saved file
  (the download artefact of the fallback path, in both browsers, or the
  OPFS file behind a stubbed native handle in `file-access.spec.ts`) and
  compare with `expect(bytes).toEqual(...)`.
- Canvas assertions sample pixels through `testHooks.sample(x, y)` or read
  the canvas data in the page rather than full screenshots, except the theme
  smoke tests.
- Fake clock (`page.clock`) or `stepTicks` for playback timing. Real time
  only where it is the subject: negative checks that nothing happens during
  a wait (each marked with an `eslint-disable-next-line` and its reason) and
  the tests that real `requestAnimationFrame` drives ticks.
- `pnpm lint` allows no warnings, so a skipped test or a fixed wait has to
  say why.

## 6. Non-goals

Visual regression at pixel level across browsers; load testing; mobile.

## 7. CI

Runs after unit tests and build on every PR and every push to main:
Chromium, Firefox and the 1024×700 project, retries 1, trace on first
retry, HTML report uploaded as an artefact. Playwright always starts its own
fresh build on `E2E_PORT` (default 4174, `--strictPort`), never reusing a
server already on the port. The game-data project runs only in the manually
triggered "Game data" workflow (`.github/workflows/gamedata.yml`, a
self-hosted runner with `OMF_DATA_DIR`), which sets `OMF_REQUIRE_DATA` and
fails when any game-data test was skipped.
