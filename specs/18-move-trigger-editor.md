# 18 — Move trigger (input string) editor

Editor for the AF `move_string` field: the controller input that triggers a
move. Shown in the Animation Overview (spec 12 §4.1) in place of the plain
text field, with the raw text always visible and editable alongside.

## 1. Semantics (from openomf `game/objects/har.c`)

- The string is at most 21 bytes (spec 06).
- Character 0 is the **button**: `P` (punch) or `K` (kick). Anything else
  never matches input.
- Characters 1… are **directions in numpad notation**, `1`–`9` with `5` as
  neutral, written **most recent first**: the game compares the string
  against its input buffer where index 0 is the latest input. `P632`
  therefore means the player pressed 2, then 3, then 6, then punch: a
  quarter-circle forward punch, "236P" in the usual notation.
- Directions are written for a HAR **facing right**: `6` is toward the
  opponent, `4` away. The game mirrors `1↔3`, `4↔6`, `7↔9` when facing left.
- Consecutive identical inputs collapse to one buffer entry (holding a
  direction does not repeat it). The game polls the controls every tick and
  records "nothing held" as `5`, and a button pressed with no direction
  adds `5` too. When the button is pressed more than 9 ticks after the
  buffer last changed, only the newest entry counts (`har.c`
  `input_staleness`, measured before the press's own input); otherwise the
  whole buffer is compared, however long the gaps between earlier inputs.
- Matching walks moves in **ascending id from 15 to 69** and takes the first
  move whose button matches and whose directions are a prefix of the buffer
  (compared from the most recent input), subject to chain rules. Moves
  openomf disables (below) are skipped. A match longer than the bare button
  clears the buffer. A one-char
  string (`P`, `K`) matches any input with that button. A move can therefore
  be **shadowed** by a lower-id move whose directions are a prefix of its
  own.
- Special values seen in shipped data: `!`, `"!"`, `0`, `n`, `LINK17`. None
  can match input (the first character is not `P`/`K`); the game treats the
  first three as "no trigger string". They are preserved verbatim.

Observed alphabet in all shipped fighters: `! " 0 1–9 I K L N P n`.

## 2. UI

```
Trigger
 ○ Not triggered by input   raw: [ "!"  ]   (preserved as is)
 ● Input sequence
   Button  (●) Punch  ( ) Kick
   Sequence  (oldest → newest)                                   P632  · 4/21 bytes
   ┌─────┐ ┌─────┐ ┌─────┐
   │  ↓  │ │  ↘  │ │  →  │  + P        ⌫   ✕ clear
   │  2  │ │  3  │ │  6  │
   └─────┘ └─────┘ └─────┘
   ┌───┬───┬───┐
   │ ↖7│ ↑8│ ↗9│   Click a direction to append. Keyboard: numpad or digits,
   ├───┼───┼───┤   P / K set the button, Backspace removes the last one.
   │ ←4│ ●5│ →6│   → = toward the opponent.
   ├───┼───┼───┤
   │ ↙1│ ↓2│ ↘3│
   └───┴───┴───┘
   Notation: 236P        Conflicts: ⚠ shadowed by move 15 (P6)
   Raw  [ P632            ]
```

- **Mode radio**: "Not triggered by input" keeps whatever special value the
  field holds (default `!` for new moves) and shows it in a raw field;
  "Input sequence" shows the structured editor. Switching from a special
  value to a sequence starts with `P`.
- **Sequence chips** in chronological order (the reverse of the file order)
  with arrow glyph and digit; drag to reorder; click a chip (or focus it
  and press `Enter`, `Space` or `Delete`) to remove it;
  the button chip is fixed at the end. Chips flash in order when **Play
  input** is pressed to show the motion.
- **Direction pad** 3×3 appends a direction. Appending the same direction as
  the last chip is refused with a hint (the game collapses repeats).
- **Keyboard**: digits or numpad append, `P`/`K` set the button, `Backspace`
  removes, `Escape` leaves the pad.
- **Notation** line shows the conventional form (`236P`, `41236K`) and the
  arrow form.
- **Raw** field is always in sync; typing in it re-parses: valid strings
  switch to sequence mode, anything else to special mode. Byte counter
  against 21.
- The editor keeps no state between moves: the remembered special value,
  hints, a drag in progress and the **Try it** buffer reset when another
  move is shown.
- **Conflicts** (live, spec §3) list shadowing and duplicate triggers with
  links to the other moves.
- Help popover explains most-recent-first storage, facing, the 9-tick
  window, and the match order.

## 3. Trigger analysis

Computed for the whole file by `analyzeTriggers(af)` in `@omf/formats`:

- **Duplicate** (identical strings) and **Shadowed** (move A with a lower
  id ≥ 15, same button, whose directions are a prefix of B's in file
  order): A is tried first. Every shipped fighter has several of these,
  for moves the game tells apart by state (standing, crouching, jumping)
  through category and chain rules. So the conflict is a **warning** only
  when both moves have the same `category` and `pos_constraint`, and
  **info** otherwise. No shipped fighter gets a warning (tested).
- **Repeat**: two equal adjacent directions never match, because the game
  collapses repeats. Warning.
- **Disabled by openomf**: moves whose base string is `A1`, and moves with
  the `IN_ARENA_3` (Fire Pit) constraint, get their trigger replaced with
  `!` on load (`har.c`). Info. They never match, so they shadow nothing.
- **Unreachable id**: a sequence on a move with id < 15 is never matched by
  input (only ids 15–69 are scanned). Informational.
- **Length**: more than 10 directions can never be matched (buffer is 10
  entries plus terminator). Warning.
- **Invalid characters** for sequence mode. Error only in the structured
  editor; the raw value stays saveable.

A **Trigger table** in the Reference view (spec 21) lists every move of the
file with its notation, category and conflicts, sorted by id, so the
fighter's whole move list can be reviewed at once.

## 4. Test input

Below the editor, **Try it**: a focused box where typing digits and P/K
feeds a simulated buffer with the game's rules (`InputBuffer`: collapse
repeats, staleness at the press, disabled moves skipped; a fake clock in
tests, real time at arena tick length otherwise). Each typed digit is the
direction held until the next one, and P/K press the button with it held;
type `5` first for a button pressed on its own. It shows which
move the game would select, highlighting whether it is this move or a
shadowing one. Useful to check a whole fighter's triggers quickly.

## 5. Tests

Unit: `parseTrigger`, `formatTrigger`, `analyzeTriggers` on the shipped
corpus of 66 distinct strings (fixture list committed) and on constructed
shadowing cases. E2E (spec 17): build `236P` by pad clicks, by keyboard, by
raw typing; reorder chips; refuse repeated direction; conflict warning
appears when a lower-id prefix move exists and disappears when its id is
raised; special value round trip for each of `!`, `"!"`, `0`, `n`, `LINK17`.
