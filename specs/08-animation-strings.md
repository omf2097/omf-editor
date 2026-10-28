# 08 — Animation strings

Module: `packages/omf-formats/src/script.ts` and `tags.json`. Reference:
`openomf/src/formats/script.c` (parser, `script_get_frame_at` and friends),
`tag_list.c`, `utils/sstream.c`, and `game/protos/player.c` for runtime
semantics. The parser is a port of openomf's: what the editor shows is what
the game reads.

## Parsing (openomf `script.c`)

The string is read as a C string: a NUL ends it (anything after it is kept
as dropped text, see below). Then, repeatedly, one frame:

1. At an uppercase letter `A`–`Z`: that is the frame key (sprite A = 0).
   A number follows (`int`, below; no digits reads 0). Then **one character
   is skipped, whatever it is** (normally the `-` separator). The frame,
   with the tags collected so far, is complete.
2. At a lowercase letter: a tag. Names are 1–3 characters, tried longest
   first, and must be in the tag table. A tag **without** an argument that
   is followed by `+`, `-` or a digit is not a match and the next shorter
   name is tried (`us63` is `u` `s63`, `bd25` is `b` `d25`). A tag with an
   argument reads an `int` (no digits reads 0: `d` alone is `d0`).
3. `c`, `o`, `p`, `z` that matched no tag are *invalid tags*: kept, flagged
   `INVALID`, written back.
4. Anything else: openomf skips to the next `-` and past it, and the frame
   being read, with its tags, is **lost**. Tags at the end of the string
   with no frame key after them are lost too.

```
int := ("+" | "-")? [0-9]*     clamped to int16 (−32768…32767); no digits → 0
```

Consequences, all checked against openomf's `stringparser` (spec 10):

- `A5B7-C2` is `A5` (it skips `B`), then `7-` is dropped, then `C2`.
- `A-05` is `A` with duration −5; `A-B3` is `A0`, skips `B`, drops `3`.
- `f` takes no argument, so `rff10` is dropped and `…jf2jfE3` loses its
  frame. `usw30X1` is `us`, then `w30` fails: dropped.
- Four distinct shipped strings lose text this way: `rff10`, the
  `uabeujf2jf…` frames, `hx+8-` (a `-` where a tag or key should follow
  ends the frame) and `…usw30X1`.
- `A5bs3`: `A5` skips `b`, `s3` is dropped.
- Lowercase "frame keys" (`a5`) and stray `-` are dropped text.
- Digit strings beyond 18 digits overflow openomf's `long`; the editor
  clamps them like any other out-of-range number.

Every string parses; there are no parse errors.

## Model

```ts
interface Tag   { key: string; value: number | null; erratas: Errata[] }
interface Frame {
  key: string; duration: number; tags: Tag[]; erratas: Errata[];
  raw?: string;      // source spelling of tags + key + duration
  sep?: string;      // the character skipped after the duration, when unusual
  dropped?: string;  // text before this frame that openomf drops
}
interface Script { frames: Frame[]; trailing?: string }  // trailing: dropped text at the end

decodeScript(s): Script
scanScript(s): { script; dropped: DroppedSpan[]; notes: ScriptNote[] }  // with positions, for lint
encodeScript(sc): string
frameText(f): string        // canonical spelling of one frame
frameEncodes(f): boolean    // false when no order of the tags reads back (below)
normaliseScript(sc): Script // canonical frames, dropped text removed
tryDecodeScript(s): { script }   // kept for callers; never has an error
```

`value` is `null` for tags without an argument and the int16 value
otherwise. `erratas` describe the spelling: `LEADING_PLUS` (`+5`),
`LEADING_ZERO` (`05`), `INVALID` (`c o p z`).

**Round trip.** `encodeScript(decodeScript(s)) === s` for every string
(tested on every shipped string, the pyomftools corpus and a fuzz corpus).
A frame is written with its `raw` spelling as long as that spelling still
parses to the frame's current key, duration, tags and erratas; otherwise it
is written canonically. Dropped text and unusual separators are written
back where they were. So only edited frames change: editing operations
(editor `scriptOps.ts`) drop `raw` on the frames they touch, and
reordering, inserting or deleting frames writes separators the usual way.

**Canonical spelling.** Tags, then key and duration, numbers as plain
int16 decimals (never exponent form), `-` between frames. Tags written
next to each other can merge (`b` + `e` is `be`, `b` + `pd5` is `bpd5`), so
the encoder keeps the tags' order when it reads back and otherwise picks
an order that does (tags with the same name keep their relative order,
because openomf uses the last one). Some sets cannot be written at all:
`b` and `u` merge in both orders (`bu`, `ub`). `frameEncodes` reports
them and the editor refuses to add a tag that would create one. `x` and
`y` cannot hold negative values (`x-5` is the `x-` tag).

## Runtime helpers (openomf `script.c`)

```ts
totalTicks(sc): number                    // durations added as written, negatives included
frameIndexAtTick(sc, tick): number        // first frame with start ≤ tick < start + duration; tick wraps modulo totalTicks; -1 if none
frameAtTick(sc, tick): Frame
tickPosAtFrame(sc, i): number
tickLenAtFrame(sc, i): number
spriteIndexOfFrame(f): number             // key.charCodeAt(0) - 65
tagValue(f, name): number | null | undefined   // the last tag of that name, as openomf
```

The player (spec 11, 15 §5) advances one tick per game tick and uses these
to pick the sprite.

Re-entry semantics of `d N` (openomf `player.c`): on a frame carrying `d`,
instead of advancing, the reader seeks to tick `N + 1` when `N ≥ 0` (a
loop), or to `totalTicks + N` when `N < 0`. `d` without a value is `d0`:
the animation re-enters at tick 1 forever. `frameIndexAtTick` is pure;
the looping lives in the player.

## Tick timing

One script tick is one game tick. openomf's tick length (`game_state.c`,
`gs->speed` = setting + 5):

| Scene                 | ms per tick                                   |
| --------------------- | --------------------------------------------- |
| Arenas                | `8 + 60 − (setting + 5) / 15 · 60` = `48 − 4 · setting`, setting 0–10, default 5 → **28 ms** (~35.7 ticks/s) |
| All other scenes (BK menus, intro, etc.) | `STATIC_TICKS` = **10 ms**              |

The library exports `msPerTick(kind: 'arena' | 'static', speed = 5)`. The
editor previews AF files at arena timing and BK files at static timing by
default, with the speed selectable (spec 12 §9).

## Tag table

`tags.json` is generated by `tools/export_tags.py` and committed. Which tags
exist comes from pyomftools `valid_tags.py`; whether a tag takes an argument
follows openomf `src/formats/tag_list.c`, because the parser is openomf's.
Descriptions are merged from both, keeping the longer text. Shape:

```json
{
  "tags": { "bb": { "arg": true, "desc": "Vertical screen shake" }, "aa": { "arg": false, "desc": "Reset your air attack state if you have already performed one" } },
  "invalid": ["c", "p", "o", "z"]
}
```

Note that some tag names contain symbols: `x+ x- x= y+ y- y=`. Only the
first character is tested for being a lowercase letter.

The library exports `TAGS`, `isValidTag`, `tagHasArg`, `tagDescription`.
Regenerate when either source changes; a test checks that every tag used in
shipped strings is in the table.

Known discrepancies between the two sources as of 2026-10-27, which the
export script prints so they are not silently resolved:

| Tag | pyomftools         | openomf                      | Decision                              |
| --- | ------------------ | ---------------------------- | ------------------------------------- |
| `u` | absent             | present, no argument, "Bring sprite to the front" | add as valid |
| `f` | takes an argument  | no argument                  | **no argument**, as openomf. The shipped frames that only parse with an argument (`rff10`, `…ujf2jfE3`) are what the game drops; the editor keeps them as dropped text and reports them |

Presentation metadata (labels, categories, argument kinds) lives in the
editor's `tag-meta.json`, spec 15 §2.

## Diagnostics

`lintScriptString(s, spriteCount): ScriptDiagnostic[]` (with `frame` and
`pos` where they apply):

- **warning** `openomf drops "…"` for every dropped span: lost frames, stray
  `-`, trailing tags, text after a NUL, and an unusual character skipped
  after a duration (`A5B…`). Not for the `!` "no string" marker.
- **warning** for numbers outside int16 (`openomf reads 32767`), argument
  tags without a value (`d`: loops forever), frames without a duration.
- frame key beyond `spriteCount` (info; `Z` is the conventional empty frame)
- zero-duration frame (info), negative duration (warning)
- erratas and invalid tags (info)

`lintScript(sc, spriteCount)` gives the subset that needs only the parsed
script.
