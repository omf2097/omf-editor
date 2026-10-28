# 06 — AF format (fighter)

Module: `packages/omf-formats/src/af.ts`. Reference: `pyshadowdive/af.py`,
`afmove.py`.

## Model

```ts
interface AFFile {
  fighterId: number;               // u16
  execWindow: number;              // u16
  endurance: number;               // u32, fixed point /256
  upwardsJumpFrameLimit: number;   // u8
  health: number;                  // u16
  forwardSpeed: number;            // i32, fixed point /256
  reverseSpeed: number;            // i32, /256
  jumpSpeed: number;               // i32, /256
  fallSpeed: number;               // i32, /256
  version1: number;                // u8
  aiProjectileYThreshold: number;  // u8
  moves: Map<number, AFMove>;      // key 0..69, iteration in ascending key order
  soundTable: number[];            // 30 × u8
}

interface AFMove extends Animation {
  aiFlags: number;                 // u16, AIMoveTriggers bitflags
  posConstraint: number;           // u16, PositionConstraint bitflags
  unknown4: number; unknown5: number; unknown6: number; unknown7: number;
  unknown8: number; unknown9: number; unknown10: number; unknown11: number;  // u8
  nextAnimationId: number;         // u8
  category: number;                // u8, MoveCategory
  blockDamage: number;             // u8
  blockStunAndScrap: number;       // u8
  successorId: number;             // u8
  damageAmount: number;            // u8
  throwDuration: number;           // u8
  extraStringSelector: number;     // u8, ExtraStringSelector
  points: number;                  // u8
  moveString: string;              // null-padded 21 bytes
  moveStringRaw?: Uint8Array;      // the 21 bytes as read (see below)
  enemyString: string;             // varStr, sizeIncludesZero
}
```

## Binary layout

```
u16 fighterId, u16 execWindow, u32 endurance, u8 upwardsJumpFrameLimit,
u16 health, i32 forwardSpeed, i32 reverseSpeed, i32 jumpSpeed, i32 fallSpeed,
u8 version1, u8 aiProjectileYThreshold
repeat:
  u8 moveId            → stop when >= 70
  Animation block      (spec 05)
  u16 aiFlags, u16 posConstraint, u8 unknown4..unknown11,
  u8 nextAnimationId, u8 category, u8 blockDamage, u8 blockStunAndScrap,
  u8 successorId, u8 damageAmount, u8 throwDuration, u8 extraStringSelector,
  u8 points, nullPaddedStr(21) moveString, varStr(sizeIncludesZero) enemyString
u8 soundTable[30]
```

Writer: moves in ascending id, then terminator `u8 250`, then sound table.

Shipped files have leftover bytes after the NUL in `moveString` (for
example `0\0\0B20-C…`, apparently from the original tool's buffer).
`moveStringRaw` keeps the 21 bytes; the writer uses them while
`moveString` still equals their decoded text, and writes a clean
NUL-padded field once the string is edited.
After reading, `resolveSharedImages` (spec 04) is run.

## Enums and labels

Ported from `afmove.py` as `const` objects plus label/description tables for
the UI:

- `AIMoveTriggers` (16 bits; `VS_AIR_STATE_1` … `FLAG_8000`)
- `PositionConstraint` (16 bits; `WALL`, `NO_DIST_CHECK`, `JUMP_WALL_BOUNCE`,
  `IN_ARENA_0..4`, `FIRE_ICE_ALLOWED`, `OPP_FIRE_ICE_DESTRUCT`, reserved)
- `MoveCategory` (0 MISCELLANEOUS … 13 DESTRUCTION)
- `ExtraStringSelector` (0 NONE, 1 ARM_SPEED, 2 LEG_SPEED, 3 SPECIAL_ARM,
  4 SPECIAL_LEG, 5 SPECIAL)
- `AF_MOVE_NAMES`: 1 Jumping, 2 Getting up, 3 Stunned, 4 Crouching,
  5 Standing block, 6 Crouching block, 7 Burning oil, 8 Blocking scrape,
  9 Damage, 10 Walking, 11 Idle, 12 Scrap, 13 Bolt, 14 Screw, 48 Victory,
  49 Loss.
- `HAR_NAMES` 0..10: Jaguar, Shadow, Thorn, Pyros, Electra, Katana,
  Shredder, Flail, Gargoyle, Chronos, Nova.

Limits from openomf: `moveString` 21 bytes (a 21-byte string has no NUL
terminator in the file, which is valid), `enemyString` ≤ 510 bytes (the
stored length counts the NUL and openomf rejects ≥ `SD_MOVE_FOOTER_STRING_MAX`
= 512). The enemy string is an animation string the opponent plays, so it is
linted like one (frame keys are not checked against this move's sprites; the
Script view checks them against the opponent's move 9, spec 15 §6.1).
A stored string whose last counted byte is not NUL is accepted, as openomf
does, and written back with the NUL. Fighter ids 0–10 are the shipped HARs; other
values are accepted.

`moveString` grammar and matching rules are in spec 18 §1;
`parseTrigger` / `formatTrigger` / `analyzeTriggers` live in `af.ts`.

Helpers: `hasMoveString(m)` is false for `"!"`, `'"!"'`, `"0"`;
fixed-point accessors `toReal(v) = v / 256`, `fromReal(x) = Math.trunc(x * 256)`.
