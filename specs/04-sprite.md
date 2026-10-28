# 04 — Sprite

Module: `packages/omf-formats/src/sprite.ts`.

## Model

```ts
interface Sprite {
  posX: number; posY: number;      // i16, offset relative to the animation origin
  width: number; height: number;   // u16
  index: number;                   // u8, image slot id within the file
  missing: boolean;                // true → no image bytes; image shared by `index`
  image: Uint8Array;               // raw RLE stream, empty when missing
}

interface DecodedSprite {
  width: number; height: number;
  pixels: Uint16Array;             // palette index, or TRANSPARENT (256)
}
const TRANSPARENT = 256;
```

## Binary layout

```
u16 imageLen   (for a missing sprite: the owner's image length, see below; hard limit 65 535 bytes of RLE)
i16 posX
i16 posY
u16 width
u16 height
u8  index
u8  missing    (1 = true)
u8  image[imageLen]   (absent when missing or imageLen == 0)
```

## RLE stream

Sequence of little-endian u16 words `c`; `op = c & 3`, `data = c >> 2`.

| op | meaning                                                                   |
| -- | ------------------------------------------------------------------------- |
| 0  | `x = data`                                                                |
| 2  | `y = data`                                                                |
| 1  | copy the next `data` bytes as pixel indices at `(x, y)`, advancing x; then `x = 0` |
| 3  | end of sprite. Must be the final word. openomf writes the word `7`       |

Decoder (`decodeSprite(s): DecodedSprite`): initialise all pixels to
`TRANSPARENT`, apply ops. A `width` or `height` of 0 or an empty stream
yields an empty `pixels`. Shipped data needs this leniency: CREDITS.BK has
zero-width sprites, ARENA4.BK and END1.BK have `imageLen = 0` sprites with
a garbage size of 60537×60537, and one CREDITS.BK stream does not end with
op 3. Rules, matching openomf `sd_sprite_vga_decode`:

- A stream may end without op 3.
- An op 3 that is not the final word throws `OmfFormatError`.
- A write past `width × height` stops decoding and sets
  `truncated: true` on the result (openomf logs and truncates); the editor
  reports it as a diagnostic.

Decoding is only for display and editing. Parsing a file never decodes, so
a bad stream never prevents loading or byte-exact saving.

Encoder (`encodeSprite(d: DecodedSprite): Uint8Array`): port of
`openomf/src/formats/sprite.c` `sd_sprite_vga_encode`, adapted to treat
`TRANSPARENT` (not index 0) as the skipped value:

1. Emit `y = 0` (word `2`).
2. Scan row-major. For each opaque pixel: emit `y` word when the row changed;
   emit `x` word when the run is not contiguous with the previous pixel and
   `x != 0`; open a new op-1 block (reserve a word) when a run starts; append
   the index; when a run ends, back-patch the reserved word with
   `(runLength << 2) | 1`.
3. Back-patch the final open run; emit word `7`.

x, y and run lengths are 14-bit fields (≤ 16 383). A run reaching 16 383
pixels is closed and the next pixel starts a new one (with an `x` word);
a pixel that needs an `x` or `y` word above 16 383 cannot be stored and
`encodeSprite` throws `OmfRangeError` rather than wrapping. It also throws
when `pixels.length` is not `width × height` or a value is not 0–255 or
`TRANSPARENT`, and checks the opaque pixel count against 65 535 bytes
before allocating (so a 60 537² placeholder fails fast).

The encoded stream must fit in the u16 `imageLen`; `encodeSprite` throws
`OmfRangeError` past 65 535 bytes. Size is roughly 4 + 2·rows + 2·runs +
2·gaps + pixels bytes, so the limit depends on content, not just on
dimensions: a fully opaque square fits up to 254×254 (n² + 4n + 2 bytes)
but not 255×255, and a checkerboard (every opaque pixel its own run,
5 bytes each) fits only about 26 000 pixels of area. The largest shipped
stream is 34 782 bytes. The pixel editor shows the encoded size live
(spec 13 §5).

Index 0 is a stored value like any other here, but openomf draws sprites
with 0 as the transparent colour, so the editor renders it transparent and
never writes it into a sprite (spec 13 §7). An empty stream is a 1×1 blank
in openomf; the pixel editor opens it at that size, not the header size.

Guarantee: `decode(encode(d))` is pixel-identical to `d`. Byte-identical
re-encoding of original streams is **not** guaranteed; the original
compressor differs. Round-trip tests therefore keep the original `image`
bytes untouched unless the editor replaces the image.

## Shared images

A sprite with `missing = true` has no image bytes of its own and uses the
image of the **most recent preceding** non-missing sprite with the same
`index`, walking the file's animations in file order. Both reference
implementations do exactly this (a lookup table overwritten by each owner)
in AF and BK files alike. Shipped data has 610 sharers, all in AF files,
and for every one of them the most recent and the earliest owner are the
same sprite. Resolution runs in `af.ts` / `bk.ts` after all animations are
read:

```ts
resolveSharedImages(af): Map<Sprite, Sprite>   // sharer → owner
```

The library never copies bytes into the sharer. On write, a sharer's
`imageLen` is the resolved owner's current image length, and no image bytes
follow. openomf keeps the field as read, and every shipped sharer stores
its owner's length, so this reproduces the files byte-exactly. An
unresolved sharer writes 0. pyomftools writes 0 for every sharer, so its
AF output is not byte-identical to the shipped files (spec 09 §Known
pyomftools differences).

Rendering code resolves through the map. Editing rules for shared sprites
are in spec 12 §10.2.

## Helpers

```ts
spritePaletteRange(d: DecodedSprite): { start: number; end: number; used: number[] }
```

Used by the UI to show which palette indices a sprite touches (relevant for
remap-sensitive HAR colours).
