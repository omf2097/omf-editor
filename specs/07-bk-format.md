# 07 — BK format (scene)

Module: `packages/omf-formats/src/bk.ts`. Reference: `pyshadowdive/bk.py`,
`bkanim.py`, `palette_mapping.py`.

## Model

```ts
interface BKFile {
  musicMask: number;                    // u32, MusicMask bitflags
  unknownA: number;                     // u8
  backgroundWidth: number;              // u16 (320 in shipped data)
  backgroundHeight: number;             // u16 (200)
  animations: Map<number, BKAnimation>; // key 0..49, ascending
  background: Uint8Array;               // width*height palette indices, row-major
  palettes: PaletteMapping[];           // u8 count
  soundTable: number[];                 // 30 × u8
}

interface BKAnimation extends Animation {
  null: number;          // u8, preserved
  chainHit: number;      // u8
  chainNoHit: number;    // u8
  repeat: number;        // u8
  probability: number;   // u16
  hazardDamage: number;  // u8
  footerString: string;  // varStr, sizeIncludesZero
}
```

## Binary layout

```
u32 musicMask, u8 unknownA, u16 backgroundWidth, u16 backgroundHeight
repeat:
  u32 nextOffset        (absolute file offset of the next entry; ignored on read)
  u8  animId            → stop when >= 50
  u8 null, u8 chainHit, u8 chainNoHit, u8 repeat, u16 probability,
  u8 hazardDamage, varStr(sizeIncludesZero) footerString
  Animation block       (spec 05)
u8  background[width*height]
u8  paletteCount
PaletteMapping palettes[paletteCount]
u8  soundTable[30]
```

Writer: each animation is serialised into a scratch `BinaryWriter` first so
`nextOffset = pos + len + 5` can be written before it. Terminator is
`u32 pos` followed by `u8 51`; with no animations openomf writes `u32 0`
instead, and so does this writer. After reading, `resolveSharedImages`
(spec 04) runs as for AF; shipped BKs have no shared sprites. Note the BK prefix fields come **before** the
shared animation block, the reverse of AF where move fields come after.

## Enums and labels

- `MusicMask`: END 0x02, MENU 0x04, ARENA0 0x08 … ARENA4 0x80.
- `BK_ANIMATION_NAMES`: 6 Round, 7 Number, 8 You lose, 9 You win, 10 Fight,
  11 Ready, 20 Left wall hit, 21 Right wall hit, 24 Dust 1, 25 Dust 2,
  26 Dust 3, 27 Match marker.

Limits from openomf: `footerString` ≤ 510 bytes (stored length with NUL <
`SD_BK_FOOTER_STRING_MAX` = 512); at most 8 palettes (`MAX_BK_PALETTES`;
openomf overflows its array with more): more is an error that blocks saving.
Palette bytes above 63 are kept and warned about (spec 03).
`backgroundWidth × backgroundHeight` is 320×200 in all shipped files; other
sizes are written faithfully but flagged as a diagnostic.

## Helpers

```ts
backgroundToDecoded(bk): DecodedSprite   // for the shared canvas pipeline
```
