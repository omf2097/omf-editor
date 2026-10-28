# 11 — Editor architecture

Package: `packages/editor`. Vue 3 + TypeScript + Bootstrap CSS + `vue-router`
in hash mode. Depends only on the public API of `@omf/formats`.

## Build and hosting

Vite production build to `packages/editor/dist`, served as static files
from the user's nginx. `base` defaults to `./` (relative asset URLs), so the
same build works from any directory, e.g. `/projects/openomf/editor/` (opened
with the trailing slash); `VITE_BASE` pins an absolute base. Hash routing
means no server rewrite rules are needed. All assets (Bootstrap CSS, Bootstrap Icons SVG,
fonts, encoders) are bundled; the CSP for the page can be
`default-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:`
and the app must work under it. Supported browsers: latest Chrome/Chromium
and latest Firefox.

## Routing

Views are routes (spec 12 §1). `router.ts` defines them; a navigation guard
redirects to `#/` when no document is open and remembers the last animation
id so `#/animations` resolves to it. Route params are the source of truth
for "which animation / sprite is selected"; `useSelection()` reads them from
the route and exposes setters that call `router.push`. Dialog and mode state
(pixel editor open, place mode) is not in the route.

## State: composables, not stores

No Pinia, no Vuex. Each module in `src/composables/` keeps module-level
reactive state and exports one `useX()` function returning refs, computeds
and actions. State is therefore a singleton per module and shared by every
component that calls the composable.

| Composable        | State                                                        | Actions                                            |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `useDocument()`   | `doc: ShallowRef<AFFile \| BKFile \| null>`, `kind`, `fileName`, `handle`, `dirty`, `generation`, `byteSize` | `openFile()`, `openBytes(name, bytes)`, `openPicked(p)`, `save()`, `saveAs()`, `close()`, `newDocument()`, `importJSON()`, `importJSONBytes()`, `exportJSON()`, `mutate(label, fn)`, `replace(label, doc)`, `undo()`, `redo()`, `commitPending()`, `onDocumentChange()`, `onSaved()` |
| `useAppActions()` | — (wraps `useDocument` with the unsaved-changes prompt and routing) | `confirmDiscard()`, `open()`, `openPicked(p)`, `close()`, `importJSON()` |
| `useNewFile()`    | `dialogOpen`                                                  | `newFighter()`, `newScene()`, `newFrom()`, `duplicate()` (spec 19) |
| `usePalette()`    | `sourceBk`, `sourceName`, `paletteIndex`, `remapIndex`, `altPals`, `harColors` (P1/P2 × 3 bands), `playerOffset` (0 or 48), `lut: ComputedRef<Uint32Array>`, `isFallback`, `forceGrayscale` | `loadSource()`, `loadSourceBytes()`, `loadAltPals()`, `loadAltPalsBytes()`, `setHarColor(player, band, option)`, `restore()` |
| `usePaletteEditor()` | swatch selection, edit index, compare target, remap slot, tool candidate (spec 16) | `select()`, `selectRange()`, `selectAll()`, `setColors()`, `setRemap()`, `applyCandidate()` |
| `usePaletteUsage()` | which indices the background, sprites and preview fighter use | — |
| `useSelection()`  | `animId`, `spriteIndex` (from route), `animation`, `hitCoordIndex` | `selectAnimation(id)`, `selectSprite(i)`, `selectHitCoord(i)` |
| `useAnimationEdit(id)` | — (edits of the selected animation's fields)             | `set()`, `setMove()`, `setBk()`, `edit()`          |
| `usePlayback()`   | `playing`, `audible`, `loop`, `timing`, `speed`, `holdFrame`, `source` (base, extra or enemy string), `animId`, `script`, `state` (frame, tick, position, flips, lead-in), `enemy` (the enemy-string plan), `facingLeft`, `minTick`, `ms`, `total`, `frameIndex` | `play()`, `pause()`, `toggle()`, `stepTicks(n)`, `stepFrame(±1)`, `seekTick(t)`, `seekFrame(i)`, `seekStart()`, `reset()`, `bind()`, `onFrameEnter()` |
| `useScriptEditor()` | `target` (base, extra or enemy string), `text`, `script`, `sprites` and `spriteCount` (the opponent's move 9 for the enemy string), `diagnostics`, `bytes`, `selectedFrame`, `effectsClipboard`, `pickerFrame` | `setText(s)`, `apply(script, label?)`, `selectFrame(i)`, `decode(sprite)`, `flush()` |
| `useTagDrag()`    | `dragTag`: the position tag being dragged on the canvas (Script view) | `startDrag(i)`, `stopDrag()`, `onPointer(e)` |
| `useWorkingScript()` | uncommitted `Script` being edited (base, extra or enemy string), debounce timer | `set(script)`, `flush()` (spec 15 §1)             |
| `useOpponent()`   | the enemy string's opponent (this file or a loaded AF) and its move 9, variant, pairing, distance, hit frame | `load()`, `loadBytes()`, `reset()`, `planFor(id)` (spec 15 §6.1) |
| `useHistory()`    | `undoStack`, `redoStack`, `canUndo`, `canRedo`, `undoLabel`, `redoLabel` | `commit()`, `undo()`, `redo()`, `seal()`, `clear()` |
| `usePixelEditor()`| working `DecodedSprite`, tool, FG/BG index, brush, zoom, grid, onion skin, selection, stroke undo stack, `encodedSize` | `load()`, `begin()`, `commit()`, `undo()`, `redo()`, `transform()`, `dropIfUnchanged()`, selection copy/paste/nudge (spec 13) |
| `usePixelRender()`, `usePixelPointer()`, `usePixelZoom()` | — (the pixel editor view's canvas drawing, pointer tools and pan, zoom steps and fit) | per view instance |
| `useViewTransform()`, `useViewPan()` | offset of a fixed pane's stage; pan drag and the shared `Space` hold | zoom around pointer or centre, fit, wheel, clamped pan (pixel editor and scene preview) |
| `useSceneView()`  | the scene preview's view; module state carries zoom centre between tabs | fit on document open and on Fit |
| `useSharedImages()` | sharer → owner map of the document                        | `ownerOf(s)`, `decoded(s)`                         |
| `useSpriteImport()` | share mode of the import dialog                          | `matchPalette()`, `match()`, `decodeAndMatch()`, `applyImage()`, `importInto()` |
| `useSceneOrigin()` | `origin` of the preview, `backgroundBk`, `showsBackground` | —                                                  |
| `useViewport()`   | `zoom`, `fitRequest`, overlay toggles, `showBackground`, `flip`, `hoverPos` | setters, `fit()`, `restore()` (toggles only)       |
| `usePlaybackShortcuts()`, `useViewportShortcuts()` | — | register the canvas keys of spec 12 §9 while the control is shown |
| `useProblems()`   | derived list of diagnostics across the document              | `forAnimation(id)`, `worstFor(id)`                 |
| `useFileDrop(onFile)` | `dragging` (drop hint) | `onDragEnter`, `onDragLeave`, `onDrop`: reads the file and, in Chromium, its handle |
| `useShortcuts()`  | registers global keydown handling (spec 12 §9)               | `install()`, `register()`, `activate(scope)`, `suspend()` |
| `useModal(opts)`  | — (dialog behaviour: shortcuts suspended, focus trap, Esc, focus restore; spec 12 §11) | `useDismiss()` for popups |
| `useAutosave()`   | snapshot timer, `recoverable` list (spec 19)                 | `snapshotNow()`, `listRecoverable()`, `restore(s)`, `discard(s)`, `install()` |
| `useRecentFiles()`| recent file handles in IndexedDB (at most eight)              | `add(handle, kind)`, `reopen(entry)`, `forget(entry)`, `refresh()` |
| `useSounds()`     | SOUNDS.DAT bank, `playbackSound` setting, what is playing (spec 23) | `load()`, `loadBytes()`, `play()`, `stop()`, `unlock()`, `restore()` |
| `useTheme()`      | `theme` (`localStorage`)                                     | `toggle()`                                         |
| `useToasts()`     | toast queue                                                   | `info()`, `success()`, `error()`, `dismiss()`     |
| `useConfirm()`    | current dialog                                                | `ask(opts): Promise<choice>`, `confirm(opts)`     |

Move triggers (spec 18) are parsed where they are shown (`TriggerEditor`);
clipboards are per editor (`usePixelEditor().clipboard`,
`usePaletteEditor().clipboard`, `useScriptEditor().effectsClipboard`).

### Mutation and undo

`doc` is a `shallowRef`. All edits go through `useDocument().mutate(fn)`:
the current document is copied with `cloneDoc()`, `fn(copy)` is applied,
the copy becomes the new `doc.value` and `useHistory().commit()` pushes
the previous value. `dirty` is derived: the document is dirty when
`doc.value` is not the value last opened or saved (identity), so undoing
back to the saved state is clean again.

`cloneDoc()` copies every object, array and `Map` but **shares** the large
typed arrays (sprite `image`, BK `background`, remap tables). Those buffers
are immutable by convention: an edit replaces the array, never writes into
it. A snapshot then costs a few KB instead of the whole file (shipped AFs
are up to ~300 KB, mostly image bytes), so 200 undo entries stay small and
a mutation is fast. Unit tests assert that no shared buffer changes
between snapshots. The stack is capped at 200
entries. Rapid value edits to
the same field within 500 ms coalesce into one history entry (`label`
equality; only labels starting with `set ` or `edit ` coalesce, so
discrete operations such as add, delete, duplicate or import are always
their own step). A save seals the top entry: the next edit starts a new one.

Pending edits (the debounced working script, a focused text field that
commits on blur) are committed before undo/redo (working script only) and
before save, export, the unsaved-changes prompt and `beforeunload` (both:
the focused field is blurred and focused again). Saves are queued: a
second save waits for the first and writes the latest document. A save
whose document was replaced while the write was pending leaves the new
document's name, handle and dirty state alone; edits made during the
write keep the document dirty.

Because `doc` is shallow, components re-render on document replacement, not
on deep mutation. Panels read fields through computeds on `doc`.

## File access

```ts
async openFile(): Promise<void>
```

Uses `showOpenFilePicker` with `.af`/`.bk` accept types when available and
keeps the `FileSystemFileHandle` so `save()` can write in place. Fallback:
hidden `<input type="file">` and `save()` triggers a Blob download named
after the original file. Drag-and-drop onto the window calls `openBytes`.
File kind is detected by extension, falling back to trying the AF reader
then the BK reader. A `beforeunload` guard fires when `dirty`.

Recent files: handles persisted in IndexedDB, at most eight, newest first,
one entry per file (`isSameEntry`); permission re-requested on use; a file
that is gone (`NotFoundError`) is removed from the list. A file dropped on
the window keeps its handle (`getAsFileSystemHandle`) where the browser has
one, so it saves in place like a picked file.

## Rendering pipeline

`src/canvas/` contains pure functions, unit-testable without a DOM:

```ts
decodedToRgba(d: DecodedSprite, lut: Uint32Array): Uint8ClampedArray
compositeFrame(scene: SceneSpec, lut): Uint8ClampedArray   // 320×200 RGBA: background + sprite at origin+offset, optional flip
```

The scene canvas is a fixed 320×200 logical surface scaled by an integer
zoom with `image-rendering: pixelated`, placed by a view transform in a
fixed-size box (spec 12 §9). Overlays (origin, bounds, hit
coordinates, grid) are drawn on a second transparent canvas on top so pixel
data is never re-composited for overlay toggles. Decoded sprites are cached
in a `WeakMap<Uint8Array, DecodedSprite>` keyed by the shared `image`
buffer, which survives `cloneDoc()`, so an unrelated edit does not
invalidate the cache; LUT changes only re-blit.

Playback uses `requestAnimationFrame` with an accumulator. The tick length
comes from `msPerTick()` in `@omf/formats` (spec 08 Tick timing): arena
timing (48 − 4·speed ms, speed 0–10, default 5 = 28 ms) for AF files, 10 ms static timing for BK
files, user-switchable. `usePlayback()` exposes `timing: 'arena' | 'static'`
and `speed`. Playback reads the
working script from `useWorkingScript()` when one exists, so tag edits are
previewed before they are committed (spec 15). Preview tag semantics are
listed in spec 15 §5; the pixel editor substitutes its working sprite into
the frame compositor the same way.

## Palette source

AF files carry no palette (spec 03). On opening an AF, `usePalette` falls
back to greyscale and `isFallback = true`; the UI prompts for an arena BK
(spec 12 §4.2). The fallback is `bandedGrayscalePalette()`: the ramp restarts
in every 16-colour band, so the HAR bands 0–15, 16–31 and 32–47 each run from
dark to white (a linear 0–255 ramp leaves HAR sprites nearly black). For a BK document the source defaults to the document
itself and follows its edits.

## Scene origin

`useSceneOrigin()` places an animation in the 320×200 scene for the
canvas, the collisions view and export. BK animations use `start_x/start_y`.
AF animations stand on the arena floor, (160, 190) + `start`, while an arena
background is drawn. Without one (no palette source, or `bg` off) the union of
the animation's sprite rectangles is centred in the scene instead, mirrored
when facing left, so the HAR does not sit at the bottom edge.

## Error handling

Reader errors surface as a non-blocking toast with offset and message; the
previous document stays loaded. Write-range errors cannot occur from widgets
and are reported as toast on JSON import.

## Component tree

```
App
├─ TopBar                   primary nav, title, save menu, undo/redo, theme
├─ PaletteBanner            shown for AF without palette source
├─ RouterView
│  ├─ StartView
│  ├─ FileView              FileFieldsAF | FileFieldsBK
│  ├─ AnimationLayout       AnimationSidebar + header tabs + nested RouterView
│  │  ├─ OverviewView       ScenePreview + MoveFields | BkAnimFields
│  │  ├─ ScriptView         ScenePreview + TagEditor (Visual | Text)
│  │  ├─ SpritesView        SpriteGrid + SpriteDetail + MiniPreview
│  │  ├─ PixelEditorView    (spec 13)
│  │  └─ CollisionsView     ScenePreview (interactive) + HitCoordTable
│  ├─ PalettesView          PaletteSource (AF) | PaletteList + PaletteEditor + RemapEditor (BK)
│  ├─ BackgroundView
│  ├─ ProblemsView
│  └─ ReferenceView         (spec 21)
├─ StatusBar
└─ Toasts, ConfirmDialog
```

`ScenePreview` bundles ViewportToolbar, SceneCanvas, OverlayCanvas,
PlaybackBar and optionally SpriteStrip, and is reused by three views.

Dialogs are plain Vue components with `<Teleport to="body">`; no Bootstrap
JS. Tooltips are CSS-only (`title` plus a lightweight hover component for
rich tag tooltips).

## Preview simulation

`usePlayback()` runs a small per-tick simulation mirroring openomf
`player.c` closely enough for authoring (exact list in spec 15 §5):

- `objectOffset` accumulates `x+ x- y+ y-` every tick while the frame is
  active (they are translations per tick, not one-off moves). `x` is
  multiplied by the facing direction (`flip` toggle = facing left).
- `x= y=` set a slide: the object moves linearly from its current position
  to `origin + N·direction` over the ticks remaining until the next frame
  that carries the same tag.
- `r` / `f` toggle horizontal / vertical flip state on frame entry (XOR, so
  they persist until toggled again).
- `ox oy` are per-frame draw corrections, not accumulated.
- `d N` re-enters the script as described in spec 08.
- Everything the simulation does not model is surfaced by the tag editor as
  "not previewed"; nothing is silently dropped.

`reset()` zeroes the offsets and flip state; it runs on seek-to-start and
whenever the script or animation changes.

Seeking (`seekTick(t)` for the scrubber, `seekFrame(i)` for frame
selection and step buttons) puts the reader directly on script tick `t`
(`Simulator.seekTo`): the frames before it are played in order so their
per-tick motion applies, but hold and `d` jumps are not taken, so every
frame is reachable while another frame is held or the script loops back.
Playback continuing from there honours hold and `d` again. A script edit,
loop/hold/flip change keeps the reader on its current tick; switching the
animation or the played string rebuilds at tick 0 synchronously, so a seek
made right after the switch stays. A new document stops playback and
clears hold and the played string; the played extra string falls back to
the base string when it stops existing (undo); playback of a script that
becomes empty stops.
