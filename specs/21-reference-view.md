# 21 — Reference view and move names

## 1. Reference view `#/reference`

An in-app, searchable reference generated from the same data the editor
uses, so documentation can never drift from behaviour. Primary nav item
"Reference". Sections (left table of contents, content right):

- **Animation tags**: every tag from `tags.json` with label, category and
  argument kind from `tag-meta.json`, long description, "previewed"
  badge, and the count of uses in the open document with links to the
  frames. Filter by category and text.
- **Fields**: AF header, AF move, BK header, BK animation, sprite and
  collision fields with type, range, file name and the human label used in
  the UI.
- **Enums and flags**: `MoveCategory`, `ExtraStringSelector`,
  `AIMoveTriggers`, `PositionConstraint`, `MusicMask` with descriptions.
- **Palette layout and remap slots**: the tables of spec 16 §1.
- **Limits**: one table of the limits of specs 04–07 as openomf enforces
  them (string lengths, counts, ranges, palettes, sound table).
- **Trigger notation**: spec 18 §1, plus the file's **trigger table** when
  an AF is open (every move: id, name, notation, category, conflicts).
- **Timing**: tick formula and the ms table.
- **Shortcuts**: keyboard shortcuts generated from the shortcut
  registry: the global ones, and those of every view opened in this
  session (a view registers its shortcuts when it is first shown), grouped
  by where they work.
- **About**: version, licence, link to the original-data cards site and to
  openomf and pyomftools.

Everything is static content plus the open document; no network.

## 2. Move names

Deferred. `ENGLISH.DAT` holds HAR names (31–41) and one special-moves text
per HAR (492–502) but no per-move-id names, so names cannot be read from
game data and a curated table would have to be built by hand. For now the
editor uses only the common table ported from pyomftools
`AF_ANIMATION_NAMES` (16 ids) and shows "Move N" otherwise. A per-fighter
name table may be added later.
