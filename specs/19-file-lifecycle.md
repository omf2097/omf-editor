# 19 — File lifecycle: new files, templates, autosave and recovery

Complements spec 12 §3 (Start view) and §10.3 (saving).

## 1. New file

Start view and File menu offer **New fighter (AF)** and **New scene (BK)**.

**New fighter** creates an AF with:

- Header copied from Jaguar (FIGHTR0.AF), adjustable in the dialog:

| Field | Value (raw) |
| ----- | ----------- |
| `fighter_id` | 0 |
| `exec_window` | 10 |
| `endurance` | 55.0 (14080) |
| `upwards_jump_frame_limit` | 2 |
| `health` | 200 |
| `forward_speed` / `reverse_speed` | 5.0 (1280) / 4.0 (1024) |
| `jump_speed` / `fall_speed` | −14.5 (−3712) / 1.1484375 (294) |
| `version_1` | 50 |
| `ai_projectile_y_threshold` | 20 |

- The 16 base animations the game requires (ids 1–14, 48, 49), each with
  one 1×1 transparent sprite and base string `A10`; all other fields 0
  except, as in every shipped fighter:

| Ids | `category` | `move_string` |
| --- | ---------- | ------------- |
| 1–8, 10, 11 | 9 BASIC | `0` |
| 9 (damage) | 0 MISCELLANEOUS | `0` |
| 12–14 (scrap, bolt, screw) | 0 MISCELLANEOUS | `"!"` |
| 48, 49 (victory, loss) | 11 VICTORY | `n` |

- Sound table copied from Jaguar (it maps HAR sound slots to the shared
  sound bank, so zeros would make every move silent).

**New scene** creates a BK with a 320×200 background filled with index 0,
one palette (greyscale ramp in 0x60–0x9F, black elsewhere), identity
remaps, `music_mask` 0, no animations.

Both open directly in the editor as an unsaved document named `Untitled.AF`
/ `Untitled.BK`; the first save asks for a location.

## 2. New from template

"New from…" picks an existing file and opens it as a new unsaved document
(the original file handle is not kept). Use case: start a fighter from
another fighter. Also available as **Duplicate** in the File menu for the
current document.

## 3. Autosave and recovery

- While a document is dirty, a snapshot (the serialised bytes plus the
  file name, kind, palette-source name and last route) is written to
  IndexedDB at most every 5 seconds, and immediately on `visibilitychange`
  to hidden and on `pagehide`.
- Snapshots are keyed by a session id; a successful save, an explicit
  close, or replacing the document (open, new, import, restore — also
  after Discard) deletes the session's snapshot. A snapshot write that
  started before the document was replaced is dropped.
- Each tab holds a Web Lock named after its session until it closes. The
  Start view leaves out snapshots whose session lock is held (another
  open tab's live work) and lists them again every 2 s while any are
  hidden, so they appear once that tab closes.
- On start, if snapshots exist, the Start view shows a **Recover** card per
  snapshot: file name, time, size, with Restore and Discard. Restore opens
  the snapshot as a dirty document (the file handle may need re-granting on
  save; the user is prompted to Save as) and returns to the stored route.
  When the snapshot was made with another palette source than the current
  one, a toast names it (the source's bytes are not part of the snapshot).
- Snapshots are capped at 5; oldest discarded. A corrupt snapshot (parse
  failure) is reported and offered as a raw download rather than lost.
- Autosave never touches the file on disk.

## 4. Close

**Close** returns to the Start view; prompts when dirty with Save / Discard
/ Cancel. Playback stops and all composable state resets.
