# 10 — Testing

Runner: Vitest, `pnpm test` (all packages) from the root. Library tests are pure Node;
editor tests use `@vue/test-utils` with happy-dom for composables and widgets.

## Fixtures

Committed: `packages/omf-formats/test/fixtures/test.af`, `test.bk` (163 B
and 64 KB). These are **not** part of the openomf repository: openomf's
`testing/test_af.c` and `test_bk.c` write them as "empty round trip"
outputs, so they are copied from a local openomf test run. They give an
independent check because a different writer produced them. All other
fixtures are synthetic and built by the library (spec 17 §2). No shipped
game data is committed.

**Shipped-bug corpus**: `test/fixtures/corpus.af` and `corpus.bk`, built by
`test/corpus.ts` (each entry names the shipped file it imitates) and
committed, so CI without game data covers the odd data of the real files:
strings with text openomf drops (`rff10-`, `hx+8-`, `uabeujf2jfE3-`,
`usw30X1-`, a bare `!`, and the unshipped `A5B7-C2`), empty 60537×60537
sprite headers, 0×1 sprites carrying 768 bytes, sharers whose stored length
is the owner's, `move_string` leftovers after the NUL, a non-zero header
dword, collision `null` bits and unknown header fields, and RLE streams
without op 3, with a run past the image, with a run longer than the bytes
left and with op 3 before the end (these four come from openomf's decoder
and tournament files; no shipped AF/BK has them). `corpus.test.ts` checks
openomf's reading (strings against `openomf-strings.json`, pixels against
`sd_sprite_vga_decode`) and byte-exact round trips; `e2e/corpus.spec.ts`
opens both in the editor's views and saves them byte-exact. A change to the
writer that alters the committed bytes fails; regenerate with
`OMF_UPDATE_FIXTURE=1` only on purpose.

Environment variables:

| Variable                   | Default                           | Use                                 |
| -------------------------- | --------------------------------- | ----------------------------------- |
| `OMF_DATA_DIR`             | `openomf/build/resources` next to the repository | directory of `*.AF`, `*.BK` |
| `OMF_REQUIRE_DATA`         | unset                             | set: a missing or empty `OMF_DATA_DIR` fails instead of skipping (game-data CI job) |
| `OMF_PYOMFTOOLS_JSON_DIR`  | unset                             | pyomftools decompiled JSON per file |
| `OMF_STRINGPARSER`         | `$OMF_DATA_DIR/../stringparser`   | openomf's `stringparser` tool, for parser parity |
| `OMF_UPDATE_FIXTURE`       | unset                             | set to rewrite `fixtures/openomf-strings.json` from `stringparser` and the corpus files from `corpus.ts` |

Tests depending on these are **skipped**, not failed, when the paths do not
exist, so CI without game data stays green. A `tools/make_parity_json.sh`
script runs pyomftools decompilers over `OMF_DATA_DIR` to populate the JSON
directory locally.

## Library test matrix

Files in `packages/omf-formats/test/`:

| File                 | Checks                                                                   |
| -------------------- | ------------------------------------------------------------------------ |
| `binary.test.ts`     | every reader/writer primitive, cp437 both ways, varStr variants, XOR, EOF errors |
| `palette.test.ts`    | 6↔8-bit conversion matches pyomftools formulas, remap, LUT byte order     |
| `sprite.test.ts`     | decode of hand-built streams incl. missing op 3, early op 3, overflow → `truncated`; `decode(encode(d)) === d` on edge cases (empty, 1 px, full row, gaps, multi-row, 254² opaque fits, 255² opaque throws) and on every shipped sprite |
| `animation.test.ts`  | hit coord pack/unpack, counts derived from arrays                        |
| `af.test.ts`         | fixture round trip byte-exact; shared image resolution (most recent owner) and sharer `imageLen` written from the owner; enum tables |
| `bk.test.ts`         | fixture round trip byte-exact; offsets recomputed; terminator            |
| `gamedata.test.ts`   | byte-exact round trip for every AF/BK in `OMF_DATA_DIR`, `ALTPALS.DAT` and `SOUNDS.DAT` |
| `corpus.test.ts`     | the shipped-bug corpus (§Fixtures): openomf's reading and byte-exact round trips without game data |
| `json.test.ts`       | `fromJSON(toJSON(x))` writes identical bytes (fixtures and every shipped file), error paths, pyomftools warnings; with `OMF_PYOMFTOOLS_JSON_DIR`, `toJSON` deep-equals pyomftools JSON |
| `script.test.ts`     | ported `tests/animation_strings.py` list round-trips; every shipped base/extra/footer string round-trips byte for byte; every used tag is in `tags.json` |
| `script-openomf.test.ts` | the parser reads like openomf: committed `openomf-strings.json` (corner cases, a fuzz corpus, the shipped strings openomf drops text from) matches; with `stringparser` built, the fixture and every shipped string are compared with its output; parsing rules S1–S16 (spec 08); every encodable tag set the encoder writes reads back; only edited frames are re-encoded |
| `runtime.test.ts`    | tick helpers incl. negative durations and `d` semantics, `msPerTick` formula, lint cases (dropped text, clamping, missing values) |
| `color.test.ts`      | closest-index metrics, ramp endpoints, 16-shade band shape vs ALTPALS, `remapImages` round trip |
| `palette-tools.test.ts` | ramps, swap/move permutations, palette file and sheet sidecar validation |
| `palfiles.test.ts`   | GPL, JASC PAL and ACT round trips and parsing                             |
| `trigger.test.ts`    | parse/format of the 66 shipped trigger strings, shadowing analysis cases (spec 18) |
| `trigger-openomf.test.ts` | matching as openomf `har.c`: disabled moves, the input buffer and its 9-tick window |
| `sheet.test.ts`      | sheet build/parse round trip, origin recomputation (spec 20)             |
| `limits.test.ts`     | writer rejects > 255 sprites, > 65 535 B images, over-long strings; diagnostics for openomf limits |
| `boundaries.test.ts` | every limit at its exact boundary, last good and first bad value: sprites 255/256, image 65535/65536, hit coordinates, move and animation ids, extra strings 10 (openomf) and 255 (format), 8/9 BK palettes, encoder coordinates and runs at 16383/16384, pixel values, the 21-byte move string, `msPerTick` per setting |
| `save-safety.test.ts`| string limits at the exact openomf boundary, > 8 BK palettes, encoder coordinate and size limits, hit coordinate integers |
| `sounds.test.ts`     | `SOUNDS.DAT` read/write, limits, sample rate and WAV export (spec 23)    |

## Editor tests

`packages/editor/src/**/*.test.ts`, happy-dom:

- Composables: `useDocument` open/save state machine and dirty tracking
  (`useDocument.test.ts`, `docChange.test.ts`, `lifecycle.test.ts`);
  `useHistory` bounds, coalescing and the 200-entry cap
  (`useHistory.test.ts`); `usePlayback` tick → frame; `useRecentFiles`
  order, cap, stale entries; `useSounds` restore; `usePixelEditor` and its
  undo; `useSpriteImport` matching.
- `lib/files.test.ts`: `ensurePermission`, `writeHandle` abort on failure,
  native pickers and the download fallback.
- `lib/doc.test.ts`: `cloneDoc` shares the immutable buffers and copies the
  rest.
- `lib/scriptOps.test.ts`: edits re-encode only the edited frame, never merge
  tags, clamp values, keep separators valid, refuse a tag the frame cannot
  hold; `lib/simulate.test.ts`, `lib/simulateSeek.test.ts`: the `player.c`
  rules of spec 15 §5 (tick-0 translation, per-frame flips, 4·n shake,
  `x=`/`y=` slides, `d` without value, negative durations).
- `lib/spriteEdit.test.ts`, `lib/pixels.test.ts`, `lib/paletteOps.test.ts`,
  `lib/references.test.ts`, `lib/scene.test.ts`, `lib/animExport.test.ts`,
  `lib/scriptTags.test.ts`, `codecs/*.test.ts`.
- Widgets (`components/widgets/widgets.test.ts`): `IntField` clamping and
  invalid display, `FixedField` raw round trip, `FlagGroup` bit toggling,
  `HexField`.
- Canvas functions: `decodedToRgba` pixel checks on tiny inputs (they
  return plain `Uint8ClampedArray` buffers, so no DOM canvas is needed).

End-to-end browser tests with Playwright are specified in spec 17 and are
part of the definition of done for every view.

## CI

`.github/workflows/ci.yml`, on pull requests and pushes to main: Node 24,
`pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`
(ESLint with `--max-warnings 0`), `pnpm typecheck`, `pnpm test`,
`pnpm build`, then `pnpm --filter @omf/editor e2e --project=chromium
--project=firefox --project=small` against the built app (spec 17 §7).

`.github/workflows/gamedata.yml`, started by hand (`workflow_dispatch`) on a
self-hosted runner with the game files: the unit tests and the e2e
`gamedata` project with `OMF_DATA_DIR` and `OMF_REQUIRE_DATA=1`; it fails
when a game-data test was skipped (only the optional `stringparser` and
pyomftools comparisons may be).

The production build has no source maps. No deploy job: the built `dist/`
is copied to the user's nginx by hand or by a script outside this repo.
