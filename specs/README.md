# OMF 2097 Web Editor — Specifications

Status: draft, awaiting go-ahead for implementation. Date: 2026-10-26.

| #  | Spec                                                 | Scope                                                   |
| -- | ---------------------------------------------------- | ------------------------------------------------------- |
| 01 | [Overview](01-overview.md)                           | Purpose, goals, toolchain, repo layout, delivery plan   |
| 02 | [Binary I/O](02-binary-io.md)                        | `BinaryReader` / `BinaryWriter`, cp437                  |
| 03 | [Palette](03-palette.md)                             | VGA palette, palette mappings, ALTPALS                  |
| 04 | [Sprite](04-sprite.md)                               | Sprite header, RLE codec, shared images, size limit     |
| 05 | [Animation](05-animation.md)                         | Shared animation block, hit coordinates, limits         |
| 06 | [AF format](06-af-format.md)                         | Fighter file and moves                                  |
| 07 | [BK format](07-bk-format.md)                         | Scene file and animations                               |
| 08 | [Animation strings](08-animation-strings.md)         | Script grammar, parser, tag table, tick timing          |
| 09 | [JSON interop](09-json-interop.md)                   | pyomftools-compatible JSON                              |
| 10 | [Testing](10-testing.md)                             | Unit tests, round trip, parity, fixtures, CI            |
| 11 | [Editor architecture](11-editor-architecture.md)     | Routing, composables, file access, preview simulation   |
| 12 | [UI design](12-ui-design.md)                         | Views, navigation, widgets, interactions, shortcuts     |
| 13 | [Sprite pixel editor](13-sprite-pixel-editor.md)     | Tools, palette panel, resize, live preview              |
| 14 | [Collision coordinates](14-hit-coordinates.md)       | Semantics, table and canvas editing                     |
| 15 | [Tag editor](15-tag-editor.md)                       | Visual tag editor, tag metadata, live preview           |
| 16 | [Palette & remap editor](16-palette-remap-editor.md) | Arena palette layout, palette tools, remap generation   |
| 17 | [End-to-end tests](17-e2e-testing.md)                | Playwright coverage of every feature and corner cases   |
| 18 | [Move trigger editor](18-move-trigger-editor.md) | Input string semantics, pad editor, conflict analysis    |
| 19 | [File lifecycle](19-file-lifecycle.md)               | New files, templates, autosave and recovery              |
| 20 | [Sprite sheets & export](20-sprite-sheets-and-export.md) | Lossless sheet round trip, APNG/GIF export           |
| 21 | [Reference view](21-reference-view.md)               | In-app reference                                         |
| 22 | [Dependencies](22-dependencies.md)                   | Libraries, versions, what is written in-house and why    |
| 23 | [Sounds](23-sounds.md)                             | SOUNDS.DAT loader, playback and the sound table editor   |

Original game data for comparison is browsable at
<https://katajakasa.fi/projects/openomf/cards/> (pyomftools `generate_html`
output: every AF/BK with headers, animations, sprites, palettes and remaps).

Reference implementations: `../pyomftools` (`omftools/pyshadowdive/`) is the
source of truth for field names, JSON shape and the string parser;
`../openomf` (`src/formats/`, `src/game/`) for the sprite RLE encoder,
script runtime semantics, tick timing and palette usage.
