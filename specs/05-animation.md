# 05 — Animation block

Module: `packages/omf-formats/src/animation.ts`. Shared by AF moves (spec 06)
and BK animations (spec 07).

## Model

```ts
interface HitCoord {
  x: number;        // signed 10-bit, -512..511, relative to the animation origin
  y: number;        // signed 10-bit
  spriteId: number; // 6-bit, index of the sprite (A = 0) the point belongs to; file field `frame_id`
  null: number;     // 6-bit, always 0 in shipped data; preserved verbatim
}

interface Animation {
  startX: number; startY: number;   // i16, origin in 320×200 scene space
  hitCoords: HitCoord[];
  baseString: string;               // animation string (spec 08)
  extraStrings: string[];
  sprites: Sprite[];
}
```

## Binary layout

```
i16 startX
i16 startY
u32 headerZero        (0 in every shipped file; openomf keeps any value, so does the model: `headerZero?`)
u16 coordCount
u8  spriteCount
u32 packedCoord[coordCount]
varStr baseString
u8  extraCount
varStr extraStrings[extraCount]
Sprite sprites[spriteCount]
```

Packed hit coordinate, bits from MSB to LSB:

```
spriteId: 6   (file field name frame_id)
y       : 10
null    : 6
x       : 10
```

Read as two u16, `a` (low) and `b` (high):
`x = ((a & 0x3FF) ^ 0x200) - 0x200`, `null = a >> 10`,
`y = ((b & 0x3FF) ^ 0x200) - 0x200`, `spriteId = b >> 10`. This is the
openomf decoding (`src/formats/animation.c`); x/y are signed 10-bit. Write
packs `x & 0x3FF` and `y & 0x3FF`, so round trips are byte-exact. `null` is
kept verbatim.

pyomftools also decodes x/y as signed, so the JSON values are signed
(spec 09). Its validator accepts only −511…511, so −512 is valid in the
file but rejected by `af_compile`; the JSON exporter warns about it. The field is named `frame_id` in both reference implementations but the
game compares it against the current **sprite** index (spec 14 §1), hence
`spriteId` in the TS model.

## Functions

```ts
readAnimation(r, into: Animation): void   // called by AF/BK readers after their own prefix
writeAnimation(w, a: Animation): void
```

Counts are derived from the arrays on write; the model never stores them.
`spriteCount` is a u8, so more than 255 sprites is a write error.

## Limits

| Item                 | Limit                       | Source                                   |
| -------------------- | --------------------------- | ---------------------------------------- |
| sprites              | 255 (u8 count)              | format                                   |
| hit coordinates      | 65 535 (u16 count); openomf refuses > 256 | format; `SD_COLCOORD_COUNT_MAX` |
| base string          | ≤ 1 023 bytes (openomf rejects a length ≥ 1 024) | `SD_ANIMATION_STRING_MAX` |
| extra strings        | 10, each ≤ 511 bytes        | `SD_EXTRASTR_COUNT_MAX`, `SD_EXTRA_STRING_MAX` |

The writer enforces the format limits (and integer hit coordinates); the
openomf limits are reported as diagnostics (spec 12 §8) because the game
will refuse the file.

## Shared images

`resolveSharedImages(animations)` follows the game (openomf
`resources/animation.c`): a `missing` sprite uses the most recent preceding
non-missing sprite with the same `index`, walking animations in file
(ascending id) order. **Index 0 is never registered as an owner**, so a
sharer of index 0, like a sharer with no earlier owner, has no image and
openomf dereferences NULL: an error diagnostic that blocks saving.
`resolveSharedImagesInFile` is the file-format view (`sd_af_postprocess`,
pyomftools), where index 0 owns too; it gives the image length written for
sharers and the bytes in pyomftools JSON, so files stay byte-exact.
