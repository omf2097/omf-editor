# 23 — Sound bank and sound table editor

`SOUNDS.DAT` is the game's shared sound bank. The editor reads it (never
edits it) so the 30-slot `sound_table` of an AF or BK can be heard,
browsed and checked. Like `ALTPALS.DAT` it is optional and remembered.

## 1. Format (`@omf/formats/sounds.ts`)

```
u32  0
u32  offset[count]          // offset[0] = header size = 4 + 4·count
per sound:
  u16 len
  if len > 0: u8 freqKey, u8 data[len]   // 8-bit unsigned mono PCM
```

- `count = headerSize / 4 − 1`; the shipped file has 299 (`SOUNDS_MAX`,
  openomf `SD_SOUNDS_MAX`), 65 non-empty.
- Offsets point at each record's `len`. Readers ignore them (openomf
  reads sequentially). openomf's writer sums only data lengths, which is
  wrong; ours writes the real positions, which is what the shipped file
  contains, so `writeSounds(readSounds(b))` is byte-exact.
- Sample rate `trunc(1 000 000 / (256 − freqKey))` (sounds_loader.c);
  key 131 is 8000 Hz.
- A bank needs at least one entry (the header size doubles as the first
  offset), and at most 299; each sample is at most 65 535 bytes.

```ts
interface Sound { freqKey: number; data: Uint8Array }
readSounds(b): Sound[];  writeSounds(s): Uint8Array;
soundSampleRate(key); pitchedSampleRate(rate, pitch); soundDurationMs(s);
soundForSlot(table, slot);   // table[slot] − 1, −1 = none
AF_OVERRIDDEN_SOUND_SLOTS     // [25, 26, 27]
soundToWav(s)                 // 8-bit mono WAV, pad byte for odd lengths
```

## 2. Sound table semantics (openomf player.c, resources/af.c)

- `s<n>` plays `SOUNDS.DAT[table[n] − 1]`. Table values are therefore
  1-based sound numbers and 0 is silent. The UI numbers sounds the same
  way (sound *v* = SOUNDS.DAT entry *v − 1*, shown in the tooltip).
- openomf zeroes AF slots 25–27 on load. Those slots are marked and the
  preview does not play them.
- Options while playing: volume `l × 2` clamped to 0–127 (default 127);
  pan `sb` −100..100, otherwise `(x − 160) · 100 / 160` from the object's
  game position; pitch `sf` via `pitched_samplerate` (+3 % per step up,
  +2 % per step down, clamped at −20). `t`, `sp`, `sc`, `sd`, `sa`,
  `sl`/`se` sweeps are not simulated.
- Shipped data: every non-zero table value points at a non-empty sound
  except FIGHTR8 slots 20 and 21.

## 3. Loading (`useSounds`)

- File view "Load SOUNDS.DAT…" (picker), or drop a file named
  `SOUNDS.DAT` on the window (any case). Dropping `ALTPALS.DAT` likewise
  loads the HAR colours. Neither replaces the open document.
- Cached in IndexedDB (`files/sounds`) and restored on start; "Forget"
  clears it. A cached copy that no longer parses is reported once and
  dropped. A "play sounds" toggle made while settings load wins over the
  stored value.
- Playback uses Web Audio: one cached `AudioBuffer` per sound at its rate
  clamped to 8000–96000 Hz, with `playbackRate` carrying pitch and the
  clamp, then gain and `StereoPannerNode`. The `AudioContext` is created
  on first use.
- Browsers keep audio suspended until a user gesture. The context is only
  resumed during one (`navigator.userActivation.isActive`), and a sound
  requested while audio is locked with no resume pending is dropped, never
  queued: nothing bursts out on the first click.
- Sounds belong to a group. `ui` (preview buttons; one at a time, a second
  click stops) and `playback` (`s` tags) stop independently.

## 4. Sound table editor (File view)

One row per slot: `s<n>`, value (`IntField` 0–255, testid
`file.sound.<n>`), "…" to open the browser, play, waveform with length
and rate, and "Used by": links to the animations whose base or extra
strings have `s<n>` (to the Script view at the first such base-string frame, at most
four shown plus "+N more").

Values are unsigned bytes: a slot can refer to SOUNDS.DAT entries 1–255
(`SOUND_TABLE_VALUE_MAX`, `soundAssignable`); 128–255 are valid. openomf
declares the table as plain `char`, signed on x86, which loses 128–255; that
looks like an openomf bug, so the editor does not warn about it.

Notes per row: AF slots 25–27 "openomf clears this slot"; a value whose
entry is empty or past the end of the bank (warning); a slot that scripts
use but whose value is 0 ("used but silent"). Scripts using `s` values
outside 0–29 are listed under the table.

"Only assigned or used slots" hides the rest. The shown set is fixed
when the filter is turned on or another file opens, so a row being
edited to 0 stays put. "Play sounds in animation
previews" (setting `playbackSound`, default on) controls playback
sounds.

Without a bank the editor still shows values, usage and notes, plus a
load prompt.

**Sound browser** (dialog, modal: focus trapped, `Esc` closes): only
entries a one-byte table value can reach (values 1–255; a note counts the
ones left out), every non-empty entry (optionally the empty
ones; the current one is always listed) with number, play, waveform,
length, rate and which slots of this file use it; a number filter; "None
(silent)" first. "Use" sets the slot in one undo step. Escape or the
backdrop closes it. Each sound can be exported as a WAV.

## 5. Script integration

- Sounds play only during playback the user started (`usePlayback.audible`,
  set by `play()` from a click or key press). Autoplay (the Sprites tab
  calls `play({ silent: true })`) is silent.
- `usePlayback.onFrameEnter` fires for every frame entered while audible
  ticks advance, and when playback starts on a frame's first tick (tick 0,
  or a frame picked in the UI), not when it starts mid-frame. A held frame
  ("loop this frame") wrapping to itself is not a new entry: its sound
  plays once. Looping the whole animation re-enters frame 0.
- `usePlayback.onCut` fires on pause, seek/scrub and switching animation,
  and stops the `playback` group; seeking while playing keeps playing with
  sound. Leaving the animation views pauses playback. Turning "play sounds
  in animation previews" off stops playback sounds at once.
- `lib/playbackSound.ts` plays the `s` tag on entry.
- The `s` value picker names each slot `slot n → sound v (ms)`, `silent`,
  `(empty)`, `(not in SOUNDS.DAT)`, or `cleared by openomf` (AF slots
  25–27), and shows a play button only for a slot that plays a real sound.
- "Used by" and Reference view links open the Script view with
  `?string=base|K&frame=N` (`lib/scriptTags.ts`, the shared tag scan with a
  decode cache); the Script view switches to that string.

## 6. Tests

Unit (`@omf/formats`): round trip, offsets, size limits (0, 1, 299, 300
entries, 65 535/65 536-byte samples), rejections, rate/pitch/duration,
slot mapping, WAV padding; the shipped `SOUNDS.DAT` is byte-exact. Unit
(editor): restore ordering and corrupt-cache handling, play clamping,
the shared tag scan.

e2e (`sounds.spec.ts`, `sound.af` and a 10-entry `sounds.dat`; a fake
`AudioContext` from `e2e/fakeAudio.ts` that is suspended until a trusted
gesture and logs buffers and sources): usage, notes and the sticky
filter; links into extra strings; load, persist, forget; preview
parameters, toggling, one-at-a-time, buffer caching and the 8000 Hz
floor; no sound before a gesture and no burst after; user playback with
`l`/`sb`/`sf`, pause, seek, leaving the view; preview sounds surviving a
playback pause; the off switch and its persistence; cleared and
out-of-table slots; hold mode; play mid-frame vs. on a frame start; the
browser (silent slots, empty entries, filter, WAV export, undo, Escape,
backdrop); the tag picker in every case; dropping good and bad files; an
unreadable cache; axe; and one test with the real Web Audio API. The hook
`soundsPlayedIn(group)` lists what was played.
