# OMF 2097 Web Editor

Browser-based editor for One Must Fall 2097 fighter (`.AF`) and scene (`.BK`)
files. Runs fully client-side; nothing is uploaded anywhere.

Status: first complete version. The format library round-trips every
shipped AF/BK byte-exact, and the editor covers every view in
[`specs/`](specs/README.md), with Playwright tests on Chromium and Firefox.

## Development

New to the code? Start with the [developer guide](docs/DEVELOPING.md).

```sh
pnpm install
pnpm test        # unit tests; game-data tests run when the data is found
pnpm lint        # ESLint, no warnings allowed
pnpm typecheck
pnpm --filter @omf/editor dev       # http://localhost:5173
pnpm --filter @omf/editor build     # static site in packages/editor/dist
pnpm --filter @omf/editor exec playwright install chromium firefox   # once
pnpm --filter @omf/editor e2e       # Playwright; E2E_PORT picks the port (4174)
```

Tests are capped so they fit on a laptop: Vitest uses at most 8 workers
(`VITEST_MAX_WORKERS`), Playwright 4 locally (`E2E_WORKERS`; CI keeps its
default), and `pnpm test` runs the packages one after another.

The built `dist/` is a static site that works from any directory: its asset
URLs are relative and routing is hash based, so the server needs no rules.
Open it with a trailing slash (`/projects/openomf/editor/`, not `…/editor`),
or relative URLs resolve against the parent; nginx adds the slash itself for
a directory, or use `location = /projects/openomf/editor { return 301
$uri/; }`. `VITE_BASE=/sub/path/` pins an absolute base instead. It works
under `Content-Security-Policy: default-src 'self'; img-src 'self'
blob: data:; worker-src 'self' blob:`.

Game-data tests read `*.AF`/`*.BK` from `OMF_DATA_DIR` (default
`../openomf/build/resources`, next to this repository) and are skipped when
it is missing; `OMF_REQUIRE_DATA=1` makes that an error. The e2e game-data
project runs with `pnpm --filter @omf/editor e2e --project=gamedata`, and the
manual "Game data" workflow runs both on a self-hosted runner. Without game
data, a synthetic shipped-bug corpus (spec 10) covers the odd data of the
real files. To also
compare JSON with pyomftools, generate reference files with
`tools/make_parity_json.sh OUT_DIR` (needs a Python with `validx`) and set
`OMF_PYOMFTOOLS_JSON_DIR=OUT_DIR`.

## Stack

- Node 24 LTS, pnpm workspace
- `@omf/formats`: pure TypeScript parsers and writers for AF, BK, sprites,
  palettes and animation strings, with byte-exact round-trip tests
- `@omf/editor`: Vite + Vue 3 + TypeScript + Bootstrap CSS

## Related projects

- [pyomftools](https://github.com/omf2097/pyomftools) — Python reference
  implementation of the file formats
- [OpenOMF](https://github.com/omf2097/openomf) — open source remake of the
  game, reference for sprite encoding and animation script semantics

## License

MIT, see [LICENSE](LICENSE).
