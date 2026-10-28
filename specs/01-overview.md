# 01 — Overview

## Purpose

A browser-based editor for One Must Fall 2097 data files:

- **AF**: fighter (HAR) definitions. Stats, up to 70 moves, each move an
  animation with sprites, hit coordinates and animation strings.
- **BK**: scenes (arenas, menus, intro). Background image, up to 50
  animations, colour palettes with remap tables, music mask.

Runs entirely client-side as a static site. No backend, and the built app
makes no network requests at all; files never leave the browser.

## Goals

1. Byte-exact round trip for every shipped game file.
2. JSON import/export compatible with pyomftools `af_compile`/`af_decompile`/
   `bk_compile`/`bk_decompile`.
3. Correctly coloured sprite viewing and animation playback.
4. Editing of everything: scalar fields, bitflags, animation strings through
   a visual tag editor with live preview, collision coordinates, sprite
   pixels in a built-in pixel editor, PNG import/export, BK background, and
   palettes and remap tables with generation tools.
5. A reusable, DOM-free TypeScript format library.

## Scope

AF and BK files only. No other game formats are edited or previewed.
`ALTPALS.DAT` is read (never written) as an optional palette source for
HAR colours (spec 16), and `SOUNDS.DAT` as an optional sound bank for
the sound table editor (spec 23); nothing else is read.

## Non-goals (for now)

- Editing or previewing other formats (TRN, PIC, CHR, REC, language
  files); `SOUNDS.DAT` is only read (spec 23).
- Collaboration, cloud storage, accounts.
- Bundling game data in the repository.

## Toolchain

| Item          | Choice                                                   |
| ------------- | -------------------------------------------------------- |
| Runtime       | Node 24 LTS. `engines.node: ">=24"`, `.nvmrc` = `24`     |
| Package mgr   | pnpm workspace                                           |
| Language      | TypeScript 6.0, `strict`, ES2022 target, ESM only (TS 7 once typescript-eslint and vue-tsc support it) |
| Bundler       | Vite                                                     |
| UI            | Vue 3, `<script setup lang="ts">`, `vue-router` (hash)   |
| Styling       | Bootstrap 5.3 CSS only. No Bootstrap JS, no Popper       |
| State         | Vue composables (`useX()`). **No Pinia, no Vuex**        |
| Tests         | Vitest (unit), Playwright (end-to-end, spec 17)          |
| Lint / format | ESLint (typescript-eslint, eslint-plugin-vue), Prettier  |
| Deploy        | Static `dist/` served by the user's own nginx; no deploy job in CI |
| Browsers      | Latest Chrome / Chromium and latest Firefox. Nothing else is supported or tested |
| Assets        | Everything bundled locally: fonts, icons, libraries. **No CDN, no runtime network requests** |
| Dependencies  | Kept minimal; full list and rationale in spec 22         |

## Repository layout

```
omf-web-editor/
  package.json                 workspace root, shared scripts
  pnpm-workspace.yaml
  tsconfig.base.json
  .nvmrc
  specs/
  tools/                       one-off scripts (tag table export)
  packages/
    omf-formats/               pure TypeScript, no DOM, no Node APIs
      src/
        binary.ts  palette.ts  sprite.ts  animation.ts
        af.ts  bk.ts  altpals.ts  script.ts  tags.json  json.ts  index.ts
        color.ts               closest match, ramps, shades, adjust (spec 16 §4)
        sheet.ts  palfiles.ts  sprite sheets (spec 20), .gpl/.pal/.act (spec 16)
      test/
        fixtures/              openomf test.af, test.bk (tiny, committed)
        *.test.ts
    editor/                    Vite + Vue 3 app
      e2e/                   Playwright tests and fixtures (spec 17)
      src/
        main.ts  App.vue  router.ts
        composables/  components/  views/  canvas/  codecs/  styles/
        tag-meta.json          presentation metadata for tags (spec 15)
```

Package names: `@omf/formats`, `@omf/editor`.

## Delivery plan

The editor ships as a **complete editor** (load, edit, save) rather than a
viewer first; the UI is designed once for editing so it does not have to be
reworked. Work is still sequenced so each step is testable:

### Phase A — Format library

1. Workspace scaffold, lint, test, CI running `pnpm -r test`.
2. Binary I/O, palette, sprite (decode + encode), animation, AF, BK, JSON
   with the full test suite (spec 10) green against local game data.
3. Animation string parser, runtime helpers, `tags.json` export.

Exit: all shipped AF/BK files round-trip byte-exact; every shipped
animation string round-trips.

### Phase B — Editor

Built view by view (spec 12), each view complete with editing and saving
when it lands:

1. App frame, routing, composables, open / save / JSON import-export, undo.
2. File view and Animation Overview (fields, canvas, playback, sprite strip).
3. Script view: visual tag editor, text mode, live preview (spec 15).
4. Collisions view (spec 14).
5. Sprites view and pixel editor (spec 13), PNG import/export.
6. Palettes and remaps view with its tools (spec 16), Background and
   Problems views.
6b. Move trigger editor (spec 18), new file / autosave (spec 19), sprite
   sheets and animation export (spec 20), Reference view (spec 21).
7. Playwright end-to-end suite (spec 17) grows with each view; a view is
   done when its e2e scenarios pass.

Exit: a fighter can be opened, every kind of field changed, a sprite
repainted, a tag added, a collision point placed, and the result saved and
loaded by openomf.

### Later

Multi-document, cross-file clipboard,
diffing. Publishing `@omf/formats` to npm if useful.

## Open questions

1. ~~Hit coordinate sign~~ Resolved: openomf decodes `x`/`y` as signed
   10-bit and `frame_id` is a sprite index (spec 14 §1).
2. `unknown_4..11`, `unknown_a`: shown raw under "Unknown"; relabel when
   openomf identifies them.
3. Opt-in nearest-colour PNG matching under a tolerance (default exact).
4. Publishing `@omf/formats` to npm. Not needed for the first release.
5. Whether the original DOS game enforces stricter limits than openomf
   (string lengths, sprite counts, image sizes). Only testing in DOSBox
   settles it.
6. Preview tick timing follows openomf's arena formula (spec 08 §Tick
   timing). Whether to also offer the original DOS game's timing, if it
   differs, is unknown until measured.
