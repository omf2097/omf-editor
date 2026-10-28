# 09 — JSON interop

Module: `packages/omf-formats/src/json.ts`. Goal: files written by
pyomftools `af_decompile` / `bk_decompile` load unchanged, and files exported
by the editor compile with `af_compile` / `bk_compile`.

## Shape

Exactly pyomftools `serialize()`:

- snake_case keys (`fighter_id`, `pos_x`, `start_x`, `hit_coords`, …).
- `moves` / `animations`: object keyed by decimal string id, not an array.
- Enums and bitflags as plain integers.
- `sound_table`: array of 30 integers.
- Sprite `image`: array of integers (raw RLE bytes). `missing`: boolean.
  pyomftools resolves sharers by reference before serialising, so a
  sharer's `image` holds a **copy of its owner's bytes**. `toJSON` does the
  same for parity; `fromJSON` ignores the `image` of a `missing` sprite.
- BK `background_image`: array of integers.
- Palette `colors.data`: array of `[r, g, b]` 8-bit values from
  pyomftools' `trunc(v6·255/63)`. `fromJSON` converts back with
  `round(v8·63/255)`, which recovers the original 6-bit values exactly.
- `remaps`: array of 19 arrays of 256 integers.
- Hit coord: `{ x, y, null, frame_id }` with `x`/`y` **signed**, as
  pyomftools decodes them. `frame_id` maps to the model's `spriteId`.
  pyomftools validates `x`/`y` to −511…511 and `null` to 0, so `toJSON`
  warns when a document holds −512 or a non-zero `null`.

AF example (abridged):

```json
{
  "fighter_id": 0, "exec_window": 10, "endurance": 2560, "upwards_jump_frame_limit": 3,
  "health": 160, "forward_speed": 512, "reverse_speed": 384, "jump_speed": 1024, "fall_speed": 1024,
  "version_1": 1, "ai_projectile_y_threshold": 60,
  "sound_table": [0, 1, 2, ...],
  "moves": {
    "11": {
      "start_x": 0, "start_y": 0,
      "hit_coords": [{ "x": 10, "y": 20, "null": 0, "frame_id": 0 }],
      "base_string": "A10-B10",
      "extra_strings": [],
      "sprites": [{ "pos_x": -16, "pos_y": -72, "width": 32, "height": 72, "index": 0, "missing": false, "image": [2, 0, ...] }],
      "ai_flags": 0, "pos_constraint": 0, "unknown_4": 0, ..., "points": 0,
      "move_string": "!", "enemy_string": ""
    }
  }
}
```

## API

```ts
afToJSON(af: AFFile): AFJson;      afFromJSON(j: unknown): AFFile;
bkToJSON(bk: BKFile): BKJson;      bkFromJSON(j: unknown): BKFile;
```

`fromJSON` validates structure and integer ranges with hand-written guards
(no runtime schema library in `@omf/formats`). Errors carry a JSON path
(`moves.11.sprites[2].pos_x`). Typed arrays are materialised from number
arrays; `Map` keys are parsed from the string ids and sorted. An id with
leading zeros (`"011"`) is refused, since it would collapse with `"11"`;
so is a NUL in any string (openomf reads strings as C strings). Sharers'
`image` bytes come from the file-format resolution in ascending id order
(spec 05). An animation whose header dword is not 0 carries `header_zero`
(not a pyomftools field; absent when 0).

## Known pyomftools differences

Found while checking the specs against the shipped data (2026-10-26). Each
is a candidate pyomftools fix; the editor does not copy the behaviour:

| Area | pyomftools | Shipped data / openomf | Effect |
| ---- | ---------- | ---------------------- | ------ |
| Sharer `imageLen` | writes 0 (`sprite.py` `write`) | all 610 sharers store the owner's length; openomf keeps it | `af_compile` output differs from the original AF bytes |
| Palette 8 → 6 bit | `trunc(v8·63/255)` | — | lossy: 60 of the 64 values (all but 0, 21, 42, 63) drop by one on each `bk_compile` |
| `move_string` padding | dropped | shipped AFs have leftover bytes after the NUL | `af_compile` output differs |
| `put_var_str` | encodes with `str.encode()` (UTF-8) | cp437 | non-ASCII characters in base/extra strings are written wrongly |
| `f` tag | takes an argument | openomf: no argument | no shipped string affected (spec 08) |
| `u` tag | missing | openomf has it | strings using `u` fail to parse |

Because of the first row, the parity test compares JSON, not pyomftools'
compiled bytes.

## Size note

Images as integer arrays make BK JSON several MB. This matches pyomftools and
is accepted; JSON is an interchange format, not the editor's working state.
