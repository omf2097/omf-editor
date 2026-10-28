# 22 — Dependencies

Planned third-party packages, what each is for, and what is written
in-house instead. The bar for a runtime dependency is high: it must be
small, have no runtime network access, need no CDN, and do something
non-trivial that we would otherwise get wrong. Versions are the current
releases as of 2026-10-26. They are pinned with `^` in `package.json`, the
lockfile is committed, and Renovate/Dependabot is not set up.

## 1. Platform

| Item | Version | Notes |
| ---- | ------- | ----- |
| Node | 24 LTS | `engines.node: ">=24"`, `.nvmrc` |
| pnpm | 12.x | via `packageManager` in the root `package.json` (Corepack ships with Node 24) |
| TypeScript | **6.0.x** | not 7.0: typescript-eslint 8 requires `<6.1` and vue-tsc builds on the TS JS API, which the native TS 7 compiler does not offer yet. Move to 7 when both support it |

## 2. `@omf/formats` (runtime)

**No runtime dependencies.** Binary I/O, cp437, RLE codec, animation string
parser, JSON guards, colour maths and sheet layout are all in-house: they
are the point of the library, and they are small.

Dev only: `typescript`, `vitest`, `@vitest/coverage-v8`, `@types/node`
(tests read game files from `OMF_DATA_DIR`).

## 3. `@omf/editor` (runtime)

| Package | Version | Use | Why not in-house / alternatives |
| ------- | ------- | --- | ------------------------------- |
| `vue` | 3.5 | UI | decided |
| `vue-router` | 5.x | hash-mode routing (spec 12 §1) | decided. Its `pinia` peer is optional and is not installed |
| `bootstrap` | 5.3.8 | precompiled CSS only (`bootstrap/dist/css/bootstrap.min.css`) | no Bootstrap JS or Popper. No Sass build: theming goes through Bootstrap's CSS variables |
| `bootstrap-icons` | 1.13 | SVG icons, imported as individual SVGs or a local sprite | no icon font, nothing from a CDN |
| `fast-png` | 8.x | **PNG decoding**: indexed palettes with `tRNS`, all bit depths, interlacing | `createImageBitmap` throws palette indices away, and indexed import needs them (spec 12 §10.2). A full decoder is not worth writing |
| `fflate` | 0.8 | deflate/inflate for the PNG/APNG writer; zip for "all animations" sheet export | tiny, synchronous, works in workers. Already a dependency of `fast-png` |
| `gifenc` | 1.0.3 | GIF export (spec 20 §3) | takes indexed frames and a palette directly, which is exactly what we have. Small; unmaintained since 2022 but feature-complete. Fallback: vendor its ~400 lines |
| `idb` | 8.x | promise wrapper over IndexedDB: recent file handles, autosave snapshots, settings, ALTPALS cache | could be hand-written, but `idb` is ~1 KB and removes callback boilerplate |
| `@vueuse/core` | 15.x | composition utilities; used for `useEventListener` (window/document listeners that clean up with their component or scope, and listeners that exist only while a modal or popup is open) | avoids hand-paired add/remove listener calls. Its debounce is not used: the script working copy needs flush and cancel |

Written in-house in `packages/editor/src/codecs/`:

- **Indexed PNG and APNG writer** (~200 lines on `fflate` plus CRC32):
  `IHDR`/`PLTE`/`tRNS`/`IDAT`, and `acTL`/`fcTL`/`fdAT` for APNG. No
  maintained npm package writes palette-indexed APNG, and the format is
  simple.
- **Palette file parsers/writers** for `.gpl`, JASC `.pal`, `.act`
  (spec 16): a few dozen lines each. They live in `@omf/formats` because
  they are pure.

Browser APIs used directly, without libraries: File System Access
(`showOpenFilePicker`, Chromium) with `<input type="file">` and download
fallback (Firefox), drag and drop, Canvas 2D, Web Audio (spec 23), Web Workers (Vite's
`new Worker(new URL(…), { type: 'module' })`), `structuredClone`,
`requestAnimationFrame`.

Not used, on purpose:

| Kind | Reason |
| ---- | ------ |
| Pinia / Vuex | composables only (spec 11) |
| Component libraries (BootstrapVue, PrimeVue, …) | Bootstrap CSS plus our own small components is enough, and BootstrapVue lags Vue 3 |
| Lodash, date libraries, colour libraries | the few helpers we need are in `color.ts` |
| Runtime schema validators (zod, valibot) | JSON guards are hand-written in `json.ts` so the library stays dependency-free |
| Web fonts | system font stack (spec 12 §12) |
| Code editor components (CodeMirror, Monaco) | the text mode is a textarea with a highlighted `<pre>` overlay (spec 15 §4); the grammar is tiny |
| Immer / patch libraries | snapshot undo with structural sharing (spec 11) |

## 4. Development

| Package | Version | Use |
| ------- | ------- | --- |
| `vite` | 8.x | dev server and build |
| `@vitejs/plugin-vue` | 6.x | SFC support |
| `vue-tsc` | 3.x | type-checking `.vue` files (`pnpm -r typecheck`) |
| `vitest` | 5.x | unit tests in both packages |
| `@vitest/coverage-v8` | 5.x | coverage |
| `@vue/test-utils` | 2.x | component and composable tests |
| `happy-dom` | 21.x | DOM for editor unit tests; faster than jsdom and enough because canvas code is DOM-free (spec 11 §Rendering) |
| `@playwright/test` | 1.64 | e2e (spec 17); only the Chromium and Firefox browsers are installed |
| `@axe-core/playwright` | 4.x | accessibility scans (spec 17 §3.12) |
| `eslint` | 10.x | flat config |
| `typescript-eslint` | 8.x | TS rules |
| `eslint-plugin-vue` | 10.x | Vue rules (`flat/recommended`) |
| `@vue/eslint-config-typescript` | 14.x | glue for `<script setup lang="ts">` |
| `eslint-plugin-playwright` | 2.x | rules for `e2e/` |
| `eslint-config-prettier` | 10.x | turns off formatting rules |
| `prettier` | 3.x | formatting |
| `globals` | 17.x | browser/node globals for flat config |
| `@types/node` | 24.x | match the Node major, not the newest types |
| `@types/wicg-file-system-access` | 2023.10 | File System Access types (not in `lib.dom`) |
| `tsx` | 4.x | runs TypeScript scripts (`e2e/fixtures/build.ts`) |

## 5. Python tools (`tools/`)

`export_tags.py`, `export_cp437.py` and `make_parity_json.sh` run against
`../pyomftools` and `../openomf` sources. Standard library only; they load
`valid_tags.py` by file path so pyomftools' own dependencies (`validx`) are
not needed. Generated outputs (`tags.json`, `cp437.ts`) are committed, so
building the project never needs Python.

## 6. Policy

- No dependency may fetch anything at runtime; the no-network e2e test
  (spec 17 §3.13) and the CSP (spec 11) enforce this.
- Adding a runtime dependency requires a line in this spec with the reason.
- `pnpm audit` runs in CI as a non-blocking report.
