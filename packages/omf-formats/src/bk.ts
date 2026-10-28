// BK files: a scene (arena, menu, cutscene) with its background image,
// animations, palettes and sound table (spec 07, openomf formats/bk.c).

import { BinaryReader, BinaryWriter } from './binary';
import { OmfFormatError, OmfRangeError } from './errors';
import { readAnimation, writeAnimation, type Animation } from './animation';
import { readPaletteMapping, writePaletteMapping, type PaletteMapping } from './palette';
import { readSoundTable, sharedLengthLookup, sortedMap, writeSoundTable } from './af';
import type { DecodedSprite } from './sprite';

/** Animation ids are 0..49; a byte ≥ 50 where an id is expected ends the list. */
export const BK_MAX_ANIMATIONS = 50;
/** Bytes; openomf rejects a stored length (bytes + NUL) ≥ SD_BK_FOOTER_STRING_MAX (512). */
export const BK_FOOTER_STRING_MAX = 510;
/** openomf MAX_BK_PALETTES: more overflow its palette array on load. */
export const BK_MAX_PALETTES = 8;

export interface BKAnimation extends Animation {
  null: number;
  chainHit: number;
  chainNoHit: number;
  repeat: number;
  probability: number;
  hazardDamage: number;
  footerString: string;
}

export interface BKFile {
  musicMask: number;
  unknownA: number;
  backgroundWidth: number;
  backgroundHeight: number;
  /** Key 0..49. Write order is ascending key. */
  animations: Map<number, BKAnimation>;
  /** width × height palette indices, row-major. Immutable: replace, never write in place. */
  background: Uint8Array;
  palettes: PaletteMapping[];
  /** As AFFile.soundTable. */
  soundTable: number[];
}

export function readBK(data: Uint8Array | ArrayBuffer): BKFile {
  const r = new BinaryReader(data);
  const musicMask = r.u32();
  const unknownA = r.u8();
  const backgroundWidth = r.u16();
  const backgroundHeight = r.u16();

  const animations = new Map<number, BKAnimation>();
  for (;;) {
    r.u32(); // offset of the next entry; recomputed on write
    const at = r.pos;
    const id = r.u8();
    if (id >= BK_MAX_ANIMATIONS) break;
    if (animations.has(id)) throw new OmfFormatError(`duplicate animation id ${id}`, at);
    const prefix = {
      null: r.u8(),
      chainHit: r.u8(),
      chainNoHit: r.u8(),
      repeat: r.u8(),
      probability: r.u16(),
      hazardDamage: r.u8(),
      footerString: r.varStr(true),
    };
    animations.set(id, { ...prefix, ...readAnimation(r) });
  }
  const background = r.bytes(backgroundWidth * backgroundHeight);
  const paletteCount = r.u8();
  const palettes: PaletteMapping[] = [];
  for (let i = 0; i < paletteCount; i++) palettes.push(readPaletteMapping(r));
  const soundTable = readSoundTable(r);
  if (r.remaining() !== 0)
    throw new OmfFormatError(`${r.remaining()} trailing bytes after BK data`, r.pos);

  return {
    musicMask,
    unknownA,
    backgroundWidth,
    backgroundHeight,
    animations: sortedMap(animations),
    background,
    palettes,
    soundTable,
  };
}

export function writeBK(bk: BKFile): Uint8Array {
  const w = new BinaryWriter(512 * 1024);
  w.u32(bk.musicMask, 'music_mask');
  w.u8(bk.unknownA, 'unknown_a');
  w.u16(bk.backgroundWidth, 'background_width');
  w.u16(bk.backgroundHeight, 'background_height');

  const anims = [...bk.animations.entries()].sort((a, b) => a[0] - b[0]);
  const sharedLen = sharedLengthLookup(anims.map(([, a]) => a));
  for (const [id, a] of anims) {
    if (id < 0 || id >= BK_MAX_ANIMATIONS)
      throw new OmfRangeError(id, 0, BK_MAX_ANIMATIONS - 1, 'animations.id');
    const f = `animations.${id}`;
    const body = new BinaryWriter(16 * 1024);
    body.u8(a.null, `${f}.null`);
    body.u8(a.chainHit, `${f}.chain_hit`);
    body.u8(a.chainNoHit, `${f}.chain_no_hit`);
    body.u8(a.repeat, `${f}.repeat`);
    body.u16(a.probability, `${f}.probability`);
    body.u8(a.hazardDamage, `${f}.hazard_damage`);
    body.varStr(a.footerString, true, `${f}.footer_string`);
    writeAnimation(body, a, sharedLen);
    const bytes = body.toUint8Array();
    // An entry starts with the file offset of the next one: past this u32, the id and the body.
    w.u32(w.pos + bytes.length + 5);
    w.u8(id);
    w.bytes(bytes);
  }
  // openomf writes the end offset of the last animation, or 0 when there are none.
  w.u32(anims.length > 0 ? w.pos : 0);
  w.u8(BK_MAX_ANIMATIONS + 1);

  if (bk.background.length !== bk.backgroundWidth * bk.backgroundHeight) {
    throw new OmfFormatError(
      `background has ${bk.background.length} bytes, expected ${bk.backgroundWidth}×${bk.backgroundHeight}`,
    );
  }
  w.bytes(bk.background);
  w.u8(bk.palettes.length, 'palettes.length');
  bk.palettes.forEach((p, i) => writePaletteMapping(w, p, `palettes[${i}]`));
  writeSoundTable(w, bk.soundTable);
  return w.toUint8Array();
}

export function backgroundToDecoded(bk: BKFile): DecodedSprite {
  return {
    width: bk.backgroundWidth,
    height: bk.backgroundHeight,
    pixels: Uint16Array.from(bk.background),
  };
}
